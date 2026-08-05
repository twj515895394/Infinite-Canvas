/**
 * 媒体 API 层测试（切片 10 F9）。
 * 契约：上传用 XHR（FormData files 字段、真实进度、可取消）；取消以 UploadAbortError 拒绝；
 * 成功解析 /api/ai/upload 的 {files:[{url,name,kind,mime}]}；缩略/下载 URL 构造正确。
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_UPLOAD_BYTES,
  UploadAbortError,
  downloadUrl,
  thumbnailUrl,
  uploadFiles,
  type UploadedFile,
} from '@/features/media/api'

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

  // --- 测试辅助 ---
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

describe('thumbnailUrl / downloadUrl', () => {
  it('缩略图 URL 编码原 url 并带宽度', () => {
    expect(thumbnailUrl('/assets/input/a b.png', 256)).toBe('/api/media-preview?url=%2Fassets%2Finput%2Fa%20b.png&w=256')
  })

  it('下载 URL 带 url 与可选 name', () => {
    expect(downloadUrl('/assets/input/a.png')).toBe('/api/download-output?url=%2Fassets%2Finput%2Fa.png')
    expect(downloadUrl('/assets/input/a.png', '照片.png')).toContain('name=%E7%85%A7%E7%89%87.png')
  })
})

describe('uploadFiles', () => {
  it('POST 到 /api/ai/upload 且 FormData 使用 files 字段', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const handle = uploadFiles([new File(['x'], 'a.png', { type: 'image/png' })])
      const xhr = FakeXHR.instances[0]
      expect(xhr.method).toBe('POST')
      expect(xhr.url).toBe('/api/ai/upload')
      expect(xhr.formData?.getAll('files').length).toBe(1)
      handle.abort()
      await handle.promise.catch(() => {}) // 消费取消拒绝，避免 unhandled rejection
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('按真实进度回调 onProgress', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const seen: number[] = []
      const handle = uploadFiles([new File(['x'], 'a.png')], { onProgress: (p) => seen.push(p) })
      const xhr = FakeXHR.instances[0]
      xhr.progress(50, 100)
      xhr.progress(100, 100)
      xhr.respond(200, { files: [{ url: '/assets/input/ast_1.png', name: 'a.png', kind: 'image', mime: 'image/png' }] })
      const uploaded = await handle.promise
      expect(seen).toEqual([50, 100])
      expect(uploaded[0]).toMatchObject<Partial<UploadedFile>>({ url: '/assets/input/ast_1.png', kind: 'image' })
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('成功响应 kind 规范化（未知 kind 归为 file）', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const handle = uploadFiles([new File(['x'], 'a.json')])
      FakeXHR.instances[0].respond(200, { files: [{ url: '/assets/input/ast_2.json', name: 'a.json', kind: 'other' }] })
      const uploaded = await handle.promise
      expect(uploaded[0].kind).toBe('file')
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('响应缺少 url 拒绝为 UploadError BAD_RESPONSE', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const handle = uploadFiles([new File(['x'], 'a.png')])
      FakeXHR.instances[0].respond(200, { files: [{ name: 'no-url' }] })
      await expect(handle.promise).rejects.toMatchObject({ name: 'UploadError', code: 'BAD_RESPONSE' })
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('HTTP 413 拒绝为 UploadError HTTP_413（超大文件提示）', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const handle = uploadFiles([new File(['x'], 'big.mp4')])
      FakeXHR.instances[0].respond(413, null)
      await expect(handle.promise).rejects.toMatchObject({ code: 'HTTP_413', message: expect.stringContaining('50MB') })
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('网络错误拒绝为 UploadError NETWORK', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const handle = uploadFiles([new File(['x'], 'a.png')])
      FakeXHR.instances[0].fail()
      await expect(handle.promise).rejects.toMatchObject({ code: 'NETWORK' })
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('abort 后 promise 以 UploadAbortError 拒绝（取消不是错误）', async () => {
    FakeXHR.instances = []
    const original = globalThis.XMLHttpRequest
    // @ts-expect-error 测试替身
    globalThis.XMLHttpRequest = FakeXHR
    try {
      const handle = uploadFiles([new File(['x'], 'a.png')])
      handle.abort()
      await expect(handle.promise).rejects.toBeInstanceOf(UploadAbortError)
      expect(FakeXHR.instances[0].aborted).toBe(true)
    } finally {
      globalThis.XMLHttpRequest = original
    }
  })

  it('暴露 50MB 上限常量供组件校验', () => {
    expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024)
  })
})
