import { DefaultResourceLoader, SettingsManager } from '@mariozechner/pi-coding-agent'

export interface PiResources {
  loader: DefaultResourceLoader
  settingsManager: SettingsManager
}

/**
 * Build resources for an embedded Pi session.
 *
 * GenOffice deliberately does not inherit Pi CLI package-manager settings:
 * packaged macOS applications do not have a shell npm PATH, and resource
 * discovery must not depend on executing `npm root -g`. Standard project and
 * global Skill/Extension directories are still discovered by the loader.
 */
export async function createPiResources(
  cwd: string,
  agentDir: string,
  systemPrompt: string,
): Promise<PiResources> {
  const settingsManager = SettingsManager.inMemory()
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    systemPrompt,
  })
  await loader.reload()
  return { loader, settingsManager }
}
