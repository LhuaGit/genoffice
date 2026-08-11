import type {
  AgentImage,
  AgentLoopEvents,
  AgentMessage,
  AgentSkill,
  ToolExecution,
} from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import type {
  PiAgentBridge,
  PiAgentEvent,
  PiAgentToolCallRequest,
  PiAgentToolCancelRequest,
} from './protocol'

declare global {
  interface Window {
    piAgent: PiAgentBridge
  }
}

export interface PiAgentLoopOptions<TSnapshot = unknown> {
  skill: AgentSkill
  getSettings(): AiSettings
  events?: AgentLoopEvents<TSnapshot>
  captureSnapshot?(): TSnapshot
  formatUserMessage?(instruction: string, context: string): string
  systemSuffix?(): string
  cwd?(): string | undefined
  bridge?: PiAgentBridge
}

/** Renderer façade for a full Pi AgentSession hosted in Electron's main process. */
export class PiAgentLoop<TSnapshot = unknown> {
  private readonly options: PiAgentLoopOptions<TSnapshot>
  private readonly bridge: PiAgentBridge | undefined
  private readonly sessionId: string
  private readonly toolControllers = new Map<string, AbortController>()
  private readonly unsubscribers: Array<() => void>
  private history: AgentMessage[] = []
  private restoredHistory: AgentMessage[] | undefined
  private running = false
  private turnText = ''
  private mutationSeen = false

  constructor(options: PiAgentLoopOptions<TSnapshot>) {
    this.options = options
    this.bridge = options.bridge ?? (typeof window === 'undefined' ? undefined : window.piAgent)
    this.sessionId = crypto.randomUUID()
    this.unsubscribers = this.bridge
      ? [
          this.bridge.onEvent((event) => this.handleEvent(event)),
          this.bridge.onToolCall((request) => void this.handleToolCall(request)),
          this.bridge.onToolCancel((request) => this.handleToolCancel(request)),
        ]
      : []
  }

  get busy(): boolean {
    return this.running
  }

  get messages(): readonly AgentMessage[] {
    return this.history
  }

  restore(messages: readonly AgentMessage[]): void {
    if (this.running || this.history.length > 0 || messages.length === 0) return
    this.history = [...messages]
    this.restoredHistory = [...messages]
  }

  run(instruction: string, images?: AgentImage[]): void {
    if (this.running || !instruction) return
    this.running = true
    if (!this.bridge) {
      this.fail('Pi agent preload bridge is unavailable')
      return
    }
    this.turnText = ''
    this.mutationSeen = false
    const context = this.options.skill.buildContext?.() ?? ''
    const format =
      this.options.formatUserMessage ??
      ((value: string, currentContext: string) =>
        currentContext ? `${value}\n\n${currentContext}` : value)
    const text = format(instruction, context)
    const cwd = this.options.cwd?.()
    this.history.push({ role: 'user', text, ...(images?.length ? { images } : {}) })
    const restoredHistory = this.restoredHistory
    this.restoredHistory = undefined
    void this.bridge
      .start({
        sessionId: this.sessionId,
        skillId: this.options.skill.id,
        settings: this.options.getSettings(),
        systemPrompt: this.options.skill.systemPrompt + (this.options.systemSuffix?.() ?? ''),
        instruction: text,
        tools: this.options.skill.tools,
        ...(images?.length ? { images } : {}),
        ...(restoredHistory?.length ? { restoredHistory } : {}),
        ...(cwd ? { cwd } : {}),
      })
      .catch((error: unknown) => {
        if (!this.running) return
        this.fail(error instanceof Error ? error.message : String(error))
      })
  }

  cancel(): void {
    if (!this.running) return
    for (const controller of this.toolControllers.values()) controller.abort()
    void this.bridge?.cancel(this.sessionId)
  }

  reset(): void {
    for (const controller of this.toolControllers.values()) controller.abort()
    this.toolControllers.clear()
    this.running = false
    this.turnText = ''
    this.history = []
    this.restoredHistory = undefined
    void this.bridge?.reset(this.sessionId)
  }

  dispose(): void {
    this.reset()
    for (const unsubscribe of this.unsubscribers) unsubscribe()
  }

  private handleEvent(event: PiAgentEvent): void {
    if (event.sessionId !== this.sessionId) return
    if (event.type === 'text-delta') {
      this.turnText += event.delta
      this.options.events?.onText?.(this.turnText)
      return
    }
    if (event.type === 'turn-end') {
      this.history.push({ role: 'assistant', text: this.turnText })
      this.turnText = ''
      this.options.events?.onTurnEnd?.()
      return
    }
    if (event.type === 'error') {
      this.fail(event.error)
      return
    }
    this.running = false
    this.history.push({ role: 'assistant', text: event.text })
    this.options.events?.onDone?.({
      text: event.text,
      cancelled: event.cancelled,
      turnLimit: false,
      ...(event.truncated ? { truncated: true } : {}),
    })
  }

  private async handleToolCall(request: PiAgentToolCallRequest): Promise<void> {
    if (request.sessionId !== this.sessionId) return
    const call = request.call
    const controller = new AbortController()
    this.toolControllers.set(call.id, controller)
    this.options.events?.onToolStart?.(call)
    const snapshot = !this.mutationSeen ? this.options.captureSnapshot?.() : undefined
    let execution: ToolExecution
    try {
      execution = await this.options.skill.executeTool(call, controller.signal)
    } catch (error) {
      execution = {
        output: error instanceof Error ? error.message : String(error),
        isError: true,
        summary: call.name,
      }
    } finally {
      this.toolControllers.delete(call.id)
    }
    const firstMutation = !!execution.mutated && !this.mutationSeen
    if (execution.mutated) this.mutationSeen = true
    this.options.events?.onToolExecuted?.({
      call,
      execution,
      ...(firstMutation && snapshot !== undefined ? { snapshotBefore: snapshot } : {}),
    })
    this.bridge?.sendToolResult({
      sessionId: this.sessionId,
      toolCallId: call.id,
      execution,
    })
  }

  private handleToolCancel(request: PiAgentToolCancelRequest): void {
    if (request.sessionId !== this.sessionId) return
    this.toolControllers.get(request.toolCallId)?.abort()
  }

  private fail(error: string): void {
    if (!this.running) return
    this.running = false
    while (this.history.at(-1)?.role === 'user') this.history.pop()
    this.options.events?.onError?.(error)
  }
}

export type { PiAgentBridge } from './protocol'
