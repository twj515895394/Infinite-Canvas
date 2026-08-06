/**
 * 图片生成节点 Inspector（F6）：Prompt / Provider / 模型 / 动态参数 + 运行/重试/取消。
 * - 参数表单由 /api/image-params 驱动（size/n/quality），不把参数写死在前端；
 * - 提交走 /api/v2/generation-tasks，任务登记进 Task Shelf store，轮询由 TaskShelf 驱动；
 * - 多次提交各自独立任务（不串扰）；失败可重试（重试用提交快照，与原始请求一致）。
 */
import { useState } from 'react'
import { Loader2, Play, RotateCcw, XCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { cn } from '@/core/utils/cn'
import { useEditorStore } from '@/features/canvas/store'
import {
  buildSubmitPayload,
  cancelImageTask,
  fetchImageParams,
  isTaskActive,
  normalizeFieldOptions,
  submitImageTask,
  TASK_STATUS_LABELS,
  useCodexStatus,
  type ImageParamsField,
  type ImageSubmitPayload,
} from '@/features/generation/api'
import { useGenerationStore } from '@/features/generation/store'
import { useProviders } from '@/features/settings/api'

interface ImageGenInspectorProps {
  nodeId: string
  config: Record<string, unknown>
  updateConfig: (id: string, patch: Record<string, unknown>) => void
}

/** 芯片选择组：options 由字段定义给出，选中值存 config[key]。 */
function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'h-6 rounded-md border px-2 text-[11px] transition-[background-color,border-color,color] duration-[120ms]',
            value === opt.value
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border bg-surface-raised text-text-muted hover:border-border-strong hover:text-text',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** 渲染 /api/image-params 的动态字段（size/n/quality）；refs/notice 等 MVP 不渲染。 */
function ParamFields({
  fields,
  config,
  onPatch,
}: {
  fields: ImageParamsField[]
  config: Record<string, unknown>
  onPatch: (key: string, value: unknown) => void
}) {
  return (
    <>
      {fields.map((field) => {
        if (field.type === 'refs' || field.type === 'notice') return null
        if (field.type === 'size') {
          const size = (config.size ?? {}) as { ratio?: string; resolution?: string }
          const ratio = size.ratio ?? (field.default as { ratio?: string } | undefined)?.ratio ?? '1:1'
          const resolution = size.resolution ?? (field.default as { resolution?: string } | undefined)?.resolution ?? '1k'
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-[11px] text-text-muted">{field.label}</span>
              <div className="flex flex-col gap-1.5">
                <ChipGroup
                  options={field.ratios ?? []}
                  value={ratio}
                  onChange={(v) => onPatch('size', { ratio: v, resolution })}
                />
                <ChipGroup
                  options={field.resolutions ?? []}
                  value={resolution}
                  onChange={(v) => onPatch('size', { ratio, resolution: v })}
                />
              </div>
            </label>
          )
        }
        if (field.type === 'int' && field.control === 'chips') {
          const options = normalizeFieldOptions(field.options)
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-[11px] text-text-muted">{field.label}</span>
              <ChipGroup
                options={options}
                value={String(config.n ?? field.default ?? 1)}
                onChange={(v) => onPatch('n', Number(v))}
              />
            </label>
          )
        }
        if (field.type === 'select') {
          const options = normalizeFieldOptions(field.options)
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-[11px] text-text-muted">{field.label}</span>
              <ChipGroup
                options={options}
                value={String(config.quality ?? field.default ?? 'auto')}
                onChange={(v) => onPatch('quality', v)}
              />
            </label>
          )
        }
        return null
      })}
    </>
  )
}

export function ImageGenInspector({ nodeId, config, updateConfig }: ImageGenInspectorProps) {
  const tasks = useGenerationStore((s) => s.tasks)
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const providers = useProviders()
  const providerList = (providers.data?.providers ?? []).filter(
    (p) => p.enabled && (p.image_models?.length ?? 0) > 0,
  )

  // Codex / GPT Image 2 Skill 探测（F7）：可用性提示 + 不可用原因（未安装/未登录）
  const codexStatus = useCodexStatus()

  const providerId = String(config.provider ?? '')
  const model = String(config.model ?? '')
  const paramsQuery = useQuery({
    queryKey: ['image-params', providerId, model],
    queryFn: () => fetchImageParams(providerId, model),
  })
  const selectedProvider = providerList.find((p) => p.id === providerId)

  const prompt = String(config.prompt ?? '').trim()
  const currentTask = tasks.find((t) => t.nodeId === nodeId && isTaskActive(t.status))
  const lastFailed = [...tasks]
    .filter((t) => t.nodeId === nodeId && t.status === 'failed')
    .sort((a, b) => b.createdAt - a.createdAt)[0]
  const running = submitting || Boolean(currentTask)

  const registerAndTrack = async (payload: ImageSubmitPayload) => {
    const { task } = await submitImageTask(payload)
    useGenerationStore.getState().upsert({
      taskId: task.id,
      nodeId,
      label: '图片生成',
      status: task.status,
      providerId: payload.provider_id || undefined,
      model: payload.model || undefined,
      payload,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    })
    useEditorStore.getState().setRuntime(nodeId, task.status)
  }

  const run = async (payloadOverride?: ImageSubmitPayload) => {
    setActionError(null)
    setSubmitting(true)
    try {
      const payload = payloadOverride ?? buildSubmitPayload(config)
      if (!payload.prompt) {
        setActionError('请先输入提示词')
        return
      }
      await registerAndTrack(payload)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const cancel = async () => {
    if (!currentTask) return
    setActionError(null)
    try {
      const { task } = await cancelImageTask(currentTask.taskId)
      useGenerationStore.getState().patch(currentTask.taskId, {
        status: task.status,
        error: task.error || undefined,
        updatedAt: task.updated_at,
      })
      useEditorStore.getState().setRuntime(nodeId, task.status)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '取消失败')
    }
  }

  const modelOptions = selectedProvider?.image_models ?? []

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Prompt</span>
        <textarea
          value={String(config.prompt ?? '')}
          placeholder="描述你想生成的图片…"
          onChange={(e) => updateConfig(nodeId, { prompt: e.target.value })}
          rows={3}
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Provider</span>
        <select
          value={providerId}
          onChange={(e) => updateConfig(nodeId, { provider: e.target.value, model: '' })}
          className="h-8 rounded-md border border-border bg-bg px-2 text-xs text-text outline-none focus:border-accent"
        >
          <option value="">默认</option>
          {providerList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.id}）
            </option>
          ))}
        </select>
      </label>

      {/* Codex / GPT Image 2 Skill 探测（F7）：选中 codex 时展示可用性，不可用明确提示原因 */}
      {providerId === 'codex' && codexStatus.data && (
        <div
          className={cn(
            'rounded-md border px-2.5 py-2 text-[11px] leading-relaxed',
            !codexStatus.data.installed && 'border-danger/40 bg-danger/10 text-danger',
            codexStatus.data.installed && !codexStatus.data.image2_helper_installed &&
              'border-warning/40 bg-warning/10 text-warning',
            codexStatus.data.installed && codexStatus.data.image2_helper_installed &&
              'border-success/40 bg-success/10 text-success',
          )}
        >
          {!codexStatus.data.installed
            ? codexStatus.data.message || '未找到 OpenAI Codex CLI，请先安装并登录'
            : codexStatus.data.image2_helper_installed
              ? 'Codex CLI 可用：GPT Image 2 helper 已安装，可执行生图'
              : 'Codex CLI 已安装，但缺少 GPT Image 2 helper，OpenAI CLI 生图不可用'}
        </div>
      )}

      {modelOptions.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">模型</span>
          <select
            value={model}
            onChange={(e) => updateConfig(nodeId, { model: e.target.value })}
            className="h-8 rounded-md border border-border bg-bg px-2 text-xs text-text outline-none focus:border-accent"
          >
            <option value="">默认</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      {paramsQuery.data && (
        <ParamFields
          fields={paramsQuery.data.fields}
          config={config}
          onPatch={(key, value) => updateConfig(nodeId, { [key]: value })}
        />
      )}

      {/* 运行控制 */}
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" disabled={!prompt || running} onClick={() => run()}>
          {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />}
          {currentTask ? TASK_STATUS_LABELS[currentTask.status] : '生成'}
        </Button>
        {currentTask && (
          <Button variant="default" size="sm" onClick={cancel}>
            <XCircle size={13} aria-hidden />
            取消
          </Button>
        )}
        {!currentTask && lastFailed && (
          <Button variant="default" size="sm" onClick={() => run(lastFailed.payload as ImageSubmitPayload | undefined)}>
            <RotateCcw size={13} aria-hidden />
            重试
          </Button>
        )}
      </div>

      {actionError && <p className="text-[11px] text-danger">{actionError}</p>}
      {lastFailed && !currentTask && (
        <p className="text-[11px] text-danger">{lastFailed.error || '生成失败，可重试'}</p>
      )}
    </div>
  )
}
