/**
 * 资产库 Feature API 层（切片 19 F11）。
 * 契约（API/v2/assets.py、asset_repo.py、asset_collections.py）：
 * - 列表为游标分页 + 服务端筛选（kind/status/tag/collection/query），sort 白名单默认 updated_at_desc；
 * - 所有 /api/v2 错误统一为 ApiError（application/problem+json）；
 * - ingest/upload 为 multipart（XHR 进度/可取消，50MB 上限，与 /api/ai/upload 对齐）；
 * - 组件不直接 fetch，统一经本层 TQ hooks 消费；本层负责 DTO 归一化（守卫函数收窄，禁内联断言读属性）。
 */
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/core/api/client'
import type { MediaKind } from '@/features/media/api'

// ---------- 类型（对齐后端 DTO） ----------

export type AssetKind = 'image' | 'video' | 'audio' | 'document' | 'workflow' | 'archive'
/** 'purged' 仅出现在 DELETE purge 响应中，列表不会返回。 */
export type AssetStatus = 'active' | 'archived' | 'trashed' | 'purged'
export type AssetSort = 'updated_at_desc' | 'updated_at_asc' | 'created_at_desc' | 'name_asc' | 'name_desc'
export type IngestSourceType = 'remote_url' | 'local_file' | 'shared_folder_file'

export interface AssetVersion {
  id: string
  asset_id: string
  version_no: number
  content_url: string
  preview_url: string | null
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  duration_ms: number | null
  checksum: string
  derivation_type: string
  created_at: number
}

export interface AssetSummary {
  id: string
  project_id: string | null
  kind: AssetKind
  name: string
  description: string
  source_type: string
  lifecycle_status: AssetStatus
  review_status: string
  current_version: AssetVersion | null
  tags: string[]
  collection_ids: string[]
  reference_count: number
  created_at: number
  updated_at: number
  revision: number
}

export interface AssetDetail extends AssetSummary {
  versions: AssetVersion[]
}

export interface AssetCollection {
  id: string
  project_id: string | null
  name: string
  description: string
  kind: string
  sort_order: number
  member_count: number
  revision: number
  created_at: number
  updated_at: number
}

export interface PageInfo {
  next_cursor: string | null
  has_more: boolean
  limit: number
  total: number
}

export interface AssetListPage {
  items: AssetSummary[]
  page: PageInfo
}

/** 列表筛选（服务端执行）；cursor 走 useInfiniteQuery 的 pageParam，不进 queryKey。 */
export interface AssetListFilters {
  project_id?: string | null
  kind?: AssetKind | 'all' | null
  status?: AssetStatus | null
  tag?: string | null
  collection_id?: string | null
  query?: string | null
  sort: AssetSort
  limit: number
}

export interface AssetPatch {
  name?: string
  description?: string
  tags?: string[]
  project_id?: string | null
}

export interface IngestSourcePayload {
  type: IngestSourceType
  url?: string
  path?: string
  shared_folder_id?: string
  name?: string
  kind?: AssetKind
}

export interface IngestPayload {
  project_id?: string | null
  sources: IngestSourcePayload[]
  tags: string[]
  collection_id?: string | null
}

/** ingest JSON 端点的按源结果（成功或失败独立）。 */
export interface IngestSourceResult {
  source_index: number
  status: 'succeeded' | 'failed'
  asset?: AssetDetail
  error?: { code?: string; title?: string; detail?: string }
}

// ---------- 展示常量 ----------

export const KIND_LABELS: Record<AssetKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  workflow: '工作流',
  archive: '归档',
}

export const KIND_OPTIONS: { value: AssetKind; label: string }[] = (Object.keys(KIND_LABELS) as AssetKind[]).map(
  (kind) => ({ value: kind, label: KIND_LABELS[kind] }),
)

export const SOURCE_LABELS: Record<string, string> = {
  upload: '上传',
  remote_url: '远程 URL',
  local_file: '本地路径',
  shared_folder_file: '共享目录',
  generated: '生成',
}

export const DERIVATION_LABELS: Record<string, string> = {
  original: '原始',
  replacement: '替换',
  crop: '裁剪',
  resize: '缩放',
  upscale: '放大',
  'background-remove': '去背景',
  transcode: '转码',
  'extract-frame': '抽帧',
  other: '其他',
}

// ---------- 纯函数：DTO 归一化（守卫收窄，禁内联断言） ----------

// 静态字面量查找表用 Record（规则：ts-set-map）；成员资格即 `key in table === true`。
const KIND_SET: Record<string, true> = { image: true, video: true, audio: true, document: true, workflow: true, archive: true }
const STATUS_SET: Record<string, true> = { active: true, archived: true, trashed: true, purged: true }

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === 'string' && KIND_SET[value] === true
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/** 版本 DTO 归一化：id 缺失视为非法版本（返回 null，列表跳过）。 */
export function normalizeVersion(raw: unknown): AssetVersion | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || !record.id) return null
  return {
    id: record.id,
    asset_id: asString(record.asset_id),
    version_no: asNullableNumber(record.version_no) ?? 0,
    content_url: asString(record.content_url),
    preview_url: typeof record.preview_url === 'string' ? record.preview_url : null,
    mime_type: asString(record.mime_type),
    size_bytes: asNullableNumber(record.size_bytes) ?? 0,
    width: asNullableNumber(record.width),
    height: asNullableNumber(record.height),
    duration_ms: asNullableNumber(record.duration_ms),
    checksum: asString(record.checksum),
    derivation_type: asString(record.derivation_type, 'other'),
    created_at: asNullableNumber(record.created_at) ?? 0,
  }
}

/** AssetSummary DTO 归一化：缺字段回落默认值，未知 kind/status 回落安全值，保证 UI 只消费稳定形状。 */
export function normalizeAsset(raw: unknown): AssetSummary {
  if (typeof raw !== 'object' || raw === null) throw new TypeError('资产数据不是对象')
  const record = raw as Record<string, unknown>
  const id = record.id
  if (typeof id !== 'string' || !id) throw new TypeError('资产缺少 id')
  const statusRaw = asString(record.lifecycle_status, 'active')
  return {
    id,
    project_id: typeof record.project_id === 'string' ? record.project_id : null,
    kind: isAssetKind(record.kind) ? record.kind : 'document',
    name: asString(record.name, '未命名'),
    description: asString(record.description),
    source_type: asString(record.source_type),
    lifecycle_status: STATUS_SET[statusRaw] === true ? (statusRaw as AssetStatus) : 'active',
    review_status: asString(record.review_status),
    current_version: normalizeVersion(record.current_version),
    tags: asStringArray(record.tags),
    collection_ids: asStringArray(record.collection_ids),
    reference_count: asNullableNumber(record.reference_count) ?? 0,
    created_at: asNullableNumber(record.created_at) ?? 0,
    updated_at: asNullableNumber(record.updated_at) ?? 0,
    revision: asNullableNumber(record.revision) ?? 0,
  }
}

/** AssetDetail = summary + 完整版本历史（版本列表按 version_no 倒序，保持后端顺序）。 */
export function normalizeDetail(raw: unknown): AssetDetail {
  const summary = normalizeAsset(raw)
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const versionsRaw = Array.isArray(record.versions) ? record.versions : []
  return {
    ...summary,
    versions: versionsRaw
      .map(normalizeVersion)
      .filter((version): version is AssetVersion => version !== null),
  }
}

/** 纯展示映射：AssetKind → MediaKind（供 MediaThumbnail/MediaPreview 复用）。 */
export function toMediaKind(kind: AssetKind | string): MediaKind {
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind
  return 'file'
}

/** 逗号分隔标签文本 → 去重清洗后的标签数组（PATCH tags 全量替换语义）。 */
export function splitTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((tag) => tag.trim()).filter(Boolean))]
}

/** 游标分页响应 → 扁平资产数组（分页累积）。 */
export function collectAssets(pages: AssetListPage[] | undefined): AssetSummary[] {
  return pages?.flatMap((page) => page.items) ?? []
}

// ---------- 纯函数：筛选与展示格式化 ----------

/** 组装列表查询串；query 空白即省略（后端按 %q% LIKE 匹配名称/描述/标签）。 */
export function buildAssetQuery(filters: AssetListFilters, cursor?: string | null): string {
  const params = new URLSearchParams()
  if (filters.project_id) params.set('project_id', filters.project_id)
  if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind)
  if (filters.status) params.set('status', filters.status)
  if (filters.tag) params.set('tag', filters.tag)
  if (filters.collection_id) params.set('collection_id', filters.collection_id)
  const query = (filters.query ?? '').trim()
  if (query) params.set('query', query)
  params.set('sort', filters.sort)
  params.set('limit', String(filters.limit))
  if (cursor) params.set('cursor', cursor)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function formatBytes(bytes: number | null | undefined): string {
  const size = asNullableNumber(bytes) ?? 0
  if (size <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** index
  // 整数（或 B 级）不带小数，非整数值保留 1 位小数
  const text = index === 0 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1)
  return `${text} ${units[index]}`
}

export function formatDuration(ms: number | null | undefined): string {
  const totalSeconds = Math.floor((asNullableNumber(ms) ?? 0) / 1000)
  if (totalSeconds <= 0) return ''
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** 时间戳 → 本地「YYYY-MM-DD HH:mm」（手动补零，避免依赖 Intl 时区数据）。 */
export function formatDate(ts: number | null | undefined): string {
  const value = asNullableNumber(ts) ?? 0
  if (value <= 0) return ''
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// ---------- ingest JSON 结果归一化 ----------

export interface IngestOutcome {
  index: number
  ok: boolean
  name: string
  detail?: string
}

/** ingest JSON 响应 results[] → 对话框展示模型（成功显示资产名，失败显示错误详情）。 */
export function normalizeIngestResults(raw: unknown): IngestOutcome[] {
  if (!Array.isArray(raw)) return []
  const outcomes: IngestOutcome[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const index = typeof record.source_index === 'number' ? record.source_index : outcomes.length
    if (record.status === 'succeeded') {
      const asset = record.asset
      outcomes.push({
        index,
        ok: true,
        name: asset && typeof asset === 'object' && 'name' in asset && typeof asset.name === 'string' ? asset.name : '导入成功',
      })
      continue
    }
    const error = record.error
    const detail =
      error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string' && error.detail
        ? error.detail
        : error && typeof error === 'object' && 'title' in error && typeof error.title === 'string'
          ? error.title
          : '未知错误'
    outcomes.push({ index, ok: false, name: '导入失败', detail })
  }
  return outcomes
}

// ---------- ingest/upload（multipart XHR，进度/取消） ----------

export class IngestUploadError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'IngestUploadError'
    this.code = code
  }
}

/** 用户主动取消：非错误，UI 不得展示失败提示。 */
export class IngestUploadAbortError extends Error {
  constructor() {
    super('上传已取消')
    this.name = 'IngestUploadAbortError'
  }
}

export interface IngestUploadOptions {
  tags?: string[]
  collectionId?: string | null
  onProgress?: (percent: number, loaded: number, total: number) => void
}

export interface IngestUploadResult {
  assets: AssetSummary[]
  failures: { title: string; detail: string }[]
}

export interface IngestUploadHandle {
  promise: Promise<IngestUploadResult>
  abort: () => void
}

/** 解析 multipart 上传响应：后端按文件独立成败（元素为 AssetDetail 或 {error}）。 */
export function parseUploadResponse(raw: unknown): IngestUploadResult {
  if (typeof raw !== 'object' || raw === null || !('assets' in raw) || !Array.isArray((raw as Record<string, unknown>).assets)) {
    throw new IngestUploadError('上传响应格式错误', 'BAD_RESPONSE')
  }
  const items = (raw as Record<string, unknown>).assets as unknown[]
  const assets: AssetSummary[] = []
  const failures: { title: string; detail: string }[] = []
  for (const item of items) {
    if (typeof item === 'object' && item !== null && 'error' in item) {
      const error = (item as Record<string, unknown>).error as Record<string, unknown> | null
      failures.push({
        title: typeof error?.title === 'string' ? error.title : '导入失败',
        detail: typeof error?.detail === 'string' ? error.detail : '',
      })
      continue
    }
    try {
      assets.push(normalizeAsset(item))
    } catch {
      failures.push({ title: '导入失败', detail: '响应中的资产数据不完整' })
    }
  }
  return { assets, failures }
}

function uploadStatusMessage(status: number): string {
  if (status === 413) return '文件超过 50MB，无法上传'
  return `上传失败（HTTP ${status}）`
}

/**
 * multipart 上传到 /api/v2/assets/ingest/upload。
 * - onProgress：进度百分比 0-100（lengthComputable 时回调）；
 * - abort() 取消进行中请求，promise 以 IngestUploadAbortError 拒绝；
 * - 与 media/api.ts uploadFiles 同构（XHR 而非 fetch，拿真实进度）。
 */
export function ingestUpload(files: File[], options?: IngestUploadOptions): IngestUploadHandle {
  const xhr = new XMLHttpRequest()
  const form = new FormData()
  for (const file of files) form.append('files', file)
  if (options?.tags && options.tags.length > 0) form.append('tags', JSON.stringify(options.tags))
  if (options?.collectionId) form.append('collection_id', options.collectionId)

  const promise = new Promise<IngestUploadResult>((resolve, reject) => {
    xhr.open('POST', '/api/v2/assets/ingest/upload')
    xhr.timeout = 30_000
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options?.onProgress?.((event.loaded / event.total) * 100, event.loaded, event.total)
      }
    }
    xhr.onerror = () => reject(new IngestUploadError('网络错误，上传失败', 'NETWORK'))
    xhr.ontimeout = () => reject(new IngestUploadError('上传超时，请重试', 'TIMEOUT'))
    xhr.onabort = () => reject(new IngestUploadAbortError())
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(parseUploadResponse(xhr.response))
        } catch (err) {
          reject(err instanceof IngestUploadError ? err : new IngestUploadError('上传响应解析失败', 'BAD_RESPONSE'))
        }
      } else {
        reject(new IngestUploadError(uploadStatusMessage(xhr.status), `HTTP_${xhr.status}`))
      }
    }
    xhr.send(form)
  })

  return { promise, abort: () => xhr.abort() }
}

// ---------- Query Keys ----------

export const assetKeys = {
  all: ['assets'] as const,
  list: (filters: AssetListFilters) => ['assets', 'list', filters] as const,
  detail: (id: string) => ['assets', 'detail', id] as const,
}

export const collectionKeys = {
  all: ['asset-collections'] as const,
}

// ---------- 资产列表（游标分页，切换筛选保留旧数据） ----------

export function useAssets(filters: AssetListFilters) {
  return useInfiniteQuery({
    queryKey: assetKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      const body = await api.get<{ items: unknown[]; page: PageInfo }>(
        `/api/v2/assets${buildAssetQuery(filters, pageParam)}`,
      )
      return { items: body.items.map(normalizeAsset), page: body.page }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.page.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  })
}

// ---------- 资产详情 ----------

export function useAssetDetail(assetId: string | null) {
  return useQuery({
    queryKey: assetKeys.detail(assetId ?? ''),
    queryFn: async () => {
      const body = await api.get<{ asset: unknown }>(`/api/v2/assets/${assetId}`)
      return normalizeDetail(body.asset)
    },
    enabled: assetId != null,
  })
}

// ---------- 资产变更 ----------

export function usePatchAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AssetPatch }) =>
      api.patch<{ asset: unknown }>(`/api/v2/assets/${id}`, patch).then((body) => normalizeDetail(body.asset)),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetKeys.all }),
  })
}

/** 删除：默认进回收站（trashed）。 */
export function useTrashAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ asset: unknown }>(`/api/v2/assets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetKeys.all }),
  })
}

/** 彻底删除（purge=true，物理清除；有画布 Hard Reference 时后端 409）。 */
export function usePurgeAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ asset: unknown }>(`/api/v2/assets/${id}?purge=true`),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetKeys.all }),
  })
}

export function useRestoreAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ asset: unknown }>(`/api/v2/assets/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetKeys.all }),
  })
}

/** JSON 导入（remote_url / local_file / shared_folder_file），按源独立成败。 */
export function useIngest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: IngestPayload) =>
      api.post<{ results: unknown[]; assets: unknown[] }>('/api/v2/assets/ingest', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetKeys.all }),
  })
}

// ---------- 集合 ----------

export function useCollections() {
  return useQuery({
    queryKey: collectionKeys.all,
    queryFn: () => api.get<{ collections: AssetCollection[] }>('/api/v2/asset-collections'),
  })
}

export function useCreateCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      api.post<{ collection: AssetCollection }>('/api/v2/asset-collections', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: collectionKeys.all }),
  })
}

export function usePatchCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; description?: string; sort_order?: number } }) =>
      api.patch<{ collection: AssetCollection }>(`/api/v2/asset-collections/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: collectionKeys.all }),
  })
}

export function useDeleteCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ collection: AssetCollection }>(`/api/v2/asset-collections/${id}`),
    // 删除集合会连带移除成员关联，资产摘要的 collection_ids 也会变化
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collectionKeys.all })
      qc.invalidateQueries({ queryKey: assetKeys.all })
    },
  })
}

export function useAddCollectionMembers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ collectionId, assetIds }: { collectionId: string; assetIds: string[] }) =>
      api.post<{ collection: AssetCollection }>(`/api/v2/asset-collections/${collectionId}/members`, { asset_ids: assetIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collectionKeys.all })
      qc.invalidateQueries({ queryKey: assetKeys.all })
    },
  })
}

export function useRemoveCollectionMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ collectionId, assetId }: { collectionId: string; assetId: string }) =>
      api.delete<{ collection: AssetCollection }>(`/api/v2/asset-collections/${collectionId}/members/${assetId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collectionKeys.all })
      qc.invalidateQueries({ queryKey: assetKeys.all })
    },
  })
}
