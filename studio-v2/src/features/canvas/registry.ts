/**
 * Node Registry：唯一扩展入口（契约：切片 09 / react-flow-node-model-and-registry-design）。
 * 节点类型表达业务能力，不表达供应商（midjourney/comfy 等降级为 config.executor/provider_id）。
 * 启动时注册全部 MVP 节点后 freeze，禁止运行时动态修改。
 */
import type { ComponentType } from 'react'

export type PortKind = 'asset' | 'prompt' | 'image' | 'video' | 'workflow' | 'text' | 'any'

export interface PortDefinition {
  id: string
  label: string
  kind: PortKind
  direction: 'input' | 'output'
}

/** Inspector 字段描述（第一版基础类型：text/select/textarea） */
export interface InspectorField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
}

export interface NodeDefinition {
  /** 业务能力类型：asset/prompt/image-generation/video-generation/workflow/output/group/artifact */
  type: string
  label: string
  /** 节点组件（React Flow 自定义节点），缺省使用 StudioNodeHost 通用渲染 */
  component?: ComponentType<unknown>
  ports: PortDefinition[]
  /** 配置字段（Inspector 用） */
  configSchema: InspectorField[]
  /** 能力标记（如支持的生成能力），供运行时降级判断 */
  capabilities?: string[]
  /** 配置校验：返回错误信息或 null */
  validate?: (config: Record<string, unknown>) => string | null
}

export class NodeRegistry {
  private defs = new Map<string, NodeDefinition>()
  private frozen = false

  register(def: NodeDefinition): void {
    if (this.frozen) {
      throw new Error(`NodeRegistry is frozen; cannot register type "${def.type}"`)
    }
    this.defs.set(def.type, def)
  }

  freeze(): void {
    this.frozen = true
  }

  get(type: string): NodeDefinition | undefined {
    return this.defs.get(type)
  }

  has(type: string): boolean {
    return this.defs.has(type)
  }

  all(): NodeDefinition[] {
    return [...this.defs.values()]
  }

  /** 校验节点：类型存在 + config 合法。返回错误信息或 null。 */
  validateNode(type: string, config: Record<string, unknown>): string | null {
    const def = this.defs.get(type)
    if (!def) {
      return `unknown node type: ${type}`
    }
    if (def.validate) {
      return def.validate(config)
    }
    return null
  }
}

/** 全局单例：MVP 启动时注册节点并冻结（含 agent-task） */
export const nodeRegistry = new NodeRegistry()
