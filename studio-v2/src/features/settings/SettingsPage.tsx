/**
 * 设置页（切片 11 F10 + 24 F16）。
 * 五段：Provider / 存储目录 / 数据备份提示 / 外观 / 旧版回退。
 * RunningHub/Midjourney 专项配置不出现。
 */
import { DatabaseBackup, ExternalLink, BookOpen } from 'lucide-react'
import { ProviderSection } from '@/features/settings/ProviderSection'
import { StorageSection } from '@/features/settings/StorageSection'
import { AppearanceSection } from '@/features/settings/AppearanceSection'

/** 开发态 Vite 独立端口 → 旧 UI 在后端 3888；同域生产（含 :3888）回站点根路径。 */
const LEGACY_URL = (() => {
  if (typeof window === 'undefined') return '/'
  const port = window.location.port
  // 空端口=80/443；3888=后端同域托管。其余独立端口视为 dev 前端。
  if (port && port !== '3888') return 'http://127.0.0.1:3888/'
  return '/'
})()

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-8">
      <header>
        <h1 className="text-lg font-semibold text-text">设置</h1>
        <p className="text-sm text-text-muted">Provider、存储目录、数据备份、外观与旧版回退。</p>
      </header>

      <ProviderSection />
      <StorageSection />

      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <DatabaseBackup size={15} className="text-warning" aria-hidden />
          <h2 className="text-sm font-medium text-text">数据目录备份</h2>
        </div>
        <p className="text-xs leading-relaxed text-text-muted">
          个人版数据都在本机。重大升级、清理磁盘或迁移电脑前，请先关闭后端服务，再备份以下路径：
        </p>
        <ul className="list-inside list-disc space-y-1 text-xs text-text-muted">
          <li>
            <code className="rounded bg-surface-raised px-1 py-0.5 text-[11px] text-text">data/</code>
            — 项目列表、Provider 配置、Studio V2 SQLite（含画布/资产/Agent/Task）
          </li>
          <li>
            <code className="rounded bg-surface-raised px-1 py-0.5 text-[11px] text-text">assets/</code>
            — 上传与生成素材文件
          </li>
          <li>
            <code className="rounded bg-surface-raised px-1 py-0.5 text-[11px] text-text">output/</code>
            — 生成输出目录（若自定义了存储路径，以「存储目录」设置为准）
          </li>
          <li>
            <code className="rounded bg-surface-raised px-1 py-0.5 text-[11px] text-text">API/.env</code>
            — 本地密钥与环境变量（勿提交到 Git）
          </li>
        </ul>
        <p className="text-[11px] leading-relaxed text-text-faint">
          建议整目录复制到外部盘；恢复时覆盖同名路径后重新启动后端。详细说明见
          <code className="mx-1 rounded bg-surface-raised px-1 py-0.5">docs/studio-v2-first-release-guide.md</code>。
        </p>
      </section>

      <AppearanceSection />

      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-text">旧版回退</h2>
        <p className="text-xs text-text-muted">
          新 UI 未覆盖的功能（RunningHub/Midjourney 专项、提示词库、独立对话等）可回到旧版前端继续使用。新旧共享后端与部分数据目录。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={LEGACY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-accent hover:underline"
          >
            打开旧版前端
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <a
            href="https://github.com/twj515895394/Infinite-Canvas/blob/main/docs/studio-v2-first-release-guide.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1.5 text-xs text-text-muted hover:text-text hover:underline"
          >
            <BookOpen className="size-3.5" aria-hidden />
            第一版使用文档
          </a>
        </div>
      </section>
    </div>
  )
}
