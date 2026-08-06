/**
 * Runtimes Tab（F13）：列表 / 新建编辑 / Probe / 启停 / 最近错误。
 * UI 基线：form.tsx + empty-state + StatusChip；语义色只用 token。
 */
import { useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, PlugZap, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel, SelectField, TextInput } from '@/components/ui/form'
import { cn } from '@/core/utils/cn'
import {
  ADAPTER_TYPES,
  errorMessage,
  formatDate,
  useCreateRuntime,
  useDeleteRuntime,
  useProbeRuntime,
  useRuntimes,
  useUpdateRuntime,
  type RuntimeProfile,
} from '@/features/agents/api'
import { ADAPTER_LABELS, RUNTIME_STATUS_LABELS, runtimeTone } from '@/features/agents/status'
import { StatusChip } from '@/features/agents/components/StatusChip'
interface RuntimeDraft {
  name: string
  adapter_type: string
  executable_path: string
  endpoint_url: string
  default_model: string
  enabled: boolean
}

const EMPTY_DRAFT: RuntimeDraft = {
  name: '',
  adapter_type: 'cli-stdio',
  executable_path: '',
  endpoint_url: '',
  default_model: '',
  enabled: true,
}

function RuntimeFormDialog({
  open,
  onClose,
  editing,
  onSubmit,
  submitting,
}: {
  open: boolean
  onClose: () => void
  editing: RuntimeProfile | null
  onSubmit: (draft: RuntimeDraft) => void
  submitting: boolean
}) {
  const [draft, setDraft] = useState<RuntimeDraft>(EMPTY_DRAFT)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setDraft({
        name: editing.name,
        adapter_type: editing.adapter_type,
        executable_path: editing.executable_path ?? '',
        endpoint_url: editing.endpoint_url ?? '',
        default_model: editing.default_model ?? '',
        enabled: editing.enabled,
      })
    } else {
      setDraft(EMPTY_DRAFT)
    }
  }, [open, editing])

  const set = <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const isHttp = draft.adapter_type === 'http'
  const canSubmit = draft.name.trim().length > 0

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `编辑 Runtime：${editing.name}` : '新建 Runtime'}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <FieldLabel>名称 *</FieldLabel>
          <TextInput value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="例如 Codex CLI" />
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>Adapter 类型</FieldLabel>
          <SelectField
            value={draft.adapter_type}
            onChange={(e) => set('adapter_type', e.target.value)}
            disabled={Boolean(editing)}
          >
            {ADAPTER_TYPES.map((t) => (
              <option key={t} value={t}>
                {ADAPTER_LABELS[t] ?? t}
              </option>
            ))}
          </SelectField>
        </label>
        {isHttp ? (
          <label className="flex flex-col gap-1">
            <FieldLabel>Endpoint URL{editing ? '（创建后不可改）' : ''}</FieldLabel>
            <TextInput
              value={draft.endpoint_url}
              onChange={(e) => set('endpoint_url', e.target.value)}
              placeholder="https://runtime.example.com"
              disabled={Boolean(editing)}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <FieldLabel>可执行文件路径{editing ? '（创建后不可改）' : ''}</FieldLabel>
            <TextInput
              value={draft.executable_path}
              onChange={(e) => set('executable_path', e.target.value)}
              placeholder="留空则按 PATH 解析（codex）"
              disabled={Boolean(editing)}
            />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <FieldLabel>默认模型</FieldLabel>
          <TextInput
            value={draft.default_model}
            onChange={(e) => set('default_model', e.target.value)}
            placeholder="可选"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          启用
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" disabled={!canSubmit || submitting} onClick={() => onSubmit(draft)}>
            {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            保存
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export function RuntimesTab() {
  const { data: runtimes = [], isLoading, error } = useRuntimes()
  const createRuntime = useCreateRuntime()
  const updateRuntime = useUpdateRuntime()
  const deleteRuntime = useDeleteRuntime()
  const probeRuntime = useProbeRuntime()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RuntimeProfile | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [probingId, setProbingId] = useState<string | null>(null)

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (runtime: RuntimeProfile) => {
    setEditing(runtime)
    setDialogOpen(true)
  }

  const submitDraft = async (draft: RuntimeDraft) => {
    setActionError(null)
    try {
      if (editing) {
        // PATCH 仅支持 name/default_model/enabled/config 等；path/endpoint 创建后不可改
        await updateRuntime.mutateAsync({
          id: editing.id,
          payload: {
            base_revision: editing.revision,
            name: draft.name.trim(),
            default_model: draft.default_model.trim() || null,
            enabled: draft.enabled,
          },
        })
      } else {
        await createRuntime.mutateAsync({
          name: draft.name.trim(),
          adapter_type: draft.adapter_type,
          executable_path: draft.executable_path.trim() || null,
          endpoint_url: draft.endpoint_url.trim() || null,
          default_model: draft.default_model.trim() || null,
          enabled: draft.enabled,
        })
      }
      setDialogOpen(false)
    } catch (err) {
      setActionError(errorMessage(err, '保存 Runtime 失败'))
    }
  }

  const toggleEnabled = async (runtime: RuntimeProfile) => {
    setActionError(null)
    try {
      await updateRuntime.mutateAsync({
        id: runtime.id,
        payload: { base_revision: runtime.revision, enabled: !runtime.enabled },
      })
    } catch (err) {
      setActionError(errorMessage(err, '切换启停失败'))
    }
  }

  const remove = async (runtime: RuntimeProfile) => {
    if (!window.confirm(`删除 Runtime「${runtime.name}」？绑定 Agent 时将拒绝删除。`)) return
    setActionError(null)
    try {
      await deleteRuntime.mutateAsync(runtime.id)
    } catch (err) {
      setActionError(errorMessage(err, '删除失败'))
    }
  }

  const probe = async (runtime: RuntimeProfile) => {
    setActionError(null)
    setProbingId(runtime.id)
    try {
      await probeRuntime.mutateAsync(runtime.id)
    } catch (err) {
      setActionError(errorMessage(err, 'Probe 失败'))
    } finally {
      setProbingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">配置可执行 Runtime、Probe 探测版本与能力，供 Agent 绑定使用。</p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5" aria-hidden />
          新建
        </Button>
      </div>

      {actionError && <p className="text-xs text-danger">{actionError}</p>}
      {error && <p className="text-xs text-danger">{errorMessage(error, '加载 Runtime 失败')}</p>}

      {isLoading ? (
        <div className="flex h-24 items-center justify-center text-text-faint">
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </div>
      ) : runtimes.length === 0 ? (
        <EmptyState
          icon={PlugZap}
          title="暂无 Runtime"
          hint="先创建一个 Codex CLI Runtime，再 Probe 验证可执行文件与登录态。"
          action={
            <Button size="sm" variant="primary" onClick={openCreate}>
              新建 Runtime
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {runtimes.map((rt) => {
            const probeInfo = rt.last_probe
            const errMsg = rt.last_probe_error?.message ?? probeInfo?.error?.message
            return (
              <li
                key={rt.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2.5"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{rt.name}</span>
                      <StatusChip
                        label={RUNTIME_STATUS_LABELS[rt.status] ?? rt.status}
                        tone={runtimeTone(rt.status)}
                      />
                      {!rt.enabled && <StatusChip label="已停用" tone="neutral" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-faint">
                      {ADAPTER_LABELS[rt.adapter_type] ?? rt.adapter_type}
                      {rt.default_model ? ` · ${rt.default_model}` : ''}
                      {rt.executable_path ? ` · ${rt.executable_path}` : ''}
                      {rt.endpoint_url ? ` · ${rt.endpoint_url}` : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-faint">
                      {probeInfo?.version && <span>版本 {probeInfo.version}</span>}
                      {rt.last_probe_at ? <span>最近探测 {formatDate(rt.last_probe_at)}</span> : <span>尚未探测</span>}
                      {probeInfo?.authenticated === true && <span className="text-success">已登录</span>}
                      {probeInfo?.authenticated === false && <span className="text-warning">未登录</span>}
                      {rt.capabilities.length > 0 && <span>能力：{rt.capabilities.join(', ')}</span>}
                    </div>
                    {errMsg && <p className="mt-1 text-[11px] text-danger">{errMsg}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rt.enabled}
                      aria-label={`${rt.enabled ? '停用' : '启用'} ${rt.name}`}
                      className={cn(
                        'relative h-4.5 w-8 rounded-full transition-colors duration-150',
                        rt.enabled ? 'bg-accent' : 'bg-border-strong',
                      )}
                      onClick={() => void toggleEnabled(rt)}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 size-3.5 rounded-full bg-white transition-transform duration-150',
                          rt.enabled ? 'translate-x-4' : 'translate-x-0.5',
                        )}
                      />
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={probingId === rt.id}
                      onClick={() => void probe(rt)}
                      aria-label={`Probe ${rt.name}`}
                    >
                      {probingId === rt.id ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <PlugZap className="size-3.5" aria-hidden />
                      )}
                      Probe
                    </Button>
                    <IconButton label={`编辑 ${rt.name}`} size="sm" onClick={() => openEdit(rt)}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton label={`删除 ${rt.name}`} size="sm" onClick={() => void remove(rt)}>
                      <Trash2 className="size-3.5 text-danger" />
                    </IconButton>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <RuntimeFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
        onSubmit={(d) => void submitDraft(d)}
        submitting={createRuntime.isPending || updateRuntime.isPending}
      />
    </div>
  )
}
