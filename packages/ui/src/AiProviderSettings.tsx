import { useEffect, useState } from 'react'
import { CheckCircle, Eye, EyeSlash, LockKey, Sparkle, X } from '@phosphor-icons/react'
import type { Lang } from '@genoffice/i18n'
import { aiProviderSettingsText } from './ai-provider-settings-strings'
import './ai-provider-settings.css'

export interface CustomAiProviderSettings {
  provider: string
  providers: { custom: { apiKey: string; model: string; baseUrl?: string | undefined } }
}

type CustomAiProviderConfig = CustomAiProviderSettings['providers']['custom']

export interface AiProviderSettingsFormProps<T extends CustomAiProviderSettings> {
  lang: Lang
  settings: T
  onChange: (settings: T) => void
  onSubmit: (settings: T) => void
  onCancel?: () => void
  submitting?: boolean
  idPrefix?: string
  variant?: 'page' | 'dialog'
}

function withCustomSettings<T extends CustomAiProviderSettings>(
  settings: T,
  custom: CustomAiProviderConfig,
): T {
  return {
    ...settings,
    provider: 'custom',
    providers: {
      ...settings.providers,
      custom,
    },
  } as T
}

function normalizedSettings<T extends CustomAiProviderSettings>(settings: T): T {
  const custom = settings.providers.custom
  return withCustomSettings(settings, {
    apiKey: custom.apiKey.trim(),
    model: custom.model.trim(),
    baseUrl: (custom.baseUrl ?? '').trim().replace(/\/+$/, ''),
  })
}

function concealApiKey(apiKeyId: string): void {
  if (typeof document === 'undefined') return
  const element = document.getElementById(apiKeyId)
  const input = element instanceof HTMLInputElement ? element : null
  if (input) input.type = 'password'
  const toggle = input?.form?.querySelector<HTMLButtonElement>('.ai-provider-secret-toggle')
  toggle?.classList.remove('is-revealed')
  toggle?.setAttribute('aria-pressed', 'false')
}

/**
 * Controlled, renderer-safe form shared by the shell settings page and the
 * editor modal. Persistence and networking stay with the Electron host.
 */
export function AiProviderSettingsForm<T extends CustomAiProviderSettings>({
  lang,
  settings,
  onChange,
  onSubmit,
  onCancel,
  submitting = false,
  idPrefix = 'custom-ai-provider',
  variant = 'page',
}: AiProviderSettingsFormProps<T>) {
  const custom = settings.providers.custom
  const baseUrlId = `${idPrefix}-base-url`
  const modelId = `${idPrefix}-model`
  const apiKeyId = `${idPrefix}-api-key`

  const updateCustom = (patch: Partial<CustomAiProviderConfig>): void => {
    onChange(withCustomSettings(settings, { ...custom, ...patch }))
  }

  const toggleKeyVisibility = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const input = document.getElementById(apiKeyId)
    if (!(input instanceof HTMLInputElement)) return
    const reveal = input.type === 'password'
    input.type = reveal ? 'text' : 'password'
    event.currentTarget.classList.toggle('is-revealed', reveal)
    event.currentTarget.setAttribute('aria-pressed', String(reveal))
  }

  return (
    <form
      className={`ai-provider-form ai-provider-form--${variant}`}
      onSubmit={(event) => {
        event.preventDefault()
        concealApiKey(apiKeyId)
        onSubmit(normalizedSettings(settings))
      }}
    >
      <div className="ai-provider-fields">
        <div className="ai-provider-field">
          <label htmlFor={baseUrlId}>{aiProviderSettingsText(lang, 'baseUrl')}</label>
          <input
            id={baseUrlId}
            required
            type="url"
            autoComplete="url"
            value={custom.baseUrl ?? ''}
            onChange={(event) => updateCustom({ baseUrl: event.target.value })}
            placeholder="http://localhost:11434/v1"
          />
          <span className="ai-provider-field-hint">
            {aiProviderSettingsText(lang, 'baseUrlHint')}
          </span>
        </div>

        <div className="ai-provider-field">
          <label htmlFor={modelId}>{aiProviderSettingsText(lang, 'model')}</label>
          <input
            id={modelId}
            required
            value={custom.model}
            onChange={(event) => updateCustom({ model: event.target.value })}
            placeholder="llama3.1"
          />
          <span className="ai-provider-field-hint">
            {aiProviderSettingsText(lang, 'modelHint')}
          </span>
        </div>

        <div className="ai-provider-field">
          <label htmlFor={apiKeyId}>{aiProviderSettingsText(lang, 'apiKey')}</label>
          <div className="ai-provider-secret-field">
            <input
              id={apiKeyId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={custom.apiKey}
              onChange={(event) => updateCustom({ apiKey: event.target.value })}
              placeholder={aiProviderSettingsText(lang, 'apiKeyPlaceholder')}
            />
            <button
              type="button"
              className="ai-provider-secret-toggle"
              aria-label={aiProviderSettingsText(lang, 'apiKey')}
              aria-pressed="false"
              onClick={toggleKeyVisibility}
            >
              <Eye className="ai-provider-eye-show" size={20} weight="regular" />
              <EyeSlash className="ai-provider-eye-hide" size={20} weight="regular" />
            </button>
          </div>
        </div>

        <p className="ai-provider-security-note">
          <LockKey size={17} weight="regular" aria-hidden="true" />
          <span>{aiProviderSettingsText(lang, 'security')}</span>
        </p>
      </div>

      <div className="ai-provider-actions">
        {onCancel && (
          <button
            type="button"
            className="ai-provider-button secondary"
            onClick={() => {
              concealApiKey(apiKeyId)
              onCancel()
            }}
          >
            {aiProviderSettingsText(lang, 'cancel')}
          </button>
        )}
        <button type="submit" className="ai-provider-button primary" disabled={submitting}>
          {submitting ? (
            <span className="ai-provider-button-spinner" aria-hidden="true" />
          ) : (
            <CheckCircle size={18} weight="bold" aria-hidden="true" />
          )}
          {aiProviderSettingsText(lang, 'save')}
        </button>
      </div>
    </form>
  )
}

/**
 * Polished modal editor used from each document AI panel. The dedicated shell
 * settings page uses AiProviderSettingsForm directly.
 */
export function AiProviderSettings<T extends CustomAiProviderSettings>({
  open,
  lang,
  settings,
  onSave,
  onClose,
}: {
  open: boolean
  lang: Lang
  settings: T
  onSave: (settings: T) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(settings)

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="ai-provider-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="ai-provider-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-ai-provider-title"
      >
        <header className="ai-provider-dialog-header">
          <span className="ai-provider-dialog-icon" aria-hidden="true">
            <Sparkle size={21} weight="fill" />
          </span>
          <div>
            <h2 id="custom-ai-provider-title">{aiProviderSettingsText(lang, 'title')}</h2>
            <p>{aiProviderSettingsText(lang, 'description')}</p>
          </div>
          <button
            type="button"
            className="ai-provider-close"
            aria-label={aiProviderSettingsText(lang, 'cancel')}
            onClick={onClose}
          >
            <X size={19} weight="bold" />
          </button>
        </header>

        <AiProviderSettingsForm
          variant="dialog"
          lang={lang}
          settings={draft}
          onChange={setDraft}
          onCancel={onClose}
          onSubmit={(next) => {
            onSave(next)
            onClose()
          }}
        />
      </section>
    </div>
  )
}
