/*
 * Provider settings page ported from Cherry Studio's ProviderSettingsPage.
 * Source: src/renderer/pages/settings/ProviderSettings/ProviderSettingsPage.tsx
 * License: GNU AGPL-3.0
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AI_PROVIDERS,
  defaultAiSettings,
  type AiProviderConfig,
  type AiModelListRequest,
  type AiModelListResult,
  type AiProviderMeta,
  type AiSettings,
} from '@genoffice/ai-provider'
import { CustomProviderDrawer } from './settings/CustomProviderDrawer'
import { ProviderList } from './settings/ProviderList'
import { ProviderSetting } from './settings/ProviderSetting'
import type { ProviderListEntry, ProviderViewId, VisibleProviderId } from './settings/types'
import './settings.css'

const VISIBLE_PROVIDERS = AI_PROVIDERS.filter(
  (provider): provider is AiProviderMeta & { id: VisibleProviderId } => provider.id !== 'codex',
)

function initialSelection(settings: AiSettings): ProviderViewId {
  return settings.provider === 'codex' ? 'custom' : settings.provider
}

export function Settings() {
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderViewId>('custom')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void window.aiOffice
      .getAiSettings()
      .then((loaded) => {
        if (!active) return
        setSettings(loaded)
        setSelectedProviderId(initialSelection(loaded))
      })
      .catch((cause: unknown) => {
        if (!active) return
        const fallback = defaultAiSettings()
        setSettings(fallback)
        setSelectedProviderId(initialSelection(fallback))
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(
    () =>
      window.aiOffice.onAiSettingsChanged((next) => {
        setSettings(next)
        setError('')
      }),
    [],
  )

  const save = async (next: AiSettings): Promise<void> => {
    setSettings(next)
    setSaving(true)
    setError('')
    try {
      await window.aiOffice.setAiSettings(next)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const listModels = useCallback(
    (request: AiModelListRequest): Promise<AiModelListResult> =>
      window.aiOffice.listAiModels(request),
    [],
  )

  const entries = useMemo<ProviderListEntry[]>(() => {
    if (!settings) return []
    const textProviders = VISIBLE_PROVIDERS.map((meta) => {
      const config = settings.providers[meta.id]
      return {
        id: meta.id,
        label: meta.label,
        meta,
        model: config.model,
        active: settings.provider === meta.id,
        configured:
          meta.id === 'genspark' ||
          Boolean(config.apiKey) ||
          Boolean(config.baseUrl && config.model),
      }
    })
    return [
      ...textProviders,
      {
        id: 'image' as const,
        label: '图片生成',
        model: settings.image.model,
        active: false,
        configured: Boolean(settings.image.baseUrl && settings.image.model),
      },
    ]
  }, [settings])

  const selectedMeta =
    selectedProviderId === 'image'
      ? undefined
      : VISIBLE_PROVIDERS.find((provider) => provider.id === selectedProviderId)

  const saveCustomProvider = (config: AiProviderConfig): void => {
    if (!settings) return
    const next: AiSettings = {
      ...settings,
      provider: 'custom',
      providers: { ...settings.providers, custom: config },
    }
    setSelectedProviderId('custom')
    void save(next).then(() => setDrawerOpen(false))
  }

  if (!settings) {
    return (
      <main className="cherry-provider-page loading" aria-label="Provider 设置">
        <span />
        <span />
        <span />
      </main>
    )
  }

  return (
    <main className="cherry-provider-page">
      <ProviderList
        entries={entries}
        selectedProviderId={selectedProviderId}
        onSelectProvider={setSelectedProviderId}
        onAddProvider={() => setDrawerOpen(true)}
      />
      <ProviderSetting
        key={selectedProviderId}
        providerId={selectedProviderId}
        meta={selectedMeta}
        settings={settings}
        saving={saving}
        error={error}
        onChange={setSettings}
        onSave={save}
        onListModels={listModels}
        onEditCustom={() => setDrawerOpen(true)}
      />
      <CustomProviderDrawer
        open={drawerOpen}
        initial={settings.providers.custom}
        saving={saving}
        onClose={() => setDrawerOpen(false)}
        onSubmit={saveCustomProvider}
      />
    </main>
  )
}
