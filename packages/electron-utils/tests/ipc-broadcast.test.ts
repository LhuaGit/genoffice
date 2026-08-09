import { describe, expect, it, vi } from 'vitest'
import { broadcastRendererEvent, type RendererEventTarget } from '../src/ipc-broadcast'

function target(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    send: vi.fn<(channel: string, ...args: unknown[]) => void>(),
  } satisfies RendererEventTarget
}

describe('broadcastRendererEvent', () => {
  it('sends the same event payload to every live renderer', () => {
    const first = target()
    const second = target()
    const payload = { provider: 'custom' }

    broadcastRendererEvent([first, second], 'ai:settings-changed', payload)

    expect(first.send).toHaveBeenCalledWith('ai:settings-changed', payload)
    expect(second.send).toHaveBeenCalledWith('ai:settings-changed', payload)
  })

  it('skips destroyed renderers', () => {
    const destroyed = target(true)

    broadcastRendererEvent([destroyed], 'ai:settings-changed', {})

    expect(destroyed.send).not.toHaveBeenCalled()
  })

  it('continues when a renderer closes during fan-out', () => {
    const closing = target()
    closing.send.mockImplementation(() => {
      throw new Error('destroyed')
    })
    const live = target()

    broadcastRendererEvent([closing, live], 'ai:settings-changed', {})

    expect(live.send).toHaveBeenCalledTimes(1)
  })
})
