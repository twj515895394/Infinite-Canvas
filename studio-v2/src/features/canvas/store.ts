/**
 * Editor Store（Zustand 七分片：nodes/edges/selection/viewport/history/dirty/runtime）。
 * 契约：docs/studio-v2-react-flow-node-model-and-registry-design.md
 * 显式编辑（增删节点/连线/参数/拖拽落点）经 CommandStack 执行（可撤销）；
 * React Flow 拖动中的位置变化直接应用（不进 undo 栈），dragStop 时合并为单命令。
 */
import { create } from 'zustand'
import {
  CommandStack,
  addEdgeCommand,
  addNodeCommand,
  moveNodeCommand,
  removeEdgeCommand,
  removeNodeCommand,
  updateConfigCommand,
  type CanvasState,
} from '@/features/canvas/commands'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/ports'
import { validateConnection } from '@/features/canvas/ports'
import { nodeRegistry } from '@/features/canvas/registry'

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasMeta {
  id: string
  projectId: string
  title: string
  revision: number
}

interface EditorStore extends CanvasState {
  meta: CanvasMeta | null
  selection: { nodeIds: string[]; edgeIds: string[] }
  history: { canUndo: boolean; canRedo: boolean }
  dirty: boolean
  runtime: Record<string, string>
  dragStart: Record<string, { x: number; y: number }>
  historyImpl: CommandStack

  addNode(type: string, position: { x: number; y: number }): string | null
  removeNode(id: string): void
  moveNode(id: string, to: { x: number; y: number }): void
  updateConfig(id: string, patch: Record<string, unknown>): void
  addEdge(edge: CanvasEdge): { ok: boolean; reason?: string }
  removeEdge(id: string): void
  undo(): void
  redo(): void
  setSelection(nodeIds: string[], edgeIds: string[]): void
  setNodePosition(id: string, position: { x: number; y: number }): void
  recordDragStart(id: string, position: { x: number; y: number }): void
  commitDrag(id: string): void
  setDirty(value: boolean): void
  setRuntime(nodeId: string, status: string): void
  loadCanvas(meta: CanvasMeta, state: CanvasState): void
  reset(): void
}

export const useEditorStore = create<EditorStore>()((set, get) => ({
  nodes: [],
  edges: [],
  viewport: null,
  meta: null,
  selection: { nodeIds: [], edgeIds: [] },
  history: { canUndo: false, canRedo: false },
  dirty: false,
  runtime: {},
  dragStart: {},
  historyImpl: new CommandStack(),

  addNode: (type, position) => {
    if (!nodeRegistry.has(type)) return null // 新节点允许空 config；config 校验在编辑/执行时进行
    const node: CanvasNode = { id: crypto.randomUUID(), type, position, config: {} }
    const state = get()
    const next = state.historyImpl.execute(addNodeCommand(node), state)
    set({ ...next, historyImpl: state.historyImpl, dirty: true, history: historyOf(state.historyImpl) })
    return node.id
  },

  removeNode: (id) => {
    const state = get()
    const related = state.edges.filter((e) => e.source === id || e.target === id)
    const next = state.historyImpl.execute(removeNodeCommand(id, related), state)
    set({
      ...next,
      historyImpl: state.historyImpl,
      dirty: true,
      history: historyOf(state.historyImpl),
      selection: { nodeIds: [], edgeIds: [] },
    })
  },

  moveNode: (id, to) => {
    const state = get()
    const from = state.nodes.find((n) => n.id === id)?.position
    if (!from) return
    const next = state.historyImpl.execute(moveNodeCommand(id, from, to), state)
    set({ ...next, historyImpl: state.historyImpl, dirty: true, history: historyOf(state.historyImpl) })
  },

  updateConfig: (id, patch) => {
    const state = get()
    const next = state.historyImpl.execute(updateConfigCommand(id, patch), state)
    set({ ...next, historyImpl: state.historyImpl, dirty: true, history: historyOf(state.historyImpl) })
  },

  addEdge: (edge) => {
    const state = get()
    const source = state.nodes.find((n) => n.id === edge.source)
    const target = state.nodes.find((n) => n.id === edge.target)
    if (!source || !target) return { ok: false, reason: '节点不存在' }
    const result = validateConnection(
      source,
      edge.sourceHandle ?? '',
      target,
      edge.targetHandle ?? '',
      state.nodes,
      state.edges,
    )
    if (!result.ok) return result
    const next = state.historyImpl.execute(addEdgeCommand(edge), state)
    set({ ...next, historyImpl: state.historyImpl, dirty: true, history: historyOf(state.historyImpl) })
    return { ok: true }
  },

  removeEdge: (id) => {
    const state = get()
    const next = state.historyImpl.execute(removeEdgeCommand(id), state)
    set({ ...next, historyImpl: state.historyImpl, dirty: true, history: historyOf(state.historyImpl) })
  },

  undo: () => {
    const state = get()
    const next = state.historyImpl.undo(state)
    if (next) set({ ...next, historyImpl: state.historyImpl, dirty: true, history: historyOf(state.historyImpl) })
  },

  redo: () => {
    const state = get()
    const next = state.historyImpl.redo(state)
    if (next) set({ ...next, historyImpl: state.historyImpl, dirty: true, history: historyOf(state.historyImpl) })
  },

  setSelection: (nodeIds, edgeIds) => set({ selection: { nodeIds, edgeIds } }),

  setNodePosition: (id, position) =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)) })),

  recordDragStart: (id, position) => set((s) => ({ dragStart: { ...s.dragStart, [id]: position } })),

  commitDrag: (id) => {
    const state = get()
    const start = state.dragStart[id]
    const current = state.nodes.find((n) => n.id === id)?.position
    if (!start || !current) return
    const next = state.historyImpl.execute(moveNodeCommand(id, start, current), state)
    const dragStart = { ...state.dragStart }
    delete dragStart[id]
    set({ ...next, historyImpl: state.historyImpl, dragStart, dirty: true, history: historyOf(state.historyImpl) })
  },

  setDirty: (value) => set({ dirty: value }),
  setRuntime: (nodeId, status) => set((s) => ({ runtime: { ...s.runtime, [nodeId]: status } })),

  loadCanvas: (meta, state) =>
    set({
      meta,
      nodes: state.nodes,
      edges: state.edges,
      viewport: state.viewport,
      dirty: false,
      runtime: {},
      selection: { nodeIds: [], edgeIds: [] },
      history: { canUndo: false, canRedo: false },
      historyImpl: new CommandStack(),
    }),

  reset: () =>
    set({
      nodes: [],
      edges: [],
      viewport: null,
      meta: null,
      dirty: false,
      runtime: {},
      selection: { nodeIds: [], edgeIds: [] },
      history: { canUndo: false, canRedo: false },
      historyImpl: new CommandStack(),
    }),
}))

function historyOf(stack: CommandStack) {
  return { canUndo: stack.canUndo, canRedo: stack.canRedo }
}
