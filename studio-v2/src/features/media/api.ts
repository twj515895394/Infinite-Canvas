/**
 * 媒体 Feature API 层（切片 10 F9）。
 * 复用现有旧接口：/api/ai/upload（上传）、/api/media-preview（缩略图）、/api/download-output（下载）。
 * 上传用 XHR 以获得真实进度与可取消；业务组件不得直接 fetch。
 */
export type MediaKind = 'image' | 'video' | 'audio' | 'file'

export interface UploadedFile {
  url: string
  name: string
  kind: MediaKind
  mime: string
}

export const UPLOAD_ENDPOINT = '/api/ai/upload'
/** 与后端 /api/ai/upload 限制一致（50MB）。 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** 上传失败（可重试）。code 为机器可读分类。 */
export class UploadError extends Error {
  readonly code: string
  constructor(message: string, code: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined)
    this.name = 'UploadError'
    this.code = code
  }
}

/** 用户主动取消：非错误，UI 不得展示失败提示。 */
export class UploadAbortError extends Error {
  constructor() {
    super('上传已取消')
    this.name = 'UploadAbortError'
  }
}

/** 缩略图 URL：复用后端 /api/media-preview（本地文件缩略，不传大图）。 */
export function thumbnailUrl(url: string, width = 512): string {
  return `/api/media-preview?url=${encodeURIComponent(url)}&w=${width}`
}

/** 下载 URL：复用后端 /api/download-output。 */
export function downloadUrl(url: string, name?: string): string {
  const q = new URLSearchParams({ url })
  if (name) q.set('name', name)
  return `/api/download-output?${q.toString()}`
}

function normalizeKind(raw: string | undefined): MediaKind {
  if (raw === 'image' || raw === 'video' || raw === 'audio') return raw
  return 'file'
}

function normalizeUploadedFile(
  raw: { url?: string; name?: string; kind?: string; mime?: string },
  fallbackName: string,
): UploadedFile {
  const url = raw.url ?? ''
  if (!url) throw new UploadError('上传响应缺少文件地址', 'BAD_RESPONSE')
  return {
    url,
    name: raw.name || fallbackName,
    kind: normalizeKind(raw.kind),
    mime: raw.mime ?? '',
  }
}

function statusMessage(status: number): string {
  if (status === 413) return '文件超过 50MB，无法上传'
  return `上传失败（HTTP ${status}）`
}

export interface UploadHandle {
  promise: Promise<UploadedFile[]>
  abort: () => void
}

/**
 * 上传一个或多个文件到 /api/ai/upload。
 * - onProgress：进度百分比 0-100（lengthComputable 时回调）。
 * - 返回 handle.promise 与 abort()；取消时 promise 以 UploadAbortError 拒绝（不产生残留结果）。
 */
export function uploadFiles(
  files: File[],
  options?: { onProgress?: (percent: number, loaded: number, total: number) => void },
): UploadHandle {
  const xhr = new XMLHttpRequest()
  const form = new FormData()
  for (const file of files) form.append('files', file)

  const promise = new Promise<UploadedFile[]>((resolve, reject) => {
    xhr.open('POST', UPLOAD_ENDPOINT)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options?.onProgress?.((event.loaded / event.total) * 100, event.loaded, event.total)
      }
    }
    xhr.onerror = () => reject(new UploadError('网络错误，上传失败', 'NETWORK'))
    xhr.ontimeout = () => reject(new UploadError('上传超时，请重试', 'TIMEOUT'))
    xhr.onabort = () => reject(new UploadAbortError())
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = xhr.response as { files?: Array<{ url?: string; name?: string; kind?: string; mime?: string }> }
          resolve((body?.files ?? []).map((raw, i) => normalizeUploadedFile(raw, files[i]?.name ?? '未命名')))
        } catch (err) {
          reject(err instanceof UploadError ? err : new UploadError('上传响应解析失败', 'BAD_RESPONSE', err))
        }
      } else {
        reject(new UploadError(statusMessage(xhr.status), `HTTP_${xhr.status}`))
      }
    }
    xhr.send(form)
  })

  return { promise, abort: () => xhr.abort() }
}
