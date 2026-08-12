/*
 * Adapted from Cherry Studio ProviderList / ProviderListItem.
 * Source: src/renderer/pages/settings/ProviderSettings/ProviderList
 * License: GNU AGPL-3.0
 */
import { useMemo, useState } from 'react'
import {
  BracketsCurly,
  CaretRight,
  ImageSquare,
  MagnifyingGlass,
  Plus,
  Sparkle,
  X,
} from '@phosphor-icons/react'
import type { ProviderListEntry, ProviderViewId } from './types'

interface ProviderListProps {
  entries: readonly ProviderListEntry[]
  selectedProviderId: ProviderViewId
  onSelectProvider: (providerId: ProviderViewId) => void
  onAddProvider: () => void
}

function ProviderAvatar({ entry }: { entry: ProviderListEntry }) {
  if (entry.id === 'custom') return <BracketsCurly size={15} weight="bold" />
  if (entry.id === 'image') return <ImageSquare size={15} weight="duotone" />
  if (entry.id === 'genspark') return <Sparkle size={14} weight="fill" />
  return <span>{entry.label.slice(0, 1).toUpperCase()}</span>
}

export function ProviderList({
  entries,
  selectedProviderId,
  onSelectProvider,
  onAddProvider,
}: ProviderListProps) {
  const [searchText, setSearchText] = useState('')
  const visibleEntries = useMemo(() => {
    const keywords = searchText.toLowerCase().split(/\s+/).filter(Boolean)
    if (keywords.length === 0) return entries
    return entries.filter((entry) => {
      const haystack = `${entry.label} ${entry.id} ${entry.model}`.toLowerCase()
      return keywords.every((keyword) => haystack.includes(keyword))
    })
  }, [entries, searchText])

  const textEntries = visibleEntries.filter((entry) => entry.id !== 'image')
  const imageEntries = visibleEntries.filter((entry) => entry.id === 'image')

  return (
    <aside className="cherry-provider-list">
      <div className="cherry-provider-search-row">
        <div className="cherry-provider-search-wrap">
          <MagnifyingGlass className="cherry-provider-search-icon" size={14} />
          <input
            value={searchText}
            placeholder="搜索 Provider"
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchText('')
            }}
          />
          {searchText && (
            <button type="button" aria-label="清空" onClick={() => setSearchText('')}>
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      <div className="cherry-provider-scroller">
        {textEntries.length > 0 && (
          <section className="cherry-provider-group">
            <div className="cherry-provider-section-label">Provider</div>
            {textEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-selected={selectedProviderId === entry.id ? 'true' : 'false'}
                className="cherry-provider-row"
                onClick={() => onSelectProvider(entry.id)}
              >
                <span className={`cherry-provider-avatar ${entry.id}`} aria-hidden="true">
                  <ProviderAvatar entry={entry} />
                </span>
                <span className="cherry-provider-label">{entry.label}</span>
                <span className="cherry-provider-trailing">
                  {entry.active ? <span className="cherry-provider-enabled-dot" /> : null}
                  <CaretRight className="cherry-provider-row-caret" size={12} />
                </span>
              </button>
            ))}
          </section>
        )}

        {imageEntries.length > 0 && (
          <section className="cherry-provider-group">
            <div className="cherry-provider-section-label">图片生成</div>
            {imageEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-selected={selectedProviderId === entry.id ? 'true' : 'false'}
                className="cherry-provider-row"
                onClick={() => onSelectProvider(entry.id)}
              >
                <span className="cherry-provider-avatar image" aria-hidden="true">
                  <ProviderAvatar entry={entry} />
                </span>
                <span className="cherry-provider-label">{entry.label}</span>
                <span className="cherry-provider-trailing">
                  {entry.configured ? <span className="cherry-provider-enabled-dot" /> : null}
                  <CaretRight className="cherry-provider-row-caret" size={12} />
                </span>
              </button>
            ))}
          </section>
        )}

        {visibleEntries.length === 0 && (
          <div className="cherry-provider-empty">未找到 Provider</div>
        )}
      </div>

      <div className="cherry-provider-add-footer">
        <button type="button" className="cherry-provider-add-button" onClick={onAddProvider}>
          <Plus size={14} weight="bold" />
          <span>添加 Provider</span>
        </button>
      </div>
    </aside>
  )
}
