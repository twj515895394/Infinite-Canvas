/**
 * agent-task 节点画布级状态同步（F15 review 修复）。
 * 不依赖 Inspector 挂载：扫描 nodes 中带 active_task_id 的 agent-task，
 * 轮询远端 Task → setRuntime + 写回 latest/summary/history。
 */
import { getAgentTask, type AgentTask } from '@/features/agents/api'
import { extractResultText } from '@/features/agents/dockApi'
import { isTaskActive } from '@/features/agents/status'
import {
  parseAgentTaskConfig,
  patchAfterTaskStatus,
} from '@/features/canvas/agentTaskNode'
import { useEditorStore } from '@/features/canvas/store'

/** 将 Task 状态投影到节点（runtime chip + config 引用）；值未变则跳过。 */
export function applyAgentTaskToNode(nodeId: string, task: AgentTask): void {
  const editor = useEditorStore.getState()
  editor.setRuntime(nodeId, task.status)

  const node = editor.nodes.find((n) => n.id === nodeId)
  if (!node) return

  const current = parseAgentTaskConfig(node.config)
  let resultSummary: string | null = null
  if (task.status === 'succeeded') {
    const text = extractResultText({ task })
    resultSummary = text ? text.slice(0, 500) : '任务已完成'
  }

  const patch = patchAfterTaskStatus({
    config: node.config,
    taskId: task.id,
    status: task.status,
    resultSummary,
  })
  if (Object.keys(patch).length === 0) return

  const nextSummary =
    patch.result_summary !== undefined ? (patch.result_summary as string | null) : current.result_summary
  const nextLatest =
    patch.latest_successful_task_id !== undefined
      ? (patch.latest_successful_task_id as string | null)
      : current.latest_successful_task_id
  const nextHistory = Array.isArray(patch.task_history)
    ? patch.task_history.filter((v): v is string => typeof v === 'string')
    : current.task_history
  const historySame =
    nextHistory.length === current.task_history.length &&
    nextHistory.every((id, i) => id === current.task_history[i])

  if (
    nextSummary === current.result_summary &&
    nextLatest === current.latest_successful_task_id &&
    historySame
  ) {
    return
  }

  useEditorStore.setState((s) => ({
    nodes: s.nodes.map((n) =>
      n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n,
    ),
    dirty: true,
  }))
}

/**
 * 刷新画布上所有可能仍活跃的 agent-task 节点。
 * 终态节点每轮仍会 GET 一次直到 config 已吸收终态（latest/history）；
 * 为减流量：若 runtime 已是终态且 config 已有对应 latest/history，则跳过。
 */
export async function refreshAgentTaskNodes(): Promise<void> {
  const { nodes, runtime } = useEditorStore.getState()
  const targets = nodes.filter((n) => {
    if (n.type !== 'agent-task') return false
    const cfg = parseAgentTaskConfig(n.config)
    if (!cfg.active_task_id) return false
    const rt = runtime[n.id]
    // runtime 未知或仍活跃 → 必须拉
    if (!rt || isTaskActive(rt)) return true
    // 终态但摘要/历史未落盘（如 Inspector 未挂载时成功）→ 再拉一次
    if (rt === 'succeeded' && cfg.latest_successful_task_id !== cfg.active_task_id) return true
    if ((rt === 'failed' || rt === 'cancelled') && !cfg.task_history.includes(cfg.active_task_id)) return true
    return false
  })

  await Promise.all(
    targets.map(async (n) => {
      const cfg = parseAgentTaskConfig(n.config)
      const taskId = cfg.active_task_id
      if (!taskId) return
      try {
        const task = await getAgentTask(taskId)
        applyAgentTaskToNode(n.id, task)
      } catch {
        // 瞬时错误下轮重试；不把节点打成 failed（与 generation 404 特例区分，agent 任务保留）
      }
    }),
  )
}

/** 画布是否存在需要轮询的 agent-task。 */
export function hasPollableAgentTaskNodes(): boolean {
  const { nodes, runtime } = useEditorStore.getState()
  return nodes.some((n) => {
    if (n.type !== 'agent-task') return false
    const cfg = parseAgentTaskConfig(n.config)
    if (!cfg.active_task_id) return false
    const rt = runtime[n.id]
    if (!rt || isTaskActive(rt)) return true
    if (rt === 'succeeded' && cfg.latest_successful_task_id !== cfg.active_task_id) return true
    if ((rt === 'failed' || rt === 'cancelled') && !cfg.task_history.includes(cfg.active_task_id)) return true
    return false
  })
}
