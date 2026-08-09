import { useEffect, useState } from 'react'
import { CheckCircle, Sparkle, WarningCircle } from '@phosphor-icons/react'
import { defaultAiSettings, type AiSettings } from '@genoffice/ai-provider'
import { AiProviderSettingsForm, aiProviderSettingsText } from '@genoffice/ui'
import { useI18n } from './locale'
import './settings.css'

function sameSettings(left: AiSettings | null, right: AiSettings | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function Settings() {
  const { lang, t } = useI18n()
  const [savedSettings, setSavedSettings] = useState<AiSettings | null>(null)
  const [draft, setDraft] = useState<AiSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void window.aiOffice
      .getAiSettings()
      .then((settings) => {
        if (!active) return
        setSavedSettings(settings)
        setDraft(settings)
      })
      .catch((cause: unknown) => {
        if (!active) return
        const fallback = defaultAiSettings()
        setSavedSettings(fallback)
        setDraft(fallback)
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(
    () =>
      window.aiOffice.onAiSettingsChanged((settings) => {
        setSavedSettings(settings)
        setDraft(settings)
        setError('')
      }),
    [],
  )

  const dirty = !sameSettings(draft, savedSettings)

  const save = async (settings: AiSettings): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      await window.aiOffice.setAiSettings(settings)
      setSavedSettings(settings)
      setDraft(settings)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="settings-page">
      <header className="settings-page-header">
        <h1>{t('navSettings')}</h1>
      </header>

      <div className="settings-layout">
        <nav className="settings-rail" aria-label={t('navSettings')}>
          <button className="settings-rail-item active" aria-current="page">
            <Sparkle size={19} weight="duotone" aria-hidden="true" />
            <span>{aiProviderSettingsText(lang, 'serviceTitle')}</span>
          </button>
          <div className="settings-rail-meta" aria-hidden="true">
            <span className="settings-provider-dot" />
            OpenAI API
          </div>
        </nav>

        <section className="settings-detail" aria-labelledby="ai-service-title">
          <div className="settings-detail-header">
            <div>
              <span className="settings-eyebrow">OpenAI API</span>
              <h2 id="ai-service-title">{aiProviderSettingsText(lang, 'serviceTitle')}</h2>
              <p>{aiProviderSettingsText(lang, 'description')}</p>
            </div>
            {!dirty && !saving && !error && draft && (
              <span className="settings-status saved" role="status">
                <CheckCircle size={18} weight="fill" aria-hidden="true" />
                {aiProviderSettingsText(lang, 'saved')}
              </span>
            )}
            {error && (
              <span className="settings-status error" role="alert" title={error}>
                <WarningCircle size={18} weight="fill" aria-hidden="true" />
                {error}
              </span>
            )}
          </div>

          {draft ? (
            <AiProviderSettingsForm
              variant="page"
              idPrefix="shell-ai-provider"
              lang={lang}
              settings={draft}
              submitting={saving}
              onChange={setDraft}
              onCancel={() => {
                if (savedSettings) setDraft(savedSettings)
                setError('')
              }}
              onSubmit={(settings) => void save(settings)}
            />
          ) : (
            <div className="settings-loading" aria-label={aiProviderSettingsText(lang, 'title')}>
              <span />
              <span />
              <span />
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
