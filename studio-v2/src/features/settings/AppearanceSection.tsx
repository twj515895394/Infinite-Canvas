/**
 * 外观设置段（F10）：主题（系统/浅色/深色）+ 动效（完整/减少）。
 * 修改即通过 applyAppearance 应用到 document（CSS token 消费）。
 */
import { useAppearance, applyAppearance, type MotionPreference, type ThemePreference } from '@/features/settings/appearance'

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

const MOTION_OPTIONS: Array<{ value: MotionPreference; label: string }> = [
  { value: 'full', label: '完整动效' },
  { value: 'reduced', label: '减少动效' },
]

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-md border border-border bg-surface p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={
            'rounded px-2.5 py-1 text-xs transition-colors duration-120 ' +
            (value === opt.value ? 'bg-accent text-white' : 'text-text-muted hover:text-text')
          }
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function AppearanceSection() {
  const theme = useAppearance((s) => s.theme)
  const motion = useAppearance((s) => s.motion)
  const setTheme = useAppearance((s) => s.setTheme)
  const setMotion = useAppearance((s) => s.setMotion)

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-text">外观</h2>
        <p className="text-xs text-text-muted">主题与动效偏好保存在本机，立即生效。</p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-muted">主题</span>
        <Segmented
          options={THEME_OPTIONS}
          value={theme}
          onChange={(v) => {
            setTheme(v)
            applyAppearance(v, motion)
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-muted">动效</span>
        <Segmented
          options={MOTION_OPTIONS}
          value={motion}
          onChange={(v) => {
            setMotion(v)
            applyAppearance(theme, v)
          }}
        />
      </div>
    </section>
  )
}
