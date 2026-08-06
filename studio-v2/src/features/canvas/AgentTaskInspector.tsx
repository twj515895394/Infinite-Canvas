/**
 * agent-task 节点 Inspector（切片 23 F15）。
 * - 配置：Agent / Skill / 任务说明（form.tsx 共享控件）
 * - 执行：复用 dockApi createSession + createDockTask；节点只存 Task ID + 摘要
 * - 状态展示：useAgentTask；写回由画布级 refreshAgentTaskNodes 负责（不依赖本面板挂载）
 * - 查看结果：openDock({ activeTaskId }) 打开 Dock 时间线
 * - 无 Agent 时 EmptyState 引导 Agent Center
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, ExternalLink, Loader2, Play, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel, SelectField, TextArea } from '@/components/ui/form'
import { StatusChip } from '@/features/agents/components/StatusChip'
import {
  errorMessage,
  useAgentTask,
  useAgents,
  useCancelTask,
  type AgentProfile,
} from '@/features/agents/api'
import { createDockTask, createSession } from '@/features/agents/dockApi'
import { useDockStore, newIdempotencyKey } from '@/features/agents/dockStore'
import { isTaskActive, TASK_STATUS_LABELS, taskTone } from '@/features/agents/status'
import {
  agentTaskGuide,
  canSubmitAgentTask,
  contextRefsFromIncomingEdges,
  parseAgentTaskConfig,
  patchAfterTaskSubmit,
} from '@/features/canvas/agentTaskNode'
import { applyAgentTaskToNode } from '@/features/canvas/agentTaskRuntime'
import { useEditorStore } from '@/features/canvas/store'

interface AgentTaskInspectorProps {
  nodeId: string
  config: Record<string, unknown>
  updateConfig: (id: string, patch: Record<string, unknown>) => void
}

export function AgentTaskInspector({ nodeId, config, updateConfig }: AgentTaskInspectorProps) {
  const navigate = useNavigate()
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const agentsQuery = useAgents()
  const agents = useMemo(
    () => (agentsQuery.data ?? []).filter((a) => a.enabled),
    [agentsQuery.data],
  )

  const parsed = parseAgentTaskConfig(config)
  const selectedAgent: AgentProfile | undefined = agents.find((a) => a.id === parsed.agent_profile_id)
  const skillOptions = (selectedAgent?.skill_bindings ?? []).filter((b) => b.enabled)

  const activeTaskId = parsed.active_task_id
  const taskQuery = useAgentTask(activeTaskId)
  const activeTask = taskQuery.data ?? null
  const cancelTask = useCancelTask()
  const runtimeStatus = useEditorStore((s) => s.runtime[nodeId])

  const status = activeTask?.status ?? runtimeStatus ?? null
  const running = submitting || (status != null && isTaskActive(status))
  const guide = agentTaskGuide({ config, agentsAvailable: agents.length })
  const canRun = canSubmitAgentTask({
    config,
    agentsAvailable: agents.length,
    activeTaskStatus: status,
  })

  const openResultInDock = (taskId: string) => {
    const meta = useEditorStore.getState().meta
    const cfg = parseAgentTaskConfig(
      useEditorStore.getState().nodes.find((n) => n.id === nodeId)?.config ?? config,
    )
    useDockStore.getState().openDock({
      source: 'canvas',
      agentId: cfg.agent_profile_id || null,
      skillId: cfg.skill_id,
      projectId: meta?.projectId ?? null,
      canvasId: meta?.id ?? null,
      activeTaskId: taskId,
      sessionId: cfg.session_id,
      message: cfg.instruction,
    })
  }

  const run = async () => {
    setActionError(null)
    if (!canRun || !parsed.agent_profile_id) return
    setSubmitting(true)
    try {
      const meta = useEditorStore.getState().meta
      const editor = useEditorStore.getState()
      const contextRefs = contextRefsFromIncomingEdges({
        nodeId,
        nodes: editor.nodes,
        edges: editor.edges,
      })

      let sessionId = parsed.session_id
      if (!sessionId) {
        const session = await createSession({
          agent_profile_id: parsed.agent_profile_id,
          project_id: meta?.projectId ?? null,
          title: 'Canvas agent-task',
        })
        sessionId = session.id
      }

      const { task } = await createDockTask({
        sessionId,
        agentProfileId: parsed.agent_profile_id,
        message: parsed.instruction.trim(),
        skillId: parsed.skill_id,
        projectId: meta?.projectId ?? null,
        canvasId: meta?.id ?? null,
        contextRefs,
        idempotencyKey: newIdempotencyKey(),
      })

      const patch = patchAfterTaskSubmit({
        config,
        taskId: task.id,
        sessionId,
      })
      updateConfig(nodeId, patch)
      applyAgentTaskToNode(nodeId, task)
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const cancel = async () => {
    if (!activeTaskId || !status || !isTaskActive(status)) return
    setActionError(null)
    try {
      const task = await cancelTask.mutateAsync(activeTaskId)
      applyAgentTaskToNode(nodeId, task)
    } catch (err) {
      setActionError(errorMessage(err))
    }
  }

  if (agentsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-4 text-xs text-text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        加载 Agent…
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="暂无可用 Agent"
        hint={guide.message ?? '请先到 Agent Center 创建 Agent 并绑定 Runtime。'}
        action={
          <Button size="sm" variant="primary" onClick={() => navigate('/agents')}>
            打开 Agent Center
          </Button>
        }
      />
    )
  }

  const resultTaskId = parsed.latest_successful_task_id || parsed.active_task_id
  const history = parsed.task_history.filter((id) => id && id !== activeTaskId).slice(0, 5)

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <FieldLabel>Agent</FieldLabel>
        <SelectField
          value={parsed.agent_profile_id}
          onChange={(e) => {
            // 换 Agent 清空 Skill（绑定集不同）
            updateConfig(nodeId, { agent_profile_id: e.target.value, skill_id: null })
          }}
        >
          <option value="">选择 Agent…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {!a.runtime_profile.enabled ? '（Runtime 停用）' : ''}
            </option>
          ))}
        </SelectField>
      </label>

      <label className="flex flex-col gap-1">
        <FieldLabel>Skill（可选）</FieldLabel>
        <SelectField
          value={parsed.skill_id ?? ''}
          disabled={!parsed.agent_profile_id}
          onChange={(e) => updateConfig(nodeId, { skill_id: e.target.value || null })}
        >
          <option value="">不指定 Skill</option>
          {skillOptions.map((b) => (
            <option key={b.skill_id} value={b.skill_id}>
              {b.skill.name}
            </option>
          ))}
        </SelectField>
        {parsed.agent_profile_id && skillOptions.length === 0 && (
          <span className="text-[10px] text-text-faint">
            该 Agent 尚未绑定 Skill，可到 Agent Center 绑定。
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <FieldLabel>任务说明</FieldLabel>
        <TextArea
          rows={3}
          placeholder="描述要 Agent 完成的任务…"
          value={parsed.instruction}
          onChange={(e) => updateConfig(nodeId, { instruction: e.target.value })}
        />
      </label>

      {guide.kind === 'missing-agent' || guide.kind === 'missing-instruction' ? (
        <p className="text-[11px] text-text-faint">{guide.message}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={!canRun || running} onClick={() => void run()}>
          {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />}
          {running && status ? TASK_STATUS_LABELS[status] ?? status : '执行'}
        </Button>
        {running && activeTaskId && (
          <Button variant="default" size="sm" disabled={cancelTask.isPending} onClick={() => void cancel()}>
            <XCircle size={13} aria-hidden />
            取消
          </Button>
        )}
        {resultTaskId && (
          <Button variant="ghost" size="sm" onClick={() => openResultInDock(resultTaskId)}>
            <ExternalLink size={13} aria-hidden />
            查看结果
          </Button>
        )}
      </div>

      {(activeTaskId || parsed.result_summary) && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-bg px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {status && (
              <StatusChip label={TASK_STATUS_LABELS[status] ?? status} tone={taskTone(status)} />
            )}
            {activeTaskId && (
              <button
                type="button"
                className="truncate font-mono text-[10px] text-accent hover:underline"
                onClick={() => openResultInDock(activeTaskId)}
                title="在 Dock 中打开"
              >
                {activeTaskId}
              </button>
            )}
          </div>
          {parsed.result_summary && (
            <p className="line-clamp-3 text-[11px] leading-relaxed text-text-muted">{parsed.result_summary}</p>
          )}
          {activeTask?.error?.message && (
            <p className="text-[11px] text-danger">{activeTask.error.message}</p>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="flex flex-col gap-1">
          <FieldLabel>历史 Task</FieldLabel>
          <ul className="flex flex-col gap-0.5">
            {history.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className="font-mono text-[10px] text-text-faint hover:text-accent hover:underline"
                  onClick={() => openResultInDock(id)}
                >
                  {id}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actionError && <p className="text-[11px] text-danger">{actionError}</p>}

      <p className="text-[10px] leading-relaxed text-text-faint">
        输入端口连接的素材/节点会作为上下文提交。节点只保存 Task ID 与摘要，完整日志在 Dock / Agent Center。
      </p>
    </div>
  )
}
