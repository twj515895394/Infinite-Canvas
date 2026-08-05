/**
 * 外观偏好（F10）：主题 + 动效，localStorage 持久化。
 * 应用方式：写 document.documentElement.dataset.theme / dataset.motion，
 * 由 index.css 的 [data-theme='light'] 与 html[data-motion='reduced'] 消费。
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'system' | 'light' | 'dark'
export type MotionPreference = 'full' | 'reduced'

interface AppearanceState {
  theme: ThemePreference
  motion: MotionPreference
  setTheme: (theme: ThemePreference) => void
  setMotion: (motion: MotionPreference) => void
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: 'system',
      motion: 'full',
      setTheme: (theme) => set({ theme }),
      setMotion: (motion) => set({ motion }),
    }),
    { name: 'studio-v2.appearance' },
  ),
)

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** 把偏好应用到 document（theme=system 时按系统解析）。 */
export function applyAppearance(theme: ThemePreference, motion: MotionPreference): void {
  const root = document.documentElement
  root.dataset.theme = theme === 'system' ? systemTheme() : theme
  root.dataset.motion = motion
}
