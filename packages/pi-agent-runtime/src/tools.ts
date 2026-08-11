import type { AgentToolCall, AgentToolDef, ToolExecution } from '@genoffice/agent-core'
import { defineTool, type ToolDefinition } from '@mariozechner/pi-coding-agent'
import { Type } from 'typebox'

export type PiToolInvoker = (call: AgentToolCall, signal?: AbortSignal) => Promise<ToolExecution>

/** Convert one GenOffice AgentSkill tool catalog into Pi custom tools. */
export function createAgentSkillPiTools(
  tools: readonly AgentToolDef[],
  invoke: PiToolInvoker,
): ToolDefinition[] {
  return tools.map((tool) =>
    defineTool({
      name: tool.name,
      label: tool.name.replace(/[_-]+/g, ' '),
      description: tool.description,
      parameters: Type.Unsafe<Record<string, unknown>>(tool.inputSchema),
      executionMode: 'sequential',
      execute: async (toolCallId, params, signal) => {
        const execution = await invoke(
          { id: toolCallId, name: tool.name, input: params as Record<string, unknown> },
          signal,
        )
        if (execution.isError) throw new Error(execution.output)
        return {
          content: [{ type: 'text', text: execution.output }],
          details: execution,
        }
      },
    }),
  )
}
