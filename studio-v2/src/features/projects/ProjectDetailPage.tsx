/**
 * 项目详情：画布列表 / 创建 / 打开（F16 冒烟链路补齐）。
 * 打开项目 → 列表或新建画布 → 进入 CanvasPage。
 */
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Plus, LayoutTemplate } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel, TextInput } from '@/components/ui/form'
import { ErrorState, LoadingState } from '@/components/ui/page-state'
import { errorMessage } from '@/core/api/errors'
import { toastSuccess } from '@/core/feedback/queryFeedback'
import {
  useCanvases,
  useCreateCanvas,
  useProject,
  type CanvasSummary,
} from '@/features/projects/api'

function CreateCanvasForm({
  onSubmit,
  onCancel,
  pending,
}: {
  onSubmit: (title: string) => void
  onCancel: () => void
  pending: boolean
}) {
  const [title, setTitle] = useState('未命名画布')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    onSubmit(t)
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <FieldLabel>画布名称</FieldLabel>
        <TextInput
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：角色设定"
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          取消
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!title.trim() || pending}>
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
          创建并打开
        </Button>
      </div>
    </form>
  )
}

function formatUpdatedAt(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function ProjectDetailPage() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const projectQuery = useProject(projectId)
  const canvasesQuery = useCanvases(projectId)
  const createCanvas = useCreateCanvas(projectId)
  const [dialogOpen, setDialogOpen] = useState(false)

  const project = projectQuery.data
  const canvases = canvasesQuery.data ?? []

  const openCanvas = (canvas: CanvasSummary) => {
    navigate(`/projects/${projectId}/canvases/${canvas.id}`)
  }

  const handleCreate = async (title: string) => {
    // 失败仅走全局 MutationCache Toast（可重试）；成功再关对话框并跳转
    try {
      const canvas = await createCanvas.mutateAsync(title)
      toastSuccess('画布已创建', canvas.title)
      setDialogOpen(false)
      navigate(`/projects/${projectId}/canvases/${canvas.id}`)
    } catch {
      /* toast via MutationCache */
    }
  }

  if (projectQuery.isLoading || canvasesQuery.isLoading) {
    return <LoadingState label="加载项目…" className="h-full" />
  }

  if (projectQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <ErrorState
          title="项目加载失败"
          hint={errorMessage(projectQuery.error, '请确认项目仍存在且后端可用。')}
          onRetry={() => void projectQuery.refetch()}
          action={
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => void projectQuery.refetch()}>
                重试
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
                返回项目列表
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  if (canvasesQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <ErrorState
          title="画布列表加载失败"
          hint={errorMessage(canvasesQuery.error, '请确认后端服务可用后重试。')}
          onRetry={() => void canvasesQuery.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} aria-label="返回项目列表">
            <ArrowLeft size={15} aria-hidden />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-text">{project?.name ?? '项目'}</h1>
            <p className="text-xs text-text-muted">选择或创建画布开始创作</p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={15} aria-hidden /> 新建画布
        </Button>
      </div>

      {canvases.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="还没有画布"
          hint="创建第一张生成画布，开始节点编排与生成任务。"
          className="py-16"
          action={
            <Button size="sm" variant="primary" onClick={() => setDialogOpen(true)}>
              <Plus size={14} aria-hidden /> 新建画布
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {canvases.map((canvas) => (
            <li key={canvas.id}>
              <button
                type="button"
                onClick={() => openCanvas(canvas)}
                className="group flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-left transition-[border-color,background-color] duration-[120ms] hover:border-border-strong"
              >
                <div className="flex items-center gap-2">
                  <LayoutTemplate size={16} className="shrink-0 text-accent" aria-hidden />
                  <span className="truncate text-sm font-medium text-text">{canvas.title}</span>
                </div>
                <p className="text-[11px] text-text-faint">
                  更新于 {formatUpdatedAt(canvas.updated_at)} · rev {canvas.revision}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="新建画布">
        <CreateCanvasForm
          pending={createCanvas.isPending}
          onSubmit={(title) => void handleCreate(title)}
          onCancel={() => setDialogOpen(false)}
        />
      </Dialog>
    </div>
  )
}
