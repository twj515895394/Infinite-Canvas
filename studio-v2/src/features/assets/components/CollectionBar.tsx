/**
 * 集合栏（切片 19 F11）。
 * - 「全部」+ 各集合芯片（含成员数），点击切换列表筛选（collection_id 参数由页面持有）；
 * - 集合 CRUD：新建 / 改名 / 删除（删除确认，连带成员关系由后端清理）；
 * - 表单与确认对话框复用共享 Dialog / TextInput / Button，不内联再造。
 */
import { useState, type FormEvent } from 'react'
import { FolderOpen, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { TextInput } from '@/components/ui/form'
import { cn } from '@/core/utils/cn'
import {
  useCollections,
  useCreateCollection,
  useDeleteCollection,
  usePatchCollection,
  type AssetCollection,
} from '@/features/assets/api'

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
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onSubmit(trimmed)
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="集合名称" />
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

type CollectionDialog =
  | { kind: 'create' }
  | { kind: 'rename'; collection: AssetCollection }
  | { kind: 'delete'; collection: AssetCollection }
  | null

export function CollectionBar({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const { data, isLoading } = useCollections()
  const createCollection = useCreateCollection()
  const patchCollection = usePatchCollection()
  const deleteCollection = useDeleteCollection()
  const [dialog, setDialog] = useState<CollectionDialog>(null)
  const [error, setError] = useState<string | null>(null)

  const collections = data?.collections ?? []

  const handleCreate = (name: string) => {
    setDialog(null)
    createCollection.mutate({ name }, { onError: (err) => setError(String(err)) })
  }

  const handleRename = (collection: AssetCollection) => (name: string) => {
    setDialog(null)
    patchCollection.mutate({ id: collection.id, patch: { name } }, { onError: (err) => setError(String(err)) })
  }

  const handleDelete = (collection: AssetCollection) => {
    setDialog(null)
    // 删除当前筛选中的集合时回到「全部」，避免列表带着失效的 collection_id 查询
    if (selectedId === collection.id) onSelect(null)
    deleteCollection.mutate(collection.id, { onError: (err) => setError(String(err)) })
  }

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
        <span>{error}</span>
        <button className="text-danger hover:underline" onClick={() => setError(null)} aria-label="关闭错误提示">
          <X size={12} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px]',
          'transition-[background-color,border-color,color] duration-[120ms]',
          selectedId === null
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-border bg-surface-raised text-text-muted hover:border-border-strong hover:text-text',
        )}
      >
        <FolderOpen size={12} aria-hidden /> 全部
      </button>
      {isLoading ? (
        <Loader2 size={14} className="ml-1 animate-spin text-text-faint" aria-hidden />
      ) : (
        collections.map((collection) => (
          <div
            key={collection.id}
            className={cn(
              'group flex h-7 items-center rounded-md border pl-2.5 transition-[background-color,border-color,color] duration-[120ms]',
              selectedId === collection.id
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border bg-surface-raised text-text-muted hover:border-border-strong hover:text-text',
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(selectedId === collection.id ? null : collection.id)}
              className="flex items-center gap-1.5 text-[11px]"
              title={`筛选集合 ${collection.name}`}
            >
              {collection.name}
              <span className="text-[10px] opacity-60">{collection.member_count}</span>
            </button>
            <div className="flex items-center opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 focus-within:opacity-100">
              <IconButton label={`重命名集合 ${collection.name}`} size="sm" className="h-7 px-1" onClick={() => setDialog({ kind: 'rename', collection })}>
                <Pencil size={11} aria-hidden />
              </IconButton>
              <IconButton label={`删除集合 ${collection.name}`} size="sm" className="h-7 px-1" onClick={() => setDialog({ kind: 'delete', collection })}>
                <Trash2 size={11} aria-hidden />
              </IconButton>
            </div>
          </div>
        ))
      )}
      <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'create' })}>
        <Plus size={13} aria-hidden /> 新建集合
      </Button>

      <Dialog open={dialog?.kind === 'create'} onClose={() => setDialog(null)} title="新建集合">
        <NameForm initial="" submitLabel="创建" onSubmit={handleCreate} onCancel={() => setDialog(null)} />
      </Dialog>

      <Dialog open={dialog?.kind === 'rename'} onClose={() => setDialog(null)} title="重命名集合">
        {dialog?.kind === 'rename' && (
          <NameForm
            initial={dialog.collection.name}
            submitLabel="保存"
            onSubmit={handleRename(dialog.collection)}
            onCancel={() => setDialog(null)}
          />
        )}
      </Dialog>

      <Dialog open={dialog?.kind === 'delete'} onClose={() => setDialog(null)} title="删除集合">
        {dialog?.kind === 'delete' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">
              确定删除集合「{dialog.collection.name}」吗？集合内资产的归类关系将被移除，资产本身不受影响。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
                取消
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(dialog.collection)}>
                删除
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
