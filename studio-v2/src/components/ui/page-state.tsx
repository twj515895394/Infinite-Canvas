/**
 * 页面级加载 / 错误态（F16）。
 * 与 EmptyState 配套：Loading 居中 spinner；Error 带重试 CTA。
 * 语义色只用 token；动效仅 spinner rotate（reduced-motion 下仍保留状态文字）。
 */
import type { ReactNode } from 'react'
import { AlertCircle, Loader2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/core/utils/cn'

export function LoadingState({
  label = '加载中…',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-1 items-center justify-center gap-2 text-sm text-text-muted',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 size={15} className="animate-spin text-text-faint" aria-hidden />
      {label}
    </div>
  )
}

export function ErrorState({
  title = '加载失败',
  hint = '请确认后端服务可用后重试。',
  onRetry,
  retryLabel = '重试',
  icon = AlertCircle,
  className,
  action,
}: {
  title?: string
  hint?: string
  onRetry?: () => void
  retryLabel?: string
  icon?: LucideIcon
  className?: string
  action?: ReactNode
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      hint={hint}
      className={cn('border-danger/25', className)}
      action={
        action ??
        (onRetry ? (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : undefined)
      }
    />
  )
}
