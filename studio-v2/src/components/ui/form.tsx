/**
 * 共享表单控件（F7/F11 UI 统一基线，apple-design 落地）。
 * 契约（与 index.css @theme 对齐）：
 * - 语义色只用 @theme token（bg/surface/border/text/accent…），禁自定义色值；
 * - 高频动效 ≤180ms 仅 transform/opacity；交互反馈在按下瞬间（button:active 全局已有）；
 * - label 一律 text-[11px] text-text-muted；输入一律 rounded-md border-border bg-bg focus:border-accent。
 * 既有 F6/F8 Inspector 的内联同模式类名逐步收敛到本组件。
 */
import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/core/utils/cn'

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-text-muted">{children}</span>
}

const fieldCls =
  'rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-accent'

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldCls, 'h-8', className)} {...props} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldCls, 'resize-y', className)} {...props} />
}

export function SelectField({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldCls, 'h-8', className)} {...props} />
}

/** 芯片选择组：选中值存表单状态；高频点击动效仅颜色过渡（≤120ms）。 */
export function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'h-6 rounded-md border px-2 text-[11px] transition-[background-color,border-color,color] duration-[120ms]',
            value === opt.value
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border bg-surface-raised text-text-muted hover:border-border-strong hover:text-text',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
