/**
 * 资产库 API 层纯函数测试（切片 19 F11）。
 * 覆盖：DTO 归一化（normalizeAsset/Version/Detail）、筛选查询串（buildAssetQuery）、
 * 展示格式化（formatBytes/Duration/Date、toMediaKind、splitTags）、
 * 分页累积（collectAssets）、ingest 结果归一化（normalizeIngestResults/parseUploadResponse）、
 * multipart 上传（ingestUpload：端点/FormData/进度/取消/错误）。
 * 不渲染组件；XHR 用 FakeXHR 替身（与 media/api 测试同构）。
 */
import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES } from '@/features/media/api'
import {
  buildAssetQuery,
  collectAssets,
  formatBytes,
  formatDate,
  formatDuration,
  IngestUploadAbortError,
  IngestUploadError,
  ingestUpload,
  normalizeAsset,
  normalizeDetail,
  normalizeIngestResults,
  normalizeVersion,
  parseUploadResponse,
  splitTags,
  toMediaKind,
  type AssetListPage,
  type AssetSummary,
} from '@/features/assets/api'

interface FakeProgressEvent {
  lengthComputable: boolean
  loaded: number
  total: number
}

class FakeXHR {
  static instances: FakeXHR[] = []
  method = ''
  url = ''
  formData: FormData | null = null
  response: unknown = null
  status = 200
  aborted = false
  upload = { onprogress: null as null | ((e: FakeProgressEvent) => void) }
  onerror: null | (() => void) = null
  onload: null | (() => void) = null
  onabort: null | (() => void) = null
  ontimeout: null | (() => void) = null

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  send(formData: FormData) {
    this.formData = formData
    FakeXHR.instances.push(this)
  }

  abort() {
    this.aborted = true
    this.onabort?.()
  }

  respond(status: number, body: unknown) {
    this.status = status
    this.response = body
    this.onload?.()
  }

  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }

  fail() {
    this.onerror?.()
  }
}

const rawAsset = {
  id: 'ast_1',
  project_id: 'proj_1',
  kind: 'image',
  name: '日落.png',
  description: '测试资产',
  source_type: 'upload',
  lifecycle_status: 'active',
  review_status: 'unreviewed',
  current_version: {
    id: 'avr_1',
    asset_id: 'ast_1',
    version_no: 1,
    content_url: '/assets/input/ast_1.png',
    preview_url: '/api/media-preview?url=%2Fassets%2Finput%2Fast_1.png&w=512',
    mime_type: 'image/png',
    size_bytes: 2048,
    width: 1920,
    height: 1080,
    duration_ms: null,
    checksum: 'abc',
    derivation_type: 'original',
    created_at: 1700000000000,
  },
  tags: ['风景', '参考'],
  collection_ids: ['col_1'],
  reference_count: 2,
  created_at: 1700000000000,
  updated_at: 1700001000000,
  revision: 1,
}

describe('normalizeAsset（DTO 归一化）', () => {
  it('完整形状原样归一化', () => {
    const asset = normalizeAsset(rawAsset)
    expect(asset.id).toBe('ast_1')
    expect(asset.kind).toBe('image')
    expect(asset.tags).toEqual(['风景', '参考'])
    expect(asset.current_version?.width).toBe(1920)
    expect(asset.reference_count).toBe(2)
  })

  it('缺失可选字段回落默认值', () => {
    const asset = normalizeAsset({ id: 'ast_2' })
    expect(asset.kind).toBe('document') // 未知 kind 回落文档（安全展示）
    expect(asset.name).toBe('未命名')
    expect(asset.tags).toEqual([])
    expect(asset.current_version).toBeNull()
    expect(asset.updated_at).toBe(0)
  })

  it('未知 lifecycle_status 回落 active', () => {
    const asset = normalizeAsset({ id: 'ast_3', lifecycle_status: 'weird' })
    expect(asset.lifecycle_status).toBe('active')
  })

  it('tags 非数组时归一为空数组', () => {
    const asset = normalizeAsset({ id: 'ast_4', tags: 'not-array' })
    expect(asset.tags).toEqual([])
  })

  it('缺少 id 抛出 TypeError（非法数据不静默）', () => {
    expect(() => normalizeAsset({ name: 'x' })).toThrow(TypeError)
    expect(() => normalizeAsset(null)).toThrow(TypeError)
  })
})

describe('normalizeVersion / normalizeDetail', () => {
  it('版本字段缺失回落默认值', () => {
    const version = normalizeVersion({ id: 'avr_2', version_no: 3 })
    expect(version?.version_no).toBe(3)
    expect(version?.content_url).toBe('')
    expect(version?.duration_ms).toBeNull()
  })

  it('id 缺失的版本归一为 null（列表跳过）', () => {
    expect(normalizeVersion({ version_no: 1 })).toBeNull()
    expect(normalizeVersion(null)).toBeNull()
  })

  it('detail 带版本历史，非法版本被过滤', () => {
    const detail = normalizeDetail({ ...rawAsset, versions: [rawAsset.current_version, { version_no: 9 }] })
    expect(detail.versions).toHaveLength(1)
    expect(detail.versions[0].id).toBe('avr_1')
  })
})

describe('buildAssetQuery（筛选查询串）', () => {
  it('仅默认 sort 与 limit', () => {
    expect(buildAssetQuery({ sort: 'updated_at_desc', limit: 48 })).toBe('?sort=updated_at_desc&limit=48')
  })

  it('kind/status/tag/collection/query 全部编码', () => {
    const qs = buildAssetQuery({
      kind: 'image',
      status: 'trashed',
      tag: '风景',
      collection_id: 'col_1',
      query: '  日落  ',
      sort: 'name_asc',
      limit: 20,
    })
    expect(qs).toContain('kind=image')
    expect(qs).toContain('status=trashed')
    expect(qs).toContain('tag=%E9%A3%8E%E6%99%AF')
    expect(qs).toContain('collection_id=col_1')
    expect(qs).toContain('query=%E6%97%A5%E8%90%BD') // 空白已 trim
    expect(qs).toContain('sort=name_asc')
    expect(qs).toContain('limit=20')
  })

  it('kind=all 与空白 query 不进入查询串', () => {
    const qs = buildAssetQuery({ kind: 'all', query: '   ', sort: 'updated_at_desc', limit: 48 })
    expect(qs).not.toContain('kind')
    expect(qs).not.toContain('query')
  })

  it('cursor 透传', () => {
    expect(buildAssetQuery({ sort: 'updated_at_desc', limit: 48 }, 'abc123')).toContain('cursor=abc123')
  })
})

describe('collectAssets（分页累积）', () => {
  it('扁平化多页 items', () => {
    const pages: AssetListPage[] = [
      { items: [normalizeAsset({ ...rawAsset, id: 'a' })], page: { next_cursor: 'x', has_more: true, limit: 48, total: 2 } },
      { items: [normalizeAsset({ ...rawAsset, id: 'b' })], page: { next_cursor: null, has_more: false, limit: 48, total: 2 } },
    ]
    expect(collectAssets(pages).map((a) => a.id)).toEqual(['a', 'b'])
    expect(collectAssets(undefined)).toEqual([])
  })
})

describe('展示格式化', () => {
  it('formatBytes 分级', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatBytes(null)).toBe('—')
  })

  it('formatDuration 分/时', () => {
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(3_600_000 + 61_000)).toBe('1:01:01')
    expect(formatDuration(null)).toBe('')
  })

  it('formatDate 输出 YYYY-MM-DD HH:mm', () => {
    const date = new Date(2026, 0, 5, 9, 7)
    expect(formatDate(date.getTime())).toBe('2026-01-05 09:07')
    expect(formatDate(0)).toBe('')
  })

  it('toMediaKind 映射（未知回落 file）', () => {
    expect(toMediaKind('image')).toBe('image')
    expect(toMediaKind('video')).toBe('video')
    expect(toMediaKind('audio')).toBe('audio')
    expect(toMediaKind('document')).toBe('file')
    expect(toMediaKind('workflow')).toBe('file')
  })

  it('splitTags 去重、trim、过滤空', () => {
    expect(splitTags(' 风景 , 参考,风景, ,角色 ')).toEqual(['风景', '参考', '角色'])
    expect(splitTags('')).toEqual([])
  })
})

describe('normalizeIngestResults（JSON 导入按源结果）', () => {
  it('成功/失败独立映射', () => {
    const outcomes = normalizeIngestResults([
      { source_index: 0, status: 'succeeded', asset: { id: 'ast_1', name: '照片.png' } },
      { source_index: 1, status: 'failed', error: { code: 'VALIDATION_FAILED', title: 'Invalid URL', detail: '仅支持 http/https' } },
      '垃圾数据',
    ])
    expect(outcomes).toHaveLength(2)
    expect(outcomes[0]).toMatchObject({ index: 0, ok: true, name: '照片.png' })
    expect(outcomes[1]).toMatchObject({ index: 1, ok: false, detail: '仅支持 http/https' })
  })

  it('非数组返回空', () => {
    expect(normalizeIngestResults(null)).toEqual([])
  })
})

describe('parseUploadResponse（multipart 响应解析）', () => {
  it('资产与 error 元素分离', () => {
    const result = parseUploadResponse({
      assets: [rawAsset, { error: { code: 'ASSET_INGEST_FAILED', title: 'Ingest failed', detail: '创建资产记录失败' } }],
    })
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0].id).toBe('ast_1')
    expect(result.failures).toEqual([{ title: 'Ingest failed', detail: '创建资产记录失败' }])
  })

  it('非法资产元素归为失败项而非崩溃', () => {
    const result = parseUploadResponse({ assets: [{ name: 'no-id' }] })
    expect(result.assets).toHaveLength(0)
    expect(result.failures).toHaveLength(1)
  })

  it('响应形状错误抛 IngestUploadError', () => {
    expect(() => parseUploadResponse({ files: [] })).toThrow(IngestUploadError)
    expect(() => parseUploadResponse(null)).toThrow(IngestUploadError)
  })
})

describe('ingestUpload（XHR multipart）', () => {
  it('POST 到 /api/v2/assets/ingest/upload，FormData 含 files/tags/collection_id', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const handle = ingestUpload([new File(['x'], 'a.png', { type: 'image/png' })], {
        tags: ['参考'],
        collectionId: 'col_1',
      })
      const xhr = FakeXHR.instances[0]
      expect(xhr.method).toBe('POST')
      expect(xhr.url).toBe('/api/v2/assets/ingest/upload')
      expect(xhr.formData?.getAll('files')).toHaveLength(1)
      expect(xhr.formData?.get('tags')).toBe('["参考"]')
      expect(xhr.formData?.get('collection_id')).toBe('col_1')
      handle.abort()
      await handle.promise.catch(() => {})
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('按真实进度回调 onProgress 并解析成功响应', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const seen: number[] = []
      const handle = ingestUpload([new File(['x'], 'a.png')], { onProgress: (p) => seen.push(p) })
      const xhr = FakeXHR.instances[0]
      xhr.progress(50, 100)
      xhr.progress(100, 100)
      xhr.respond(200, { assets: [rawAsset] })
      const result = await handle.promise
      expect(seen).toEqual([50, 100])
      expect(result.assets[0].name).toBe('日落.png')
      expect(result.failures).toEqual([])
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('HTTP 413 拒绝为 IngestUploadError HTTP_413（超大文件提示）', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const handle = ingestUpload([new File(['x'], 'big.mp4')])
      FakeXHR.instances[0].respond(413, null)
      await expect(handle.promise).rejects.toMatchObject({ code: 'HTTP_413', message: expect.stringContaining('50MB') })
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('abort 后 promise 以 IngestUploadAbortError 拒绝（取消不是错误）', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const handle = ingestUpload([new File(['x'], 'a.png')])
      handle.abort()
      await expect(handle.promise).rejects.toBeInstanceOf(IngestUploadAbortError)
      expect(FakeXHR.instances[0].aborted).toBe(true)
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('网络错误拒绝为 IngestUploadError NETWORK', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const handle = ingestUpload([new File(['x'], 'a.png')])
      FakeXHR.instances[0].fail()
      await expect(handle.promise).rejects.toMatchObject({ code: 'NETWORK' })
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('暴露 50MB 上限常量供组件校验', () => {
    expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024)
  })

  it('归一化后的资产类型可用作 AssetSummary', () => {
    const asset: AssetSummary = normalizeAsset(rawAsset)
    expect(asset.lifecycle_status).toBe('active')
  })
})

// ---------- 拖拽 payload（F12 资产拖入画布） ----------

import { ASSET_DRAG_MIME, assetToDragPayload, isIngestAllSucceeded, isIngestResult, parseAssetDragPayload, type AssetDragPayload } from '@/features/assets/api'

describe('parseAssetDragPayload（F12 拖入画布）', () => {
  const valid: AssetDragPayload = {
    assetId: 'ast_1',
    assetVersionId: 'avr_1',
    name: '参考图',
    kind: 'image',
    status: 'active',
    previewUrl: '/api/media-preview?url=%2Fassets%2Finput%2Fa.png',
    contentUrl: '/assets/input/a.png',
  }

  it('合法 payload 完整解析（含展示缓存字段）', () => {
    const parsed = parseAssetDragPayload(JSON.stringify(valid))
    expect(parsed).toEqual(valid)
  })

  it('缺失 assetVersionId 或 contentUrl 返回 null（画布 drop 拒绝）', () => {
    expect(parseAssetDragPayload(JSON.stringify({ ...valid, assetVersionId: '' }))).toBeNull()
    expect(parseAssetDragPayload(JSON.stringify({ ...valid, contentUrl: '' }))).toBeNull()
  })

  it('未知 kind 回落 image、未知 status 回落 active（守卫收窄）', () => {
    const parsed = parseAssetDragPayload(
      JSON.stringify({ ...valid, kind: 'weird', status: 'zzz' }),
    )
    expect(parsed).toMatchObject({ kind: 'image', status: 'active' })
  })

  it('非 JSON / 非对象返回 null', () => {
    expect(parseAssetDragPayload('not-json')).toBeNull()
    expect(parseAssetDragPayload('42')).toBeNull()
    expect(parseAssetDragPayload(null)).toBeNull()
    expect(parseAssetDragPayload(undefined)).toBeNull()
  })

  it('trashed 状态保留（画布 drop 侧拒绝拖入）', () => {
    const parsed = parseAssetDragPayload(JSON.stringify({ ...valid, status: 'trashed' }))
    expect(parsed?.status).toBe('trashed')
  })

  it('MIME 常量稳定（跨 AssetDrawer 与 CanvasPage 契约）', () => {
    expect(ASSET_DRAG_MIME).toBe('application/x-studio-v2-asset')
    const payload: AssetDragPayload = valid
    expect(typeof JSON.stringify(payload)).toBe('string')
  })

  it('assetToDragPayload：active 资产带当前版本生成 payload', () => {
    const asset = normalizeAsset({
      ...rawAsset,
      current_version: { id: 'avr_9', content_url: '/assets/input/a.png', preview_url: null },
    })
    expect(assetToDragPayload(asset)).toMatchObject({
      assetId: asset.id,
      assetVersionId: 'avr_9',
      kind: 'image',
      status: 'active',
      contentUrl: '/assets/input/a.png',
    })
  })

  it('assetToDragPayload：回收站资产返回 null（禁拖）', () => {
    const trashed = normalizeAsset({ ...rawAsset, lifecycle_status: 'trashed', current_version: null })
    expect(assetToDragPayload(trashed)).toBeNull()
  })

  it('assetToDragPayload：无当前版本返回 null', () => {
    const noVersion = normalizeAsset({ ...rawAsset, current_version: null })
    expect(assetToDragPayload(noVersion)).toBeNull()
  })
})

// ---------- ingest 批量结果判定（F12 保存到资产库） ----------

describe('isIngestAllSucceeded / isIngestResult（F12 保存判定）', () => {
  it('全部 succeeded 才算成功（TaskShelf 标记已保存）', () => {
    expect(isIngestAllSucceeded([{ source_index: 0, status: 'succeeded' }])).toBe(true)
    expect(
      isIngestAllSucceeded([
        { source_index: 0, status: 'succeeded' },
        { source_index: 1, status: 'succeeded' },
      ]),
    ).toBe(true)
  })

  it('任一 failed / 空数组 / 非数组返回 false（保留重试，避免假成功）', () => {
    expect(
      isIngestAllSucceeded([{ source_index: 0, status: 'succeeded' }, { source_index: 1, status: 'failed' }]),
    ).toBe(false)
    expect(isIngestAllSucceeded([{ source_index: 0, status: 'failed' }])).toBe(false)
    expect(isIngestAllSucceeded([])).toBe(false)
    expect(isIngestAllSucceeded(null)).toBe(false)
    expect(isIngestAllSucceeded(undefined)).toBe(false)
  })

  it('isIngestResult 只接受 {status} 形状元素', () => {
    expect(isIngestResult({ status: 'succeeded' })).toBe(true)
    expect(isIngestResult({ status: 'failed' })).toBe(true)
    expect(isIngestResult({ status: 'weird' })).toBe(false)
    expect(isIngestResult('x')).toBe(false)
    expect(isIngestResult(null)).toBe(false)
  })
})
