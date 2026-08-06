/**
 * Tasks Tab（F13）：列表 / 详情 / 取消 / 重试；活跃任务 2s 轮询。
 * 状态展示对齐 agent_schema.TASK_STATUSES；不建 Permissions 页。
 */
import { useState } from 'react'
import {
  Ban,
  CheckCircle2,
  Clock,
  ListTodo,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState, LoadingState } from '@/components/ui/page-state'
import { SelectField } from '@/components/ui/form'
import {
  errorMessage,
  formatDate,
  useAgentTask,
  useAgentTasks,
  useCancelTask,
  useRetryTask,
  type AgentTask,
} from '@/features/agents/api'
import { isTaskActive, TASK_STATUS_LABELS, taskTone } from '@/features/agents/status'
import { StatusChip } from '@/features/agents/components/StatusChip'
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'running', label: '运行中' },
  { value: 'queued', label: '排队' },
  { value: 'waiting_input', label: '等待输入' },
  { value: 'waiting_permission', label: '等待权限' },
  { value: 'succeeded', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
]

function StatusIcon({ status }: { status: string }) {
  if (status === 'succeeded') return <CheckCircle2 className="size-3.5 text-success" aria-hidden />
  if (status === 'failed') return <XCircle className="size-3.5 text-danger" aria-hidden />
  if (status === 'cancelled' || status === 'cancel_requested')
    return <Ban className="size-3.5 text-text-faint" aria-hidden />
  if (isTaskActive(status)) return <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden />
  return <Clock className="size-3.5 text-text-faint" aria-hidden />
}

function TaskDetailDialog({
  taskId,
  onClose,
}: {
  taskId: string
  onClose: () => void
}) {
  const { data: task, isLoading, error } = useAgentTask(taskId)
  const cancelTask = useCancelTask()
  const retryTask = useRetryTask()
  const [actionError, setActionError] = useState<string | null>(null)

  const onCancel = async () => {
    setActionError(null)
    try {
      await cancelTask.mutateAsync(taskId)
    } catch (err) {
      setActionError(errorMessage(err, '取消失败'))
    }
  }

  const onRetry = async () => {
    setActionError(null)
    try {
      await retryTask.mutateAsync(taskId)
    } catch (err) {
      setActionError(errorMessage(err, '重试失败'))
    }
  }

  const active = task ? isTaskActive(task.status) : false
  const canRetry = task ? task.status === 'failed' || task.status === 'cancelled' : false

  return (
    <Dialog open onClose={onClose} title="任务详情" className="max-w-lg">
      {isLoading || !task ? (
        <div className="flex h-24 items-center justify-center text-text-faint">
          {error ? (
            <p className="text-xs text-danger">{errorMessage(error)}</p>
          ) : (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusIcon status={task.status} />
            <StatusChip label={TASK_STATUS_LABELS[task.status] ?? task.status} tone={taskTone(task.status)} />
            <span className="text-xs text-text-faint">{task.id}</span>
          </div>
          <div className="grid gap-1 text-xs">
            <p>
              <span className="text-text-muted">Agent：</span>
              <span className="text-text">{task.agent_profile.name}</span>
            </p>
            {task.requested_skill && (
              <p>
                <span className="text-text-muted">Skill：</span>
                <span className="text-text">{task.requested_skill.name}</span>
              </p>
            )}
            <p>
              <span className="text-text-muted">创建：</span>
              <span className="text-text">{formatDate(task.created_at)}</span>
              {task.finished_at ? ` · 结束 ${formatDate(task.finished_at)}` : ''}
            </p>
            {task.latest_run && (
              <p>
                <span className="text-text-muted">Run：</span>
                <span className="text-text">
                  attempt {task.latest_run.attempt} · {task.latest_run.status}
                </span>
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium text-text-muted">消息</p>
            <p className="mt-0.5 max-h-28 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-bg px-2 py-1.5 text-xs text-text">
              {task.message}
            </p>
          </div>
          {(task.error?.message || task.latest_run?.error?.message || task.latest_run?.result_summary) && (
            <div>
              <p className="text-[11px] font-medium text-text-muted">
                {task.status === 'failed' ? '错误' : '结果摘要'}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-text">
                {task.error?.message ||
                  task.latest_run?.error?.message ||
                  task.latest_run?.result_summary ||
                  ''}
              </p>
            </div>
          )}
          {task.runs && task.runs.length > 1 && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-text-muted">历史 Run</p>
              <ul className="flex flex-col gap-1">
                {task.runs.map((run) => (
                  <li key={run.id} className="rounded border border-border/60 bg-bg px-2 py-1 text-[11px] text-text-faint">
                    #{run.attempt} {run.status}
                    {run.result_summary ? ` · ${run.result_summary.slice(0, 80)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {actionError && <p className="text-xs text-danger">{actionError}</p>}
          <div className="flex justify-end gap-2">
            {active && (
              <Button
                size="sm"
                variant="danger"
                disabled={cancelTask.isPending}
                onClick={() => void onCancel()}
              >
                {cancelTask.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Ban className="size-3.5" aria-hidden />}
                取消
              </Button>
            )}
            {canRetry && (
              <Button
                size="sm"
                variant="ghost"
                disabled={retryTask.isPending}
                onClick={() => void onRetry()}
              >
                {retryTask.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="size-3.5" aria-hidden />
                )}
                重试
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function TaskRow({
  task,
  onOpen,
  onCancel,
  onRetry,
  busy,
}: {
  task: AgentTask
  onOpen: () => void
  onCancel: () => void
  onRetry: () => void
  busy: boolean
}) {
  const active = isTaskActive(task.status)
  const canRetry = task.status === 'failed' || task.status === 'cancelled'
  return (
    <li className="flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-2.5">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusIcon status={task.status} />
          <StatusChip label={TASK_STATUS_LABELS[task.status] ?? task.status} tone={taskTone(task.status)} />
          <span className="truncate text-sm text-text">{task.agent_profile.name}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-text-faint">{task.message}</p>
        <p className="mt-0.5 text-[11px] text-text-faint">
          {formatDate(task.updated_at)}
          {task.requested_skill ? ` · ${task.requested_skill.name}` : ''}
          {task.latest_run?.result_summary
            ? ` · ${task.latest_run.result_summary.slice(0, 60)}`
            : task.error?.message
              ? ` · ${task.error.message.slice(0, 60)}`
              : ''}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {active && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel} aria-label="取消任务">
            <Ban className="size-3.5" />
          </Button>
        )}
        {canRetry && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onRetry} aria-label="重试任务">
            <RotateCcw className="size-3.5" />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onOpen}>
          详情
        </Button>
      </div>
    </li>
  )
}

export function TasksTab() {
  const [status, setStatus] = useState('')
  const { data, isLoading, error, refetch } = useAgentTasks(status || undefined)
  const cancelTask = useCancelTask()
  const retryTask = useRetryTask()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const items = data?.items ?? []

  const onCancel = async (id: string) => {
    setActionError(null)
    setBusyId(id)
    try {
      await cancelTask.mutateAsync(id)
    } catch (err) {
      setActionError(errorMessage(err, '取消失败'))
    } finally {
      setBusyId(null)
    }
  }

  const onRetry = async (id: string) => {
    setActionError(null)
    setBusyId(id)
    try {
      await retryTask.mutateAsync(id)
    } catch (err) {
      setActionError(errorMessage(err, '重试失败'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-muted">查看 Agent Task 状态，支持取消与重试（活跃任务自动刷新）。</p>
        <SelectField
          className="w-36"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="按状态筛选"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value || 'all'} value={f.value}>
              {f.label}
            </option>
          ))}
        </SelectField>
      </div>

      {actionError && <p className="text-xs text-danger">{actionError}</p>}

      {isLoading ? (
        <LoadingState label="加载任务…" className="h-24" />
      ) : error ? (
        <ErrorState title="加载任务失败" hint={errorMessage(error)} onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="暂无任务"
          hint="在 Agents Tab 测试运行，或从 Agent Dock（F14）提交任务后，会显示在这里。"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onOpen={() => setDetailId(task.id)}
              onCancel={() => void onCancel(task.id)}
              onRetry={() => void onRetry(task.id)}
              busy={busyId === task.id}
            />
          ))}
        </ul>
      )}

      {detailId && <TaskDetailDialog taskId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}
