/*
 * Provider settings UI structure adapted from Cherry Studio's AGPL-3.0
 * ProviderSettings module. Runtime configuration remains GenOffice-owned.
 */
import type { AiProviderConfig, AiProviderId, AiProviderMeta } from '@genoffice/ai-provider'

export type VisibleProviderId = Exclude<AiProviderId, 'codex'>
export type ProviderViewId = VisibleProviderId | 'image'

export interface ProviderListEntry {
  id: ProviderViewId
  label: string
  meta?: AiProviderMeta
  model: string
  active: boolean
  configured: boolean
}

export interface CustomProviderDraft extends AiProviderConfig {}
