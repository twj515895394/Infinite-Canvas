/**
 * Agent Dock 执行面 API（切片 22 F14）。
 * Session 创建 → Task 提交（含 context）→ events 轮询 → 结果保存 Artifact/资产库。
 * 时间戳 Epoch 毫秒；幂等走 idempotency_key。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch } from '@/core/api/client'
import {
  errorMessage,
  isTaskActive,
  normalizeTask,
  taskKeys,
  type AgentTask,
} from '@/features/agents/api'
import { toSelectionRefs, type DockContextRef } from '@/features/agents/dockStore'
import { ingestUpload } from '@/features/assets/api'

// ---------- Session ----------

export interface AgentSession {
  id: string
  project_id: string | null
  agent_profile_id: string
  agent_profile: { id: string; name: string; slug: string }
  title: string
  status: string
  created_at: number
  updated_at: number
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export function normalizeSession(raw: unknown): AgentSession {
  const obj = asRecord(raw)
  const agent = asRecord(obj.agent_profile)
  return {
    id: asString(obj.id),
    project_id: asNullableString(obj.project_id),
    agent_profile_id: asString(obj.agent_profile_id),
    agent_profile: {
      id: asString(agent.id, asString(obj.agent_profile_id)),
      name: asString(agent.name, 'Agent'),
      slug: asString(agent.slug),
    },
    title: asString(obj.title),
    status: asString(obj.status, 'ready'),
    created_at: asNumber(obj.created_at),
    updated_at: asNumber(obj.updated_at),
  }
}

export async function createSession(payload: {
  agent_profile_id: string
  project_id?: string | null
  title?: string
}): Promise<AgentSession> {
  const res = await api.post<{ session: unknown }>('/api/v2/agent-sessions', {
    agent_profile_id: payload.agent_profile_id,
    project_id: payload.project_id ?? null,
    title: payload.title ?? 'Agent Dock',
  })
  return normalizeSession(res.session)
}

// ---------- Task create ----------

export interface CreateDockTaskInput {
  sessionId: string
  agentProfileId: string
  message: string
  skillId?: string | null
  projectId?: string | null
  contextRefs: DockContextRef[]
  canvasId?: string | null
  idempotencyKey: string
}

/** 组装 Task 创建 body（纯函数，便于单测）。 */
export function buildTaskCreateBody(input: CreateDockTaskInput): Record<string, unknown> {
  const selection_refs = toSelectionRefs(input.contextRefs)
  // 画布打开时附带 canvas 引用（若尚未在 chips 中）
  if (input.canvasId && !selection_refs.some((r) => r.reference_type === 'canvas' && r.reference_id === input.canvasId)) {
    selection_refs.push({
      reference_type: 'canvas',
      reference_id: input.canvasId,
      title: '当前画布',
      required: false,
    })
  }
  const attachment_asset_version_ids = input.contextRefs
    .filter((r) => r.reference_type === 'asset' && r.version_ref)
    .map((r) => r.version_ref as string)

  return {
    agent_profile_id: input.agentProfileId,
    skill_id: input.skillId || null,
    message: input.message,
    context: {
      project_id: input.projectId ?? null,
      selection_refs,
      attachment_asset_version_ids,
      policy_overrides: {},
    },
    output_policy: {
      mode: 'message-only',
      require_preview_before_write: true,
    },
    idempotency_key: input.idempotencyKey,
  }
}

export async function createDockTask(input: CreateDockTaskInput): Promise<{ task: AgentTask; reused: boolean }> {
  const body = buildTaskCreateBody(input)
  const res = await apiFetch<{ task: unknown; reused?: boolean }>(
    `/api/v2/agent-sessions/${input.sessionId}/tasks`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 60_000,
    },
  )
  return {
    task: normalizeTask(res.task),
    reused: Boolean(res.reused),
  }
}

export function useCreateDockTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createDockTask,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

// ---------- Events 轮询 ----------

export interface TaskEventItem {
  sequence: number
  event_type: string
  role: string | null
  content: string | null
  created_at: number
}

export interface TaskEventsPage {
  task_id: string
  status: string
  events: TaskEventItem[]
  next_cursor: number
  run: {
    id: string
    status: string
    result_summary: string | null
    error: { code?: string; message?: string } | null
  } | null
}

export function normalizeTaskEvent(raw: unknown): TaskEventItem | null {
  const obj = asRecord(raw)
  const sequence = asNumber(obj.sequence, -1)
  if (sequence < 0) return null
  return {
    sequence,
    event_type: asString(obj.event_type, 'message'),
    role: asNullableString(obj.role),
    content: asNullableString(obj.content),
    created_at: asNumber(obj.created_at),
  }
}

export function normalizeEventsPage(raw: unknown): TaskEventsPage {
  const obj = asRecord(raw)
  const events = Array.isArray(obj.events)
    ? obj.events.map(normalizeTaskEvent).filter((e): e is TaskEventItem => e != null)
    : []
  const runRaw = obj.run
  let run: TaskEventsPage['run'] = null
  if (runRaw && typeof runRaw === 'object') {
    const r = runRaw as Record<string, unknown>
    const err = r.error && typeof r.error === 'object' ? (r.error as Record<string, unknown>) : null
    run = {
      id: asString(r.id),
      status: asString(r.status),
      result_summary: asNullableString(r.result_summary),
      error: err
        ? {
            code: typeof err.code === 'string' ? err.code : undefined,
            message: typeof err.message === 'string' ? err.message : undefined,
          }
        : null,
    }
  }
  return {
    task_id: asString(obj.task_id),
    status: asString(obj.status, 'queued'),
    events,
    next_cursor: asNumber(obj.next_cursor),
    run,
  }
}

/**
 * 累积轮询：维护 cursor，把新 events 追加到本地列表。
 * queryFn 每次拉增量；select 由组件侧 useEffect 合并（避免 TQ 缓存丢增量）。
 */
export function useTaskEvents(taskId: string | null, cursor: number) {
  return useQuery({
    queryKey: ['agent-task-events', taskId, cursor] as const,
    enabled: Boolean(taskId),
    queryFn: async () => {
      const res = await api.get<unknown>(
        `/api/v2/agent-tasks/${taskId}/events?cursor=${encodeURIComponent(String(cursor))}`,
      )
      return normalizeEventsPage(res)
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && isTaskActive(status) ? 1500 : false
    },
  })
}

// ---------- 结果保存 ----------

export type SaveArtifactFormat = 'text' | 'json'

/** 从 Task / events 提取可保存的结果文本。 */
export function extractResultText(opts: {
  task?: AgentTask | null
  events?: TaskEventItem[]
}): string {
  const fromRun = opts.task?.latest_run?.result_summary
  if (fromRun && fromRun.trim()) return fromRun.trim()

  // 取最后一条 assistant 消息
  const events = opts.events ?? []
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]
    if ((e.role === 'assistant' || e.event_type === 'message-completed') && e.content?.trim()) {
      return e.content.trim()
    }
  }
  if (opts.task?.message) return opts.task.message
  return ''
}

/** 结果 → File（text/plain 或 application/json），供 multipart ingest。 */
export function resultToFile(
  text: string,
  format: SaveArtifactFormat,
  basename = 'agent-result',
): File {
  if (format === 'json') {
    let body = text
    try {
      body = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      body = JSON.stringify({ text }, null, 2)
    }
    return new File([body], `${basename}.json`, { type: 'application/json' })
  }
  return new File([text], `${basename}.txt`, { type: 'text/plain' })
}

/** 保存结果为资产（document）；成功返回 asset id 列表。 */
export async function saveResultToLibrary(opts: {
  text: string
  format: SaveArtifactFormat
  tags?: string[]
  basename?: string
}): Promise<{ assetIds: string[]; error?: string }> {
  const file = resultToFile(opts.text, opts.format, opts.basename ?? 'agent-result')
  try {
    const handle = ingestUpload([file], { tags: opts.tags ?? ['agent-artifact'] })
    const result = await handle.promise
    const ids = result.assets.map((a) => a.id).filter(Boolean)
    if (ids.length === 0) {
      const firstErr = result.failures[0]
      return { assetIds: [], error: firstErr?.detail || firstErr?.title || '保存失败' }
    }
    return { assetIds: ids }
  } catch (err) {
    return { assetIds: [], error: errorMessage(err, '保存到资产库失败') }
  }
}

/** 下载结果为本地文件（不经后端 Artifact API；MVP 文本/JSON Artifact 入口）。 */
export function downloadResultFile(text: string, format: SaveArtifactFormat, basename = 'agent-result'): void {
  const file = resultToFile(text, format, basename)
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
