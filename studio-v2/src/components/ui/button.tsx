/**
 * 基础 UI 组件：Button / IconButton。
 * 动效契约：反馈在按下瞬间（:active scale 0.97，全局样式）；hover 微光；
 * 高频动效 ≤180ms；仅 transform/opacity。
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { cn } from '@/core/utils/cn'

type Variant = 'default' | 'primary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variantClass: Record<Variant, string> = {
  default: 'bg-surface-raised text-text border border-border hover:border-border-strong hover:bg-surface-raised/80',
  primary: 'bg-accent text-white hover:bg-accent-strong shadow-[0_0_0_1px_rgba(91,140,255,0.4)]',
  ghost: 'bg-transparent text-text-muted hover:text-text hover:bg-surface-raised',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
}

const sizeClass: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium select-none',
        'transition-[transform,background-color,border-color,color,box-shadow] duration-[120ms] ease-ui',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:opacity-50 disabled:pointer-events-none',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  label: string // 无障碍名称（必填）
  children?: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', label, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-md select-none',
        'transition-[transform,background-color,color] duration-[120ms] ease-ui',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:opacity-50 disabled:pointer-events-none',
        sizeClass[size],
        variantClass[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
