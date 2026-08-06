/**
 * 生成画布页（切片 09/14/17）。
 * React Flow 集成：studio-node Host、Node Registry、Command/Undo-Redo、
 * 连接验证、保存/重开闭环、revision 冲突提示。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Undo2, Redo2, Trash2, Save, Loader2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useEditorStore, type CanvasMeta } from '@/features/canvas/store'
import { nodeRegistry, type InspectorField } from '@/features/canvas/registry'
import { registerMvpNodes, nodeTypes, NODE_TYPES } from '@/features/canvas/nodes'
import { AssetDrawer } from '@/features/canvas/AssetDrawer'
import type { CanvasNode, CanvasEdge } from '@/features/canvas/ports'
import { ASSET_DRAG_MIME, parseAssetDragPayload, toMediaKind } from '@/features/assets/api'
import { ImageGenInspector } from '@/features/generation/ImageGenInspector'
import { VideoInspector } from '@/features/generation/VideoInspector'
import { WorkflowInspector } from '@/features/generation/WorkflowInspector'
import { loadCanvas, saveCanvasSnapshot, isRevisionConflict } from '@/features/canvas/persistence'
import { cn } from '@/core/utils/cn'

registerMvpNodes()

/** 从 config.result 收窄图片稳定引用（{urls}）的 url 列表；非该形状安全返回空。 */
function stableUrlsOf(result: unknown): string[] {
  if (result && typeof result === 'object' && 'urls' in result && Array.isArray(result.urls)) {
    return result.urls.filter((u): u is string => typeof u === 'string')
  }
  return []
}

/** 从 config.result 收窄视频稳定引用（{videos}）的 url 列表；非该形状安全返回空。 */
function stableVideosOf(result: unknown): string[] {
  if (result && typeof result === 'object' && 'videos' in result && Array.isArray(result.videos)) {
    return result.videos.filter((v): v is string => typeof v === 'string')
  }
  return []
}

/** 节点结果缩略图来源：生成节点（图片/工作流）读 config.result 图片稳定引用；
 * 视频节点返回视频 url（MediaThumbnail 用 /api/media-preview 首帧作 poster，不整段加载）；
 * 输出节点收集上游结果。kind 随来源传递（视频走 video 语义，图片/工作流走 image）。 */
function resultUrlsFor(node: CanvasNode, nodes: CanvasNode[], edges: CanvasEdge[]): { url: string; kind: string }[] {
  if (node.type === 'asset') {
    // asset 节点：展示缓存来自拖入时写入的 config（content/preview url），引用主键是 asset_version_id；
    // kind 经 toMediaKind 映射（audio/document 等走图标分支，避免按 image 渲染破图）
    const url = typeof node.config?.content_url === 'string' && node.config.content_url ? node.config.content_url : null
    if (!url) return []
    const kind = toMediaKind(typeof node.config?.kind === 'string' ? node.config.kind : 'image')
    return [{ url, kind }]
  }
  if (node.type === 'image-generation' || node.type === 'workflow') {
    return stableUrlsOf(node.config?.result).map((url) => ({ url, kind: 'image' }))
  }
  if (node.type === 'video-generation') {
    return stableVideosOf(node.config?.result).map((url) => ({ url, kind: 'video' }))
  }
  if (node.type === 'output') {
    const sources = edges
      .filter((e) => e.target === node.id)
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter((n): n is CanvasNode =>
        n?.type === 'image-generation' || n?.type === 'video-generation' || n?.type === 'workflow',
      )
    return sources.flatMap((n) => {
      if (n.type === 'video-generation') {
        return stableVideosOf(n.config?.result).map((url) => ({ url, kind: 'video' }))
      }
      return stableUrlsOf(n.config?.result).map((url) => ({ url, kind: 'image' }))
    })
  }
  return []
}

function toRfEdge(e: CanvasEdge): RFEdge {
  return { id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle }
}

function InspectorPanel() {
  const selectedId = useEditorStore((s) => s.selection.nodeIds[0])
  const nodes = useEditorStore((s) => s.nodes)
  const updateConfig = useEditorStore((s) => s.updateConfig)
  const node = nodes.find((n) => n.id === selectedId)
  const def = node ? nodeRegistry.get(node.type) : undefined

  if (!node || !def) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-text-faint">
        选中节点后在此编辑参数
      </div>
    )
  }
  if (def.type === 'image-generation') {
    return (
      <div className="flex flex-col gap-3 p-3">
        <div className="text-xs font-medium text-text">图片生成 参数</div>
        <ImageGenInspector nodeId={node.id} config={node.config} updateConfig={updateConfig} />
      </div>
    )
  }
  if (def.type === 'video-generation') {
    return (
      <div className="flex flex-col gap-3 p-3">
        <div className="text-xs font-medium text-text">视频生成 参数</div>
        <VideoInspector nodeId={node.id} config={node.config} updateConfig={updateConfig} />
      </div>
    )
  }
  if (def.type === 'workflow') {
    return (
      <div className="flex flex-col gap-3 p-3">
        <div className="text-xs font-medium text-text">ComfyUI 工作流 参数</div>
        <WorkflowInspector nodeId={node.id} config={node.config} updateConfig={updateConfig} />
      </div>
    )
  }
  const fields: InspectorField[] = def.configSchema
  if (fields.length === 0) {
    return <div className="px-4 text-xs text-text-faint">该节点无需配置参数</div>
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="text-xs font-medium text-text">{def.label} 参数</div>
      {fields.map((field) => (
        <label key={field.key} className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">{field.label}</span>
          {field.type === 'textarea' ? (
            <textarea
              value={String(node.config[field.key] ?? '')}
              placeholder={field.placeholder}
              onChange={(e) => updateConfig(node.id, { [field.key]: e.target.value })}
              rows={3}
              className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
            />
          ) : (
            <input
              value={String(node.config[field.key] ?? '')}
              placeholder={field.placeholder}
              onChange={(e) => updateConfig(node.id, { [field.key]: e.target.value })}
              className="h-8 rounded-md border border-border bg-bg px-2 text-xs text-text outline-none focus:border-accent"
            />
          )}
        </label>
      ))}
    </div>
  )
}

function CanvasWorkspace() {
  const { canvasId } = useParams<{ projectId: string; canvasId: string }>()
  const navigate = useNavigate()
  const nodes = useEditorStore((s) => s.nodes)
  const edges = useEditorStore((s) => s.edges)
  const dirty = useEditorStore((s) => s.dirty)
  const history = useEditorStore((s) => s.history)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  const store = useEditorStore

  /* 加载画布 */
  useEffect(() => {
    if (!canvasId) return
    setLoading(true)
    setLoadError(null)
    loadCanvas(canvasId)
      .then((loaded) => {
        const meta: CanvasMeta = { id: loaded.id, projectId: loaded.projectId, title: loaded.title, revision: loaded.revision }
        store.getState().loadCanvas(meta, {
          nodes: loaded.nodes,
          edges: loaded.edges,
          viewport: loaded.viewport,
        })
        setLoading(false)
      })
      .catch((err) => {
        setLoadError(String(err))
        setLoading(false)
      })
    return () => store.getState().reset()
  }, [canvasId, store])

  /* debounce 保存 */
  useEffect(() => {
    if (!dirty || !canvasId) return
    const timer = setTimeout(() => {
      const state = store.getState()
      if (!state.meta) return
      saveCanvasSnapshot(canvasId, {
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
      })
        .then((revision) => {
          const meta = store.getState().meta
          if (meta) {
            store.setState({ meta: { ...meta, revision }, dirty: false })
          }
        })
        .catch((err) => {
          if (isRevisionConflict(err)) {
            setConflict(true)
          } else {
            console.error('save failed', err)
          }
        })
    }, 800)
    return () => clearTimeout(timer)
  }, [dirty, canvasId, store])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const s = store.getState()
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          s.setNodePosition(c.id, c.position) // 拖拽中直接应用，dragStop 时合并为单命令
        } else if (c.type === 'remove') {
          s.removeNode(c.id)
        }
      }
      if (changes.length > 0) s.setDirty(true)
    },
    [store],
  )

  const onNodeDragStart = useCallback(
    (_: unknown, node: RFNode) => {
      store.getState().recordDragStart(node.id, node.position)
    },
    [store],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: RFNode) => {
      store.getState().commitDrag(node.id)
    },
    [store],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const s = store.getState()
      for (const c of changes) {
        if (c.type === 'remove') {
          s.removeEdge(c.id)
        }
      }
      if (changes.length > 0) s.setDirty(true)
    },
    [store],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const edge: CanvasEdge = {
        id: `e_${crypto.randomUUID()}`,
        source: connection.source,
        sourceHandle: connection.sourceHandle ?? undefined,
        target: connection.target,
        targetHandle: connection.targetHandle ?? undefined,
      }
      const result = store.getState().addEdge(edge)
      if (!result.ok) {
        console.warn('connection rejected:', result.reason)
      }
    },
    [store],
  )

  const onSelectionChange = useCallback(
    (params: { nodes: RFNode[]; edges: RFEdge[] }) => {
      store.getState().setSelection(
        params.nodes.map((n) => n.id),
        params.edges.map((e) => e.id),
      )
    },
    [store],
  )

  /* 键盘快捷键：Ctrl+Z / Ctrl+Shift+Z / Delete */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store.getState()
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (e.key === 'Delete' && s.selection.nodeIds.length > 0) {
        e.preventDefault()
        for (const id of [...s.selection.nodeIds]) s.removeNode(id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])

  const addNodeAt = (type: string) => {
    const id = store.getState().addNode(type, {
      x: 120 + (nodes.length % 4) * 40,
      y: 100 + (nodes.length % 3) * 60,
    })
    setAddMenuOpen(false)
    return id
  }

  /* 资产拖入画布（F12）：从 Asset Drawer 拖拽 → 创建 asset 节点（config 存 asset_version_id 引用） */
  const { screenToFlowPosition } = useReactFlow()
  const [dropHint, setDropHint] = useState<string | null>(null)
  const dropHintTimer = useRef<number | null>(null)
  const reduceMotion = useReducedMotion()

  /* dropHint 自动消失（1.6s；注释与实现一致） */
  const flashDropHint = useCallback((text: string) => {
    setDropHint(text)
    if (dropHintTimer.current) window.clearTimeout(dropHintTimer.current)
    dropHintTimer.current = window.setTimeout(() => setDropHint(null), 1600)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ASSET_DRAG_MIME)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(ASSET_DRAG_MIME)
      const payload = parseAssetDragPayload(raw)
      if (!payload) return
      e.preventDefault()
      if (payload.status === 'trashed') {
        flashDropHint(`「${payload.name}」已在回收站，无法拖入画布`)
        return
      }
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const id = store.getState().addNode('asset', position)
      if (id) {
        store.getState().updateConfig(id, {
          asset_id: payload.assetId,
          asset_version_id: payload.assetVersionId,
          name: payload.name,
          kind: payload.kind,
          // §8.1 AssetNodeConfig 缺省：拖入即固定当前版本（selectionMode='fixed'）
          selection_mode: 'fixed',
          preview_url: payload.previewUrl ?? undefined,
          content_url: payload.contentUrl,
        })
        flashDropHint(`已添加素材「${payload.name}」`)
      }
    },
    [flashDropHint, screenToFlowPosition, store],
  )

  const runtime = useEditorStore((s) => s.runtime)
  const selection = useEditorStore((s) => s.selection)
  const rfNodes = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'studio-node',
        position: n.position,
        // selected 必须回传：React Flow 以 prop 为准，不回传会在节点 prop 更新时清空内部选择
        selected: selection.nodeIds.includes(n.id),
        data: {
          nodeType: n.type,
          config: n.config ?? {},
          status: runtime[n.id],
          resultUrls: resultUrlsFor(n, nodes, edges),
        },
      })),
    [nodes, edges, runtime, selection],
  )
  const rfEdges = useMemo(() => edges.map(toRfEdge), [edges])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" aria-hidden /> 加载画布…
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-danger">画布加载失败：{loadError}</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
          返回项目
        </Button>
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <div className="absolute inset-0 flex">
        <AssetDrawer />
        <div className="relative min-w-0 flex-1">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onSelectionChange={onSelectionChange}
            onDragOver={onDragOver}
            onDrop={onDrop}
            fitView
            minZoom={0.2}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
            className="bg-bg"
          >
            <Background gap={20} size={1} color="#2a3242" />
            <Controls />
            <MiniMap pannable zoomable className="!bg-surface-raised" maskColor="rgba(13,15,20,0.7)" />
          </ReactFlow>

          {/* 拖放反馈提示（apple-design：落点反馈；自动消失；reduced-motion 下降级为纯淡入） */}
          <AnimatePresence>
            {dropHint && (
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md border border-border bg-surface-raised/95 px-3 py-1.5 text-xs text-text shadow-lg backdrop-blur"
              >
                {dropHint}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 顶部工具条 */}
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-surface-raised/90 p-1 shadow-lg backdrop-blur">
        <IconButton label="撤销" size="sm" disabled={!history.canUndo} onClick={() => store.getState().undo()}>
          <Undo2 size={15} aria-hidden />
        </IconButton>
        <IconButton label="重做" size="sm" disabled={!history.canRedo} onClick={() => store.getState().redo()}>
          <Redo2 size={15} aria-hidden />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="relative">
          <IconButton label="添加节点" size="sm" onClick={() => setAddMenuOpen((v) => !v)}>
            <Plus size={15} aria-hidden />
          </IconButton>
          {addMenuOpen && (
            <div className="absolute left-0 top-9 z-20 w-40 rounded-lg border border-border bg-surface-raised p-1 shadow-xl">
              {NODE_TYPES.map((t) => {
                const def = nodeRegistry.get(t)
                if (!def) return null
                return (
                  <button
                    key={t}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text hover:bg-surface"
                    onClick={() => addNodeAt(t)}
                  >
                    {def.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <IconButton
          label="删除选中"
          size="sm"
          disabled={store.getState().selection.nodeIds.length === 0}
          onClick={() => {
            const s = store.getState()
            for (const id of [...s.selection.nodeIds]) s.removeNode(id)
          }}
        >
          <Trash2 size={15} aria-hidden />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="flex items-center gap-1.5 px-2">
          <Save size={13} className={dirty ? 'text-warning' : 'text-text-faint'} aria-hidden />
          <span className={cn('text-[11px]', dirty ? 'text-warning' : 'text-text-faint')}>
            {dirty ? '未保存' : '已保存'}
          </span>
        </div>
      </div>

      {/* 右侧 Inspector 浮层 */}
      <div className="absolute right-3 top-3 z-10 flex max-h-[calc(100%-6rem)] w-[340px] flex-col overflow-auto rounded-lg border border-border bg-surface-raised/95 shadow-xl backdrop-blur">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-text">Inspector</div>
        <InspectorPanel />
      </div>

      {/* revision 冲突提示 */}
      <Dialog open={conflict} onClose={() => setConflict(false)} title="画布已被修改">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            画布在其他会话中被更新（revision 冲突）。重新加载以获取最新内容。
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setConflict(false)
                window.location.reload()
              }}
            >
              重新加载
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasWorkspace />
    </ReactFlowProvider>
  )
}
