/**
 * 状态芯片（F13）：Runtime / Agent / Skill / Task 共用。
 * 语义色只用 @theme token；动效仅颜色过渡 ≤120ms。
 */
import { cn } from '@/core/utils/cn'
import type { StatusTone } from '@/features/agents/status'

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'border-border bg-surface-subtle text-text-faint',
  accent: 'border-accent/30 bg-accent/15 text-accent',
  success: 'border-success/30 bg-success/15 text-success',
  warning: 'border-warning/30 bg-warning/15 text-warning',
  danger: 'border-danger/30 bg-danger/15 text-danger',
}

export function StatusChip({
  label,
  tone = 'neutral',
  className,
}: {
  label: string
  tone?: StatusTone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        'transition-colors duration-[120ms]',
        TONE_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  )
}
