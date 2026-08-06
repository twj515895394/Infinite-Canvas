/**
 * agent-task 节点纯函数（切片 23 F15）。
 * 节点只存 Task ID + 最新结果引用，不塞 messages/steps 全文。
 * 执行路径复用 dockApi.createSession / createDockTask。
 */
import type { DockContextRef } from '@/features/agents/dockStore'
import { nodeToContextRef } from '@/features/agents/dockStore'
import { isTaskActive } from '@/features/agents/status'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/ports'

/** 节点 config 形状（snake_case，与画布其他节点一致）。 */
export interface AgentTaskNodeConfig {
  agent_profile_id: string
  skill_id: string | null
  /** 提交给 Agent 的任务说明（message）。 */
  instruction: string
  /** 当前活动 Task（运行中或最近一次提交）。 */
  active_task_id: string | null
  /** 最近一次成功 Task。 */
  latest_successful_task_id: string | null
  /** 可选 Session 复用。 */
  session_id: string | null
  /** 成功时的结果摘要（短文本，非完整日志）。 */
  result_summary: string | null
  /**
   * 历史 Task ID（重跑时把旧 active 推进这里；有界，最近优先）。
   * 不含完整日志。
   */
  task_history: string[]
}

export const AGENT_TASK_HISTORY_LIMIT = 20

const EMPTY: AgentTaskNodeConfig = {
  agent_profile_id: '',
  skill_id: null,
  instruction: '',
  active_task_id: null,
  latest_successful_task_id: null,
  session_id: null,
  result_summary: null,
  task_history: [],
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0)
}

/** 从任意 config 收窄为 AgentTaskNodeConfig（缺字段安全默认）。 */
export function parseAgentTaskConfig(config: Record<string, unknown> | null | undefined): AgentTaskNodeConfig {
  const c = config ?? {}
  return {
    agent_profile_id: asString(c.agent_profile_id),
    skill_id: asNullableString(c.skill_id),
    instruction: asString(c.instruction ?? c.message),
    active_task_id: asNullableString(c.active_task_id),
    latest_successful_task_id: asNullableString(c.latest_successful_task_id),
    session_id: asNullableString(c.session_id),
    result_summary: asNullableString(c.result_summary),
    task_history: asStringArray(c.task_history),
  }
}

/** 配置校验（Registry validate + Inspector 共用）。 */
export function validateAgentTaskConfig(config: Record<string, unknown>): string | null {
  const parsed = parseAgentTaskConfig(config)
  if (!parsed.agent_profile_id.trim()) return '请选择 Agent'
  if (!parsed.instruction.trim()) return '请输入任务说明'
  return null
}

export type AgentTaskGuideKind = 'no-agents' | 'no-skills' | 'missing-agent' | 'missing-instruction' | null

/**
 * 无可用 Agent/Skill 或配置不全时的引导类型。
 * agents/skills 传「当前可用」列表（enabled）；空列表 → 引导去 Agent Center。
 */
export function agentTaskGuide(opts: {
  config: Record<string, unknown>
  agentsAvailable: number
  /** Skill 可选；0 不阻塞执行，仅提示可安装。 */
  skillsAvailable?: number
}): { kind: AgentTaskGuideKind; message: string | null } {
  const { agentsAvailable, skillsAvailable } = opts
  if (agentsAvailable <= 0) {
    return {
      kind: 'no-agents',
      message: '暂无可用 Agent。请先到 Agent Center 创建 Agent 并绑定 Runtime。',
    }
  }
  const parsed = parseAgentTaskConfig(opts.config)
  if (!parsed.agent_profile_id.trim()) {
    return { kind: 'missing-agent', message: '请选择要执行的 Agent。' }
  }
  if (!parsed.instruction.trim()) {
    return { kind: 'missing-instruction', message: '请输入任务说明后再执行。' }
  }
  if (skillsAvailable === 0) {
    // 不阻塞，仅作轻提示（kind 仍 null，message 可选展示）
    return { kind: null, message: null }
  }
  return { kind: null, message: null }
}

/** 是否可提交执行（有 Agent + 说明，且当前无活动 Task）。 */
export function canSubmitAgentTask(opts: {
  config: Record<string, unknown>
  agentsAvailable: number
  /** 当前 active_task 的远端状态；未知时仅看 config 是否有 active id。 */
  activeTaskStatus?: string | null
}): boolean {
  if (opts.agentsAvailable <= 0) return false
  if (validateAgentTaskConfig(opts.config) != null) return false
  const parsed = parseAgentTaskConfig(opts.config)
  if (!parsed.active_task_id) return true
  if (opts.activeTaskStatus == null) return false
  return !isTaskActive(opts.activeTaskStatus)
}

/** 有界追加历史（新 id 前置，去重，截断）。 */
export function pushTaskHistory(history: string[], taskId: string, limit = AGENT_TASK_HISTORY_LIMIT): string[] {
  const id = taskId.trim()
  if (!id) return history.slice(0, limit)
  const next = [id, ...history.filter((h) => h !== id)]
  return next.slice(0, limit)
}

/**
 * 提交成功后写回节点：新 Task 成为 active；旧 active 进历史。
 * session 一并缓存便于连续跑。
 */
export function patchAfterTaskSubmit(opts: {
  config: Record<string, unknown>
  taskId: string
  sessionId: string
}): Record<string, unknown> {
  const parsed = parseAgentTaskConfig(opts.config)
  let history = parsed.task_history
  if (parsed.active_task_id && parsed.active_task_id !== opts.taskId) {
    history = pushTaskHistory(history, parsed.active_task_id)
  }
  return {
    active_task_id: opts.taskId,
    session_id: opts.sessionId,
    task_history: history,
    // 新任务清空旧摘要，避免误读为上轮输出
    result_summary: null,
  }
}

/**
 * 轮询到状态变化后写回：runtime 投影 + 成功时记 latest + 短摘要。
 * 返回应 merge 进 config 的 patch（可能为空对象）。
 */
export function patchAfterTaskStatus(opts: {
  config: Record<string, unknown>
  taskId: string
  status: string
  resultSummary?: string | null
}): Record<string, unknown> {
  const parsed = parseAgentTaskConfig(opts.config)
  const patch: Record<string, unknown> = {}
  // 仅当 taskId 仍是当前 active 时更新摘要/成功引用，避免旧轮询覆盖新任务
  if (parsed.active_task_id && parsed.active_task_id !== opts.taskId) {
    return patch
  }
  if (opts.status === 'succeeded') {
    patch.latest_successful_task_id = opts.taskId
    if (opts.resultSummary != null && opts.resultSummary !== '') {
      patch.result_summary = opts.resultSummary.slice(0, 500)
    }
    patch.task_history = pushTaskHistory(parsed.task_history, opts.taskId)
  } else if (opts.status === 'failed' || opts.status === 'cancelled') {
    patch.task_history = pushTaskHistory(parsed.task_history, opts.taskId)
  }
  return patch
}

/**
 * 从连入边收集上游节点 → Dock 上下文引用。
 * - 素材节点优先 asset 引用（需 asset_version_id）
 * - 其他节点走 node 引用
 */
export function contextRefsFromIncomingEdges(opts: {
  nodeId: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}): DockContextRef[] {
  const incoming = opts.edges.filter((e) => e.target === opts.nodeId)
  const byId = new Map(opts.nodes.map((n) => [n.id, n]))
  const refs: DockContextRef[] = []
  const seen = new Set<string>()

  for (const edge of incoming) {
    const src = byId.get(edge.source)
    if (!src) continue

    if (src.type === 'asset') {
      const versionId = typeof src.config.asset_version_id === 'string' ? src.config.asset_version_id : ''
      const assetId = typeof src.config.asset_id === 'string' ? src.config.asset_id : src.id
      if (versionId) {
        const key = `asset:${assetId}:${versionId}`
        if (!seen.has(key)) {
          seen.add(key)
          refs.push({
            key,
            reference_type: 'asset',
            reference_id: assetId,
            version_ref: versionId,
            title: String(src.config.name ?? '素材'),
            required: false,
          })
        }
        continue
      }
    }

    const ref = nodeToContextRef({
      id: src.id,
      type: src.type,
      config: src.config,
    })
    if (!seen.has(ref.key)) {
      seen.add(ref.key)
      refs.push(ref)
    }
  }
  return refs
}

/** 节点 Host 副标题：Agent 名或任务摘要。 */
export function agentTaskSubtitle(config: Record<string, unknown>, agentName?: string | null): string {
  const parsed = parseAgentTaskConfig(config)
  if (parsed.result_summary) {
    const s = parsed.result_summary.trim()
    return s.length > 40 ? `${s.slice(0, 40)}…` : s
  }
  if (parsed.active_task_id) return parsed.active_task_id
  if (agentName) return agentName
  if (parsed.instruction.trim()) {
    const s = parsed.instruction.trim()
    return s.length > 40 ? `${s.slice(0, 40)}…` : s
  }
  return '未配置'
}

export const EMPTY_AGENT_TASK_CONFIG = EMPTY
