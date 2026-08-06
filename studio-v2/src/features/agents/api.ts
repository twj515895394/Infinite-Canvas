/**
 * Agent Center Feature API 层（切片 20 F13）。
 * 契约：docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md + handoff §4/§6
 * - 时间戳 Epoch 毫秒直出，展示层 formatDate；禁引入 ISO 解析。
 * - 供应商/Runtime 字段不扩散到通用组件——组件只消费本层稳定 DTO。
 * - Skill ZIP import 用 FormData（字段 file），不走 JSON Content-Type。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch } from '@/core/api/client'
import { isTaskActive } from '@/features/agents/status'

// 展示常量从 status.ts 再导出，保持既有 import 路径兼容
export {
  ADAPTER_LABELS,
  RUNTIME_STATUS_LABELS,
  AGENT_STATUS_LABELS,
  SKILL_STATUS_LABELS,
  TASK_STATUS_LABELS,
  ACTIVE_TASK_STATUSES,
  isTaskActive,
  formatValidationResult,
} from '@/features/agents/status'

// ---------- 枚举 / 联合类型（对齐后端 agent_schema） ----------

export const ADAPTER_TYPES = ['cli-stdio', 'cli-jsonl', 'acp', 'http', 'embedded-tool'] as const
export type AdapterType = (typeof ADAPTER_TYPES)[number]

export type RuntimeStatus =
  | 'unknown'
  | 'probing'
  | 'ready'
  | 'unavailable'
  | 'auth-required'
  | 'incompatible'
  | 'disabled'

export type AgentProfileStatus = 'draft' | 'ready' | 'disabled'
export type SkillStatus = 'discovered' | 'imported' | 'broken'

export type AgentTaskStatus =
  | 'draft'
  | 'queued'
  | 'preparing'
  | 'running'
  | 'waiting_permission'
  | 'waiting_input'
  | 'succeeded'
  | 'failed'
  | 'cancel_requested'
  | 'cancelled'

// ---------- DTO ----------

export interface RuntimeProbe {
  id: string
  runtime_profile_id: string
  status: string
  version: string | null
  authenticated: boolean | null
  capabilities: string[]
  models: string[]
  native_skills: string[]
  diagnostics: Record<string, unknown>
  error: { code?: string; message?: string } | null
  started_at: number
  finished_at: number | null
}

export interface RuntimeProfile {
  id: string
  name: string
  adapter_type: AdapterType | string
  enabled: boolean
  status: RuntimeStatus | string
  executable_path: string | null
  endpoint_url: string | null
  default_model: string | null
  capabilities: string[]
  revision: number
  last_probe_at: number | null
  last_probe_error: { code?: string; message?: string } | null
  last_probe?: RuntimeProbe | null
  created_at: number
  updated_at: number
}

export interface RuntimeCreatePayload {
  name: string
  adapter_type: string
  executable_path?: string | null
  endpoint_url?: string | null
  default_model?: string | null
  enabled?: boolean
}

export interface RuntimeUpdatePayload {
  base_revision: number
  name?: string
  default_model?: string | null
  /** 后端 PATCH 当前不支持改 path/endpoint；编辑 UI 仅展示，不提交。 */
  enabled?: boolean
  command_template?: Record<string, unknown>
  config?: Record<string, unknown>
}

export interface RuntimeSummary {
  id: string
  name: string
  adapter_type: string
  enabled: boolean
  status: string
  default_model: string | null
}

export interface SkillSummary {
  id: string
  skill_key: string
  name: string
  description: string
  category: string | null
  enabled: boolean
  status: SkillStatus | string
  active_version: string | null
  binding_count: number
  source_types?: string[]
  compatible_runtime_count?: number
}

export interface SkillVersion {
  id: string
  skill_id: string
  version: string
  validation_status: string
  installed_at: number
  active: boolean
  /** 后端 validation_result_json；issues 数组或 {message} 形状。 */
  validation_result: unknown
}

export interface SkillDetail extends SkillSummary {
  versions: SkillVersion[]
  active_version_id: string | null
}

export interface SkillBinding {
  id: string
  agent_profile_id: string
  skill_id: string
  skill: SkillSummary
  version_constraint: string
  enabled: boolean
  priority: number
  aliases: string[]
  default_inputs: Record<string, unknown>
  created_at: number
  updated_at: number
}

export interface AgentProfile {
  id: string
  name: string
  slug: string
  description: string
  icon: string | null
  enabled: boolean
  status: AgentProfileStatus | string
  runtime_profile: RuntimeSummary
  runtime_profile_id: string
  default_model: string | null
  current_revision: number
  instructions: string
  runtime_config: Record<string, unknown>
  context_policy: Record<string, unknown>
  tool_policy: Record<string, unknown>
  permission_policy: Record<string, unknown>
  output_policy: Record<string, unknown>
  skill_bindings: SkillBinding[]
  created_at: number
  updated_at: number
}

export interface AgentCreatePayload {
  name: string
  description?: string
  runtime_profile_id: string
  default_model?: string | null
  instructions?: string
  enabled?: boolean
}

export interface AgentUpdatePayload {
  base_revision: number
  name?: string
  description?: string
  runtime_profile_id?: string
  default_model?: string | null
  instructions?: string
  enabled?: boolean
}

export interface AgentRun {
  id: string
  task_id: string
  attempt: number
  status: string
  runtime_profile_id: string
  result_summary: string | null
  created_at: number
  started_at: number | null
  finished_at: number | null
  error: { code?: string; message?: string } | null
}

export interface AgentTask {
  id: string
  session_id: string
  project_id: string | null
  agent_profile: { id: string; name: string; slug: string }
  requested_skill: { id: string; skill_key: string; name: string } | null
  message: string
  status: AgentTaskStatus | string
  active_run_id: string | null
  revision: number
  latest_run: AgentRun | null
  created_at: number
  updated_at: number
  finished_at: number | null
  error: { code?: string; message?: string } | null
  runs?: AgentRun[] | null
}

export interface AgentTestResult {
  ok: boolean
  message: string | null
  task: AgentTask
}

export interface SkillTestResult {
  ok: boolean
  skill_id: string
  message?: string
  manifest?: Record<string, unknown>
  instructions_preview?: string
  issues?: { code?: string; message?: string }[]
}

export interface SkillDiscoverResult {
  discovered: { skill_id?: string; skill_key?: string; version?: string; path?: string }[]
  errors: { code?: string; message?: string }[]
  count: number
}

// ---------- 守卫 / 归一化 ----------

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asErrorObj(value: unknown): { code?: string; message?: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  return {
    code: typeof obj.code === 'string' ? obj.code : undefined,
    message: typeof obj.message === 'string' ? obj.message : undefined,
  }
}

export function normalizeProbe(raw: unknown): RuntimeProbe | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = asString(obj.id)
  if (!id) return null
  return {
    id,
    runtime_profile_id: asString(obj.runtime_profile_id),
    status: asString(obj.status, 'unavailable'),
    version: asNullableString(obj.version),
    authenticated: typeof obj.authenticated === 'boolean' ? obj.authenticated : null,
    capabilities: asStringArray(obj.capabilities),
    models: asStringArray(obj.models),
    native_skills: asStringArray(obj.native_skills),
    diagnostics: asRecord(obj.diagnostics),
    error: asErrorObj(obj.error),
    started_at: asNumber(obj.started_at),
    finished_at: asNullableNumber(obj.finished_at),
  }
}

export function normalizeRuntime(raw: unknown): RuntimeProfile {
  const obj = asRecord(raw)
  const probe = obj.last_probe != null ? normalizeProbe(obj.last_probe) : null
  return {
    id: asString(obj.id),
    name: asString(obj.name, '未命名 Runtime'),
    adapter_type: asString(obj.adapter_type, 'cli-stdio'),
    enabled: asBoolean(obj.enabled, true),
    status: asString(obj.status, 'unknown'),
    executable_path: asNullableString(obj.executable_path),
    endpoint_url: asNullableString(obj.endpoint_url),
    default_model: asNullableString(obj.default_model),
    capabilities: asStringArray(obj.capabilities),
    revision: asNumber(obj.revision, 1),
    last_probe_at: asNullableNumber(obj.last_probe_at),
    last_probe_error: asErrorObj(obj.last_probe_error),
    last_probe: probe,
    created_at: asNumber(obj.created_at),
    updated_at: asNumber(obj.updated_at),
  }
}

function normalizeRuntimeSummary(raw: unknown): RuntimeSummary {
  const obj = asRecord(raw)
  return {
    id: asString(obj.id),
    name: asString(obj.name, '未知 Runtime'),
    adapter_type: asString(obj.adapter_type, 'unknown'),
    enabled: asBoolean(obj.enabled),
    status: asString(obj.status, 'unknown'),
    default_model: asNullableString(obj.default_model),
  }
}

export function normalizeSkill(raw: unknown): SkillSummary {
  const obj = asRecord(raw)
  return {
    id: asString(obj.id),
    skill_key: asString(obj.skill_key),
    name: asString(obj.name, '未命名 Skill'),
    description: asString(obj.description),
    category: asNullableString(obj.category),
    enabled: asBoolean(obj.enabled, true),
    status: asString(obj.status, 'discovered'),
    active_version: asNullableString(obj.active_version),
    binding_count: asNumber(obj.binding_count),
    source_types: asStringArray(obj.source_types),
    compatible_runtime_count: asNullableNumber(obj.compatible_runtime_count) ?? undefined,
  }
}

function normalizeSkillVersion(raw: unknown): SkillVersion | null {
  const obj = asRecord(raw)
  const id = asString(obj.id)
  if (!id) return null
  return {
    id,
    skill_id: asString(obj.skill_id),
    version: asString(obj.version),
    validation_status: asString(obj.validation_status, 'pending'),
    installed_at: asNumber(obj.installed_at),
    active: asBoolean(obj.active),
    validation_result: obj.validation_result ?? null,
  }
}

export function normalizeSkillDetail(raw: unknown): SkillDetail {
  const base = normalizeSkill(raw)
  const obj = asRecord(raw)
  const versions = Array.isArray(obj.versions)
    ? obj.versions.map(normalizeSkillVersion).filter((v): v is SkillVersion => v != null)
    : []
  return {
    ...base,
    versions,
    active_version_id: asNullableString(obj.active_version_id),
  }
}

function normalizeBinding(raw: unknown): SkillBinding | null {
  const obj = asRecord(raw)
  const id = asString(obj.id)
  if (!id) return null
  return {
    id,
    agent_profile_id: asString(obj.agent_profile_id),
    skill_id: asString(obj.skill_id),
    skill: normalizeSkill(obj.skill ?? { id: obj.skill_id }),
    version_constraint: asString(obj.version_constraint, '*'),
    enabled: asBoolean(obj.enabled, true),
    priority: asNumber(obj.priority, 100),
    aliases: asStringArray(obj.aliases),
    default_inputs: asRecord(obj.default_inputs),
    created_at: asNumber(obj.created_at),
    updated_at: asNumber(obj.updated_at),
  }
}

export function normalizeAgent(raw: unknown): AgentProfile {
  const obj = asRecord(raw)
  const bindings = Array.isArray(obj.skill_bindings)
    ? obj.skill_bindings.map(normalizeBinding).filter((b): b is SkillBinding => b != null)
    : []
  return {
    id: asString(obj.id),
    name: asString(obj.name, '未命名 Agent'),
    slug: asString(obj.slug),
    description: asString(obj.description),
    icon: asNullableString(obj.icon),
    enabled: asBoolean(obj.enabled, true),
    status: asString(obj.status, 'draft'),
    runtime_profile: normalizeRuntimeSummary(obj.runtime_profile ?? { id: obj.runtime_profile_id }),
    runtime_profile_id: asString(obj.runtime_profile_id),
    default_model: asNullableString(obj.default_model),
    current_revision: asNumber(obj.current_revision, 1),
    instructions: asString(obj.instructions),
    runtime_config: asRecord(obj.runtime_config),
    context_policy: asRecord(obj.context_policy),
    tool_policy: asRecord(obj.tool_policy),
    permission_policy: asRecord(obj.permission_policy),
    output_policy: asRecord(obj.output_policy),
    skill_bindings: bindings,
    created_at: asNumber(obj.created_at),
    updated_at: asNumber(obj.updated_at),
  }
}

function normalizeRun(raw: unknown): AgentRun | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = asString(obj.id)
  if (!id) return null
  return {
    id,
    task_id: asString(obj.task_id),
    attempt: asNumber(obj.attempt, 1),
    status: asString(obj.status, 'queued'),
    runtime_profile_id: asString(obj.runtime_profile_id),
    result_summary: asNullableString(obj.result_summary),
    created_at: asNumber(obj.created_at),
    started_at: asNullableNumber(obj.started_at),
    finished_at: asNullableNumber(obj.finished_at),
    error: asErrorObj(obj.error),
  }
}

export function normalizeTask(raw: unknown): AgentTask {
  const obj = asRecord(raw)
  const agentRaw = asRecord(obj.agent_profile)
  const skillRaw = obj.requested_skill
  let requested_skill: AgentTask['requested_skill'] = null
  if (skillRaw && typeof skillRaw === 'object') {
    const s = skillRaw as Record<string, unknown>
    requested_skill = {
      id: asString(s.id),
      skill_key: asString(s.skill_key),
      name: asString(s.name),
    }
  }
  const runs = Array.isArray(obj.runs)
    ? obj.runs.map(normalizeRun).filter((r): r is AgentRun => r != null)
    : null
  return {
    id: asString(obj.id),
    session_id: asString(obj.session_id),
    project_id: asNullableString(obj.project_id),
    agent_profile: {
      id: asString(agentRaw.id),
      name: asString(agentRaw.name, '未知 Agent'),
      slug: asString(agentRaw.slug),
    },
    requested_skill,
    message: asString(obj.message),
    status: asString(obj.status, 'queued'),
    active_run_id: asNullableString(obj.active_run_id),
    revision: asNumber(obj.revision, 1),
    latest_run: normalizeRun(obj.latest_run),
    created_at: asNumber(obj.created_at),
    updated_at: asNumber(obj.updated_at),
    finished_at: asNullableNumber(obj.finished_at),
    error: asErrorObj(obj.error),
    runs,
  }
}

/** 时间戳 → 本地「YYYY-MM-DD HH:mm」（与 assets formatDate 同约定）。 */
export function formatDate(ts: number | null | undefined): string {
  const value = asNullableNumber(ts) ?? 0
  if (value <= 0) return ''
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 兼容既有 `from '@/features/agents/api'` 调用方；实现见 `@/core/api/errors`。 */
export { errorMessage } from '@/core/api/errors'

// ---------- Query Keys ----------

export const runtimeKeys = {
  all: ['agent-runtimes'] as const,
  detail: (id: string) => ['agent-runtimes', id] as const,
}

export const agentKeys = {
  all: ['agent-profiles'] as const,
  detail: (id: string) => ['agent-profiles', id] as const,
}

export const skillKeys = {
  all: ['skills'] as const,
  detail: (id: string) => ['skills', id] as const,
  versions: (id: string) => ['skills', id, 'versions'] as const,
}

export const taskKeys = {
  all: ['agent-tasks'] as const,
  list: (status?: string) => ['agent-tasks', { status: status ?? '' }] as const,
  detail: (id: string) => ['agent-tasks', id] as const,
}

// ---------- Runtimes ----------

export function useRuntimes() {
  return useQuery({
    queryKey: runtimeKeys.all,
    queryFn: async () => {
      const res = await api.get<{ items: unknown[] }>('/api/v2/agent-runtimes')
      return (res.items ?? []).map(normalizeRuntime)
    },
  })
}

export function useCreateRuntime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RuntimeCreatePayload) => {
      const res = await api.post<{ runtime: unknown }>('/api/v2/agent-runtimes', payload)
      return normalizeRuntime(res.runtime)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: runtimeKeys.all }),
  })
}

export function useUpdateRuntime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: RuntimeUpdatePayload }) => {
      const res = await api.patch<{ runtime: unknown }>(`/api/v2/agent-runtimes/${id}`, payload)
      return normalizeRuntime(res.runtime)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: runtimeKeys.all }),
  })
}

export function useDeleteRuntime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v2/agent-runtimes/${id}`)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: runtimeKeys.all }),
  })
}

export function useProbeRuntime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ probe: unknown }>(`/api/v2/agent-runtimes/${id}/probe`)
      return normalizeProbe(res.probe)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: runtimeKeys.all }),
  })
}

// ---------- Agents ----------

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.all,
    queryFn: async () => {
      const res = await api.get<{ items: unknown[] }>('/api/v2/agent-profiles')
      return (res.items ?? []).map(normalizeAgent)
    },
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: AgentCreatePayload) => {
      const res = await api.post<{ agent: unknown }>('/api/v2/agent-profiles', payload)
      return normalizeAgent(res.agent)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: agentKeys.all }),
  })
}

export function useUpdateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: AgentUpdatePayload }) => {
      const res = await api.patch<{ agent: unknown }>(`/api/v2/agent-profiles/${id}`, payload)
      return normalizeAgent(res.agent)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: agentKeys.all }),
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v2/agent-profiles/${id}`)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: agentKeys.all }),
  })
}

export function useDuplicateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ agent: unknown }>(`/api/v2/agent-profiles/${id}/duplicate`)
      return normalizeAgent(res.agent)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: agentKeys.all }),
  })
}

export function useTestAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, message, skill_id }: { id: string; message?: string; skill_id?: string }) => {
      // 同步驱动 Task 到终态，Codex CLI 可能超过默认 30s
      const res = await apiFetch<{ ok: boolean; message?: string | null; task: unknown }>(
        `/api/v2/agent-profiles/${id}/test`,
        {
          method: 'POST',
          body: JSON.stringify({ message: message ?? '你好，请简短自我介绍。', skill_id }),
          timeoutMs: 120_000,
        },
      )
      return {
        ok: Boolean(res.ok),
        message: res.message ?? null,
        task: normalizeTask(res.task),
      } satisfies AgentTestResult
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskKeys.all })
      void qc.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}

export function useBindSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ agentId, skillId }: { agentId: string; skillId: string }) => {
      const res = await api.post<{ binding: unknown }>(`/api/v2/agent-profiles/${agentId}/skills`, {
        skill_id: skillId,
      })
      return normalizeBinding(res.binding)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentKeys.all })
      void qc.invalidateQueries({ queryKey: skillKeys.all })
    },
  })
}

export function useUnbindSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ agentId, bindingId }: { agentId: string; bindingId: string }) => {
      await api.delete(`/api/v2/agent-profiles/${agentId}/skills/${bindingId}`)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentKeys.all })
      void qc.invalidateQueries({ queryKey: skillKeys.all })
    },
  })
}

// ---------- Skills ----------

export function useSkills() {
  return useQuery({
    queryKey: skillKeys.all,
    queryFn: async () => {
      const res = await api.get<{ items: unknown[] }>('/api/v2/skills')
      return (res.items ?? []).map(normalizeSkill)
    },
  })
}

export function useSkillDetail(skillId: string | null) {
  return useQuery({
    queryKey: skillKeys.detail(skillId ?? ''),
    enabled: Boolean(skillId),
    queryFn: async () => {
      const res = await api.get<{ skill: unknown }>(`/api/v2/skills/${skillId}`)
      return normalizeSkillDetail(res.skill)
    },
  })
}

export function useDiscoverSkills() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<SkillDiscoverResult>('/api/v2/skills/discover')
      return {
        discovered: Array.isArray(res.discovered) ? res.discovered : [],
        errors: Array.isArray(res.errors) ? res.errors : [],
        count: asNumber(res.count),
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: skillKeys.all }),
  })
}

/** ZIP multipart（字段 file）或本地 path 导入。 */
export async function importSkill(options: {
  file?: File
  path?: string
  projectId?: string
  activate?: boolean
}): Promise<{ skill: SkillSummary; version_id: string; version: string }> {
  const form = new FormData()
  if (options.file) form.append('file', options.file)
  if (options.path) form.append('path', options.path)
  if (options.projectId) form.append('project_id', options.projectId)
  if (options.activate != null) form.append('activate', String(options.activate))

  // 不设 Content-Type，让浏览器带 multipart boundary
  const res = await apiFetch<{ skill: unknown; version_id: string; version: string }>(
    '/api/v2/skills/import',
    { method: 'POST', body: form, headers: {} },
  )
  return {
    skill: normalizeSkill(res.skill),
    version_id: asString(res.version_id),
    version: asString(res.version),
  }
}

export function useImportSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: importSkill,
    onSuccess: () => void qc.invalidateQueries({ queryKey: skillKeys.all }),
  })
}

export function useEnableSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ skill: unknown }>(`/api/v2/skills/${id}/enable`)
      return normalizeSkill(res.skill)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: skillKeys.all }),
  })
}

export function useDisableSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ skill: unknown }>(`/api/v2/skills/${id}/disable`)
      return normalizeSkill(res.skill)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: skillKeys.all }),
  })
}

export function useValidateSkill() {
  return useMutation({
    mutationFn: async (id: string) => {
      return api.post<{ skill_id: string; ok: boolean; issues: { code?: string; message?: string }[] }>(
        `/api/v2/skills/${id}/validate`,
      )
    },
  })
}

export function useTestSkill() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<SkillTestResult>(`/api/v2/skills/${id}/test`)
      return res
    },
  })
}

export function useActivateSkillVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ skillId, versionId }: { skillId: string; versionId: string }) => {
      const res = await api.post<{ skill: unknown }>(`/api/v2/skills/${skillId}/versions/${versionId}/activate`)
      return normalizeSkill(res.skill)
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: skillKeys.all })
      void qc.invalidateQueries({ queryKey: skillKeys.detail(vars.skillId) })
    },
  })
}

// ---------- Tasks ----------

export function useAgentTasks(status?: string) {
  return useQuery({
    queryKey: taskKeys.list(status),
    queryFn: async () => {
      const qs = status ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100'
      const res = await api.get<{ items: unknown[]; total: number }>(`/api/v2/agent-tasks${qs}`)
      return {
        items: (res.items ?? []).map(normalizeTask),
        total: asNumber(res.total),
      }
    },
    // 有活跃任务时 2s 轮询（对齐 TaskShelf 模式）
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? []
      return items.some((t) => isTaskActive(t.status)) ? 2000 : false
    },
  })
}

export async function getAgentTask(taskId: string): Promise<AgentTask> {
  const res = await api.get<{ task: unknown }>(`/api/v2/agent-tasks/${encodeURIComponent(taskId)}`)
  return normalizeTask(res.task)
}

export function useAgentTask(taskId: string | null) {
  return useQuery({
    queryKey: taskKeys.detail(taskId ?? ''),
    enabled: Boolean(taskId),
    queryFn: () => getAgentTask(taskId as string),
    refetchInterval: (query) => {
      const task = query.state.data
      return task && isTaskActive(task.status) ? 2000 : false
    },
  })
}

export function useCancelTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ task: unknown }>(`/api/v2/agent-tasks/${id}/cancel`)
      return normalizeTask(res.task)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: taskKeys.all }),
  })
}

export function useRetryTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ task: unknown }>(`/api/v2/agent-tasks/${id}/retry`, {
        mode: 'original-context',
      })
      return normalizeTask(res.task)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: taskKeys.all }),
  })
}
