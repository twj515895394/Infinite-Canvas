/**
 * Agent Dock 面板状态（切片 22 F14）。
 * Composer 草稿、上下文 chips、活动 Task、打开来源——本地 UI 态，不进服务端。
 * 契约：docs/studio-v2-agent-skill-runtime-and-management-design.md §15.1 / §20
 */
import { create } from 'zustand'

/** 上下文引用（提交前的草稿；与后端 selection_refs 对齐）。 */
export interface DockContextRef {
  /** 本地稳定 key（asset/node id + type）。 */
  key: string
  reference_type: 'asset' | 'node' | 'canvas' | 'project'
  reference_id: string
  version_ref?: string | null
  title: string
  required?: boolean
}

export type DockSource = 'shell' | 'canvas' | 'assets' | 'agents'

interface DockState {
  open: boolean
  source: DockSource | null
  /** 当前选中的 Agent Profile id。 */
  agentId: string | null
  /** 可选 Skill id。 */
  skillId: string | null
  /** Composer 输入。 */
  message: string
  /** 上下文 chips（资产版本 / 画布节点等）。 */
  contextRefs: DockContextRef[]
  /** 当前 Session（创建 Task 后保留，便于连续对话）。 */
  sessionId: string | null
  /** 活动 / 最近查看的 Task。 */
  activeTaskId: string | null
  /** 打开时可选项目上下文。 */
  projectId: string | null
  canvasId: string | null

  openDock: (opts?: {
    source?: DockSource
    agentId?: string | null
    skillId?: string | null
    projectId?: string | null
    canvasId?: string | null
    contextRefs?: DockContextRef[]
    message?: string
  }) => void
  closeDock: () => void
  setAgentId: (id: string | null) => void
  setSkillId: (id: string | null) => void
  setMessage: (message: string) => void
  setSessionId: (id: string | null) => void
  setActiveTaskId: (id: string | null) => void
  addContextRef: (ref: DockContextRef) => void
  removeContextRef: (key: string) => void
  clearContextRefs: () => void
  /** 合并一批上下文（同 key 覆盖）。 */
  mergeContextRefs: (refs: DockContextRef[]) => void
}

export const useDockStore = create<DockState>()((set, get) => ({
  open: false,
  source: null,
  agentId: null,
  skillId: null,
  message: '',
  contextRefs: [],
  sessionId: null,
  activeTaskId: null,
  projectId: null,
  canvasId: null,

  openDock: (opts) => {
    const incoming = opts?.contextRefs ?? []
    set((s) => {
      const merged = incoming.length > 0 ? mergeRefs(s.contextRefs, incoming) : s.contextRefs
      return {
        open: true,
        source: opts?.source ?? s.source ?? 'shell',
        agentId: opts?.agentId !== undefined ? opts.agentId : s.agentId,
        skillId: opts?.skillId !== undefined ? opts.skillId : s.skillId,
        projectId: opts?.projectId !== undefined ? opts.projectId : s.projectId,
        canvasId: opts?.canvasId !== undefined ? opts.canvasId : s.canvasId,
        message: opts?.message !== undefined ? opts.message : s.message,
        contextRefs: merged,
      }
    })
  },

  closeDock: () => set({ open: false }),

  setAgentId: (id) => {
    // 换 Agent 时清 Skill / Session / 活动 Task（绑定集与会话需重建，时间线不串台）
    const prev = get().agentId
    if (prev === id) {
      set({ agentId: id })
      return
    }
    set({ agentId: id, skillId: null, sessionId: null, activeTaskId: null })
  },

  setSkillId: (id) => set({ skillId: id }),
  setMessage: (message) => set({ message }),
  setSessionId: (id) => set({ sessionId: id }),
  setActiveTaskId: (id) => set({ activeTaskId: id }),

  addContextRef: (ref) =>
    set((s) => ({
      contextRefs: mergeRefs(s.contextRefs, [ref]),
    })),

  removeContextRef: (key) =>
    set((s) => ({
      contextRefs: s.contextRefs.filter((r) => r.key !== key),
    })),

  clearContextRefs: () => set({ contextRefs: [] }),

  mergeContextRefs: (refs) =>
    set((s) => ({
      contextRefs: mergeRefs(s.contextRefs, refs),
    })),
}))

function mergeRefs(existing: DockContextRef[], incoming: DockContextRef[]): DockContextRef[] {
  const map = new Map<string, DockContextRef>()
  for (const r of existing) map.set(r.key, r)
  for (const r of incoming) map.set(r.key, r)
  return [...map.values()]
}

/** 资产 → Dock 上下文引用（必须有 current_version）。 */
export function assetToContextRef(asset: {
  id: string
  name: string
  current_version?: { id: string } | null
}): DockContextRef | null {
  const versionId = asset.current_version?.id
  if (!versionId) return null
  return {
    key: `asset:${asset.id}:${versionId}`,
    reference_type: 'asset',
    reference_id: asset.id,
    version_ref: versionId,
    title: asset.name,
    required: false,
  }
}

/** 画布选中节点 → Dock 上下文引用。 */
export function nodeToContextRef(node: {
  id: string
  type: string
  config?: Record<string, unknown>
}): DockContextRef {
  const name =
    (typeof node.config?.name === 'string' && node.config.name) ||
    (typeof node.config?.title === 'string' && node.config.title) ||
    node.type
  return {
    key: `node:${node.id}`,
    reference_type: 'node',
    reference_id: node.id,
    title: `${name} (${node.type})`,
    required: false,
  }
}

/** 草稿 refs → 后端 selection_refs。 */
export function toSelectionRefs(refs: DockContextRef[]): {
  reference_type: string
  reference_id: string
  version_ref?: string | null
  title?: string
  required?: boolean
}[] {
  return refs.map((r) => ({
    reference_type: r.reference_type,
    reference_id: r.reference_id,
    version_ref: r.version_ref ?? null,
    title: r.title,
    required: r.required ?? false,
  }))
}

/** 生成 Task 幂等键（同内容短窗内去重）。 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `dock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
