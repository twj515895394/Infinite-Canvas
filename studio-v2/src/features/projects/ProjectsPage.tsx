/**
 * 项目首页（契约：切片 08 / MVP §6.2）。
 * 列表、创建、打开、重命名、删除（归档）与恢复；加载/错误/空状态完整；
 * 破坏性操作有确认对话框。
 */
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, RotateCcw, FolderOpen, Archive, Loader2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import {
  useProjects,
  useCreateProject,
  useRenameProject,
  useArchiveProject,
  useRestoreProject,
  type Project,
} from '@/features/projects/api'

type DialogState =
  | { kind: 'create' }
  | { kind: 'rename'; project: Project }
  | { kind: 'archive'; project: Project }
  | null

function NameForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: string
  submitLabel: string
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onSubmit(trimmed)
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="项目名称"
        className="h-9 rounded-md border border-border bg-bg px-3 text-sm text-text outline-none focus:border-accent"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" variant="primary" size="sm">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useProjects()
  const createProject = useCreateProject()
  const renameProject = useRenameProject()
  const archiveProject = useArchiveProject()
  const restoreProject = useRestoreProject()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [error, setError] = useState<string | null>(null)

  const projects = data?.items ?? []
  const active = projects.filter((p) => !p.archived)
  const archived = projects.filter((p) => p.archived)

  const handleCreate = (name: string) => {
    setDialog(null)
    createProject.mutate(name, { onError: (err) => setError(String(err)) })
  }

  const handleRename = (project: Project) => (name: string) => {
    setDialog(null)
    renameProject.mutate(
      { id: project.id, name, base_revision: project.revision },
      { onError: (err) => setError(String(err)) },
    )
  }

  const handleArchive = (project: Project) => {
    setDialog(null)
    archiveProject.mutate(project.id, { onError: (err) => setError(String(err)) })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" aria-hidden /> 加载项目…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-danger">项目列表加载失败</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const ProjectCard = ({ project }: { project: Project }) => (
    <div className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 transition-[border-color,background-color] duration-[120ms] hover:border-border-strong">
      <button
        className="flex items-center gap-2 text-left"
        onClick={() => navigate(`/projects/${project.id}`)}
        title={`打开 ${project.name}`}
      >
        <FolderOpen size={16} className="shrink-0 text-accent" aria-hidden />
        <span className="truncate text-sm font-medium text-text">{project.name}</span>
      </button>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-faint">
          {project.archived ? '已归档' : '最近项目'}
        </span>
        <div className="flex gap-1 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
          {project.archived ? (
            <IconButton label={`恢复 ${project.name}`} size="sm" onClick={() => restoreProject.mutate(project.id)}>
              <RotateCcw size={14} aria-hidden />
            </IconButton>
          ) : (
            <>
              <IconButton label={`重命名 ${project.name}`} size="sm" onClick={() => setDialog({ kind: 'rename', project })}>
                <Pencil size={14} aria-hidden />
              </IconButton>
              <IconButton
                label={`删除 ${project.name}`}
                size="sm"
                onClick={() => setDialog({ kind: 'archive', project })}
              >
                <Trash2 size={14} aria-hidden />
              </IconButton>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">项目</h1>
        <Button variant="primary" size="sm" onClick={() => setDialog({ kind: 'create' })}>
          <Plus size={15} aria-hidden /> 新建项目
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span>{error}</span>
          <button className="text-danger hover:underline" onClick={() => setError(null)}>
            关闭
          </button>
        </div>
      )}

      {active.length === 0 && archived.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-text-muted">还没有项目，创建第一个开始创作</p>
          <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
            新建项目
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
          {archived.length > 0 && (
            <div className="col-span-full mt-4 flex items-center gap-2 border-t border-border pt-4 text-xs text-text-faint">
              <Archive size={14} aria-hidden /> 已归档（{archived.length}）
            </div>
          )}
          {archived.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <Dialog
        open={dialog?.kind === 'create'}
        onClose={() => setDialog(null)}
        title="新建项目"
      >
        <NameForm
          initial=""
          submitLabel="创建"
          onSubmit={handleCreate}
          onCancel={() => setDialog(null)}
        />
      </Dialog>

      <Dialog
        open={dialog?.kind === 'rename'}
        onClose={() => setDialog(null)}
        title="重命名项目"
      >
        {dialog?.kind === 'rename' && (
          <NameForm
            initial={dialog.project.name}
            submitLabel="保存"
            onSubmit={handleRename(dialog.project)}
            onCancel={() => setDialog(null)}
          />
        )}
      </Dialog>

      <Dialog
        open={dialog?.kind === 'archive'}
        onClose={() => setDialog(null)}
        title="删除项目"
      >
        {dialog?.kind === 'archive' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">
              确定删除项目「{dialog.project.name}」吗？项目将归档，可随时恢复。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
                取消
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleArchive(dialog.project)}>
                删除
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
