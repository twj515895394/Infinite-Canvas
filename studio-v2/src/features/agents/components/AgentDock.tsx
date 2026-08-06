/**
 * Agent Dock 面板（切片 22 F14）。
 * 结构：Agent/Skill 选择 → Context Chips → Timeline（事件轮询）→ Composer → 取消/保存。
 * 动效：侧滑 sheet spring bounce:0 ≤180ms；reduced-motion 降级 opacity。
 * 入口：AppShell / 画布 / 资产库 / Agent Center（useDockStore.openDock）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Ban,
  Bot,
  Download,
  Loader2,
  Send,
  Sparkles,
  X,
  BookmarkPlus,
  FileJson,
} from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { FieldLabel, SelectField, TextArea } from '@/components/ui/form'
import { cn } from '@/core/utils/cn'
import {
  errorMessage,
  formatDate,
  useAgentTask,
  useAgents,
  useCancelTask,
  useSkills,
  type AgentTask,
} from '@/features/agents/api'
import {
  createSession,
  downloadResultFile,
  extractResultText,
  saveResultToLibrary,
  useCreateDockTask,
  useTaskEvents,
  type TaskEventItem,
} from '@/features/agents/dockApi'
import {
  newIdempotencyKey,
  useDockStore,
  type DockContextRef,
} from '@/features/agents/dockStore'
import { StatusChip } from '@/features/agents/components/StatusChip'
import { isTaskActive, TASK_STATUS_LABELS, taskTone } from '@/features/agents/status'

function ContextChips({
  refs,
  onRemove,
}: {
  refs: DockContextRef[]
  onRemove: (key: string) => void
}) {
  if (refs.length === 0) {
    return <p className="text-[11px] text-text-faint">未添加上下文。可从资产库「使用 Agent」或画布选中节点带入。</p>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {refs.map((ref) => (
        <span
          key={ref.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11px] text-text"
        >
          <span className="truncate">
            <span className="text-text-faint">{ref.reference_type} · </span>
            {ref.title}
          </span>
          <button
            type="button"
            className="rounded-full p-0.5 text-text-faint hover:text-text"
            aria-label={`移除上下文 ${ref.title}`}
            onClick={() => onRemove(ref.key)}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  )
}

function Timeline({
  events,
  task,
  status,
}: {
  events: TaskEventItem[]
  task: AgentTask | null
  status: string | null
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [events.length, status])

  if (!task && events.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <Sparkles className="size-5 text-text-faint" aria-hidden />
        <p className="text-xs text-text-muted">选择 Agent，输入任务并提交</p>
        <p className="max-w-xs text-[11px] text-text-faint">运行中的消息与结果会显示在这里；历史 Task 可在 Agent Center → Tasks 查看。</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
      {task && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-faint">
          <StatusChip label={TASK_STATUS_LABELS[status ?? task.status] ?? (status ?? task.status)} tone={taskTone(status ?? task.status)} />
          <span className="truncate">{task.id}</span>
          {task.updated_at > 0 && <span>{formatDate(task.updated_at)}</span>}
        </div>
      )}
      {events.map((evt) => {
        const isUser = evt.role === 'user'
        const isAssistant = evt.role === 'assistant' || evt.event_type === 'message-completed'
        return (
          <div
            key={`${evt.sequence}-${evt.event_type}`}
            className={cn(
              'rounded-md border px-2.5 py-2 text-xs whitespace-pre-wrap',
              isUser && 'border-border bg-surface-raised text-text',
              isAssistant && 'border-accent/25 bg-accent/10 text-text',
              !isUser && !isAssistant && 'border-border/60 bg-bg text-text-muted',
            )}
          >
            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-text-faint">
              {isUser ? '你' : isAssistant ? 'Agent' : evt.event_type}
            </div>
            {evt.content || <span className="text-text-faint">（空）</span>}
          </div>
        )
      })}
      {status && isTaskActive(status) && (
        <div className="flex items-center gap-2 text-[11px] text-accent">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          运行中…
        </div>
      )}
      {task?.error?.message && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-2.5 py-2 text-xs text-danger">
          {task.error.message}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

export function AgentDock() {
  const open = useDockStore((s) => s.open)
  const closeDock = useDockStore((s) => s.closeDock)
  const agentId = useDockStore((s) => s.agentId)
  const skillId = useDockStore((s) => s.skillId)
  const message = useDockStore((s) => s.message)
  const contextRefs = useDockStore((s) => s.contextRefs)
  const sessionId = useDockStore((s) => s.sessionId)
  const activeTaskId = useDockStore((s) => s.activeTaskId)
  const projectId = useDockStore((s) => s.projectId)
  const canvasId = useDockStore((s) => s.canvasId)
  const setAgentId = useDockStore((s) => s.setAgentId)
  const setSkillId = useDockStore((s) => s.setSkillId)
  const setMessage = useDockStore((s) => s.setMessage)
  const setSessionId = useDockStore((s) => s.setSessionId)
  const setActiveTaskId = useDockStore((s) => s.setActiveTaskId)
  const removeContextRef = useDockStore((s) => s.removeContextRef)

  const { data: agents = [], isLoading: agentsLoading } = useAgents()
  const { data: skills = [] } = useSkills()
  const createTask = useCreateDockTask()
  const cancelTask = useCancelTask()
  const { data: activeTask } = useAgentTask(activeTaskId)

  const reduced = useReducedMotion()
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [events, setEvents] = useState<TaskEventItem[]>([])
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const enabledAgents = useMemo(() => agents.filter((a) => a.enabled), [agents])
  const selectedAgent = agents.find((a) => a.id === agentId) ?? null
  const boundSkills = selectedAgent?.skill_bindings.filter((b) => b.enabled) ?? []
  // 未绑定时仍允许从全局 enabled skills 选（可选）
  const skillOptions = boundSkills.length > 0
    ? boundSkills.map((b) => ({ id: b.skill_id, name: b.skill.name }))
    : skills.filter((s) => s.enabled).map((s) => ({ id: s.id, name: s.name }))

  // 切换 Task 时重置事件流
  useEffect(() => {
    setCursor(0)
    setEvents([])
    setLiveStatus(null)
    setSaveMsg(null)
  }, [activeTaskId])

  const eventsQuery = useTaskEvents(activeTaskId, cursor)
  useEffect(() => {
    const page = eventsQuery.data
    if (!page) return
    setLiveStatus(page.status)
    if (page.events.length > 0) {
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.sequence))
        const next = [...prev]
        for (const e of page.events) {
          if (!seen.has(e.sequence)) next.push(e)
        }
        next.sort((a, b) => a.sequence - b.sequence)
        return next
      })
    }
    if (page.next_cursor > cursor) setCursor(page.next_cursor)
  }, [eventsQuery.data, cursor])

  // 默认选第一个可用 Agent
  useEffect(() => {
    if (!open) return
    if (agentId) return
    if (enabledAgents[0]) setAgentId(enabledAgents[0].id)
  }, [open, agentId, enabledAgents, setAgentId])

  const resultText = extractResultText({ task: activeTask, events })
  const status = liveStatus ?? activeTask?.status ?? null
  const canCancel = status != null && isTaskActive(status)
  const canSave = Boolean(resultText) && status === 'succeeded'

  const onSubmit = async () => {
    const text = message.trim()
    if (!agentId || !text || submitting) return
    setActionError(null)
    setSubmitting(true)
    try {
      let sid = sessionId
      if (!sid) {
        const session = await createSession({
          agent_profile_id: agentId,
          project_id: projectId,
          title: 'Agent Dock',
        })
        sid = session.id
        setSessionId(sid)
      }
      const { task } = await createTask.mutateAsync({
        sessionId: sid,
        agentProfileId: agentId,
        message: text,
        skillId,
        projectId,
        contextRefs,
        canvasId,
        idempotencyKey: newIdempotencyKey(),
      })
      setActiveTaskId(task.id)
      setMessage('')
    } catch (err) {
      setActionError(errorMessage(err, '提交任务失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const onCancel = async () => {
    if (!activeTaskId) return
    setActionError(null)
    try {
      await cancelTask.mutateAsync(activeTaskId)
    } catch (err) {
      setActionError(errorMessage(err, '取消失败'))
    }
  }

  const onSaveLibrary = async (format: 'text' | 'json') => {
    if (!resultText || saving) return
    setSaving(true)
    setSaveMsg(null)
    const res = await saveResultToLibrary({
      text: resultText,
      format,
      basename: `agent-${activeTaskId ?? 'result'}`,
    })
    setSaving(false)
    if (res.error) setSaveMsg(res.error)
    else setSaveMsg(`已保存到资产库（${res.assetIds.length}）`)
  }

  const onDownload = (format: 'text' | 'json') => {
    if (!resultText) return
    downloadResultFile(resultText, format, `agent-${activeTaskId ?? 'result'}`)
    setSaveMsg(format === 'json' ? '已下载 JSON' : '已下载文本')
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 轻遮罩：不阻断主工作流阅读，点击关闭 */}
          <motion.button
            type="button"
            aria-label="关闭 Agent Dock"
            className="fixed inset-0 z-40 bg-black/30 lg:bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={closeDock}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Agent Dock"
            className={cn(
              'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border',
              'bg-surface shadow-2xl',
            )}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
            transition={
              reduced
                ? { duration: 0.12 }
                : { type: 'spring', bounce: 0, duration: 0.18 }
            }
          >
            {/* Header */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-accent" aria-hidden />
                <h2 className="text-sm font-medium text-text">Agent Dock</h2>
              </div>
              <IconButton label="关闭" size="sm" onClick={closeDock}>
                <X className="size-4" />
              </IconButton>
            </div>

            {/* Agent / Skill */}
            <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2.5">
              <label className="flex flex-col gap-1">
                <FieldLabel>Agent</FieldLabel>
                <SelectField
                  value={agentId ?? ''}
                  onChange={(e) => setAgentId(e.target.value || null)}
                  disabled={agentsLoading || enabledAgents.length === 0}
                >
                  {enabledAgents.length === 0 && <option value="">无可用 Agent</option>}
                  {enabledAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.runtime_profile?.name ? ` · ${a.runtime_profile.name}` : ''}
                    </option>
                  ))}
                </SelectField>
              </label>
              <label className="flex flex-col gap-1">
                <FieldLabel>Skill（可选）</FieldLabel>
                <SelectField
                  value={skillId ?? ''}
                  onChange={(e) => setSkillId(e.target.value || null)}
                  disabled={!agentId}
                >
                  <option value="">不指定</option>
                  {skillOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              </label>
              <div>
                <FieldLabel>上下文</FieldLabel>
                <div className="mt-1">
                  <ContextChips refs={contextRefs} onRemove={removeContextRef} />
                </div>
              </div>
            </div>

            {/* Timeline */}
            <Timeline events={events} task={activeTask ?? null} status={status} />

            {/* Actions for result */}
            {(canSave || canCancel || saveMsg) && (
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
                {canCancel && (
                  <Button size="sm" variant="danger" disabled={cancelTask.isPending} onClick={() => void onCancel()}>
                    {cancelTask.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Ban className="size-3.5" aria-hidden />}
                    取消
                  </Button>
                )}
                {canSave && (
                  <>
                    <Button size="sm" variant="ghost" disabled={saving} onClick={() => void onSaveLibrary('text')}>
                      {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <BookmarkPlus className="size-3.5" aria-hidden />}
                      存资产库
                    </Button>
                    <Button size="sm" variant="ghost" disabled={saving} onClick={() => void onSaveLibrary('json')}>
                      <FileJson className="size-3.5" aria-hidden />
                      JSON 入库
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDownload('text')}>
                      <Download className="size-3.5" aria-hidden />
                      下载
                    </Button>
                  </>
                )}
                {saveMsg && <span className="text-[11px] text-text-muted">{saveMsg}</span>}
              </div>
            )}

            {actionError && (
              <p className="shrink-0 px-3 pb-1 text-xs text-danger">{actionError}</p>
            )}

            {/* Composer */}
            <div className="shrink-0 border-t border-border p-3">
              <TextArea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={agentId ? '描述任务…（Enter+Ctrl 提交）' : '请先选择 Agent'}
                disabled={!agentId || submitting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    void onSubmit()
                  }
                }}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-text-faint">Ctrl+Enter 提交</span>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!agentId || !message.trim() || submitting}
                  onClick={() => void onSubmit()}
                >
                  {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
                  提交
                </Button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
