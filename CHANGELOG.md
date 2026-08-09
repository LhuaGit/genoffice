# Changelog

All notable changes to GenOffice are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-08-09

### Added

- Added a dedicated AI settings page with an obvious sidebar entry and a shared,
  polished provider configuration form.
- Added support for custom OpenAI-compatible AI providers, including configurable
  Base URL, model, and optional API key.
- Added local AI settings persistence and cross-window settings synchronization
  for Docs, Sheets, Slides, and PDF.
- Added AI assistance to the PDF editor.
- Added location-aware slide annotations with click targeting, live drag marquee,
  persistent dashed outlines, multiple comments, and structured prompts for the LLM.
- Added annotation keyboard behavior: Enter submits, Shift+Enter inserts a newline,
  and IME composition is protected.
- Added a compact annotation tray that is collapsed by default and can be expanded
  without covering the presentation canvas.
- Added automated tests for AI provider settings, IPC broadcasting, PDF AI, and
  slide annotation behavior.
- Added a project-local macOS build-and-run script.

### Changed

- Custom AI providers can be used without signing in to a Genspark account.
- Local OpenAI-compatible endpoints can be used without an API key.
- Improved the visible wording for AI beautification, fact-checking, image, and
  annotation requests while retaining detailed structured context for the model.
- Updated the implementation to remain compatible with the latest upstream Docs,
  Sheets, Slides, PDF, Markdown, and shell changes.

### Security

- AI provider credentials remain local and are not included in application source,
  logs, release notes, or repository artifacts.
- Renderer settings changes are routed through typed Electron IPC boundaries.

### Validation

- Passed TypeScript type checking, production builds, lint with no errors, and the
  complete automated test suite.
- Built and launched the macOS arm64 application successfully; generated packages
  remain unsigned and unnotarized unless a Developer ID identity is supplied.

[0.5.0]: https://github.com/LhuaGit/genoffice/releases/tag/0.5.0
