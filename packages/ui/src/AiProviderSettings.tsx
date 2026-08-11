import { useEffect, useState } from 'react'
import { CheckCircle, Eye, EyeSlash, LockKey, Sparkle, X } from '@phosphor-icons/react'
import type { Lang } from '@genoffice/i18n'
import { aiProviderSettingsText } from './ai-provider-settings-strings'
import './ai-provider-settings.css'

export interface CustomAiProviderSettings {
  provider: string
  providers: {
    custom: { apiKey: string; model: string; baseUrl?: string | undefined }
    codex: { apiKey: string; model: string; baseUrl?: string | undefined }
  }
  image: { apiKey: string; model: string; baseUrl: string }
}

type CustomAiProviderConfig = CustomAiProviderSettings['providers']['custom']
type CodexAiProviderConfig = CustomAiProviderSettings['providers']['codex']
type ImageProviderConfig = CustomAiProviderSettings['image']

export interface CodexOAuthBridge {
  codexAuthStatus(): Promise<{ loggedIn: boolean }>
  codexLogin(): Promise<{ loggedIn: boolean }>
  codexLogout(): Promise<{ loggedIn: boolean }>
}

function globalOAuthBridge(): CodexOAuthBridge | undefined {
  if (typeof globalThis === 'undefined') return undefined
  return (globalThis as typeof globalThis & { piAgent?: CodexOAuthBridge }).piAgent
}

export interface AiProviderSettingsFormProps<T extends CustomAiProviderSettings> {
  lang: Lang
  settings: T
  onChange: (settings: T) => void
  onSubmit: (settings: T) => void
  onCancel?: () => void
  submitting?: boolean
  idPrefix?: string
  variant?: 'page' | 'dialog'
  oauthBridge?: CodexOAuthBridge
}

function withCustomSettings<T extends CustomAiProviderSettings>(
  settings: T,
  custom: CustomAiProviderConfig,
): T {
  return {
    ...settings,
    providers: {
      ...settings.providers,
      custom,
    },
  } as T
}

function withCodexSettings<T extends CustomAiProviderSettings>(
  settings: T,
  codex: CodexAiProviderConfig,
): T {
  return {
    ...settings,
    providers: { ...settings.providers, codex },
  } as T
}

function normalizedSettings<T extends CustomAiProviderSettings>(settings: T): T {
  const custom = settings.providers.custom
  const normalized = withCustomSettings(settings, {
    apiKey: custom.apiKey.trim(),
    model: custom.model.trim(),
    baseUrl: (custom.baseUrl ?? '').trim().replace(/\/+$/, ''),
  })
  return {
    ...withCodexSettings(normalized, {
      ...normalized.providers.codex,
      model: normalized.providers.codex.model.trim(),
    }),
    provider: settings.provider === 'codex' ? 'codex' : 'custom',
    image: {
      apiKey: normalized.image.apiKey.trim(),
      model: normalized.image.model.trim(),
      baseUrl: normalized.image.baseUrl.trim().replace(/\/+$/, ''),
    },
  }
}

function concealApiKey(apiKeyId: string): void {
  if (typeof document === 'undefined') return
  const element = document.getElementById(apiKeyId)
  const input = element instanceof HTMLInputElement ? element : null
  if (input) input.type = 'password'
  const toggle = input
    ?.closest('.ai-provider-secret-field')
    ?.querySelector<HTMLButtonElement>('.ai-provider-secret-toggle')
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
  oauthBridge,
}: AiProviderSettingsFormProps<T>) {
  const custom = settings.providers.custom
  const codex = settings.providers.codex
  const providerKind = settings.provider === 'codex' ? 'codex' : 'custom'
  const providerId = `${idPrefix}-provider`
  const baseUrlId = `${idPrefix}-base-url`
  const modelId = `${idPrefix}-model`
  const apiKeyId = `${idPrefix}-api-key`
  const codexModelId = `${idPrefix}-codex-model`
  const imageBaseUrlId = `${idPrefix}-image-base-url`
  const imageModelId = `${idPrefix}-image-model`
  const imageApiKeyId = `${idPrefix}-image-api-key`

  const updateCustom = (patch: Partial<CustomAiProviderConfig>): void => {
    onChange(withCustomSettings(settings, { ...custom, ...patch }))
  }

  const updateCodex = (patch: Partial<CodexAiProviderConfig>): void => {
    onChange(withCodexSettings(settings, { ...codex, ...patch }))
  }

  const updateImage = (patch: Partial<ImageProviderConfig>): void => {
    onChange({ ...settings, image: { ...settings.image, ...patch } } as T)
  }

  const toggleKeyVisibility = (
    event: React.MouseEvent<HTMLButtonElement>,
    targetId = apiKeyId,
  ): void => {
    const input = document.getElementById(targetId)
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
        concealApiKey(imageApiKeyId)
        onSubmit(normalizedSettings(settings))
      }}
    >
      <div className="ai-provider-fields">
        <div className="ai-provider-field">
          <label htmlFor={providerId}>{aiProviderSettingsText(lang, 'provider')}</label>
          <select
            id={providerId}
            value={providerKind}
            onChange={(event) =>
              onChange({
                ...settings,
                provider: event.target.value === 'codex' ? 'codex' : 'custom',
              })
            }
          >
            <option value="custom">{aiProviderSettingsText(lang, 'customProvider')}</option>
            <option value="codex">{aiProviderSettingsText(lang, 'codexProvider')}</option>
          </select>
        </div>

        {providerKind === 'custom' ? (
          <>
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
          </>
        ) : (
          <>
            <div className="ai-provider-field">
              <label htmlFor={codexModelId}>{aiProviderSettingsText(lang, 'model')}</label>
              <input
                id={codexModelId}
                required
                value={codex.model}
                onChange={(event) => updateCodex({ model: event.target.value })}
                list={`${idPrefix}-codex-models`}
              />
              <datalist id={`${idPrefix}-codex-models`}>
                {['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2-codex'].map(
                  (model) => (
                    <option key={model} value={model} />
                  ),
                )}
              </datalist>
            </div>
            <CodexOAuthControl lang={lang} {...(oauthBridge ? { bridge: oauthBridge } : {})} />
          </>
        )}

        <div className="ai-provider-section-title">
          {aiProviderSettingsText(lang, 'imageSection')}
        </div>
        <div className="ai-provider-field">
          <label htmlFor={imageBaseUrlId}>{aiProviderSettingsText(lang, 'imageBaseUrl')}</label>
          <input
            id={imageBaseUrlId}
            required
            type="url"
            value={settings.image.baseUrl}
            onChange={(event) => updateImage({ baseUrl: event.target.value })}
            placeholder="https://api.openai.com/v1"
          />
        </div>
        <div className="ai-provider-field">
          <label htmlFor={imageModelId}>{aiProviderSettingsText(lang, 'imageModel')}</label>
          <input
            id={imageModelId}
            required
            value={settings.image.model}
            onChange={(event) => updateImage({ model: event.target.value })}
            placeholder="gpt-image-1"
          />
          <span className="ai-provider-field-hint">
            {aiProviderSettingsText(lang, 'imageModelHint')}
          </span>
        </div>
        <div className="ai-provider-field">
          <label htmlFor={imageApiKeyId}>{aiProviderSettingsText(lang, 'imageApiKey')}</label>
          <div className="ai-provider-secret-field">
            <input
              id={imageApiKeyId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={settings.image.apiKey}
              onChange={(event) => updateImage({ apiKey: event.target.value })}
            />
            <button
              type="button"
              className="ai-provider-secret-toggle"
              aria-label={aiProviderSettingsText(lang, 'imageApiKey')}
              aria-pressed="false"
              onClick={(event) => toggleKeyVisibility(event, imageApiKeyId)}
            >
              <Eye className="ai-provider-eye-show" size={20} />
              <EyeSlash className="ai-provider-eye-hide" size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="ai-provider-actions">
        {onCancel && (
          <button
            type="button"
            className="ai-provider-button secondary"
            onClick={() => {
              concealApiKey(apiKeyId)
              concealApiKey(imageApiKeyId)
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

function CodexOAuthControl({ lang, bridge }: { lang: Lang; bridge?: CodexOAuthBridge }) {
  const resolvedBridge = bridge ?? globalOAuthBridge()
  const [status, setStatus] = useState<'loading' | 'in' | 'out'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!resolvedBridge) {
      setStatus('out')
      return () => {
        active = false
      }
    }
    void resolvedBridge
      .codexAuthStatus()
      .then((next) => active && setStatus(next.loggedIn ? 'in' : 'out'))
      .catch((cause: unknown) => {
        if (!active) return
        setStatus('out')
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      active = false
    }
  }, [resolvedBridge])

  const changeAuth = async (login: boolean): Promise<void> => {
    if (!resolvedBridge) return
    setBusy(true)
    setError('')
    try {
      const next = login ? await resolvedBridge.codexLogin() : await resolvedBridge.codexLogout()
      setStatus(next.loggedIn ? 'in' : 'out')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ai-provider-oauth">
      <div>
        <strong>{aiProviderSettingsText(lang, 'codexOAuth')}</strong>
        <span>
          {status === 'loading'
            ? aiProviderSettingsText(lang, 'codexChecking')
            : status === 'in'
              ? aiProviderSettingsText(lang, 'codexConnected')
              : aiProviderSettingsText(lang, 'codexDisconnected')}
        </span>
      </div>
      <button
        type="button"
        disabled={busy || !resolvedBridge}
        onClick={() => void changeAuth(status !== 'in')}
      >
        {status === 'in'
          ? aiProviderSettingsText(lang, 'codexLogout')
          : aiProviderSettingsText(lang, 'codexLogin')}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
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
  oauthBridge,
}: {
  open: boolean
  lang: Lang
  settings: T
  onSave: (settings: T) => void
  onClose: () => void
  oauthBridge?: CodexOAuthBridge
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
          {...(oauthBridge ? { oauthBridge } : {})}
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
