/**
 * Command System / Undo-Redo 测试。
 * 契约（切片 14）：命令可撤销重做；LIFO；新命令清空 redo；
 * 删除节点级联删除关联边（undo 恢复）。
 */
import { describe, expect, it } from 'vitest'
import {
  CommandStack,
  addNodeCommand,
  moveNodeCommand,
  removeNodeCommand,
  updateConfigCommand,
  addEdgeCommand,
  removeEdgeCommand,
  type CanvasState,
} from '@/features/canvas/commands'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/ports'

const emptyState = (): CanvasState => ({ nodes: [], edges: [], viewport: null })

const n1: CanvasNode = { id: 'n1', type: 'prompt', position: { x: 0, y: 0 }, config: { prompt: '' } }
const n2: CanvasNode = { id: 'n2', type: 'output', position: { x: 100, y: 0 }, config: {} }
const e1: CanvasEdge = { id: 'e1', source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' }

describe('CommandStack', () => {
  it('执行命令后撤销恢复、重做还原', () => {
    const stack = new CommandStack()
    let state = emptyState()
    state = stack.execute(addNodeCommand(n1), state)
    expect(state.nodes).toHaveLength(1)
    state = stack.undo(state)!
    expect(state.nodes).toHaveLength(0)
    state = stack.redo(state)!
    expect(state.nodes).toHaveLength(1)
  })

  it('多命令按 LIFO 顺序撤销', () => {
    const stack = new CommandStack()
    let state = emptyState()
    state = stack.execute(addNodeCommand(n1), state)
    state = stack.execute(addNodeCommand(n2), state)
    state = stack.undo(state)!
    expect(state.nodes.map((n) => n.id)).toEqual(['n1'])
    state = stack.undo(state)!
    expect(state.nodes).toHaveLength(0)
    expect(stack.canUndo).toBe(false)
  })

  it('新命令执行后清空 redo 栈', () => {
    const stack = new CommandStack()
    let state = emptyState()
    state = stack.execute(addNodeCommand(n1), state)
    stack.undo(state)!
    expect(stack.canRedo).toBe(true)
    state = stack.execute(addNodeCommand(n2), state)
    expect(stack.canRedo).toBe(false)
  })

  it('move 命令撤销回到原位置', () => {
    const stack = new CommandStack()
    let state: CanvasState = { nodes: [n1], edges: [], viewport: null }
    state = stack.execute(moveNodeCommand('n1', { x: 0, y: 0 }, { x: 50, y: 60 }), state)
    expect(state.nodes[0].position).toEqual({ x: 50, y: 60 })
    state = stack.undo(state)!
    expect(state.nodes[0].position).toEqual({ x: 0, y: 0 })
  })

  it('删除节点级联删除关联边，撤销恢复节点与边', () => {
    const stack = new CommandStack()
    let state: CanvasState = { nodes: [n1, n2], edges: [e1], viewport: null }
    state = stack.execute(removeNodeCommand('n1', [e1]), state)
    expect(state.nodes).toHaveLength(1)
    expect(state.edges).toHaveLength(0)
    state = stack.undo(state)!
    expect(state.nodes).toHaveLength(2)
    expect(state.edges).toHaveLength(1)
  })

  it('updateConfig 撤销恢复旧配置', () => {
    const stack = new CommandStack()
    let state: CanvasState = { nodes: [n1], edges: [], viewport: null }
    state = stack.execute(updateConfigCommand('n1', { prompt: 'hello' }), state)
    expect(state.nodes[0].config).toEqual({ prompt: 'hello' })
    state = stack.undo(state)!
    expect(state.nodes[0].config).toEqual({ prompt: '' })
  })

  it('addEdge / removeEdge 往返', () => {
    const stack = new CommandStack()
    let state: CanvasState = { nodes: [n1, n2], edges: [], viewport: null }
    state = stack.execute(addEdgeCommand(e1), state)
    expect(state.edges).toHaveLength(1)
    state = stack.execute(removeEdgeCommand('e1'), state)
    expect(state.edges).toHaveLength(0)
    state = stack.undo(state)!
    expect(state.edges).toHaveLength(1)
  })
})
