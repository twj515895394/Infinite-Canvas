/**
 * 项目 Feature API 层（契约：切片 08 / /api/v2/projects + canvases）。
 * 组件不直接 fetch，统一经 TanStack Query hooks 消费。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/core/api/client'

export interface Project {
  id: string
  name: string
  order: number
  created_at: number | null
  updated_at: number | null
  revision: number
  archived: boolean
  archived_at: number | null
}

export interface CanvasSummary {
  id: string
  project_id: string
  title: string
  revision: number
  status: string
  created_at: number | null
  updated_at: number | null
}

interface ProjectListResponse {
  items: Project[]
  page: { next_cursor: string | null; has_more: boolean; limit: number; total: number }
}

interface CanvasListResponse {
  items: CanvasSummary[]
}

export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
  canvases: (projectId: string) => ['projects', projectId, 'canvases'] as const,
}

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => api.get<ProjectListResponse>('/api/v2/projects'),
  })
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: async () => {
      const res = await api.get<{ project: Project }>(`/api/v2/projects/${projectId}`)
      return res.project
    },
    enabled: Boolean(projectId),
  })
}

export function useCanvases(projectId: string) {
  return useQuery({
    queryKey: projectKeys.canvases(projectId),
    queryFn: async () => {
      const res = await api.get<CanvasListResponse>(`/api/v2/projects/${projectId}/canvases`)
      return res.items
    },
    enabled: Boolean(projectId),
  })
}

export function useCreateCanvas(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (title: string) => {
      const res = await api.post<{ canvas: CanvasSummary }>(`/api/v2/projects/${projectId}/canvases`, {
        title,
      })
      return res.canvas
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectKeys.canvases(projectId) })
    },
    meta: { errorTitle: '创建画布失败' },
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.post<{ project: Project }>('/api/v2/projects', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
    meta: { errorTitle: '创建项目失败' },
  })
}

export function useRenameProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, base_revision }: { id: string; name: string; base_revision: number }) =>
      api.patch<{ project: Project }>(`/api/v2/projects/${id}`, { name, base_revision }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
    meta: { errorTitle: '重命名失败' },
  })
}

export function useArchiveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ project: Project }>(`/api/v2/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
    meta: { errorTitle: '归档失败' },
  })
}

export function useRestoreProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ project: Project }>(`/api/v2/projects/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
    meta: { errorTitle: '恢复失败' },
  })
}
