import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings, type AiSettings } from '@genoffice/ai-provider'
import { AI_CHANNELS } from '../src/shared/ipc'

const handle = vi.fn()
const send = vi.fn()

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/genoffice-pdf-test') },
  ipcMain: { handle },
  webContents: {
    getAllWebContents: () => [{ isDestroyed: () => false, send }],
  },
}))

describe('standalone PDF AI IPC', () => {
  beforeEach(() => {
    handle.mockClear()
    send.mockClear()
    vi.resetModules()
  })

  it('registers each shared AI channel once', async () => {
    const { registerStandalonePdfAiIpc } = await import('../src/main/ai-ipc')

    registerStandalonePdfAiIpc()
    registerStandalonePdfAiIpc()

    expect(handle.mock.calls.map(([channel]) => channel)).toEqual([
      AI_CHANNELS.getSettings,
      AI_CHANNELS.setSettings,
      AI_CHANNELS.stream,
      AI_CHANNELS.streamCancel,
    ])
  })

  it('broadcasts persisted settings to live renderer views', async () => {
    const { registerStandalonePdfAiIpc } = await import('../src/main/ai-ipc')
    registerStandalonePdfAiIpc()
    const registeredHandler = handle.mock.calls.find(
      ([channel]) => channel === AI_CHANNELS.setSettings,
    )?.[1]
    const setHandler = registeredHandler as
      ((_event: unknown, settings: AiSettings) => Promise<void>) | undefined
    const settings = {
      ...defaultAiSettings(),
      provider: 'custom' as const,
    }

    expect(setHandler).toBeTypeOf('function')
    await setHandler?.({}, settings)

    expect(send).toHaveBeenCalledWith(AI_CHANNELS.settingsChanged, settings)
  })
})
