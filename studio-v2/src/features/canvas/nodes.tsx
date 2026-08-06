/**
 * MVP 节点集注册 + 统一 StudioNodeHost。
 * 契约：节点类型表达业务能力；单一稳定 studio-node Host；端口可视化。
 */
import { memo } from 'react'
import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react'
import { Image, Film, Workflow, Box, FileText, FolderTree, Wand2, Type, Bot } from 'lucide-react'
import type { ComponentType } from 'react'
import { nodeRegistry, type NodeDefinition } from '@/features/canvas/registry'
import { validateAgentTaskConfig, agentTaskSubtitle } from '@/features/canvas/agentTaskNode'
import { cn } from '@/core/utils/cn'
import type { MediaKind } from '@/features/media/api'
import { MediaThumbnail } from '@/features/media/components/MediaThumbnail'

const MEDIA_KIND_SET: Record<string, true> = { image: true, video: true, audio: true, file: true }

/** 收窄 resultUrls 的 kind 字符串 → MediaKind（未知值回落 file，避免 MediaThumbnail 按 image 渲染破图）。 */
function toThumbKind(kind: unknown): MediaKind {
  return typeof kind === 'string' && MEDIA_KIND_SET[kind] === true ? (kind as MediaKind) : 'file'
}

export const NODE_TYPES = ['asset', 'prompt', 'image-generation', 'video-generation', 'workflow', 'output', 'group', 'artifact', 'agent-task'] as const

const NODE_ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  asset: Box,
  prompt: Type,
  'image-generation': Wand2,
  'video-generation': Film,
  workflow: Workflow,
  output: Image,
  group: FolderTree,
  artifact: FileText,
  'agent-task': Bot,
}

function define(def: NodeDefinition): NodeDefinition {
  return def
}

/** 注册 MVP 节点（含 agent-task；模块加载时执行一次，随后冻结） */
export function registerMvpNodes(): void {
  if (nodeRegistry.get('prompt')) return // 幂等
  const defs: NodeDefinition[] = [
    define({
      type: 'asset',
      label: '素材',
      ports: [{ id: 'out', label: '素材', kind: 'asset', direction: 'output' }],
      configSchema: [
        { key: 'asset_version_id', label: 'AssetVersion ID', type: 'text', placeholder: 'avr_xxx' },
        { key: 'name', label: '素材名', type: 'text', placeholder: '拖入资产后自动填充' },
      ],
      validate: (config) => (config.asset_version_id ? null : '请选择素材版本（从左侧资产面板拖入）'),
    }),
    define({
      type: 'prompt',
      label: '提示词',
      ports: [{ id: 'out', label: '提示词', kind: 'prompt', direction: 'output' }],
      configSchema: [{ key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: '输入提示词…' }],
      validate: (config) => (String(config.prompt ?? '').trim() ? null : '请输入提示词'),
    }),
    define({
      type: 'image-generation',
      label: '图片生成',
      ports: [
        { id: 'in', label: '提示词', kind: 'prompt', direction: 'input' },
        { id: 'out', label: '图片', kind: 'image', direction: 'output' },
      ],
      configSchema: [
        { key: 'prompt', label: 'Prompt', type: 'textarea' },
        { key: 'provider', label: 'Provider', type: 'select', options: [{ value: '', label: '默认' }] },
        { key: 'model', label: '模型', type: 'text' },
      ],
      validate: (config) => (String(config.prompt ?? '').trim() ? null : '请输入提示词'),
    }),
    define({
      type: 'video-generation',
      label: '视频生成',
      ports: [
        { id: 'in', label: '提示词', kind: 'prompt', direction: 'input' },
        { id: 'out', label: '视频', kind: 'video', direction: 'output' },
      ],
      // 实际参数表单由 VideoInspector 驱动（Provider/模型/时长/比例）；此处仅作兜底展示
      configSchema: [
        { key: 'prompt', label: 'Prompt', type: 'textarea' },
        { key: 'provider', label: 'Provider', type: 'select', options: [{ value: '', label: '默认' }] },
        { key: 'duration', label: '时长（秒）', type: 'text' },
      ],
      validate: (config) => (String(config.prompt ?? '').trim() ? null : '请输入提示词'),
    }),
    define({
      type: 'workflow',
      label: '工作流',
      ports: [
        { id: 'in', label: '输入', kind: 'any', direction: 'input' },
        { id: 'out', label: '输出', kind: 'any', direction: 'output' },
      ],
      // 实际参数表单由 WorkflowInspector 驱动（工作流选择 + 动态字段）；此处仅作兜底展示
      configSchema: [
        { key: 'workflow', label: '工作流', type: 'text', placeholder: 'workflow 名称' },
        { key: 'field_values', label: '字段值 JSON', type: 'textarea' },
      ],
      validate: (config) => (String(config.workflow ?? '').trim() ? null : '请选择工作流'),
    }),
    define({
      type: 'output',
      label: '输出',
      ports: [{ id: 'in', label: '结果', kind: 'any', direction: 'input' }],
      configSchema: [],
    }),
    define({
      type: 'group',
      label: '分组',
      ports: [
        { id: 'in', label: '输入', kind: 'any', direction: 'input' },
        { id: 'out', label: '输出', kind: 'any', direction: 'output' },
      ],
      configSchema: [{ key: 'label', label: '组名', type: 'text' }],
    }),
    define({
      type: 'artifact',
      label: '成果',
      ports: [
        { id: 'in', label: '文本', kind: 'text', direction: 'input' },
        { id: 'out', label: '文本', kind: 'text', direction: 'output' },
      ],
      configSchema: [{ key: 'title', label: '标题', type: 'text' }],
    }),
    define({
      type: 'agent-task',
      label: 'Agent 任务',
      ports: [
        { id: 'context', label: '上下文', kind: 'any', direction: 'input' },
        { id: 'assets', label: '素材', kind: 'asset', direction: 'input' },
        { id: 'out', label: '结果', kind: 'text', direction: 'output' },
        { id: 'task', label: 'Task', kind: 'text', direction: 'output' },
      ],
      // 实际表单由 AgentTaskInspector 驱动；此处兜底 + validate
      configSchema: [
        { key: 'agent_profile_id', label: 'Agent ID', type: 'text' },
        { key: 'skill_id', label: 'Skill ID', type: 'text' },
        { key: 'instruction', label: '任务说明', type: 'textarea' },
      ],
      capabilities: ['agent-task'],
      validate: (config) => validateAgentTaskConfig(config),
    }),
  ]
  for (const def of defs) nodeRegistry.register(def)
  nodeRegistry.freeze()
}

export interface StudioNodeData {
  nodeType: string
  config: Record<string, unknown>
  status?: string
  /** 结果缩略图（生成节点自身结果 / 输出节点上游结果），kind 随来源传递（video/image）。 */
  resultUrls?: { url: string; kind: string }[]
}

/** 任务状态展示（与 TaskShelf TASK_STATUS_LABELS 语义一致；本地维护避免 canvas→generation 依赖）。 */
const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '生成中',
  jimeng_pending: '即梦排队中',
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
  // Agent Task 扩展态（F15）
  draft: '草稿',
  preparing: '准备中',
  waiting_permission: '等待权限',
  waiting_input: '等待输入',
  cancel_requested: '取消中',
}

const STATUS_CHIP: Record<string, string> = {
  queued: 'bg-text-faint/15 text-text-muted',
  running: 'bg-warning/15 text-warning',
  jimeng_pending: 'bg-warning/15 text-warning',
  succeeded: 'bg-success/15 text-success',
  failed: 'bg-danger/15 text-danger',
  cancelled: 'bg-text-faint/15 text-text-faint',
  draft: 'bg-text-faint/15 text-text-muted',
  preparing: 'bg-warning/15 text-warning',
  waiting_permission: 'bg-warning/15 text-warning',
  waiting_input: 'bg-warning/15 text-warning',
  cancel_requested: 'bg-text-faint/15 text-text-muted',
}

/** 统一节点 Host：标题 + 状态 + 输入/输出端口 */
export const StudioNodeHost = memo(function StudioNodeHost({ data, selected }: NodeProps) {
  const { nodeType, config = {}, status, resultUrls = [] } = (data ?? {}) as unknown as StudioNodeData
  const def = nodeRegistry.get(nodeType)
  const Icon = NODE_ICONS[nodeType] ?? Box
  if (!def) {
    return <div className="rounded-lg border border-danger/50 bg-surface px-3 py-2 text-xs text-danger">未知节点 {nodeType}</div>
  }
  const running =
    status === 'running' ||
    status === 'queued' ||
    status === 'preparing' ||
    status === 'waiting_permission' ||
    status === 'waiting_input' ||
    status === 'cancel_requested' ||
    status === 'draft'
  return (
    <div
      className={cn(
        'w-48 rounded-lg border bg-surface-raised shadow-sm',
        'transition-[border-color,box-shadow] duration-[120ms]',
        selected ? 'border-accent shadow-[0_0_0_1px_rgba(91,140,255,0.5)]' : 'border-border',
        running && 'border-warning/60',
      )}
    >
      {/* 输入端口（左侧） */}
      {def.ports
        .filter((p) => p.direction === 'input')
        .map((p) => (
          <Handle key={p.id} type="target" position={Position.Left} id={p.id} className="!h-2 !w-2 !border-border !bg-accent" />
        ))}
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon size={14} className={cn('shrink-0', status === 'failed' ? 'text-danger' : 'text-accent')} aria-hidden />
        <span className="truncate text-xs font-medium text-text">{def.label}</span>
        {status && (
          <span className={cn('ml-auto rounded px-1.5 py-0.5 text-[10px]', STATUS_CHIP[status])}>
            {STATUS_LABELS[status] ?? status}
          </span>
        )}
      </div>
      <div className="truncate border-t border-border px-3 py-1.5 text-[11px] text-text-faint">
        {nodeType === 'agent-task'
          ? agentTaskSubtitle(config)
          : String(
              config.prompt ??
                config.workflow ??
                config.title ??
                config.label ??
                (nodeType === 'asset' ? config.name : '') ??
                '',
            ) || '未配置'}
      </div>
      {resultUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-1 border-t border-border p-1.5">
          {resultUrls.slice(0, 6).map(({ url, kind }) => (
            <div key={url} className="aspect-square overflow-hidden rounded-md bg-bg">
              <MediaThumbnail url={url} kind={toThumbKind(kind)} alt="结果" width={160} />
            </div>
          ))}
        </div>
      )}
      {/* 输出端口（右侧） */}
      {def.ports
        .filter((p) => p.direction === 'output')
        .map((p) => (
          <Handle key={p.id} type="source" position={Position.Right} id={p.id} className="!h-2 !w-2 !border-border !bg-accent" />
        ))}
    </div>
  )
})

/** React Flow nodeTypes（冻结单一 Host） */
export const nodeTypes: NodeTypes = {
  'studio-node': StudioNodeHost as unknown as ComponentType<NodeProps>,
}
