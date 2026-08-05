/**
 * Command System（契约：切片 14 / react-flow-node-model-and-registry-design）。
 * 所有编辑经命令执行：execute 应用 + 压 undo 栈；undo/redo 纯函数式变换。
 * 第一版命令集：add/remove/move node、update config、add/remove edge、update viewport。
 */
import type { CanvasEdge, CanvasNode } from '@/features/canvas/ports'

export interface CanvasState {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: { x: number; y: number; zoom: number } | null
}

export interface Command {
  /** 命令名称（撤销栈展示用） */
  label: string
  do(state: CanvasState): CanvasState
  undo(state: CanvasState): CanvasState
}

export class CommandStack {
  private undoStack: Command[] = []
  private redoStack: Command[] = []

  execute(command: Command, state: CanvasState): CanvasState {
    const next = command.do(state)
    this.undoStack.push(command)
    this.redoStack = []
    return next
  }

  undo(state: CanvasState): CanvasState | null {
    const command = this.undoStack.pop()
    if (!command) return null
    const prev = command.undo(state)
    this.redoStack.push(command)
    return prev
  }

  redo(state: CanvasState): CanvasState | null {
    const command = this.redoStack.pop()
    if (!command) return null
    const next = command.do(state)
    this.undoStack.push(command)
    return next
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}

/* ── 第一版命令 ─────────────────────────────────────────────────────── */

export function addNodeCommand(node: CanvasNode): Command {
  return {
    label: '添加节点',
    do: (s) => ({ ...s, nodes: [...s.nodes, node] }),
    undo: (s) => ({ ...s, nodes: s.nodes.filter((n) => n.id !== node.id) }),
  }
}

export function removeNodeCommand(nodeId: string, relatedEdges: CanvasEdge[]): Command {
  let removedNode: CanvasNode | null = null
  return {
    label: '删除节点',
    do: (s) => {
      removedNode = getNode(s.nodes, nodeId) ?? null
      return {
        nodes: s.nodes.filter((n) => n.id !== nodeId),
        edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
        viewport: s.viewport,
      }
    },
    undo: (s) => {
      const restoredNodes = removedNode ? [...s.nodes, removedNode] : s.nodes
      const restoredEdges = [...s.edges, ...relatedEdges]
      return { nodes: restoredNodes, edges: restoredEdges, viewport: s.viewport }
    },
  }
}

export function moveNodeCommand(
  nodeId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Command {
  return {
    label: '移动节点',
    do: (s) => ({ ...s, nodes: patchNode(s.nodes, nodeId, { position: to }) }),
    undo: (s) => ({ ...s, nodes: patchNode(s.nodes, nodeId, { position: from }) }),
  }
}

export function updateConfigCommand(
  nodeId: string,
  patch: Record<string, unknown>,
): Command {
  let prevConfig: Record<string, unknown> = {}
  return {
    label: '修改参数',
    do: (s) => {
      prevConfig = getNode(s.nodes, nodeId)?.config ?? {}
      return { ...s, nodes: patchNode(s.nodes, nodeId, { config: { ...prevConfig, ...patch } }) }
    },
    undo: (s) => ({ ...s, nodes: patchNode(s.nodes, nodeId, { config: prevConfig }) }),
  }
}

export function addEdgeCommand(edge: CanvasEdge): Command {
  return {
    label: '添加连线',
    do: (s) => ({ ...s, edges: [...s.edges, edge] }),
    undo: (s) => ({ ...s, edges: s.edges.filter((e) => e.id !== edge.id) }),
  }
}

export function removeEdgeCommand(edgeId: string): Command {
  let removed: CanvasEdge | null = null
  return {
    label: '删除连线',
    do: (s) => {
      removed = s.edges.find((e) => e.id === edgeId) ?? null
      return { ...s, edges: s.edges.filter((e) => e.id !== edgeId) }
    },
    undo: (s) => (removed ? { ...s, edges: [...s.edges, removed] } : s),
  }
}

/* ── 内部工具 ────────────────────────────────────────────────────────── */

function getNode(nodes: CanvasNode[], id: string): CanvasNode | undefined {
  return nodes.find((n) => n.id === id)
}

function patchNode(nodes: CanvasNode[], id: string, patch: Partial<CanvasNode>): CanvasNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch } : n))
}
