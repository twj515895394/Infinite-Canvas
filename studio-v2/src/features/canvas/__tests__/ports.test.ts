/**
 * 端口系统与连接验证测试。
 * 契约（切片 14）：9 步验证——端口存在、方向、类型、自连、重复、环。
 */
import { describe, expect, it } from 'vitest'
import { NodeRegistry, type NodeDefinition } from '@/features/canvas/registry'
import { validateConnection, wouldCreateCycle, type CanvasEdge, type CanvasNode } from '@/features/canvas/ports'

function makeRegistry(): NodeRegistry {
  const r = new NodeRegistry()
  const defs: NodeDefinition[] = [
    {
      type: 'prompt',
      label: '提示词',
      ports: [{ id: 'out', label: '输出', kind: 'prompt', direction: 'output' }],
      configSchema: [],
    },
    {
      type: 'image-generation',
      label: '图片生成',
      ports: [
        { id: 'in', label: '输入', kind: 'prompt', direction: 'input' },
        { id: 'out', label: '输出', kind: 'image', direction: 'output' },
      ],
      configSchema: [],
    },
    {
      type: 'output',
      label: '输出',
      ports: [{ id: 'in', label: '输入', kind: 'image', direction: 'input' }],
      configSchema: [],
    },
  ]
  for (const d of defs) r.register(d)
  r.freeze()
  return r
}

function node(id: string, type: string): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, config: {} }
}

const registry = makeRegistry()
const promptNode = node('n1', 'prompt')
const genNode = node('n2', 'image-generation')
const outputNode = node('n3', 'output')

describe('validateConnection', () => {
  it('合法连接（prompt → image-generation 输入）', () => {
    const result = validateConnection(promptNode, 'out', genNode, 'in', [promptNode, genNode], [], registry)
    expect(result.ok).toBe(true)
  })

  it('方向错误被拒绝（输入端口不能作为源）', () => {
    const result = validateConnection(genNode, 'in', outputNode, 'in', [genNode, outputNode], [], registry)
    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.reason).toMatch(/方向|source|output/i)
  })

  it('自连被拒绝', () => {
    const result = validateConnection(genNode, 'out', genNode, 'in', [genNode], [], registry)
    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.reason).toMatch(/自身|self/i)
  })

  it('类型不兼容被拒绝（prompt → output 的 image 输入）', () => {
    const result = validateConnection(promptNode, 'out', outputNode, 'in', [promptNode, outputNode], [], registry)
    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.reason).toMatch(/类型|kind|兼容/i)
  })

  it('重复连接被拒绝', () => {
    const edges: CanvasEdge[] = [{ id: 'e1', source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' }]
    const result = validateConnection(promptNode, 'out', genNode, 'in', [promptNode, genNode], edges, registry)
    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.reason).toMatch(/重复|exists/i)
  })

  it('端口不存在被拒绝', () => {
    const result = validateConnection(promptNode, 'nope', genNode, 'in', [promptNode, genNode], [], registry)
    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.reason).toMatch(/端口|port/i)
  })

  it('节点不在画布中被拒绝', () => {
    const stranger = node('n99', 'prompt')
    const result = validateConnection(stranger, 'out', genNode, 'in', [genNode], [], registry)
    expect(result.ok).toBe(false)
  })
})

describe('wouldCreateCycle', () => {
  it('无环图追加边不产生环', () => {
    const edges: CanvasEdge[] = [
      { id: 'e1', source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
    ]
    expect(wouldCreateCycle('n2', 'n3', edges)).toBe(false)
  })

  it('反向回边产生环', () => {
    const edges: CanvasEdge[] = [
      { id: 'e1', source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
      { id: 'e2', source: 'n2', sourceHandle: 'out', target: 'n3', targetHandle: 'in' },
    ]
    // n3 → n1 会成环（n1 是 n3 的祖先）
    expect(wouldCreateCycle('n3', 'n1', edges)).toBe(true)
  })

  it('自环边产生环', () => {
    expect(wouldCreateCycle('n1', 'n1', [])).toBe(true)
  })
})
