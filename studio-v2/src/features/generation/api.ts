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

/** 视频稳定引用条目（F7）：url + 元数据（供 F12 输出入资产库）。 */
export interface VideoItem {
  url: string
  kind: 'video'
  name: string
  width?: number
  height?: number
  duration_ms?: number
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

/** 视频生成成功结果（F7）：videos + video_items 稳定引用，raw 供应商字段不入视图。 */
export interface VideoTaskResult {
  prompt?: string
  videos?: string[]
  video_items?: VideoItem[]
  provider_id?: string
  model?: string
  timestamp?: number
  task_id?: string
  params?: { duration?: number; aspect_ratio?: string; resolution?: string }
}

export type TaskResult = ImageTaskResult | VideoTaskResult

export interface GenerationTask {
  id: string
  type: 'image' | 'video' | 'comfy'
  status: GenerationTaskStatus
  created_at: number
  updated_at: number
  result: TaskResult | null
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
  /** 视频/工作流任务参数回显。 */
  duration?: number
  aspect_ratio?: string
  resolution?: string
  workflow?: string
  field_values?: Record<string, unknown>
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

/** 视频结果写回节点 config 的稳定引用（F7，与图片 §3.5 同契约：只存引用）。 */
export interface StableVideoResult {
  videos: string[]
  items: VideoItem[]
}

/** 从后端视频任务结果提取稳定引用。 */
export function toStableVideoResult(result: VideoTaskResult | null | undefined): StableVideoResult {
  return {
    videos: result?.videos ?? [],
    items: result?.video_items ?? [],
  }
}

/** 从任务结果判断是否为视频结果（轮询投影按类型分派）。 */
export function isVideoResult(result: TaskResult | null | undefined): result is VideoTaskResult {
  return Boolean(result && 'videos' in result)
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

export function listWorkflows(): Promise<{ workflows: WorkflowInfo[] }> {
  return api.get('/api/workflows')
}

export function getWorkflow(name: string): Promise<WorkflowDetail> {
  return api.get(`/api/workflows/${encodeWorkflowPath(name)}`)
}

export function submitComfyTask(payload: ComfySubmitPayload): Promise<{ task: GenerationTask }> {
  return api.post('/api/v2/generation-tasks/comfy', payload)
}

// ---------- 视频生成（F7） ----------

/** 提交视频生成任务：字段与旧 CanvasVideoRequest 对齐，供应商细节留在后端 Adapter。 */
export interface VideoSubmitPayload {
  prompt: string
  provider_id: string
  model: string
  duration?: number
  aspect_ratio?: string
  resolution?: string
  size?: string
  seed?: number | null
  enable_upsample?: boolean
}

/** 视频节点参数面板的时长/比例选项（与旧前端 veo 参数一致）。 */
export const VIDEO_DURATIONS = [5, 8, 10] as const

export const VIDEO_RATIOS: { value: string; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '21:9', label: '21:9' },
]

/** 从节点 config 构造视频提交载荷（缺失字段回退默认值）。 */
export function buildVideoPayload(config: Record<string, unknown>): VideoSubmitPayload {
  return {
    prompt: String(config.prompt ?? '').trim(),
    provider_id: String(config.provider ?? '').trim(),
    model: String(config.model ?? '').trim(),
    duration: Number(config.duration ?? 5) || 5,
    aspect_ratio: String(config.aspect_ratio ?? '16:9').trim() || '16:9',
    resolution: String(config.resolution ?? '').trim(),
    seed: config.seed === undefined || config.seed === null || config.seed === '' ? null : Number(config.seed),
    enable_upsample: config.enable_upsample === true,
  }
}

export function submitVideoTask(payload: VideoSubmitPayload): Promise<{ task: GenerationTask }> {
  return api.post('/api/v2/generation-tasks/video', payload)
}

// ---------- Codex / GPT Image 2 Skill 探测（F7） ----------

export interface CodexStatus {
  installed: boolean
  logged_in: boolean | null
  version?: string
  path?: string
  image2_helper_installed: boolean
  image2_helper_path?: string | null
  message: string
}

/** 探测 Codex CLI / GPT Image 2 helper 状态（复用旧 /api/codex/status）。 */
export function fetchCodexStatus(): Promise<CodexStatus> {
  return api.get('/api/codex/status')
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

// ---------- ComfyUI 工作流（F8） ----------

/** 工作流 config 字段定义（等价后端 WorkflowField，含磁盘上的额外键 bind_prompt）。 */
export interface WorkflowFieldDef {
  id: string
  node?: string
  input?: string
  name?: string
  type?: string
  default?: unknown
  min?: number | null
  max?: number | null
  step?: number | null
  options?: string[]
  random_enabled?: boolean
  bind_prompt?: boolean | null
}

export interface WorkflowInfo {
  name: string
  title: string
  builtin: boolean
  field_count: number
}

export interface WorkflowDetail {
  name: string
  workflow: Record<string, unknown>
  config: { title?: string; fields?: WorkflowFieldDef[] }
  builtin: boolean
}

/** 提交 ComfyUI 工作流任务：字段值按工作流 config 字段 id 键控，映射由后端完成。 */
export interface ComfySubmitPayload {
  workflow: string
  field_values: Record<string, unknown>
}

/** 工作流名含路径分隔符（custom/xxx.json），逐段编码以保留斜杠（后端 {name:path}）。 */
export function encodeWorkflowPath(name: string): string {
  return name
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
}

/** 字段缺省值按类型回退（与旧前端 comfyFields 语义一致）。 */
export function workflowFieldDefault(field: WorkflowFieldDef): unknown {
  if (field.type === 'boolean') return false
  if (field.type === 'number' || field.type === 'slider') return 0
  return ''
}

/** 取字段当前值：config.field_values[id] ?? 字段 default ?? 类型缺省。 */
export function workflowFieldValue(config: Record<string, unknown>, field: WorkflowFieldDef): unknown {
  const values = (config.field_values ?? {}) as Record<string, unknown>
  if (values[field.id] !== undefined) return values[field.id]
  if (field.default !== undefined && field.default !== null) return field.default
  return workflowFieldDefault(field)
}

/** 从节点 config 构造 ComfyUI 提交载荷（缺失字段回退默认值）。 */
export function buildComfyPayload(config: Record<string, unknown>): ComfySubmitPayload {
  return {
    workflow: String(config.workflow ?? '').trim(),
    field_values: { ...((config.field_values ?? {}) as Record<string, unknown>) },
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

/** 已注册工作流列表（Workflow 节点选择器；无可用时前端空状态引导配置）。 */
export function useWorkflowList() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: () => listWorkflows(),
  })
}

/** Codex / GPT Image 2 Skill 状态探测（图片生成节点 Codex 提示条）。 */
export function useCodexStatus() {
  return useQuery({
    queryKey: ['codex-status'],
    queryFn: () => fetchCodexStatus(),
  })
}

// ---------- 生成结果 → 资产库 ingest（F12） ----------

/** 任务结果稳定引用 → ingest 源（local_url：本地输出文件入库，供 TaskShelf“保存到资产库”）。 */
export function taskResultToIngestSources(
  result: TaskResult | null | undefined,
): { url: string; name?: string; kind?: string }[] {
  if (!result) return []
  if (isVideoResult(result)) {
    return (result.video_items ?? [])
      .filter((item) => typeof item.url === 'string' && item.url)
      .map((item) => ({ url: item.url, name: item.name, kind: item.kind }))
  }
  return (result.image_items ?? [])
    .filter((item) => typeof item.url === 'string' && item.url)
    .map((item) => ({ url: item.url, name: item.name, kind: item.kind }))
}
