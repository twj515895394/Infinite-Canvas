/**
 * Node Registry 测试。
 * 契约（切片 09）：Registry 为唯一扩展入口；冻结后不可注册；
 * 节点类型表达业务能力（asset/prompt/image-generation/...）不表达供应商。
 */
import { describe, expect, it } from 'vitest'
import { NodeRegistry, type NodeDefinition } from '@/features/canvas/registry'

function baseDef(type: string): NodeDefinition {
  return {
    type,
    label: type,
    ports: [
      { id: 'in', label: '输入', kind: 'any', direction: 'input' },
      { id: 'out', label: '输出', kind: 'image', direction: 'output' },
    ],
    configSchema: [],
  }
}

describe('NodeRegistry', () => {
  it('注册后可查询', () => {
    const r = new NodeRegistry()
    r.register(baseDef('prompt'))
    expect(r.has('prompt')).toBe(true)
    expect(r.get('prompt')?.label).toBe('prompt')
    expect(r.get('missing')).toBeUndefined()
  })

  it('冻结后禁止再注册', () => {
    const r = new NodeRegistry()
    r.register(baseDef('prompt'))
    r.freeze()
    expect(() => r.register(baseDef('output'))).toThrow(/frozen/)
  })

  it('未知节点类型校验失败', () => {
    const r = new NodeRegistry()
    r.register(baseDef('prompt'))
    const result = r.validateNode('nonexistent', {})
    expect(result).toMatch(/unknown/i)
  })

  it('config 校验失败返回错误信息', () => {
    const r = new NodeRegistry()
    r.register({
      ...baseDef('image-generation'),
      validate: (config) => (config.prompt ? null : '缺少 prompt'),
    })
    expect(r.validateNode('image-generation', {})).toMatch(/prompt/)
    expect(r.validateNode('image-generation', { prompt: 'x' })).toBeNull()
  })

  it('MVP 节点集全部注册', () => {
    const r = new NodeRegistry()
    for (const t of ['asset', 'prompt', 'image-generation', 'video-generation', 'workflow', 'output', 'group', 'artifact', 'agent-task']) {
      r.register(baseDef(t))
    }
    r.freeze()
    for (const t of ['asset', 'prompt', 'image-generation', 'video-generation', 'workflow', 'output', 'group', 'artifact', 'agent-task']) {
      expect(r.has(t)).toBe(true)
    }
  })
})
