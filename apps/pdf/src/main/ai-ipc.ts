import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, ipcMain, webContents } from 'electron'
import {
  defaultAiSettings,
  resolveAiSettings,
  streamForProvider,
  type AiSettings,
  type AiStreamChunk,
  type AiStreamRequest,
  type LegacyAiSettings,
} from '@genoffice/ai-provider'
import { broadcastRendererEvent } from '@genoffice/electron-utils'
import { AI_CHANNELS } from '../shared/ipc'

const activeStreams = new Map<string, AbortController>()

const settingsPath = (): string => join(app.getPath('userData'), 'ai-settings.json')

async function readSettings(): Promise<AiSettings> {
  let stored: Partial<AiSettings> & LegacyAiSettings = {}
  try {
    stored = JSON.parse(await readFile(settingsPath(), 'utf8')) as Partial<AiSettings> &
      LegacyAiSettings
  } catch {
    // First run or malformed local state: use provider defaults.
  }
  return resolveAiSettings(stored, defaultAiSettings())
}

async function writeSettings(settings: AiSettings): Promise<void> {
  const path = settingsPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(settings, null, 2), 'utf8')
}

let registered = false

/** Register AI IPC only for the standalone PDF process. The unified shell owns these channels. */
export function registerStandalonePdfAiIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(AI_CHANNELS.getSettings, () => readSettings())
  ipcMain.handle(AI_CHANNELS.setSettings, async (_event, settings: AiSettings) => {
    await writeSettings(settings)
    broadcastRendererEvent(webContents.getAllWebContents(), AI_CHANNELS.settingsChanged, settings)
  })
  ipcMain.handle(AI_CHANNELS.stream, async (event, request: AiStreamRequest) => {
    const { requestId, settings, system, messages } = request
    const provider = settings.provider
    const config = settings.providers[provider]
    const send = (chunk: AiStreamChunk): void => {
      if (!event.sender.isDestroyed()) event.sender.send(AI_CHANNELS.streamChunk, chunk)
    }
    if (!config || (!config.apiKey && provider !== 'custom')) {
      send({ requestId, type: 'error', error: `No API key configured for ${provider}` })
      return
    }
    if (!config.model) {
      send({ requestId, type: 'error', error: 'No model name configured' })
      return
    }

    const controller = new AbortController()
    activeStreams.set(requestId, controller)
    try {
      await streamForProvider(
        provider,
        config,
        system,
        messages,
        request.tools ?? [],
        request.maxTokens ?? 8192,
        {
          signal: controller.signal,
          onDelta: (text) => send({ requestId, type: 'delta', text }),
          onToolCall: (toolCall) => send({ requestId, type: 'tool-call', toolCall }),
        },
      )
      send({ requestId, type: 'done' })
    } catch (error) {
      send({
        requestId,
        type: controller.signal.aborted ? 'done' : 'error',
        ...(controller.signal.aborted
          ? {}
          : { error: error instanceof Error ? error.message : String(error) }),
      })
    } finally {
      activeStreams.delete(requestId)
    }
  })
  ipcMain.handle(AI_CHANNELS.streamCancel, (_event, requestId: string) => {
    activeStreams.get(requestId)?.abort()
  })
}
