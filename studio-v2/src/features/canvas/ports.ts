/**
 * 端口系统与连接验证（契约：切片 14）。
 * 9 步验证：节点存在 → 端口存在 → 方向 → 自连 → 类型兼容 → 重复 → 环。
 */
import { nodeRegistry, type NodeRegistry, type PortKind } from '@/features/canvas/registry'

export interface CanvasNode {
  id: string
  type: string
  position: { x: number; y: number }
  config: Record<string, unknown>
}

export interface CanvasEdge {
  id: string
  source: string
  sourceHandle?: string
  target: string
  targetHandle?: string
}

export type ConnectionResult = { ok: true } | { ok: false; reason: string }

/** 端口类型兼容：any 可接任意；否则要求类型一致。 */
function kindsCompatible(source: PortKind, target: PortKind): boolean {
  return source === 'any' || target === 'any' || source === target
}

/**
 * 环检测：新边 source→target 加入后，若 target 已可沿现有边到达 source 的下游，
 * 则 source→target + 既有路径成环。实现：从 target 沿正向边遍历下游，遇到 source 即成环。
 */
export function wouldCreateCycle(
  source: string,
  target: string,
  edges: CanvasEdge[],
): boolean {
  if (source === target) return true
  const adjacency = new Map<string, string[]>()
  for (const e of edges) {
    const list = adjacency.get(e.source) ?? []
    list.push(e.target)
    adjacency.set(e.source, list)
  }
  const visited = new Set<string>()
  const stack = [target]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === source) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const downstream of adjacency.get(current) ?? []) {
      stack.push(downstream)
    }
  }
  return false
}

/**
 * 校验一条新连接是否合法（画布级）。
 * 9 步：源节点存在 / 目标节点存在 / 源端口存在 / 目标端口存在 /
 *      方向（源=output、目标=input）/ 不自连 / 类型兼容 / 不重复 / 不成环。
 */
export function validateConnection(
  sourceNode: CanvasNode,
  sourceHandle: string,
  targetNode: CanvasNode,
  targetHandle: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  registry: NodeRegistry = nodeRegistry,
): ConnectionResult {
  if (!nodes.some((n) => n.id === sourceNode.id)) {
    return { ok: false, reason: 'source node not in canvas' }
  }
  if (!nodes.some((n) => n.id === targetNode.id)) {
    return { ok: false, reason: 'target node not in canvas' }
  }
  if (sourceNode.id === targetNode.id) {
    return { ok: false, reason: 'cannot connect node to itself（不能自连）' }
  }

  const sourceDef = registry.get(sourceNode.type)
  const targetDef = registry.get(targetNode.type)
  const sourcePort = sourceDef?.ports.find((p) => p.id === sourceHandle)
  const targetPort = targetDef?.ports.find((p) => p.id === targetHandle)
  if (!sourcePort || !targetPort) {
    return { ok: false, reason: 'port not found（端口不存在）' }
  }
  if (sourcePort.direction !== 'output' || targetPort.direction !== 'input') {
    return { ok: false, reason: 'direction mismatch（方向错误：源须为输出端口，目标须为输入端口）' }
  }
  if (!kindsCompatible(sourcePort.kind, targetPort.kind)) {
    return { ok: false, reason: `kind mismatch（类型不兼容：${sourcePort.kind} → ${targetPort.kind}）` }
  }
  const duplicate = edges.some(
    (e) =>
      e.source === sourceNode.id &&
      e.sourceHandle === sourceHandle &&
      e.target === targetNode.id &&
      e.targetHandle === targetHandle,
  )
  if (duplicate) {
    return { ok: false, reason: 'connection already exists（重复连接）' }
  }
  if (wouldCreateCycle(sourceNode.id, targetNode.id, edges)) {
    return { ok: false, reason: 'would create cycle（禁止成环）' }
  }
  return { ok: true }
}
