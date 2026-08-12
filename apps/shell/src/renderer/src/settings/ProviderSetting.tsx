/*
 * Adapted from Cherry Studio ProviderSetting, AuthenticationSection and ModelList.
 * Source: src/renderer/pages/settings/ProviderSettings
 * License: GNU AGPL-3.0
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowsClockwise,
  Check,
  Eye,
  EyeSlash,
  MagnifyingGlass,
  Plus,
  WarningCircle,
} from '@phosphor-icons/react'
import type {
  AiModelListRequest,
  AiModelListResult,
  AiProviderConfig,
  AiProviderMeta,
  AiSettings,
} from '@genoffice/ai-provider'
import type { ProviderViewId, VisibleProviderId } from './types'

interface ProviderSettingProps {
  providerId: ProviderViewId
  meta?: AiProviderMeta
  settings: AiSettings
  saving: boolean
  error: string
  onChange: (settings: AiSettings) => void
  onSave: (settings: AiSettings) => Promise<void>
  onListModels: (request: AiModelListRequest) => Promise<AiModelListResult>
  onEditCustom: () => void
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="cherry-provider-switch"
      onClick={onChange}
    >
      <span />
    </button>
  )
}

function SecretInput({
  value,
  placeholder,
  onChange,
  onCommit,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
  onCommit: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="cherry-provider-input-group">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit(event.target.value)}
      />
      <button
        type="button"
        className="cherry-provider-input-icon"
        aria-label={visible ? '隐藏密钥' : '显示密钥'}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeSlash size={13} /> : <Eye size={13} />}
      </button>
    </div>
  )
}

export function ProviderSetting({
  providerId,
  meta,
  settings,
  saving,
  error,
  onChange,
  onSave,
  onListModels,
  onEditCustom,
}: ProviderSettingProps) {
  const [modelSearch, setModelSearch] = useState('')
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelError, setModelError] = useState('')
  const [manualModelOpen, setManualModelOpen] = useState(false)
  const isImage = providerId === 'image'
  const isGenspark = providerId === 'genspark'
  const textProviderId = isImage ? null : (providerId as VisibleProviderId)
  const config: AiProviderConfig | AiSettings['image'] = isImage
    ? settings.image
    : settings.providers[textProviderId!]
  const title = isImage ? '图片生成' : (meta?.label ?? providerId)
  const active = textProviderId !== null && settings.provider === textProviderId

  const updateTextProvider = (patch: Partial<AiProviderConfig>, commit = false): void => {
    if (!textProviderId) return
    const next = {
      ...settings,
      providers: {
        ...settings.providers,
        [textProviderId]: { ...settings.providers[textProviderId], ...patch },
      },
    }
    onChange(next)
    if (commit) void onSave(next)
  }

  const updateImage = (patch: Partial<AiSettings['image']>, commit = false): void => {
    const next = { ...settings, image: { ...settings.image, ...patch } }
    onChange(next)
    if (commit) void onSave(next)
  }

  const canDiscover =
    isGenspark ||
    (providerId === 'custom' || isImage
      ? Boolean(config.baseUrl?.trim())
      : Boolean(config.apiKey.trim()))

  const discoverModels = useCallback(async (): Promise<void> => {
    if (!canDiscover) {
      setModelError(
        providerId === 'custom' || isImage
          ? '填写 API 地址后可自动获取，也可以直接添加模型 ID。'
          : '填写 API 密钥后将自动获取模型，也可以直接添加模型 ID。',
      )
      return
    }
    setModelsLoading(true)
    setModelError('')
    const requestConfig = isImage
      ? { apiKey: config.apiKey, model: '', baseUrl: config.baseUrl ?? '' }
      : { apiKey: config.apiKey, model: '', baseUrl: config.baseUrl }
    try {
      const result = await onListModels({ providerId, config: requestConfig })
      setDiscoveredModels(result.models)
      setModelError(result.error ?? '')
      if (result.error || result.models.length === 0) setManualModelOpen(true)
    } catch (cause: unknown) {
      setDiscoveredModels([])
      setModelError(cause instanceof Error ? cause.message : String(cause))
      setManualModelOpen(true)
    } finally {
      setModelsLoading(false)
    }
  }, [canDiscover, config.apiKey, config.baseUrl, isImage, onListModels, providerId])

  useEffect(() => {
    const timer = window.setTimeout(() => void discoverModels(), 350)
    return () => window.clearTimeout(timer)
  }, [discoverModels])

  const models = useMemo(() => {
    const source = [...new Set([config.model, ...discoveredModels].filter(Boolean))]
    const query = modelSearch.trim().toLowerCase()
    return source.filter(Boolean).filter((model) => !query || model.toLowerCase().includes(query))
  }, [config.model, discoveredModels, modelSearch])

  const selectModel = (model: string, commit = true): void => {
    if (isImage) updateImage({ model }, commit)
    else updateTextProvider({ model }, commit)
  }

  const toggleActive = (): void => {
    if (!textProviderId) return
    const fallback: VisibleProviderId = textProviderId === 'custom' ? 'openai' : 'custom'
    void onSave({ ...settings, provider: active ? fallback : textProviderId })
  }

  return (
    <section className="cherry-provider-detail" data-testid="provider-detail-shell">
      <div className="cherry-provider-detail-header">
        <div className="cherry-provider-detail-title">
          <h1>{title}</h1>
          {providerId === 'custom' && (
            <button type="button" className="cherry-provider-header-action" onClick={onEditCustom}>
              编辑
            </button>
          )}
        </div>
        {!isImage && <Toggle checked={active} disabled={saving} onChange={toggleActive} />}
      </div>

      <div className="cherry-provider-detail-scroll">
        <div className="cherry-provider-section-stack">
          {error && (
            <div className="cherry-provider-error" role="alert">
              <WarningCircle size={15} weight="fill" />
              <span>{error}</span>
            </div>
          )}

          <section className="cherry-provider-section">
            <h2>连接设置</h2>
            {isGenspark ? (
              <div className="cherry-provider-account-auth">
                <div>
                  <strong>Genspark 账号</strong>
                  <span>使用左下角账号入口登录，无需单独填写 API 密钥。</span>
                </div>
                <span className="cherry-provider-account-badge">账号授权</span>
              </div>
            ) : (
              <div className="cherry-provider-field">
                <label htmlFor={`provider-${providerId}-key`}>API 密钥</label>
                <SecretInput
                  value={config.apiKey}
                  placeholder={meta?.keyPlaceholder ?? 'API Key'}
                  onChange={(value) =>
                    isImage ? updateImage({ apiKey: value }) : updateTextProvider({ apiKey: value })
                  }
                  onCommit={(value) =>
                    isImage
                      ? updateImage({ apiKey: value }, true)
                      : updateTextProvider({ apiKey: value }, true)
                  }
                />
              </div>
            )}

            {(providerId === 'custom' || isImage) && (
              <div className="cherry-provider-field">
                <label htmlFor={`provider-${providerId}-host`}>API 地址</label>
                <input
                  id={`provider-${providerId}-host`}
                  type="url"
                  value={config.baseUrl ?? ''}
                  placeholder="https://api.openai.com/v1"
                  onChange={(event) =>
                    isImage
                      ? updateImage({ baseUrl: event.target.value })
                      : updateTextProvider({ baseUrl: event.target.value })
                  }
                  onBlur={(event) =>
                    isImage
                      ? updateImage({ baseUrl: event.target.value }, true)
                      : updateTextProvider({ baseUrl: event.target.value }, true)
                  }
                />
              </div>
            )}
          </section>

          <section className="cherry-provider-model-section">
            <div className="cherry-provider-model-header">
              <div>
                <h2>模型</h2>
                <span className="cherry-provider-model-status">
                  {modelsLoading
                    ? '正在从服务获取模型…'
                    : discoveredModels.length > 0
                      ? `已获取 ${discoveredModels.length} 个模型`
                      : '自动获取可用模型'}
                </span>
              </div>
              <div className="cherry-provider-model-actions">
                <button
                  type="button"
                  className="cherry-provider-model-add"
                  disabled={modelsLoading}
                  onClick={() => void discoverModels()}
                >
                  <ArrowsClockwise size={13} className={modelsLoading ? 'is-spinning' : ''} />
                  刷新
                </button>
                <button
                  type="button"
                  className="cherry-provider-model-add"
                  onClick={() => setManualModelOpen((open) => !open)}
                >
                  <Plus size={13} weight="bold" />
                  自定义模型 ID
                </button>
              </div>
            </div>

            {modelError && (
              <div className="cherry-provider-model-notice">
                <WarningCircle size={14} />
                <span>{modelError}</span>
              </div>
            )}

            {manualModelOpen && (
              <div className="cherry-provider-field cherry-provider-model-input">
                <label htmlFor={`provider-${providerId}-model`}>模型 ID</label>
                <input
                  id={`provider-${providerId}-model`}
                  value={config.model}
                  placeholder="输入服务实际支持的模型 ID"
                  onChange={(event) => selectModel(event.target.value, false)}
                  onBlur={(event) => selectModel(event.target.value)}
                />
              </div>
            )}

            {(modelsLoading || models.length > 0 || discoveredModels.length > 0) && (
              <>
                <div className="cherry-provider-model-search">
                  <MagnifyingGlass size={13} />
                  <input
                    value={modelSearch}
                    placeholder="搜索模型"
                    onChange={(event) => setModelSearch(event.target.value)}
                  />
                </div>
                <div className="cherry-provider-model-list">
                  {models.map((model) => {
                    const selected = config.model === model
                    return (
                      <button
                        key={model}
                        type="button"
                        className="cherry-provider-model-row"
                        data-selected={selected ? 'true' : 'false'}
                        onClick={() => selectModel(model)}
                      >
                        <span>{model}</span>
                        <span className="cherry-provider-model-check">
                          {selected && <Check size={12} weight="bold" />}
                        </span>
                      </button>
                    )
                  })}
                  {!modelsLoading && models.length === 0 && (
                    <div className="cherry-provider-model-empty">没有匹配的模型</div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}
