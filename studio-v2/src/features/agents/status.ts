/**
 * Agent Center 状态展示常量与 tone 映射（F13）。
 * 与组件解耦，避免 StatusChip 文件混出非组件导出触发 fast-refresh 告警。
 */

export const ADAPTER_LABELS: Record<string, string> = {
  'cli-stdio': 'CLI stdio（Codex）',
  'cli-jsonl': 'CLI JSONL',
  acp: 'ACP',
  http: 'HTTP',
  'embedded-tool': '内嵌工具',
}

export const RUNTIME_STATUS_LABELS: Record<string, string> = {
  unknown: '未探测',
  probing: '探测中',
  ready: '就绪',
  unavailable: '不可用',
  'auth-required': '需登录',
  incompatible: '不兼容',
  disabled: '已禁用',
}

export const AGENT_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  ready: '就绪',
  disabled: '已禁用',
}

export const SKILL_STATUS_LABELS: Record<string, string> = {
  discovered: '已发现',
  imported: '已导入',
  broken: '损坏',
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  queued: '排队中',
  preparing: '准备中',
  running: '运行中',
  waiting_permission: '等待权限',
  waiting_input: '等待输入',
  succeeded: '成功',
  failed: '失败',
  cancel_requested: '取消中',
  cancelled: '已取消',
}

/** 任务是否仍在进行（Tasks 列表轮询 + 取消按钮）。 */
export const ACTIVE_TASK_STATUSES: Record<string, true> = {
  draft: true,
  queued: true,
  preparing: true,
  running: true,
  waiting_permission: true,
  waiting_input: true,
  cancel_requested: true,
}

export function isTaskActive(status: string): boolean {
  return ACTIVE_TASK_STATUSES[status] === true
}

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export function runtimeTone(status: string): StatusTone {
  if (status === 'ready') return 'success'
  if (status === 'probing') return 'accent'
  if (status === 'auth-required' || status === 'incompatible') return 'warning'
  if (status === 'unavailable' || status === 'disabled') return 'danger'
  return 'neutral'
}

export function agentTone(status: string, enabled: boolean): StatusTone {
  if (!enabled || status === 'disabled') return 'neutral'
  if (status === 'ready') return 'success'
  if (status === 'draft') return 'warning'
  return 'neutral'
}

export function skillTone(status: string, enabled: boolean): StatusTone {
  if (!enabled) return 'neutral'
  if (status === 'imported') return 'success'
  if (status === 'broken') return 'danger'
  return 'accent'
}

export function taskTone(status: string): StatusTone {
  if (status === 'succeeded') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'cancelled' || status === 'cancel_requested') return 'neutral'
  if (status === 'waiting_input' || status === 'waiting_permission') return 'warning'
  if (status === 'running' || status === 'preparing' || status === 'queued') return 'accent'
  return 'neutral'
}

/** 将 Skill validation_result 压成可读短文案。 */
export function formatValidationResult(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          const message = typeof obj.message === 'string' ? obj.message : ''
          const code = typeof obj.code === 'string' ? obj.code : ''
          const detail = typeof obj.detail === 'string' ? obj.detail : ''
          return message || code || detail
        }
        return ''
      })
      .filter(Boolean)
      .join('；')
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (Array.isArray(obj.issues)) return formatValidationResult(obj.issues)
    const message = typeof obj.message === 'string' ? obj.message : ''
    const detail = typeof obj.detail === 'string' ? obj.detail : ''
    const error = typeof obj.error === 'string' ? obj.error : ''
    return message || detail || error
  }
  return ''
}
