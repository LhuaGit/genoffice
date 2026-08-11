# GenOffice Pi Agent Runtime

This package hosts the full `@mariozechner/pi-coding-agent` SDK in Electron's
main process while keeping Office editor objects in the renderer.

## Runtime boundary

- `PiAgentLoop` is the renderer-compatible replacement for the former
  `AgentLoop` API.
- `registerPiAgentIpc()` owns Pi `AgentSession` lifecycle, streaming, cancellation,
  model selection, and resource discovery in the main process.
- Each `AgentSkill` is exposed as a Pi extension package. GenOffice injects its
  tools through the SDK's `customTools`; tool execution is sent back to the
  originating renderer through the narrow preload bridge.
- Pi discovers project/global Skills and Extensions through
  `DefaultResourceLoader`. Native `read` remains enabled for progressive Skill
  disclosure and image reads.

The safe default disables Pi's native bash/edit/write tools so Office chat does
not silently gain arbitrary filesystem mutation. Launch with
`GENOFFICE_PI_BUILTIN_TOOLS=all` when installed Skills intentionally require the
complete Pi coding toolset.

## Providers

OpenAI, Anthropic, Google/Gemini, and DeepSeek resolve through Pi's native model
registry and auth storage. GenOffice Custom and Genspark endpoints are registered
as runtime Pi providers, so all configured sources use the same Pi session and
streaming path. Text and image prompts are forwarded to Pi-native model inputs.
