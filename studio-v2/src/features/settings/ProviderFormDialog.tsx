/**
 * Provider 编辑/新增表单（F10）。
 * 通用字段编辑；专项字段（runninghub/midjourney）不出现在设置页（MVP §6.7）。
 * api_key 留空 = 保持原 Key（placeholder 显示 has_key 状态）；clear 由表单勾选触发。
 */
import { useEffect, useState } from 'react'
import { Loader2, PlugZap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/core/utils/cn'
import {
  IMAGE_REQUEST_MODES,
  PROVIDER_PROTOCOLS,
  newProviderId,
  testProviderConnection,
  type Provider,
  type TestResult,
} from '@/features/settings/api'

export interface ProviderDraft {
  id?: string
  name: string
  base_url: string
  protocol: string
  image_request_mode: string
  api_key: string
  clear_key: boolean
  enabled: boolean
  primary: boolean
}

export interface ProviderFormDialogProps {
  open: boolean
  onClose: () => void
  /** null = 新增；Provider = 编辑（以脱敏记录为基座）。 */
  editing: Provider | null
  onSubmit: (draft: ProviderDraft) => void
}

const inputClass =
  'h-8 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-text placeholder:text-text-faint ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      {children}
    </label>
  )
}

export function ProviderFormDialog({ open, onClose, editing, onSubmit }: ProviderFormDialogProps) {
  const [draft, setDraft] = useState<ProviderDraft>({
    name: '',
    base_url: '',
    protocol: 'openai',
    image_request_mode: 'openai',
    api_key: '',
    clear_key: false,
    enabled: true,
    primary: false,
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // 打开时按编辑目标初始化表单
  useEffect(() => {
    if (!open) return
    setDraft({
      id: editing?.id ?? newProviderId(),
      name: editing?.name ?? '',
      base_url: editing?.base_url ?? '',
      protocol: editing?.protocol ?? 'openai',
      image_request_mode: editing?.image_request_mode ?? 'openai',
      api_key: '',
      clear_key: false,
      enabled: editing?.enabled ?? true,
      primary: editing?.primary ?? false,
    })
    setTestResult(null)
  }, [open, editing])

  const set = <K extends keyof ProviderDraft>(key: K, value: ProviderDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await testProviderConnection({
      base_url: draft.base_url,
      api_key: draft.api_key,
      provider_id: draft.id,
      protocol: draft.protocol,
      image_request_mode: draft.image_request_mode,
    })
    setTestResult(result)
    setTesting(false)
  }

  const canSubmit = draft.name.trim().length > 0 && draft.base_url.trim().length > 0

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `编辑 Provider：${editing.name}` : '新增 Provider'}>
      <div className="flex flex-col gap-3">
        <Field label="名称 *">
          <input className={inputClass} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="例如 OpenAI 兼容" />
        </Field>
        <Field label="API Base URL *">
          <input
            className={inputClass}
            value={draft.base_url}
            onChange={(e) => set('base_url', e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="协议">
            <select className={inputClass} value={draft.protocol} onChange={(e) => set('protocol', e.target.value)}>
              {PROVIDER_PROTOCOLS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="图片请求模式">
            <select className={inputClass} value={draft.image_request_mode} onChange={(e) => set('image_request_mode', e.target.value)}>
              {IMAGE_REQUEST_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={`API Key${editing?.has_key ? `（已保存 ${editing.key_preview ?? ''}，留空保持）` : ''}`}>
          <input
            className={inputClass}
            type="password"
            value={draft.api_key}
            onChange={(e) => set('api_key', e.target.value)}
            placeholder={editing?.has_key ? '保持原 Key' : '输入 API Key'}
            autoComplete="new-password"
          />
        </Field>
        {editing?.has_key && (
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" checked={draft.clear_key} onChange={(e) => set('clear_key', e.target.checked)} />
            清除已保存的 Key
          </label>
        )}
        <div className="flex gap-4 text-xs text-text-muted">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            启用
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.primary} onChange={(e) => set('primary', e.target.checked)} />
            设为主要
          </label>
        </div>

        {testResult && (
          <p className={cn('text-xs', testResult.ok ? 'text-success' : 'text-danger')}>
            {testResult.ok ? '✓ ' : '✗ '}
            {testResult.message}
            {testResult.model_count != null ? `（${testResult.model_count} 个模型）` : ''}
          </p>
        )}

        <div className="mt-1 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={runTest} disabled={testing || !draft.base_url}>
            {testing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <PlugZap className="size-3.5" aria-hidden />}
            测试连接
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" size="sm" disabled={!canSubmit} onClick={() => onSubmit(draft)}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
