# Cherry Studio Provider settings source notice

The Provider settings UI in this directory adapts source code and design primitives from
[Cherry Studio](https://github.com/CherryHQ/cherry-studio), licensed under GNU AGPL-3.0.

Upstream source areas:

- `src/renderer/pages/settings/ProviderSettings/ProviderSettingsPage.tsx`
- `src/renderer/pages/settings/ProviderSettings/ProviderList/`
- `src/renderer/pages/settings/ProviderSettings/ProviderSetting.tsx`
- `src/renderer/pages/settings/ProviderSettings/ConnectionSettings/`
- `src/renderer/pages/settings/ProviderSettings/ModelList/`
- `src/renderer/pages/settings/ProviderSettings/primitives/`

The upstream React state, routing and storage adapters were replaced with GenOffice's
Electron IPC and `AiSettings` persistence boundary. The component decomposition, layout
metrics and interaction model remain derived from Cherry Studio.
