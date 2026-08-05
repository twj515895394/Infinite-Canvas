/**
 * 存储目录设置段（F10）：查看/修改上传、生成、本地素材目录。
 * 修改后上传与生成立即写入新目录（后端 save_storage_settings 即时生效）。
 */
import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STORAGE_DIR_LABELS, useStorageSettings, useUpdateStorageSettings } from '@/features/settings/api'

export function StorageSection() {
  const { data, isLoading } = useStorageSettings()
  const update = useUpdateStorageSettings()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savedKey, setSavedKey] = useState<string | null>(null)

  const dirs = data?.dirs ?? {}
  const defaults = data?.defaults ?? {}

  const saveDir = async (key: string) => {
    const value = drafts[key]
    if (!value || value.trim() === '') return
    await update.mutateAsync({ [key]: value.trim() })
    setDrafts((d) => {
      const next = { ...d }
      delete next[key] // 保存成功后回退到服务端值（不残留空 draft 遮蔽 dirs）
      return next
    })
    setSavedKey(key)
    setTimeout(() => setSavedKey(null), 1600)
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-text">存储目录</h2>
        <p className="text-xs text-text-muted">修改后立即生效：上传与生成结果写入新目录（旧文件保留原位置）。</p>
      </div>
      {isLoading ? (
        <div className="flex h-12 items-center justify-center text-text-faint">
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {Object.keys(STORAGE_DIR_LABELS).map((key) => (
            <li key={key} className="rounded-md border border-border bg-surface px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-text-muted">{STORAGE_DIR_LABELS[key]}</span>
                <input
                  className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-2 text-xs text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  value={drafts[key] ?? dirs[key] ?? ''}                  onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={defaults[key] ?? ''}
                />
                <Button
                  variant="default"
                  size="sm"
                  disabled={!drafts[key]?.trim() || update.isPending}
                  onClick={() => saveDir(key)}
                >
                  {savedKey === key ? <Check className="size-3.5 text-success" aria-hidden /> : '保存'}
                </Button>
              </div>
              <p className="mt-1 pl-[104px] text-[10px] text-text-faint">默认：{defaults[key] ?? ''}</p>
            </li>
          ))}
        </ul>
      )}
      {update.isError && <p className="text-xs text-danger">保存失败：{String(update.error)}</p>}
    </section>
  )
}
