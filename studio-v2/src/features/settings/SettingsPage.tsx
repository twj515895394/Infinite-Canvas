/**
 * 设置页（切片 11 F10）。
 * 四段：Provider / 存储目录 / 外观 / 旧版回退。RunningHub/Midjourney 专项配置不出现。
 */
import { ExternalLink } from 'lucide-react'
import { ProviderSection } from '@/features/settings/ProviderSection'
import { StorageSection } from '@/features/settings/StorageSection'
import { AppearanceSection } from '@/features/settings/AppearanceSection'

const LEGACY_URL = 'http://127.0.0.1:3888/'

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-8">
      <header>
        <h1 className="text-lg font-semibold text-text">设置</h1>
        <p className="text-sm text-text-muted">Provider 配置、存储目录、外观与旧版回退。</p>
      </header>

      <ProviderSection />
      <StorageSection />
      <AppearanceSection />

      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-text">旧版回退</h2>
        <p className="text-xs text-text-muted">
          新 UI 未覆盖的功能（RunningHub/Midjourney 专项、提示词库等）可回到旧版前端继续使用。
        </p>
        <a
          href={LEGACY_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-accent hover:underline"
        >
          打开旧版前端
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </section>
    </div>
  )
}
