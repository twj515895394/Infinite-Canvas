/**
 * ComfyUI 工作流节点 Inspector（F8）。
 * - 工作流选择：复用 /api/workflows 注册表，选中后展示基本信息（标题/名称/内置标记）；
 * - 参数表单：按工作流 config.fields 动态渲染（textarea/dropdown/boolean/slider/number/text），
 *   字段值只存节点 config.field_values（供应商特有字段仅存在于节点 config）；
 * - 执行：POST /api/v2/generation-tasks/comfy（字段→节点覆盖映射由后端完成），任务登记进
 *   Task Shelf store，轮询由 TaskShelf 驱动；失败可重试（重试用提交快照，与原始请求一致）；
 * - 无可用工作流时显示空状态，引导到旧版 ComfyUI 设置页上传/配置工作流。
 */
import { useState } from 'react'
import { Loader2, Play, RotateCcw, Workflow as WorkflowIcon, XCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { cn } from '@/core/utils/cn'
import { useEditorStore } from '@/features/canvas/store'
import {
  buildComfyPayload,
  cancelImageTask,
  getWorkflow,
  isTaskActive,
  submitComfyTask,
  TASK_STATUS_LABELS,
  useWorkflowList,
  workflowFieldValue,
  type ComfySubmitPayload,
  type WorkflowFieldDef,
} from '@/features/generation/api'
import { useGenerationStore } from '@/features/generation/store'

interface WorkflowInspectorProps {
  nodeId: string
  config: Record<string, unknown>
  updateConfig: (id: string, patch: Record<string, unknown>) => void
}

const LEGACY_COMFYUI_URL = 'http://127.0.0.1:3888/comfyui-settings.html'

const inputCls =
  'rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-accent'

/** 按字段类型渲染单个参数控件；值写回 config.field_values[id]（不可变更新）。
 * MVP 裁剪说明：random_enabled（随机数开关）不渲染——字段使用 config 默认值，
 * 后端按默认值提交；后续如需随机种子再补开关。 */
function FieldControl({
  field,
  value,
  onPatch,
}: {
  field: WorkflowFieldDef
  value: unknown
  onPatch: (fieldId: string, value: unknown) => void
}) {
  const label = field.name || field.input || field.id
  if (field.type === 'textarea') {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">{label}</span>
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onPatch(field.id, e.target.value)}
          rows={3}
          className={cn(inputCls, 'resize-y')}
        />
      </label>
    )
  }
  if (field.type === 'dropdown') {
    const options = field.options ?? []
    return (
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">{label}</span>
        <select
          value={String(value ?? '')}
          onChange={(e) => onPatch(field.id, e.target.value)}
          className="h-8 rounded-md border border-border bg-bg px-2 text-xs text-text outline-none focus:border-accent"
        >
          {options.length === 0 && <option value="">（无选项）</option>}
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (field.type === 'boolean') {
    const on = value === true
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted">{label}</span>
        <button
          type="button"
          onClick={() => onPatch(field.id, !on)}
          className={cn(
            'h-6 rounded-md border px-2 text-[11px] transition-[background-color,border-color,color] duration-[120ms]',
            on ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-raised text-text-muted',
          )}
        >
          {on ? '开' : '关'}
        </button>
      </div>
    )
  }
  if (field.type === 'slider') {
    const min = field.min ?? 0
    const max = field.max ?? 10
    const step = field.step ?? 1
    const num = Number(value ?? min)
    return (
      <label className="flex flex-col gap-1">
        <span className="flex items-center justify-between text-[11px] text-text-muted">
          <span>{label}</span>
          <span className="text-text">{Number.isFinite(num) ? num : min}</span>
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(num) ? num : min}
          onChange={(e) => onPatch(field.id, Number(e.target.value))}
          className="accent-accent"
        />
      </label>
    )
  }
  // number / text / 未知类型统一文本数字输入（数值保持数值类型，后端再做类型归一）
  const isNumber = field.type === 'number'
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted">{label}</span>
      <input
        type={isNumber ? 'number' : 'text'}
        min={field.min ?? undefined}
        max={field.max ?? undefined}
        step={field.step ?? undefined}
        value={String(value ?? '')}
        onChange={(e) => onPatch(field.id, isNumber && e.target.value === '' ? undefined : isNumber ? Number(e.target.value) : e.target.value)}
        className={cn(inputCls, 'h-8')}
      />
    </label>
  )
}

export function WorkflowInspector({ nodeId, config, updateConfig }: WorkflowInspectorProps) {
  const tasks = useGenerationStore((s) => s.tasks)
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const workflowsQuery = useWorkflowList()
  const workflows = workflowsQuery.data?.workflows ?? []

  const workflow = String(config.workflow ?? '').trim()
  const detailQuery = useQuery({
    queryKey: ['workflow-detail', workflow],
    queryFn: () => getWorkflow(workflow),
    enabled: workflow.length > 0,
  })
  const fields = detailQuery.data?.config.fields ?? []
  const detailTitle = detailQuery.data?.config.title ?? ''

  const currentTask = tasks.find((t) => t.nodeId === nodeId && isTaskActive(t.status))
  const lastFailed = [...tasks]
    .filter((t) => t.nodeId === nodeId && t.status === 'failed')
    .sort((a, b) => b.createdAt - a.createdAt)[0]
  const running = submitting || Boolean(currentTask)

  const patchField = (fieldId: string, value: unknown) => {
    const values = { ...((config.field_values ?? {}) as Record<string, unknown>) }
    // undefined 表示清除该字段覆盖（回退到字段默认值显示与提交）
    if (value === undefined) delete values[fieldId]
    else values[fieldId] = value
    updateConfig(nodeId, { field_values: values })
  }

  const selectWorkflow = (name: string) => {
    // 切换工作流时清空字段值与旧结果：不同工作流的字段 id 不兼容，残留缩略图/引用会误导
    updateConfig(nodeId, { executor: 'comfyui', workflow: name, field_values: {}, result: undefined })
  }

  const registerAndTrack = async (payload: ComfySubmitPayload) => {
    const { task } = await submitComfyTask(payload)
    useGenerationStore.getState().upsert({
      taskId: task.id,
      kind: 'comfy',
      nodeId,
      label: 'ComfyUI 工作流',
      status: task.status,
      workflow: payload.workflow,
      payload,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    })
    useEditorStore.getState().setRuntime(nodeId, task.status)
  }

  const run = async (payloadOverride?: ComfySubmitPayload) => {
    setActionError(null)
    setSubmitting(true)
    try {
      const payload = payloadOverride ?? buildComfyPayload(config)
      if (!payload.workflow) {
        setActionError('请先选择工作流')
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
      // ComfyUI 任务与图片任务共用同一取消端点（/generation-tasks/{id}/cancel）
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
      {workflowsQuery.isLoading ? (
        <p className="text-[11px] text-text-faint">加载工作流…</p>
      ) : workflowsQuery.isError ? (
        <p className="text-[11px] text-danger">工作流列表加载失败，请确认后端服务可用后重试</p>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-bg px-3 py-4 text-center">
          <WorkflowIcon size={16} className="text-text-faint" aria-hidden />
          <p className="text-xs font-medium text-text">暂无可用工作流</p>
          <p className="text-[11px] text-text-faint">
            请先在 ComfyUI 设置页上传工作流 JSON 并配置字段，再回到此处选择执行。
          </p>
          <a
            href={LEGACY_COMFYUI_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-accent hover:underline"
          >
            打开 ComfyUI 设置页
          </a>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-muted">工作流</span>
            <select
              value={workflow}
              onChange={(e) => selectWorkflow(e.target.value)}
              className="h-8 rounded-md border border-border bg-bg px-2 text-xs text-text outline-none focus:border-accent"
            >
              <option value="">请选择工作流</option>
              {workflows.map((w) => (
                <option key={w.name} value={w.name}>
                  {w.title}（{w.name}）
                </option>
              ))}
            </select>
          </label>

          {workflow && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-bg px-2.5 py-2">
              <WorkflowIcon size={14} className="shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-text">{detailTitle || workflow}</p>
                <p className="truncate text-[10px] text-text-faint">
                  {workflow} · {fields.length} 个参数
                </p>
              </div>
            </div>
          )}

          {detailQuery.isLoading && <p className="text-[11px] text-text-faint">加载工作流配置…</p>}
          {detailQuery.isError && (
            <p className="text-[11px] text-danger">工作流配置加载失败，请确认工作流文件存在</p>
          )}

          {fields.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="text-[11px] font-medium text-text-muted">参数</div>
              {fields.map((field) => (
                <FieldControl
                  key={field.id}
                  field={field}
                  value={workflowFieldValue(config, field)}
                  onPatch={patchField}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* 运行控制 */}
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={!workflow || running || workflows.length === 0}
          onClick={() => run()}
        >
          {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />}
          {currentTask ? TASK_STATUS_LABELS[currentTask.status] : '运行'}
        </Button>
        {currentTask && (
          <Button variant="default" size="sm" onClick={cancel}>
            <XCircle size={13} aria-hidden />
            取消
          </Button>
        )}
        {!currentTask && lastFailed && (
          <Button variant="default" size="sm" onClick={() => run(lastFailed.payload as ComfySubmitPayload | undefined)}>
            <RotateCcw size={13} aria-hidden />
            重试
          </Button>
        )}
      </div>

      {actionError && <p className="text-[11px] text-danger">{actionError}</p>}
      {lastFailed && !currentTask && <p className="text-[11px] text-danger">{lastFailed.error || '执行失败，可重试'}</p>}
    </div>
  )
}
