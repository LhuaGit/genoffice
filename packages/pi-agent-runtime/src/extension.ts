import type { AgentToolDef } from '@genoffice/agent-core'
import type { ExtensionFactory, ToolDefinition } from '@mariozechner/pi-coding-agent'
import { createAgentSkillPiTools, type PiToolInvoker } from './tools'

/**
 * A portable Pi extension package for one GenOffice AgentSkill.
 *
 * `customTools` is the SDK embedding path used by GenOffice. `extensionFactory`
 * exposes the same tools through Pi's extension API for hosts that load factories.
 */
export interface AgentSkillPiExtensionPackage {
  id: string
  customTools: ToolDefinition[]
  extensionFactory: ExtensionFactory
}

export function packageAgentSkillAsPiExtension(
  id: string,
  tools: readonly AgentToolDef[],
  invoke: PiToolInvoker,
): AgentSkillPiExtensionPackage {
  const customTools = createAgentSkillPiTools(tools, invoke)
  const extensionFactory: ExtensionFactory = (pi) => {
    for (const tool of customTools) pi.registerTool(tool)
  }
  return { id, customTools, extensionFactory }
}
