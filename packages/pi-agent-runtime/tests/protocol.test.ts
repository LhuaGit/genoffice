import { describe, expect, it, vi } from 'vitest'
import { createPiAgentPreloadBridge, PI_AGENT_CHANNELS } from '../src/protocol'

describe('createPiAgentPreloadBridge', () => {
  it('keeps Pi IPC channels behind a narrow preload contract', async () => {
    const invoke = vi.fn(async () => undefined)
    const send = vi.fn()
    const listeners = new Map<string, (_event: unknown, payload: unknown) => void>()
    const removeListener = vi.fn()
    const bridge = createPiAgentPreloadBridge({
      invoke,
      send,
      on: (channel, listener) => listeners.set(channel, listener),
      removeListener,
    })
    const onEvent = vi.fn()
    const unsubscribe = bridge.onEvent(onEvent)

    listeners.get(PI_AGENT_CHANNELS.event)?.(
      {},
      {
        sessionId: 'session-1',
        type: 'text-delta',
        delta: 'hello',
      },
    )
    await bridge.cancel('session-1')
    await bridge.codexAuthStatus()
    await bridge.codexLogin()
    await bridge.codexLogout()
    bridge.sendToolResult({
      sessionId: 'session-1',
      toolCallId: 'call-1',
      execution: { output: 'ok', summary: 'Done' },
    })
    unsubscribe()

    expect(onEvent).toHaveBeenCalledWith({
      sessionId: 'session-1',
      type: 'text-delta',
      delta: 'hello',
    })
    expect(invoke).toHaveBeenCalledWith(PI_AGENT_CHANNELS.cancel, 'session-1')
    expect(invoke).toHaveBeenCalledWith(PI_AGENT_CHANNELS.codexAuthStatus)
    expect(invoke).toHaveBeenCalledWith(PI_AGENT_CHANNELS.codexLogin)
    expect(invoke).toHaveBeenCalledWith(PI_AGENT_CHANNELS.codexLogout)
    expect(send).toHaveBeenCalledWith(
      PI_AGENT_CHANNELS.toolResult,
      expect.objectContaining({ toolCallId: 'call-1' }),
    )
    expect(removeListener).toHaveBeenCalledWith(
      PI_AGENT_CHANNELS.event,
      listeners.get(PI_AGENT_CHANNELS.event),
    )
  })
})
