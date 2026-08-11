import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPiResources } from '../src/resources'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('createPiResources', () => {
  it('does not execute npm package discovery when the embedded app has no npm PATH', async () => {
    const root = await mkdtemp(join(tmpdir(), 'genoffice-pi-resources-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'project')
    const agentDir = join(root, 'agent')
    await mkdir(cwd, { recursive: true })
    await mkdir(agentDir, { recursive: true })
    await writeFile(
      join(agentDir, 'settings.json'),
      JSON.stringify({ npmCommand: ['npm'], packages: ['unavailable-test-package'] }),
      'utf8',
    )
    vi.stubEnv('PATH', '')

    const resources = await createPiResources(cwd, agentDir, 'Office system prompt')

    expect(resources.loader.getSystemPrompt()).toBe('Office system prompt')
    expect(resources.settingsManager.getNpmCommand()).toBeUndefined()
    expect(resources.settingsManager.getPackages()).toEqual([])
  })
})
