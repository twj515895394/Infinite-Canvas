/**
 * 画布持久化（切片 17）。
 * 契约：GET /api/v2/canvases/{id} 恢复状态；PUT snapshot 保存（debounce 全量，
 * MVP 简化；增量 operations 后端已就绪，前端后续接入）；409 冲突提示重载。
 */
import { api, ApiError } from '@/core/api/client'
import type { CanvasState } from '@/features/canvas/commands'
import type { CanvasMeta } from '@/features/canvas/store'

interface CanvasDetailResponse {
  canvas: {
    id: string
    project_id: string
    title: string
    revision: number
    state: CanvasState
  }
}

interface SnapshotResponse {
  canvas_id: string
  revision: number
}

/** 加载画布：返回元数据 + 状态（revision 冲突由保存侧处理） */
export async function loadCanvas(canvasId: string): Promise<CanvasMeta & CanvasState> {
  const { canvas } = await api.get<CanvasDetailResponse>(`/api/v2/canvases/${canvasId}`)
  return {
    id: canvas.id,
    projectId: canvas.project_id,
    title: canvas.title,
    revision: canvas.revision,
    nodes: canvas.state.nodes,
    edges: canvas.state.edges,
    viewport: canvas.state.viewport,
  }
}

/** 保存快照：成功返回新 revision；409 冲突抛 ApiError（调用方提示重载） */
export async function saveCanvasSnapshot(canvasId: string, state: CanvasState): Promise<number> {
  const res = await api.put<SnapshotResponse>(`/api/v2/canvases/${canvasId}/snapshot`, {
    state: { nodes: state.nodes, edges: state.edges, viewport: state.viewport, settings: {} },
  })
  return res.revision
}

export function isRevisionConflict(err: unknown): boolean {
  return err instanceof ApiError && err.problem.code === 'CANVAS_REVISION_CONFLICT'
}
