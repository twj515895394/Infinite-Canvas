/**
 * 全局 Toast 反馈（F16）。
 * 契约：docs/studio-v2-ui-interaction-and-motion-design-system.md §8.8 / §13.4
 * - 仅异步结果与非阻断摘要；表单错误走 Inline
 * - 相同 fingerprint 合并，避免连续堆叠
 * - Hover 暂停自动关闭；手动 dismiss
 */
import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  tone: ToastTone
  title: string
  description?: string
  /** 自动关闭毫秒；0 = 不自动关 */
  durationMs: number
  /** 合并键：相同 key 刷新既有 toast 而非新增 */
  fingerprint?: string
  action?: ToastAction
  createdAt: number
}

export interface ToastInput {
  tone?: ToastTone
  title: string
  description?: string
  durationMs?: number
  fingerprint?: string
  action?: ToastAction
}

const MAX_VISIBLE = 4
const DEFAULT_DURATION: Record<ToastTone, number> = {
  info: 4200,
  success: 3200,
  warning: 5200,
  danger: 6800,
}

let seq = 0
function nextId(): string {
  seq += 1
  return `toast_${Date.now().toString(36)}_${seq}`
}

interface ToastState {
  items: ToastItem[]
  push: (input: ToastInput) => string
  dismiss: (id: string) => void
  clear: () => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (input) => {
    const tone = input.tone ?? 'info'
    const durationMs = input.durationMs ?? DEFAULT_DURATION[tone]
    const fingerprint = input.fingerprint
    const now = Date.now()

    if (fingerprint) {
      const existing = get().items.find((t) => t.fingerprint === fingerprint)
      if (existing) {
        const refreshed: ToastItem = {
          ...existing,
          tone,
          title: input.title,
          description: input.description,
          durationMs,
          action: input.action,
          createdAt: now,
        }
        set((s) => ({
          items: s.items.map((t) => (t.id === existing.id ? refreshed : t)),
        }))
        return existing.id
      }
    }

    const id = nextId()
    const item: ToastItem = {
      id,
      tone,
      title: input.title,
      description: input.description,
      durationMs,
      fingerprint,
      action: input.action,
      createdAt: now,
    }
    set((s) => ({
      items: [...s.items, item].slice(-MAX_VISIBLE),
    }))
    return id
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
  clear: () => set({ items: [] }),
}))

/** 命令式 API（mutation onError / 非组件代码）。 */
export const toast = {
  show: (input: ToastInput) => useToastStore.getState().push(input),
  info: (title: string, description?: string, extra?: Omit<ToastInput, 'title' | 'description' | 'tone'>) =>
    useToastStore.getState().push({ ...extra, tone: 'info', title, description }),
  success: (title: string, description?: string, extra?: Omit<ToastInput, 'title' | 'description' | 'tone'>) =>
    useToastStore.getState().push({ ...extra, tone: 'success', title, description }),
  warning: (title: string, description?: string, extra?: Omit<ToastInput, 'title' | 'description' | 'tone'>) =>
    useToastStore.getState().push({ ...extra, tone: 'warning', title, description }),
  danger: (title: string, description?: string, extra?: Omit<ToastInput, 'title' | 'description' | 'tone'>) =>
    useToastStore.getState().push({ ...extra, tone: 'danger', title, description }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
}
