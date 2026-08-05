/**
 * Provider 设置段（F10）：列表 + 启停 + 新增/编辑/删除 + 连接测试。
 * 保存策略：以已存在记录为基座合并编辑字段后整体 PUT（后端全量替换语义）；
 * 新建时生成合法 id；RunningHub/Midjourney 专项配置不出现（MVP §6.7）。
 */
import { useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/core/utils/cn'
import { useProviders, useSaveProviders, type Provider } from '@/features/settings/api'
import { ProviderFormDialog, type ProviderDraft } from '@/features/settings/ProviderFormDialog'

const protocolBadge: Record<string, string> = {
  openai: 'OpenAI 兼容',
  apimart: 'APIMart',
  gemini: 'Gemini',
  'gemini-cli': 'Gemini CLI',
  volcengine: '方舟',
  runninghub: 'RunningHub',
  jimeng: '即梦',
  codex: 'Codex',
}

export function ProviderSection() {
  const { data, isLoading } = useProviders()
  const saveProviders = useSaveProviders()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const providers = data?.providers ?? []

  const persist = async (next: Provider[]) => {
    setActionError(null)
    try {
      await saveProviders.mutateAsync(next)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '保存失败')
    }
  }

  const toggleEnabled = (provider: Provider) =>
    persist(providers.map((p) => (p.id === provider.id ? { ...p, enabled: !p.enabled } : p)))

  const removeProvider = (provider: Provider) => {
    const next = providers.filter((p) => p.id !== provider.id)
    if (next.length === 0) {
      setActionError('至少保留一个 API 平台')
      return
    }
    void persist(next)
  }

  const submitDraft = (draft: ProviderDraft) => {
    const existing = providers.find((p) => p.id === draft.id)
    const merged: Provider = {
      ...(existing ?? { id: draft.id!, has_key: false, key_preview: null }),
      name: draft.name.trim(),
      base_url: draft.base_url.trim(),
      protocol: draft.protocol,
      image_request_mode: draft.image_request_mode,
      enabled: draft.enabled,
      primary: draft.primary,
      api_key: draft.api_key || undefined,
      clear_key: draft.clear_key,
    }
    const next = existing ? providers.map((p) => (p.id === existing.id ? merged : p)) : [...providers, merged]
    void persist(next).then(() => setDialogOpen(false))
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-text">API Provider</h2>
          <p className="text-xs text-text-muted">新增、修改、启停与测试；RunningHub/Midjourney 专项配置后续版本提供。</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
          <Plus className="size-3.5" aria-hidden />
          新增
        </Button>
      </div>

      {actionError && <p className="text-xs text-danger">{actionError}</p>}

      {isLoading ? (
        <div className="flex h-16 items-center justify-center text-text-faint">
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </div>
      ) : providers.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-text-faint">
          暂无 Provider，点击「新增」添加第一个。
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {providers.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-text">{p.name}</span>
                  {p.primary && (
                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">主要</span>
                  )}
                  {!p.enabled && <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] text-text-faint">已停用</span>}
                </div>
                <p className="truncate text-xs text-text-faint">
                  {protocolBadge[p.protocol] ?? p.protocol} · {p.base_url}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={p.enabled}
                aria-label={`${p.enabled ? '停用' : '启用'} ${p.name}`}
                className={cn(
                  'relative h-4.5 w-8 rounded-full transition-colors duration-150',
                  p.enabled ? 'bg-accent' : 'bg-border-strong',
                )}
                onClick={() => toggleEnabled(p)}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-3.5 rounded-full bg-white transition-transform duration-150',
                    p.enabled ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </button>
              <Button variant="ghost" size="sm" aria-label={`编辑 ${p.name}`} onClick={() => { setEditing(p); setDialogOpen(true) }}>
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="sm" aria-label={`删除 ${p.name}`} onClick={() => removeProvider(p)}>
                <Trash2 className="size-3.5 text-danger" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ProviderFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} onSubmit={submitDraft} />
    </section>
  )
}
