/**
 * 共享空状态（F7/F11 UI 统一基线）。
 * 模式：虚线框 + 弱化图标 + 标题 + 引导文案 + 可选操作链接（WorkflowInspector 空状态范本提升）。
 */
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/core/utils/cn'

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-bg px-4 py-6 text-center',
        className,
      )}
    >
      <Icon size={16} className="text-text-faint" aria-hidden />
      <p className="text-xs font-medium text-text">{title}</p>
      {hint && <p className="max-w-xs text-[11px] leading-relaxed text-text-faint">{hint}</p>}
      {action}
    </div>
  )
}
