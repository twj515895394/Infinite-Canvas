/**
 * 设置 Feature API 层（切片 11 F10）。
 * 复用现有接口：/api/providers（CRUD）、/api/providers/test-connection（测试）、/api/storage-settings（目录）。
 * 组件不直接 fetch；保存 Provider 时以已存在记录为基座合并编辑字段（api_key 留空=保持原 Key）。
 * RunningHub/Midjourney 专项字段不回传（MVP 设置页不提供专项配置）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/core/api/client'

// ---------- Provider ----------

export const PROVIDER_PROTOCOLS = ['openai', 'apimart', 'gemini', 'gemini-cli', 'volcengine', 'runninghub', 'jimeng', 'codex'] as const
export const IMAGE_REQUEST_MODES = ['openai', 'openai-json', 'openai-video-proxy', 'openai-responses', 'tudou-async'] as const

/** public_provider 脱敏后的视图模型；保留专项字段以便保存时原样回传。 */
export interface Provider {
  id: string
  name: string
  base_url: string
  protocol: string
  image_request_mode: string
  enabled: boolean
  primary: boolean
  has_key: boolean
  key_preview: string | null
  image_models?: string[]
  chat_models?: string[]
  video_models?: string[]
  [key: string]: unknown
}

export interface TestResult {
  ok: boolean
  status?: number
  message: string
  model_count?: number
}

export const providerKeys = { all: ['providers'] as const }

export function useProviders() {
  return useQuery({
    queryKey: providerKeys.all,
    queryFn: () => api.get<{ providers: Provider[] }>('/api/providers'),
  })
}

export function useSaveProviders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (providers: Provider[]) =>
      api.put<{ providers: Provider[] }>('/api/providers', providers).then((body) => body.providers),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  })
}

/** 测试 Provider 连接：调 /v1/models 验证；HTTP 错误统一转为可展示的失败结果。 */
export async function testProviderConnection(payload: {
  base_url: string
  api_key: string
  provider_id?: string
  protocol?: string
  image_request_mode?: string
}): Promise<TestResult> {
  try {
    const body = await api.post<{ ok?: boolean; status?: number; message?: string; model_count?: number }>(
      '/api/providers/test-connection',
      payload,
    )
    return {
      ok: body.ok ?? false,
      status: body.status,
      message: body.message || (body.ok ? '连接成功' : '连接失败'),
      model_count: body.model_count,
    }
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, message: err.message }
    }
    return { ok: false, message: '测试请求失败' }
  }
}

/** 新建 Provider 时生成合法 id（后端 PROVIDER_ID_RE: ^[a-zA-Z0-9_-]{2,40}$）。 */
export function newProviderId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `p_${rand}`
}

// ---------- 存储目录 ----------

export interface StorageSettings {
  dirs: Record<string, string>
  defaults: Record<string, string>
}

export const STORAGE_DIR_LABELS: Record<string, string> = {
  upload: '上传目录',
  generated: '生成目录',
  local: '本地素材目录',
}

export const storageKeys = { all: ['storage-settings'] as const }

export function useStorageSettings() {
  return useQuery({
    queryKey: storageKeys.all,
    queryFn: () => api.get<StorageSettings>('/api/storage-settings'),
  })
}

export function useUpdateStorageSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Record<string, string>) =>
      api.patch<StorageSettings>('/api/storage-settings', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: storageKeys.all }),
  })
}
