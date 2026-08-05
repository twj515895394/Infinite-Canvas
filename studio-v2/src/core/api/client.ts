/**
 * Feature API 层基础客户端。
 * 契约：所有 /api/v2 错误统一为 application/problem+json（ApiProblem）。
 * 供应商字段不得扩散到通用组件——组件只消费本层返回的稳定 DTO。
 */

export interface ApiProblem {
  type?: string
  title: string
  status: number
  detail?: string
  code: string
  request_id?: string
  retryable?: boolean
  field_errors?: Record<string, unknown>
  context?: Record<string, unknown>
}

export class ApiError extends Error {
  readonly problem: ApiProblem
  readonly status: number

  constructor(problem: ApiProblem, status: number) {
    super(problem.detail || problem.title)
    this.problem = problem
    this.status = status
  }
}

const REQUEST_TIMEOUT_MS = 30_000

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let problem: ApiProblem
    try {
      problem = (await response.json()) as ApiProblem
    } catch {
      problem = {
        title: response.statusText || 'Request failed',
        status: response.status,
        code: 'UNKNOWN',
      }
    }
    throw new ApiError(problem, response.status)
  }

  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers }),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiFetch<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body), headers }),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiFetch<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body), headers }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
