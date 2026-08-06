/**
 * Toast 宿主（F16）。
 * - 右下角固定边缘进出（路径一致）
 * - 仅 transform/opacity；≤180ms；spring bounce:0
 * - Hover 暂停自动关闭；指针按下即时反馈
 * - reduced-motion → 短 crossfade
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/core/utils/cn'
import { IconButton } from '@/components/ui/button'
import {
  useToastStore,
  type ToastItem,
  type ToastTone,
} from '@/core/feedback/toastStore'

const TONE_ICON: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
}

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'border-border text-text',
  success: 'border-success/35 text-text',
  warning: 'border-warning/40 text-text',
  danger: 'border-danger/40 text-text',
}

const ICON_CLASS: Record<ToastTone, string> = {
  info: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const remainingRef = useRef(item.durationMs)
  const startedAtRef = useRef<number | null>(null)

  // fingerprint 刷新会重置 createdAt/duration；用 key 驱动 effect 重启计时
  useEffect(() => {
    remainingRef.current = item.durationMs
    startedAtRef.current = null
    if (item.durationMs <= 0) return

    let timer: ReturnType<typeof setTimeout> | undefined

    const arm = () => {
      if (paused || remainingRef.current <= 0) return
      startedAtRef.current = Date.now()
      timer = setTimeout(() => dismiss(item.id), remainingRef.current)
    }

    arm()
    return () => {
      clearTimeout(timer)
      if (startedAtRef.current != null) {
        const elapsed = Date.now() - startedAtRef.current
        remainingRef.current = Math.max(0, remainingRef.current - elapsed)
        startedAtRef.current = null
      }
    }
  }, [item.id, item.createdAt, item.durationMs, paused, dismiss])

  const Icon = TONE_ICON[item.tone]

  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      transition={{ type: 'spring', bounce: 0, duration: reduced ? 0.12 : 0.18 }}
      role="status"
      aria-live={item.tone === 'danger' ? 'assertive' : 'polite'}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex w-[min(100vw-2rem,22rem)] items-start gap-2.5 rounded-lg border bg-surface-raised/95 px-3 py-2.5 shadow-lg backdrop-blur-md',
        TONE_CLASS[item.tone],
      )}
    >
      <Icon size={16} className={cn('mt-0.5 shrink-0', ICON_CLASS[item.tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-text">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{item.description}</p>
        )}
        {item.action && (
          <button
            type="button"
            className="mt-1.5 text-xs font-medium text-accent hover:underline"
            onClick={() => {
              item.action?.onClick()
              dismiss(item.id)
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <IconButton
        label="关闭通知"
        size="sm"
        className="size-6 shrink-0 text-text-faint"
        onClick={() => dismiss(item.id)}
      >
        <X size={14} aria-hidden />
      </IconButton>
    </motion.div>
  )
}

export function ToastHost() {
  const items = useToastStore((s) => s.items)
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[80] flex flex-col-reverse items-end gap-2"
      aria-label="通知"
    >
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  )
}
