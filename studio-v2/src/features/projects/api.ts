/**
 * 项目 Feature API 层（契约：切片 08 / /api/v2/projects）。
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

interface ProjectListResponse {
  items: Project[]
  page: { next_cursor: string | null; has_more: boolean; limit: number; total: number }
}

export const projectKeys = {
  all: ['projects'] as const,
}

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => api.get<ProjectListResponse>('/api/v2/projects'),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.post<{ project: Project }>('/api/v2/projects', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  })
}

export function useRenameProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, base_revision }: { id: string; name: string; base_revision: number }) =>
      api.patch<{ project: Project }>(`/api/v2/projects/${id}`, { name, base_revision }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  })
}

export function useArchiveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ project: Project }>(`/api/v2/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  })
}

export function useRestoreProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ project: Project }>(`/api/v2/projects/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  })
}
