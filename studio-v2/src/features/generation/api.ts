/**
 * 生成 Feature API 层（F6 图片生成闭环 / Task Shelf）。
 * 任务端点走 /api/v2/generation-tasks（独立状态机：queued→running→succeeded|failed|cancelled，
 * 即梦排队为 jimeng_pending 并由后端自动续查）；参数定义复用旧 /api/image-params。
 * 供应商字段只在本层出现，组件消费稳定 DTO。
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/core/api/client'

export type GenerationTaskStatus = 'queued' | 'running' | 'jimeng_pending' | 'succeeded' | 'failed' | 'cancelled'

export interface ImageItem {
  url: string
  kind?: string
  name?: string
  width?: number
  height?: number
}

/** 生成成功结果（稳定引用：本地 url + 资产 item 元数据，供 F12 输出入资产库）。 */
export interface ImageTaskResult {
  prompt?: string
  images?: string[]
  image_items?: ImageItem[]
  provider_id?: string
  provider_name?: string
  model?: string
  timestamp?: number
  task_id?: string
}

export interface GenerationTask {
  id: string
  type: 'image' | 'comfy'
  status: GenerationTaskStatus
  created_at: number
  updated_at: number
  result: ImageTaskResult | null
  error: string
  message: string
  prompt?: string
  provider_id?: string
  model?: string
  size?: string
  quality?: string
  n?: number
  jimeng_pending?: boolean
  submit_id?: string | null
  kind?: string | null
  status_code?: number | null
}

export interface ImageParamsField {
  key: string
  type: string
  label: string
  control?: string
  /** int 芯片为裸数字（如 [1,2,3,4]）；select 为 {value,label} 数组。 */
  options?: ({ value: string; label: string } | number | string)[]
  ratios?: { value: string; label: string }[]
  resolutions?: { value: string; label: string }[]
  default?: unknown
  max?: number
}

/** 归一化后端字段选项：裸数字/字符串 → {value,label}。 */
export function normalizeFieldOptions(options: ImageParamsField['options']): { value: string; label: string }[] {
  return (options ?? []).map((o) =>
    typeof o === 'object' && o !== null
      ? { value: String(o.value), label: String(o.label) }
      : { value: String(o), label: String(o) },
  )
}

export interface ImageSubmitPayload {
  prompt: string
  provider_id: string
  model: string
  size?: string
  quality?: string
  n?: number
}

/** 写回节点 config 的稳定引用（design doc §3.5：节点只存结果引用，不复制任务详情/供应商字段）。 */
export interface StableImageResult {
  urls: string[]
  items: ImageItem[]
}

/** 从后端任务结果提取稳定引用：仅 URL + item 元数据（供 F12 输出入资产库）。 */
export function toStableResult(result: ImageTaskResult | null | undefined): StableImageResult {
  return {
    urls: result?.images ?? [],
    items: result?.image_items ?? [],
  }
}

// ---------- 端点 ----------

export function submitImageTask(payload: ImageSubmitPayload): Promise<{ task: GenerationTask }> {
  return api.post('/api/v2/generation-tasks', payload)
}

export function getImageTask(taskId: string): Promise<{ task: GenerationTask }> {
  return api.get(`/api/v2/generation-tasks/${encodeURIComponent(taskId)}`)
}

export function listGenerationTasks(limit = 30): Promise<{ tasks: GenerationTask[]; total: number }> {
  return api.get(`/api/v2/generation-tasks?limit=${limit}`)
}

export function cancelImageTask(taskId: string): Promise<{ task: GenerationTask }> {
  return api.post(`/api/v2/generation-tasks/${encodeURIComponent(taskId)}/cancel`)
}

export function fetchImageParams(providerId: string, model: string): Promise<{ fields: ImageParamsField[] }> {
  const qs = new URLSearchParams()
  if (providerId) qs.set('provider_id', providerId)
  if (model) qs.set('model', model)
  return api.get(`/api/image-params?${qs.toString()}`)
}

// ---------- 纯函数（可单测） ----------

/** 旧前端 SIZE_MAP 的等价映射（ratio label → 尺寸字符串）。 */
const RATIO_KEYS: Record<string, string> = {
  '1:1': 'square',
  '2:3': 'portrait',
  '3:2': 'landscape',
  '3:4': 'portrait43',
  '4:3': 'landscape43',
  '9:16': 'story',
  '16:9': 'wide',
}

const SIZE_MAP: Record<string, Record<string, string>> = {
  square: { '1k': '1024x1024', '2k': '2048x2048', '4k': '4096x4096' },
  portrait: { '1k': '1024x1536', '2k': '1360x2048', '4k': '2352x3520' },
  portrait43: { '1k': '1008x1344', '2k': '1536x2048', '4k': '2448x3264' },
  landscape43: { '1k': '1344x1008', '2k': '2048x1536', '4k': '3264x2448' },
  landscape: { '1k': '1536x1024', '2k': '2048x1360', '4k': '3520x2352' },
  story: { '1k': '720x1280', '2k': '1152x2048', '4k': '2160x3840' },
  wide: { '1k': '1280x720', '2k': '2048x1152', '4k': '3840x2160' },
}

/** 由 /api/image-params 的 ratio + resolution 拼出提交用的 size 字符串。 */
export function buildSizeString(ratio: string, resolution: string): string {
  if (resolution === 'auto') return 'auto'
  const key = RATIO_KEYS[ratio] ?? 'square'
  return SIZE_MAP[key]?.[resolution] ?? '1024x1024'
}

export const TASK_STATUS_LABELS: Record<GenerationTaskStatus, string> = {
  queued: '排队中',
  running: '生成中',
  jimeng_pending: '即梦排队中',
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
}

export function isTaskActive(status: GenerationTaskStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'jimeng_pending'
}

/** 从节点 config 构造提交载荷；缺失的字段回退默认值。 */
export function buildSubmitPayload(config: Record<string, unknown>): ImageSubmitPayload {
  const sizeConfig = (config.size ?? {}) as { ratio?: string; resolution?: string }
  return {
    prompt: String(config.prompt ?? '').trim(),
    provider_id: String(config.provider ?? '').trim(),
    model: String(config.model ?? '').trim(),
    size: buildSizeString(sizeConfig.ratio ?? '1:1', sizeConfig.resolution ?? '1k'),
    quality: String(config.quality ?? 'auto').trim() || 'auto',
    n: Number(config.n ?? 1) || 1,
  }
}

// ---------- TQ hooks ----------

export const generationKeys = { all: ['generation-tasks'] as const }

/** 近期任务列表（Task Shelf 恢复用；运行态轮询走 features/generation/store）。 */
export function useGenerationTaskList(limit = 30) {
  return useQuery({
    queryKey: [...generationKeys.all, 'list', limit],
    queryFn: () => listGenerationTasks(limit),
    refetchInterval: 10_000,
  })
}
