import { ipcMain, shell, type WebContents } from 'electron'
import {
  createAgentSession,
  createReadToolDefinition,
  defineTool,
  getAgentDir,
  SessionManager,
  type AgentSession,
} from '@mariozechner/pi-coding-agent'
import { completeSimple } from '@mariozechner/pi-ai'
import type { AgentMessage, AgentToolCall, ToolExecution } from '@genoffice/agent-core'
import {
  PI_AGENT_CHANNELS,
  type PiAgentEvent,
  type PiAgentStartRequest,
  type PiAgentToolCancelRequest,
  type PiAgentToolCallRequest,
  type PiAgentToolResultResponse,
  type PiCompletionRequest,
  type PiCompletionResult,
  type PiOAuthStatus,
} from './protocol'
import { createPiProviderRuntime, resolvePiModel } from './provider'
import { packageAgentSkillAsPiExtension } from './extension'
import { createPiResources } from './resources'

const TOOL_TIMEOUT_MS = 15 * 60 * 1000

interface RuntimeEntry {
  session: AgentSession
  signature: string
  sender: WebContents
  cancelled: boolean
  unsubscribe: () => void
}

interface PendingTool {
  resolve(execution: ToolExecution): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
  sender: WebContents
  sessionId: string
  toolCallId: string
}

const runtimeByKey = new Map<string, RuntimeEntry>()
const pendingTools = new Map<string, PendingTool>()
const observedSenders = new Set<number>()
const activeCompletions = new Map<string, AbortController>()
let registered = false
let codexLoginPromise: Promise<PiOAuthStatus> | null = null

const runtimeKey = (senderId: number, sessionId: string): string => `${senderId}:${sessionId}`
const toolKey = (senderId: number, sessionId: string, toolCallId: string): string =>
  `${senderId}:${sessionId}:${toolCallId}`
const completionKey = (senderId: number, requestId: string): string => `${senderId}:${requestId}`

function send(sender: WebContents, event: PiAgentEvent): void {
  if (!sender.isDestroyed()) sender.send(PI_AGENT_CHANNELS.event, event)
}

function renderRestoredHistory(history: readonly AgentMessage[] | undefined): string {
  if (!history?.length) return ''
  const lines = history.flatMap((message) => {
    if (message.role === 'tool') return []
    const label = message.role === 'user' ? 'User' : 'Assistant'
    return message.text ? [`${label}: ${message.text}`] : []
  })
  return lines.length
    ? `<previous-conversation>\n${lines.join('\n')}\n</previous-conversation>\n\n`
    : ''
}

function finalAssistant(entry: RuntimeEntry): { text: string; truncated: boolean; error?: string } {
  const messages = entry.session.messages
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== 'assistant') continue
    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
    return {
      text,
      truncated: message.stopReason === 'length',
      ...(message.stopReason === 'error' && message.errorMessage
        ? { error: message.errorMessage }
        : {}),
    }
  }
  return { text: '', truncated: false }
}

function rejectPendingForSession(senderId: number, sessionId: string, reason: string): void {
  const prefix = `${senderId}:${sessionId}:`
  for (const [key, pending] of pendingTools) {
    if (!key.startsWith(prefix)) continue
    clearTimeout(pending.timer)
    pendingTools.delete(key)
    pending.reject(new Error(reason))
  }
}

function invokeRendererTool(
  sender: WebContents,
  sessionId: string,
  call: AgentToolCall,
  signal?: AbortSignal,
): Promise<ToolExecution> {
  if (sender.isDestroyed()) return Promise.reject(new Error('Office editor is no longer available'))
  const key = toolKey(sender.id, sessionId, call.id)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTools.delete(key)
      reject(new Error(`Office tool timed out: ${call.name}`))
    }, TOOL_TIMEOUT_MS)
    const pending: PendingTool = {
      resolve,
      reject,
      timer,
      sender,
      sessionId,
      toolCallId: call.id,
    }
    pendingTools.set(key, pending)
    const request: PiAgentToolCallRequest = { sessionId, call }
    sender.send(PI_AGENT_CHANNELS.toolCall, request)
    signal?.addEventListener(
      'abort',
      () => {
        const active = pendingTools.get(key)
        if (!active) return
        clearTimeout(active.timer)
        pendingTools.delete(key)
        const cancellation: PiAgentToolCancelRequest = { sessionId, toolCallId: call.id }
        if (!sender.isDestroyed()) sender.send(PI_AGENT_CHANNELS.toolCancel, cancellation)
        reject(new Error(`Office tool cancelled: ${call.name}`))
      },
      { once: true },
    )
  })
}

function sessionSignature(request: PiAgentStartRequest): string {
  const config = request.settings.providers[request.settings.provider]
  return JSON.stringify({
    provider: request.settings.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    systemPrompt: request.systemPrompt,
    skillId: request.skillId,
    tools: request.tools,
    cwd: request.cwd,
  })
}

async function createRuntime(
  sender: WebContents,
  request: PiAgentStartRequest,
): Promise<RuntimeEntry> {
  const cwd = request.cwd || process.cwd()
  const providerRuntime = createPiProviderRuntime()
  const model = resolvePiModel(providerRuntime, request.settings)
  const officeExtension = packageAgentSkillAsPiExtension(
    request.skillId,
    request.tools,
    (call, signal) => invokeRendererTool(sender, request.sessionId, call, signal),
  )
  const agentDir = getAgentDir()
  const { loader, settingsManager } = await createPiResources(cwd, agentDir, request.systemPrompt)
  const enableBuiltinCodingTools = process.env.GENOFFICE_PI_BUILTIN_TOOLS === 'all'
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    authStorage: providerRuntime.authStorage,
    modelRegistry: providerRuntime.modelRegistry,
    model,
    resourceLoader: loader,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
    // Pi Skills use `read` for progressive disclosure. Keep that capability (and
    // native image results) in the safe default; executable Skills can opt into
    // the complete Pi coding toolset through GENOFFICE_PI_BUILTIN_TOOLS=all.
    customTools: enableBuiltinCodingTools
      ? officeExtension.customTools
      : [defineTool(createReadToolDefinition(cwd)), ...officeExtension.customTools],
    ...(enableBuiltinCodingTools ? {} : { noTools: 'builtin' as const }),
  })
  const entry: RuntimeEntry = {
    session,
    signature: sessionSignature(request),
    sender,
    cancelled: false,
    unsubscribe: () => {},
  }
  entry.unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_update') {
      const update = event.assistantMessageEvent
      if (update.type === 'text_delta') {
        send(sender, { sessionId: request.sessionId, type: 'text-delta', delta: update.delta })
      }
    } else if (event.type === 'turn_end' && event.toolResults.length > 0) {
      send(sender, { sessionId: request.sessionId, type: 'turn-end' })
    }
  })
  return entry
}

async function getRuntime(
  sender: WebContents,
  request: PiAgentStartRequest,
): Promise<RuntimeEntry> {
  const key = runtimeKey(sender.id, request.sessionId)
  const signature = sessionSignature(request)
  const existing = runtimeByKey.get(key)
  if (existing?.signature === signature) return existing
  if (existing) {
    existing.unsubscribe()
    existing.session.dispose()
    rejectPendingForSession(sender.id, request.sessionId, 'Pi session was replaced')
  }
  const created = await createRuntime(sender, request)
  runtimeByKey.set(key, created)
  return created
}

function disposeRuntime(senderId: number, sessionId: string): void {
  const key = runtimeKey(senderId, sessionId)
  const entry = runtimeByKey.get(key)
  if (!entry) return
  entry.unsubscribe()
  entry.session.dispose()
  runtimeByKey.delete(key)
  rejectPendingForSession(senderId, sessionId, 'Pi session was reset')
}

function disposeAllRuntimes(): void {
  for (const entry of runtimeByKey.values()) {
    entry.unsubscribe()
    entry.session.dispose()
  }
  runtimeByKey.clear()
}

function observeSender(sender: WebContents): void {
  if (observedSenders.has(sender.id)) return
  observedSenders.add(sender.id)
  sender.once('destroyed', () => {
    const prefix = `${sender.id}:`
    for (const key of [...runtimeByKey.keys()]) {
      if (!key.startsWith(prefix)) continue
      const sessionId = key.slice(prefix.length)
      disposeRuntime(sender.id, sessionId)
    }
    observedSenders.delete(sender.id)
    const completionPrefix = `${sender.id}:`
    for (const [key, controller] of activeCompletions) {
      if (!key.startsWith(completionPrefix)) continue
      controller.abort()
      activeCompletions.delete(key)
    }
  })
}

/** Register the full Pi Coding Agent runtime once per Electron main process. */
export function registerPiAgentIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(
    PI_AGENT_CHANNELS.complete,
    async (event, request: PiCompletionRequest): Promise<PiCompletionResult> => {
      observeSender(event.sender)
      const key = completionKey(event.sender.id, request.requestId)
      const controller = new AbortController()
      activeCompletions.set(key, controller)
      try {
        const runtime = createPiProviderRuntime()
        const model = resolvePiModel(runtime, request.settings)
        const auth = await runtime.modelRegistry.getApiKeyAndHeaders(model)
        if (!auth.ok) return { ok: false, error: auth.error }
        const response = await completeSimple(
          model,
          {
            systemPrompt: request.systemPrompt,
            messages: [{ role: 'user', content: request.instruction, timestamp: Date.now() }],
          },
          {
            ...(auth.apiKey ? { apiKey: auth.apiKey } : {}),
            ...(auth.headers ? { headers: auth.headers } : {}),
            ...(request.maxTokens ? { maxTokens: request.maxTokens } : {}),
            ...(request.timeoutMs ? { timeoutMs: request.timeoutMs } : {}),
            signal: controller.signal,
          },
        )
        const text = response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('')
        if (response.stopReason === 'error' || response.stopReason === 'aborted') {
          return {
            ok: false,
            error: response.errorMessage ?? `Pi completion stopped: ${response.stopReason}`,
            stopReason: response.stopReason,
          }
        }
        return { ok: true, text, stopReason: response.stopReason }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      } finally {
        activeCompletions.delete(key)
      }
    },
  )

  ipcMain.handle(PI_AGENT_CHANNELS.completeCancel, (event, requestId: string) => {
    activeCompletions.get(completionKey(event.sender.id, requestId))?.abort()
  })

  ipcMain.handle(PI_AGENT_CHANNELS.codexAuthStatus, (): PiOAuthStatus => ({
    loggedIn: createPiProviderRuntime().authStorage.hasAuth('openai-codex'),
  }))

  ipcMain.handle(PI_AGENT_CHANNELS.codexLogin, async (): Promise<PiOAuthStatus> => {
    if (!codexLoginPromise) {
      codexLoginPromise = (async () => {
        const runtime = createPiProviderRuntime()
        await runtime.authStorage.login('openai-codex', {
          onAuth: ({ url }) => void shell.openExternal(url),
          onPrompt: async () => {
            throw new Error('Codex OAuth browser callback was not received')
          },
        })
        disposeAllRuntimes()
        return { loggedIn: true }
      })().finally(() => {
        codexLoginPromise = null
      })
    }
    return codexLoginPromise
  })

  ipcMain.handle(PI_AGENT_CHANNELS.codexLogout, (): PiOAuthStatus => {
    createPiProviderRuntime().authStorage.logout('openai-codex')
    disposeAllRuntimes()
    return { loggedIn: false }
  })

  ipcMain.handle(PI_AGENT_CHANNELS.start, async (event, request: PiAgentStartRequest) => {
    observeSender(event.sender)
    const entry = await getRuntime(event.sender, request)
    entry.cancelled = false
    try {
      const restored = renderRestoredHistory(request.restoredHistory)
      const images = request.images?.map((image) => ({
        type: 'image' as const,
        data: image.base64,
        mimeType: image.mime,
      }))
      await entry.session.prompt(`${restored}${request.instruction}`, {
        ...(images?.length ? { images } : {}),
        source: 'interactive',
      })
      const final = finalAssistant(entry)
      if (final.error) {
        send(event.sender, { sessionId: request.sessionId, type: 'error', error: final.error })
      } else {
        send(event.sender, {
          sessionId: request.sessionId,
          type: 'done',
          text: final.text,
          cancelled: entry.cancelled,
          ...(final.truncated ? { truncated: true } : {}),
        })
      }
    } catch (error) {
      send(event.sender, {
        sessionId: request.sessionId,
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  ipcMain.handle(PI_AGENT_CHANNELS.cancel, async (event, sessionId: string) => {
    const entry = runtimeByKey.get(runtimeKey(event.sender.id, sessionId))
    if (!entry) return
    entry.cancelled = true
    await entry.session.abort()
  })

  ipcMain.handle(PI_AGENT_CHANNELS.reset, (event, sessionId: string) => {
    disposeRuntime(event.sender.id, sessionId)
  })

  ipcMain.on(PI_AGENT_CHANNELS.toolResult, (event, response: PiAgentToolResultResponse) => {
    const key = toolKey(event.sender.id, response.sessionId, response.toolCallId)
    const pending = pendingTools.get(key)
    if (!pending || pending.sender.id !== event.sender.id) return
    clearTimeout(pending.timer)
    pendingTools.delete(key)
    pending.resolve(response.execution)
  })
}
