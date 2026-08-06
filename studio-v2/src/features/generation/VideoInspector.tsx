/**
 * 视频生成节点 Inspector（F7）。
 * - Provider / 模型（video_models）/ 时长 / 比例 / 分辨率 + 运行/重试/取消；
 * - 提交走 /api/v2/generation-tasks/video（复用旧 canvas_video 长轮询），任务登记进
 *   Task Shelf store，轮询由 TaskShelf 驱动；失败可重试（重试用提交快照）；
 * - 结果展示：视频 poster 首帧缩略（/api/media-preview），不整段加载；
 * - 共享表单控件（components/ui/form）保证与 F6/F8 Inspector 的视觉/动效一致。
 */
import { useState } from 'react'
import { Loader2, Play, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChipGroup, FieldLabel, SelectField, TextArea } from '@/components/ui/form'
import { useEditorStore } from '@/features/canvas/store'
import {
  buildVideoPayload,
  cancelImageTask,
  isTaskActive,
  submitVideoTask,
  TASK_STATUS_LABELS,
  VIDEO_DURATIONS,
  VIDEO_RATIOS,
  type VideoSubmitPayload,
} from '@/features/generation/api'
import { useGenerationStore } from '@/features/generation/store'
import { useProviders } from '@/features/settings/api'
import { thumbnailUrl } from '@/features/media/api'

interface VideoInspectorProps {
  nodeId: string
  config: Record<string, unknown>
  updateConfig: (id: string, patch: Record<string, unknown>) => void
}

export function VideoInspector({ nodeId, config, updateConfig }: VideoInspectorProps) {
  const tasks = useGenerationStore((s) => s.tasks)
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const providers = useProviders()
  const providerList = (providers.data?.providers ?? []).filter(
    (p) => p.enabled && (p.video_models?.length ?? 0) > 0,
  )

  const providerId = String(config.provider ?? '')
  const model = String(config.model ?? '')
  const selectedProvider = providerList.find((p) => p.id === providerId)
  const modelOptions = selectedProvider?.video_models ?? []

  const prompt = String(config.prompt ?? '').trim()
  const currentTask = tasks.find((t) => t.nodeId === nodeId && isTaskActive(t.status))
  const lastFailed = [...tasks]
    .filter((t) => t.nodeId === nodeId && t.status === 'failed')
    .sort((a, b) => b.createdAt - a.createdAt)[0]
  const running = submitting || Boolean(currentTask)

  // 节点结果（视频 poster 首帧）；来自 config.result（任务成功后由轮询写回稳定引用）
  const rawResult = config.result
  const resultVideos =
    rawResult && typeof rawResult === 'object' && 'videos' in rawResult && Array.isArray(rawResult.videos)
      ? rawResult.videos.filter((v): v is string => typeof v === 'string')
      : []

  const registerAndTrack = async (payload: VideoSubmitPayload) => {
    const { task } = await submitVideoTask(payload)
    useGenerationStore.getState().upsert({
      taskId: task.id,
      kind: 'video',
      nodeId,
      label: '视频生成',
      status: task.status,
      providerId: payload.provider_id || undefined,
      model: payload.model || undefined,
      payload,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    })
    useEditorStore.getState().setRuntime(nodeId, task.status)
    // 新任务运行期间清空旧结果展示区（成功后才由轮询写回新引用，避免误读为上轮输出）
    updateConfig(nodeId, { result: { videos: [], items: [] } })
  }

  const run = async (payloadOverride?: VideoSubmitPayload) => {
    setActionError(null)
    setSubmitting(true)
    try {
      const payload = payloadOverride ?? buildVideoPayload(config)
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
      // 视频任务与图片/工作流共用同一取消端点（/generation-tasks/{id}/cancel）
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

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <FieldLabel>Prompt</FieldLabel>
        <TextArea
          value={String(config.prompt ?? '')}
          placeholder="描述你想生成的视频…"
          onChange={(e) => updateConfig(nodeId, { prompt: e.target.value })}
          rows={3}
        />
      </label>

      <label className="flex flex-col gap-1">
        <FieldLabel>Provider</FieldLabel>
        <SelectField
          value={providerId}
          onChange={(e) => updateConfig(nodeId, { provider: e.target.value, model: '' })}
        >
          <option value="">默认</option>
          {providerList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.id}）
            </option>
          ))}
        </SelectField>
      </label>

      {modelOptions.length > 0 && (
        <label className="flex flex-col gap-1">
          <FieldLabel>模型</FieldLabel>
          <SelectField value={model} onChange={(e) => updateConfig(nodeId, { model: e.target.value })}>
            <option value="">默认</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </SelectField>
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <FieldLabel>时长（秒）</FieldLabel>
        <ChipGroup
          options={VIDEO_DURATIONS.map((d) => ({ value: String(d), label: `${d}s` }))}
          value={String(config.duration ?? 5)}
          onChange={(v) => updateConfig(nodeId, { duration: Number(v) })}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <FieldLabel>画面比例</FieldLabel>
        <ChipGroup
          options={VIDEO_RATIOS}
          value={String(config.aspect_ratio ?? '16:9')}
          onChange={(v) => updateConfig(nodeId, { aspect_ratio: v })}
        />
      </label>

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
          <Button variant="default" size="sm" onClick={() => run(lastFailed.payload as VideoSubmitPayload | undefined)}>
            <RotateCcw size={13} aria-hidden />
            重试
          </Button>
        )}
      </div>

      {actionError && <p className="text-[11px] text-danger">{actionError}</p>}
      {lastFailed && !currentTask && <p className="text-[11px] text-danger">{lastFailed.error || '生成失败，可重试'}</p>}

      {/* 视频结果：poster 首帧预览（不整段加载） */}
      {resultVideos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel>结果</FieldLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {resultVideos.slice(0, 4).map((url) => (
              <video
                key={url}
                src={url}
                poster={thumbnailUrl(url, 320)}
                muted
                playsInline
                preload="metadata"
                className="aspect-video w-full rounded-md border border-border bg-ink object-cover"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
