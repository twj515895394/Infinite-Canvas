/**
 * Task Shelf（F6）：全局生成任务面板（AppShell 底部）。
 * - 收起态为半透明毛玻璃条（apple-design §12 材料层级），显示活跃/成功/失败计数；
 * - 展开态列出全部任务：状态、错误、取消/重试/清除；
 * - 轮询驱动：1.5s 刷新非终态任务（MVP §7.2 轮询方案），挂载时从后端恢复近期任务；
 * - 展开动效：临界阻尼 spring（bounce=0），reduced-motion 下降级为直接切换。
 */
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { cn } from '@/core/utils/cn'
import { useEditorStore } from '@/features/canvas/store'
import {
  cancelImageTask,
  isTaskActive,
  submitComfyTask,
  submitImageTask,
  submitVideoTask,
  TASK_STATUS_LABELS,
  useGenerationTaskList,
} from '@/features/generation/api'
import type { ComfySubmitPayload, GenerationTaskStatus, ImageSubmitPayload, VideoSubmitPayload } from '@/features/generation/api'
import { refreshActiveTasks, useGenerationStore } from '@/features/generation/store'
import type { TaskEntry } from '@/features/generation/store'

const STATUS_ICONS: Record<GenerationTaskStatus, typeof Clock> = {
  queued: Clock,
  running: Loader2,
  jimeng_pending: Loader2,
  succeeded: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
}

const STATUS_CHIP: Record<GenerationTaskStatus, string> = {
  queued: 'bg-text-faint/15 text-text-muted',
  running: 'bg-warning/15 text-warning',
  jimeng_pending: 'bg-warning/15 text-warning',
  succeeded: 'bg-success/15 text-success',
  failed: 'bg-danger/15 text-danger',
  cancelled: 'bg-text-faint/15 text-text-faint',
}

function StatusIcon({ status, spinning }: { status: GenerationTaskStatus; spinning: boolean }) {
  const Icon = STATUS_ICONS[status]
  return (
    <Icon
      size={14}
      aria-hidden
      className={cn(
        'shrink-0',
        status === 'running' || status === 'jimeng_pending' ? 'text-warning' : 'text-text-faint',
        spinning && 'animate-spin',
      )}
    />
  )
}

function TaskRow({
  entry,
  onCancel,
  onRetry,
  onRemove,
}: {
  entry: TaskEntry
  onCancel: (entry: TaskEntry) => void
  onRetry: (entry: TaskEntry) => void
  onRemove: (entry: TaskEntry) => void
}) {
  const active = isTaskActive(entry.status)
  const spinning = entry.status === 'running' || entry.status === 'jimeng_pending'
  const subtitle = [entry.workflow, entry.providerId, entry.model].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center gap-2.5 px-4 py-2">
      <StatusIcon status={entry.status} spinning={spinning} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-text">{entry.label}</span>
          {subtitle && <span className="truncate text-[10px] text-text-faint">{subtitle}</span>}
        </div>
        {entry.error && <p className="mt-0.5 truncate text-[11px] text-danger">{entry.error}</p>}
        {entry.message && !entry.error && entry.status === 'jimeng_pending' && (
          <p className="mt-0.5 truncate text-[11px] text-text-faint">{entry.message}</p>
        )}
      </div>
      <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px]', STATUS_CHIP[entry.status])}>
        {TASK_STATUS_LABELS[entry.status]}
      </span>
      {active && (
        <IconButton label="取消任务" size="sm" onClick={() => onCancel(entry)}>
          <X size={13} aria-hidden />
        </IconButton>
      )}
      {!active && entry.status === 'failed' && entry.payload && (
        <IconButton label="重试" size="sm" onClick={() => onRetry(entry)}>
          <RotateCcw size={13} aria-hidden />
        </IconButton>
      )}
      {!active && (
        <IconButton label="移除" size="sm" onClick={() => onRemove(entry)}>
          <XCircle size={13} aria-hidden />
        </IconButton>
      )}
    </div>
  )
}

export function TaskShelf() {
  const tasks = useGenerationStore((s) => s.tasks)
  const [expanded, setExpanded] = useState(false)
  const reduceMotion = useReducedMotion()
  const { data: recent } = useGenerationTaskList(30)

  /* 挂载/刷新时恢复后端近期任务（去重，保留本地 nodeId 关联） */
  useEffect(() => {
    if (recent?.tasks) {
      useGenerationStore.getState().mergeBackend(recent.tasks)
    }
  }, [recent])

  /* 轮询非终态任务（MVP §7.2：轮询替代完整 Event Hub） */
  useEffect(() => {
    const timer = setInterval(() => {
      void refreshActiveTasks()
    }, 1500)
    return () => clearInterval(timer)
  }, [])

  const counts = useMemo(() => {
    let active = 0
    let succeeded = 0
    let failed = 0
    for (const t of tasks) {
      if (isTaskActive(t.status)) active += 1
      else if (t.status === 'succeeded') succeeded += 1
      else if (t.status === 'failed') failed += 1
    }
    return { active, succeeded, failed }
  }, [tasks])

  const cancel = async (entry: TaskEntry) => {
    try {
      const { task } = await cancelImageTask(entry.taskId)
      useGenerationStore.getState().patch(entry.taskId, {
        status: task.status,
        error: task.error || undefined,
        updatedAt: task.updated_at,
      })
      if (entry.nodeId) useEditorStore.getState().setRuntime(entry.nodeId, task.status)
    } catch {
      useGenerationStore.getState().patch(entry.taskId, { status: 'failed', error: '取消失败' })
    }
  }

  const retry = async (entry: TaskEntry) => {
    if (!entry.payload) return
    try {
      // 按任务类型分派提交端点：图片 / 视频 / ComfyUI 工作流共用同一任务中心
      const { task } =
        entry.kind === 'comfy'
          ? await submitComfyTask(entry.payload as ComfySubmitPayload)
          : entry.kind === 'video'
            ? await submitVideoTask(entry.payload as VideoSubmitPayload)
            : await submitImageTask(entry.payload as ImageSubmitPayload)
      useGenerationStore.getState().upsert({
        taskId: task.id,
        kind: entry.kind,
        nodeId: entry.nodeId,
        label: entry.label,
        status: task.status,
        providerId: entry.providerId,
        model: entry.model,
        workflow: entry.workflow,
        payload: entry.payload,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
      })
      if (entry.nodeId) useEditorStore.getState().setRuntime(entry.nodeId, task.status)
    } catch {
      /* 重试提交失败：静默（原条目保持 failed 可再次重试） */
    }
  }

  const panel = (
    <div className="max-h-[38vh] overflow-y-auto border-t border-border bg-surface-overlay backdrop-blur">
      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-text-faint">
          暂无任务 — 在画布上选择「图片生成」节点并点击生成
        </div>
      ) : (
        tasks.map((t) => (
          <TaskRow
            key={t.taskId}
            entry={t}
            onCancel={(e) => void cancel(e)}
            onRetry={(e) => void retry(e)}
            onRemove={(e) => useGenerationStore.getState().remove(e.taskId)}
          />
        ))
      )}
    </div>
  )

  return (
    <div className="relative shrink-0">
      <AnimatePresence initial={false}>
        {expanded && !reduceMotion && (
          <motion.div
            key="shelf-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.18 }}
            className="overflow-hidden"
          >
            {panel}
          </motion.div>
        )}
        {expanded && reduceMotion && <div key="shelf-panel-static">{panel}</div>}
      </AnimatePresence>

      <div className="flex h-14 shrink-0 items-center gap-2 border-t border-border bg-surface-overlay px-4 backdrop-blur">
        <span className="text-xs font-medium text-text">任务</span>
        {counts.active > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">
            <Loader2 size={10} className="animate-spin" aria-hidden />
            {counts.active} 运行中
          </span>
        )}
        {counts.succeeded > 0 && (
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success">{counts.succeeded} 成功</span>
        )}
        {counts.failed > 0 && (
          <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] text-danger">{counts.failed} 失败</span>
        )}
        <span className="ml-auto text-[11px] text-text-faint">{tasks.length} 条</span>
        <IconButton label={expanded ? '收起任务面板' : '展开任务面板'} size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
        </IconButton>
      </div>
    </div>
  )
}
