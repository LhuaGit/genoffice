import type {
  AgentImage,
  AgentMessage,
  AgentToolCall,
  AgentToolDef,
  ToolExecution,
} from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'

export const PI_AGENT_CHANNELS = {
  start: 'pi-agent:start',
  cancel: 'pi-agent:cancel',
  reset: 'pi-agent:reset',
  event: 'pi-agent:event',
  toolCall: 'pi-agent:tool-call',
  toolCancel: 'pi-agent:tool-cancel',
  toolResult: 'pi-agent:tool-result',
  complete: 'pi-agent:complete',
  completeCancel: 'pi-agent:complete-cancel',
  codexAuthStatus: 'pi-agent:codex-auth-status',
  codexLogin: 'pi-agent:codex-login',
  codexLogout: 'pi-agent:codex-logout',
} as const

export interface PiCompletionRequest {
  requestId: string
  settings: AiSettings
  systemPrompt: string
  instruction: string
  maxTokens?: number
  timeoutMs?: number
}

export interface PiCompletionResult {
  ok: boolean
  text?: string
  error?: string
  stopReason?: string
}

export interface PiOAuthStatus {
  loggedIn: boolean
}

export interface PiAgentStartRequest {
  sessionId: string
  skillId: string
  settings: AiSettings
  systemPrompt: string
  instruction: string
  tools: AgentToolDef[]
  images?: AgentImage[]
  restoredHistory?: AgentMessage[]
  cwd?: string
}

export type PiAgentEvent =
  | { sessionId: string; type: 'text-delta'; delta: string }
  | { sessionId: string; type: 'turn-end' }
  | {
      sessionId: string
      type: 'done'
      text: string
      cancelled: boolean
      truncated?: boolean
    }
  | { sessionId: string; type: 'error'; error: string }

export interface PiAgentToolCallRequest {
  sessionId: string
  call: AgentToolCall
}

export interface PiAgentToolCancelRequest {
  sessionId: string
  toolCallId: string
}

export interface PiAgentToolResultResponse {
  sessionId: string
  toolCallId: string
  execution: ToolExecution
}

export interface PiAgentBridge {
  start(request: PiAgentStartRequest): Promise<void>
  cancel(sessionId: string): Promise<void>
  reset(sessionId: string): Promise<void>
  sendToolResult(response: PiAgentToolResultResponse): void
  onEvent(handler: (event: PiAgentEvent) => void): () => void
  onToolCall(handler: (request: PiAgentToolCallRequest) => void): () => void
  onToolCancel(handler: (request: PiAgentToolCancelRequest) => void): () => void
  complete(request: PiCompletionRequest): Promise<PiCompletionResult>
  cancelCompletion(requestId: string): Promise<void>
  codexAuthStatus(): Promise<PiOAuthStatus>
  codexLogin(): Promise<PiOAuthStatus>
  codexLogout(): Promise<PiOAuthStatus>
}

export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: (_event: unknown, payload: unknown) => void): void
  removeListener(channel: string, listener: (_event: unknown, payload: unknown) => void): void
}

export function createPiAgentPreloadBridge(ipc: IpcRendererLike): PiAgentBridge {
  const subscribe = <T>(channel: string, handler: (payload: T) => void): (() => void) => {
    const listener = (_event: unknown, payload: unknown): void => handler(payload as T)
    ipc.on(channel, listener)
    return () => ipc.removeListener(channel, listener)
  }
  return {
    start: async (request) => {
      await ipc.invoke(PI_AGENT_CHANNELS.start, request)
    },
    cancel: async (sessionId) => {
      await ipc.invoke(PI_AGENT_CHANNELS.cancel, sessionId)
    },
    reset: async (sessionId) => {
      await ipc.invoke(PI_AGENT_CHANNELS.reset, sessionId)
    },
    complete: async (request) =>
      (await ipc.invoke(PI_AGENT_CHANNELS.complete, request)) as PiCompletionResult,
    cancelCompletion: async (requestId) => {
      await ipc.invoke(PI_AGENT_CHANNELS.completeCancel, requestId)
    },
    codexAuthStatus: async () =>
      (await ipc.invoke(PI_AGENT_CHANNELS.codexAuthStatus)) as PiOAuthStatus,
    codexLogin: async () => (await ipc.invoke(PI_AGENT_CHANNELS.codexLogin)) as PiOAuthStatus,
    codexLogout: async () => (await ipc.invoke(PI_AGENT_CHANNELS.codexLogout)) as PiOAuthStatus,
    sendToolResult: (response) => ipc.send(PI_AGENT_CHANNELS.toolResult, response),
    onEvent: (handler) => subscribe(PI_AGENT_CHANNELS.event, handler),
    onToolCall: (handler) => subscribe(PI_AGENT_CHANNELS.toolCall, handler),
    onToolCancel: (handler) => subscribe(PI_AGENT_CHANNELS.toolCancel, handler),
  }
}
