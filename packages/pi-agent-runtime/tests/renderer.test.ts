import type { AgentSkill } from '@genoffice/agent-core'
import { defaultAiSettings } from '@genoffice/ai-provider'
import { describe, expect, it, vi } from 'vitest'
import type {
  PiAgentBridge,
  PiAgentEvent,
  PiAgentStartRequest,
  PiAgentToolCallRequest,
  PiAgentToolCancelRequest,
  PiAgentToolResultResponse,
} from '../src/protocol'
import { PiAgentLoop } from '../src/renderer'

class FakeBridge implements PiAgentBridge {
  readonly start = vi.fn(async (_request: PiAgentStartRequest) => undefined)
  readonly cancel = vi.fn(async (_sessionId: string) => undefined)
  readonly reset = vi.fn(async (_sessionId: string) => undefined)
  readonly complete = vi.fn(async () => ({ ok: true, text: 'done' }))
  readonly cancelCompletion = vi.fn(async (_requestId: string) => undefined)
  readonly codexAuthStatus = vi.fn(async () => ({ loggedIn: false }))
  readonly codexLogin = vi.fn(async () => ({ loggedIn: true }))
  readonly codexLogout = vi.fn(async () => ({ loggedIn: false }))
  readonly sendToolResult = vi.fn((_response: PiAgentToolResultResponse) => undefined)
  private eventHandler?: (event: PiAgentEvent) => void
  private toolHandler?: (request: PiAgentToolCallRequest) => void
  private cancelHandler?: (request: PiAgentToolCancelRequest) => void

  onEvent(handler: (event: PiAgentEvent) => void): () => void {
    this.eventHandler = handler
    return () => {
      this.eventHandler = undefined
    }
  }

  onToolCall(handler: (request: PiAgentToolCallRequest) => void): () => void {
    this.toolHandler = handler
    return () => {
      this.toolHandler = undefined
    }
  }

  onToolCancel(handler: (request: PiAgentToolCancelRequest) => void): () => void {
    this.cancelHandler = handler
    return () => {
      this.cancelHandler = undefined
    }
  }

  emitEvent(event: PiAgentEvent): void {
    this.eventHandler?.(event)
  }

  emitTool(request: PiAgentToolCallRequest): void {
    this.toolHandler?.(request)
  }
}

describe('PiAgentLoop', () => {
  it('runs Pi in main while executing the existing AgentSkill tool in renderer', async () => {
    const bridge = new FakeBridge()
    const executeTool = vi.fn(async () => ({
      output: 'changed',
      summary: 'Changed document',
      mutated: true,
    }))
    const skill: AgentSkill = {
      id: 'docs',
      systemPrompt: 'Edit the document.',
      tools: [
        {
          name: 'replace_text',
          description: 'Replace text',
          inputSchema: { type: 'object' },
        },
      ],
      buildContext: () => '<document>hello</document>',
      executeTool,
    }
    const onToolExecuted = vi.fn()
    const onDone = vi.fn()
    const loop = new PiAgentLoop({
      bridge,
      skill,
      getSettings: defaultAiSettings,
      captureSnapshot: () => 'before',
      events: { onToolExecuted, onDone },
    })

    loop.run('make it concise', [{ base64: 'aGVsbG8=', mime: 'image/png' }])
    const request = bridge.start.mock.calls[0]![0]
    expect(request).toEqual(
      expect.objectContaining({
        skillId: 'docs',
        instruction: 'make it concise\n\n<document>hello</document>',
        tools: skill.tools,
        images: [{ base64: 'aGVsbG8=', mime: 'image/png' }],
      }),
    )

    bridge.emitTool({
      sessionId: request.sessionId,
      call: { id: 'call-1', name: 'replace_text', input: { value: 'hello' } },
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(executeTool).toHaveBeenCalledOnce()
    expect(onToolExecuted).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotBefore: 'before' }),
    )
    expect(bridge.sendToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: request.sessionId,
        toolCallId: 'call-1',
        execution: expect.objectContaining({ output: 'changed', mutated: true }),
      }),
    )

    bridge.emitEvent({
      sessionId: request.sessionId,
      type: 'done',
      text: 'Done.',
      cancelled: false,
    })
    expect(loop.busy).toBe(false)
    expect(onDone).toHaveBeenCalledWith({ text: 'Done.', cancelled: false, turnLimit: false })
  })
})
