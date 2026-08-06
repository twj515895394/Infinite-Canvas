/**
 * API / 未知错误 → 可读文案（F16 全局反馈共用）。
 * 表单字段错误仍走 Inline Validation，不经此函数。
 */
import { ApiError } from '@/core/api/client'

export function errorMessage(err: unknown, fallback = '操作失败'): string {
  if (err instanceof ApiError) return err.problem.detail || err.problem.title || fallback
  if (err instanceof Error && err.message) return err.message
  return fallback
}

/** 是否建议用户重试（网络中断 / 服务端标记 retryable / 5xx）。 */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return err instanceof TypeError
  if (err.problem.retryable === true) return true
  if (err.problem.retryable === false) return false
  return err.status >= 500 || err.status === 0
}
