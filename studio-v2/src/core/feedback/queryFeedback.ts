/**
 * TanStack Query 全局/局部失败反馈（F16）。
 * - 列表查询失败：页面内 ErrorState + 可选 Toast 摘要（同 fingerprint 合并）
 * - Mutation 失败：统一 Toast；若可拿到 variables 则附带重试
 * - 表单字段错误不走这里；局部已处理的 mutation 设 meta.silentError
 */
import { errorMessage, isRetryableError } from '@/core/api/errors'
import { toast } from '@/core/feedback/toastStore'

const QUERY_TOAST_FINGERPRINT = 'query-error'

interface QueryLike {
  meta?: unknown
  queryHash: string
  state: { data: unknown }
  fetch: () => unknown
  // TanStack Query 的 options 形状版本间差异大，只读运行时字段
  options?: object & { refetchInterval?: unknown }
}

interface MutationLike {
  meta?: unknown
  mutationId: number
  options: { mutationKey?: unknown }
  state?: { variables?: unknown }
  execute?: (variables: unknown) => unknown
}

/** 静默查询（轮询/后台刷新）不弹全局 Toast，避免刷屏。 */
function isSilentQuery(query: QueryLike): boolean {
  const meta = query.meta as { silentError?: boolean } | undefined
  if (meta?.silentError) return true
  // 短轮询类：refetchInterval 已设的 query 通常已有局部 UI
  if (query.options?.refetchInterval) return true
  return false
}

export function notifyQueryError(error: unknown, query: QueryLike): void {
  if (isSilentQuery(query)) return
  // 仅在「无数据的首次失败」时 Toast；已有缓存的后台刷新失败交给页面局部态
  if (query.state.data !== undefined) return

  const detail = errorMessage(error, '请求失败')
  toast.danger('加载失败', detail, {
    fingerprint: `${QUERY_TOAST_FINGERPRINT}:${String(query.queryHash)}`,
    action: isRetryableError(error)
      ? {
          label: '重试',
          onClick: () => {
            void query.fetch()
          },
        }
      : undefined,
  })
}

export function notifyMutationError(error: unknown, mutation: MutationLike): void {
  const meta = mutation.meta as { silentError?: boolean; errorTitle?: string } | undefined
  if (meta?.silentError) return

  const title = meta?.errorTitle ?? '操作失败'
  const detail = errorMessage(error, title)
  const variables = mutation.state?.variables
  const canRetry = typeof mutation.execute === 'function' && variables !== undefined

  toast.danger(title, detail, {
    fingerprint: `mutation-error:${String(mutation.options.mutationKey ?? mutation.mutationId)}`,
    action: canRetry
      ? {
          label: '重试',
          onClick: () => {
            void mutation.execute?.(variables)
          },
        }
      : undefined,
  })
}

/** 命令式：非 React Query 路径（如直接 apiFetch）快捷调用。 */
export function toastError(err: unknown, title = '操作失败', fingerprint?: string): void {
  toast.danger(title, errorMessage(err, title), fingerprint ? { fingerprint } : undefined)
}

export function toastSuccess(title: string, description?: string): void {
  toast.success(title, description)
}
