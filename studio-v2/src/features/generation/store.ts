/**
 * Task Shelf Store（F6）：全局生成任务清单 + 轮询驱动。
 * 任务由节点 Inspector 提交时 register；refreshActiveTasks 轮询后端 /api/v2/generation-tasks/{id}，
 * 将状态投影到节点运行态（useEditorStore.runtime）；成功时仅把稳定引用（urls+items）写回
 * 节点 config.result（design doc §3.5：节点只存结果引用；运行态/供应商细节不入画布持久化）。
 */
import { create } from 'zustand'
import { ApiError } from '@/core/api/client'
import { useEditorStore } from '@/features/canvas/store'
import {
  getImageTask,
  isTaskActive,
  toStableResult,
  type GenerationTaskStatus,
  type ImageSubmitPayload,
  type ImageTaskResult,
} from '@/features/generation/api'

export interface TaskEntry {
  taskId: string
  /** 发起任务的节点（画布节点）id；来自后端恢复的任务无此字段。 */
  nodeId?: string
  label: string
  status: GenerationTaskStatus
  providerId?: string
  model?: string
  error?: string
  message?: string
  result?: ImageTaskResult | null
  /** 提交载荷快照（重试用；不可变，保证重试与原始提交一致）。 */
  payload?: ImageSubmitPayload | null
  createdAt: number
  updatedAt: number
}

interface GenerationStore {
  tasks: TaskEntry[]
  upsert(entry: TaskEntry): void
  patch(taskId: string, patch: Partial<TaskEntry>): void
  remove(taskId: string): void
  clearFinished(): void
  /** 从后端近期任务恢复（去重：已存在的 taskId 保留本地 nodeId 关联）。 */
  mergeBackend(tasks: { id: string; status: GenerationTaskStatus; created_at: number; updated_at: number }[]): void
  reset(): void
}

export const useGenerationStore = create<GenerationStore>()((set) => ({
  tasks: [],

  upsert: (entry) =>
    set((s) => {
      const idx = s.tasks.findIndex((t) => t.taskId === entry.taskId)
      if (idx >= 0) {
        const next = [...s.tasks]
        next[idx] = { ...next[idx], ...entry }
        return { tasks: next }
      }
      return { tasks: [entry, ...s.tasks] }
    }),

  patch: (taskId, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.taskId === taskId ? { ...t, ...patch, updatedAt: patch.updatedAt ?? t.updatedAt } : t,
      ),
    })),

  remove: (taskId) => set((s) => ({ tasks: s.tasks.filter((t) => t.taskId !== taskId) })),

  clearFinished: () =>
    set((s) => ({ tasks: s.tasks.filter((t) => isTaskActive(t.status)) })),

  mergeBackend: (tasks) =>
    set((s) => {
      const known = new Set(s.tasks.map((t) => t.taskId))
      const merged: TaskEntry[] = []
      for (const raw of tasks) {
        if (known.has(raw.id)) continue
        merged.push({
          taskId: raw.id,
          label: '生成任务',
          status: raw.status,
          createdAt: raw.created_at,
          updatedAt: raw.updated_at,
          payload: null,
        })
      }
      if (merged.length === 0) return s
      return { tasks: [...s.tasks, ...merged] }
    }),

  reset: () => set({ tasks: [] }),
}))

/**
 * 轮询所有非终态任务一次：更新 shelf 条目，并把状态投影到节点、
 * 成功时写回节点 config.result（非撤销路径，编辑 store 直接 patch）。
 */
export async function refreshActiveTasks(): Promise<void> {
  const store = useGenerationStore.getState()
  const active = store.tasks.filter((t) => isTaskActive(t.status))
  if (active.length === 0) return

  const editor = useEditorStore.getState()
  for (const entry of active) {
    try {
      const { task } = await getImageTask(entry.taskId)
      store.patch(entry.taskId, {
        status: task.status,
        error: task.error || undefined,
        message: task.message || undefined,
        result: task.result,
        updatedAt: task.updated_at,
      })
      if (!entry.nodeId) continue
      // 节点运行态投影：即梦排队统一显示为运行中
      editor.setRuntime(entry.nodeId, task.status === 'jimeng_pending' ? 'running' : task.status)
      if (task.status === 'succeeded' && task.result) {
        // 仅写回稳定引用（urls+items），任务详情/供应商字段不入画布持久化
        editor.setNodeResult(entry.nodeId, toStableResult(task.result))
      }
    } catch (err) {
      // 仅 404（任务已过期/后端重启）视为终态失败；瞬时网络错误保留 active 下轮重试
      if (err instanceof ApiError && err.problem.code === 'RESOURCE_NOT_FOUND') {
        store.patch(entry.taskId, { status: 'failed', error: '任务已过期或后端已重启' })
        if (entry.nodeId) editor.setRuntime(entry.nodeId, 'failed')
      }
    }
  }
}
