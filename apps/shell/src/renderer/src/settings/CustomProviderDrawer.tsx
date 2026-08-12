/*
 * Adapted from Cherry Studio ProviderEditorDrawer.
 * Source: src/renderer/pages/settings/ProviderSettings/ProviderList/ProviderEditorDrawer.tsx
 * License: GNU AGPL-3.0
 */
import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import type { AiProviderConfig } from '@genoffice/ai-provider'

interface CustomProviderDrawerProps {
  open: boolean
  initial: AiProviderConfig
  saving: boolean
  onClose: () => void
  onSubmit: (config: AiProviderConfig) => void
}

export function CustomProviderDrawer({
  open,
  initial,
  saving,
  onClose,
  onSubmit,
}: CustomProviderDrawerProps) {
  const [draft, setDraft] = useState(initial)

  useEffect(() => {
    if (open) setDraft(initial)
  }, [initial, open])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="cherry-provider-drawer-overlay" onMouseDown={onClose}>
      <aside
        className="cherry-provider-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-provider-drawer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="custom-provider-drawer-title">添加自定义 Provider</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit({
              apiKey: draft.apiKey.trim(),
              model: draft.model.trim(),
              baseUrl: (draft.baseUrl ?? '').trim().replace(/\/+$/, ''),
            })
          }}
        >
          <div className="cherry-provider-drawer-body">
            <div className="cherry-provider-field">
              <label htmlFor="custom-provider-host">API 地址</label>
              <input
                id="custom-provider-host"
                required
                type="url"
                value={draft.baseUrl ?? ''}
                placeholder="https://api.example.com/v1"
                onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              />
            </div>
            <div className="cherry-provider-field">
              <label htmlFor="custom-provider-key">API 密钥</label>
              <input
                id="custom-provider-key"
                type="password"
                autoComplete="off"
                value={draft.apiKey}
                placeholder="API Key"
                onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
              />
            </div>
            <div className="cherry-provider-field">
              <label htmlFor="custom-provider-model">模型 ID</label>
              <input
                id="custom-provider-model"
                required
                value={draft.model}
                placeholder="model-id"
                onChange={(event) => setDraft({ ...draft, model: event.target.value })}
              />
            </div>
          </div>
          <footer>
            <button type="button" className="secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? '保存中…' : '添加 Provider'}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  )
}
