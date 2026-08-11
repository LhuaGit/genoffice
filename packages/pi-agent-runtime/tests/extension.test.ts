import type { AgentToolDef, ToolExecution } from '@genoffice/agent-core'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { describe, expect, it, vi } from 'vitest'
import { packageAgentSkillAsPiExtension } from '../src/extension'

const tool: AgentToolDef = {
  name: 'replace_text',
  description: 'Replace text in the active Office artifact',
  inputSchema: {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
  },
}

describe('packageAgentSkillAsPiExtension', () => {
  it('exposes AgentSkill tools as both SDK customTools and an Extension factory', async () => {
    const execution: ToolExecution = {
      output: 'replaced',
      summary: 'Replace text',
      mutated: true,
    }
    const invoke = vi.fn(async () => execution)
    const extension = packageAgentSkillAsPiExtension('docs', [tool], invoke)
    const registerTool = vi.fn()

    await extension.extensionFactory({ registerTool } as unknown as ExtensionAPI)

    expect(extension.id).toBe('docs')
    expect(registerTool).toHaveBeenCalledWith(extension.customTools[0])
    const result = await extension.customTools[0]!.execute(
      'call-1',
      { value: 'next' },
      undefined,
      undefined,
      {} as never,
    )
    expect(invoke).toHaveBeenCalledWith(
      { id: 'call-1', name: 'replace_text', input: { value: 'next' } },
      undefined,
    )
    expect(result).toEqual({
      content: [{ type: 'text', text: 'replaced' }],
      details: execution,
    })
  })

  it('turns AgentSkill failures into Pi tool failures', async () => {
    const extension = packageAgentSkillAsPiExtension('docs', [tool], async () => ({
      output: 'selection is stale',
      summary: 'Replace text',
      isError: true,
    }))

    await expect(
      extension.customTools[0]!.execute(
        'call-2',
        { value: 'next' },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow('selection is stale')
  })
})
