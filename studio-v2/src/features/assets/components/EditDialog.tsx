/**
 * 编辑资产对话框（切片 19 F11）。
 * - 重命名/描述/标签：PATCH 一次提交；标签为全量替换语义（后端 replace_tags），输入用逗号分隔文本；
 * - 归类：勾选/取消集合即调用 members add/remove（即时生效），与保存元数据解耦；
 * - 表单全部使用共享控件（FieldLabel/TextInput/TextArea），不内联再造。
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldLabel, TextArea, TextInput } from '@/components/ui/form'
import { cn } from '@/core/utils/cn'
import {
  splitTags,
  useAddCollectionMembers,
  useCollections,
  usePatchAsset,
  useRemoveCollectionMember,
  type AssetSummary,
} from '@/features/assets/api'

export function EditDialog({ asset, onClose }: { asset: AssetSummary | null; onClose: () => void }) {
  const patchAsset = usePatchAsset()
  const { data: collectionsData, isLoading: collectionsLoading } = useCollections()
  const addMembers = useAddCollectionMembers()
  const removeMember = useRemoveCollectionMember()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [pendingCollections, setPendingCollections] = useState<ReadonlySet<string>>(new Set())
  const [localCollections, setLocalCollections] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // 集合勾选状态一并重置：避免上一资产的 in-flight 请求 onSettled 作用于新资产
  useEffect(() => {
    if (!asset) return
    setName(asset.name)
    setDescription(asset.description)
    setTagsText(asset.tags.join(', '))
    setError(null)
    setPendingCollections(new Set())
    // 本地勾选状态以当前资产初始化（乐观更新；列表刷新后由 invalidation 校正）
    setLocalCollections(new Set(asset.collection_ids))
  }, [asset])

  const collections = collectionsData?.collections ?? []
  const saving = patchAsset.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!asset) return
    const trimmedName = name.trim()
    if (!trimmedName) return
    patchAsset.mutate(
      { id: asset.id, patch: { name: trimmedName, description: description.trim(), tags: splitTags(tagsText) } },
      { onSuccess: () => onClose(), onError: (err) => setError(String(err)) },
    )
  }

  // 集合勾选即生效：本地乐观更新勾选态（即时反馈），失败回滚并提示；成功由 invalidation 刷新列表
  const toggleCollection = (collectionId: string) => {
    if (!asset) return
    if (pendingCollections.has(collectionId)) return
    const wasChecked = localCollections.has(collectionId)
    // 乐观更新：先翻转本地勾选（不再依赖 AssetsPage 捕获的 asset 快照）
    setLocalCollections((prev) => {
      const next = new Set(prev)
      if (wasChecked) next.delete(collectionId)
      else next.add(collectionId)
      return next
    })
    setPendingCollections((prev) => new Set(prev).add(collectionId))
    const rollback = () => {
      setLocalCollections((prev) => {
        const next = new Set(prev)
        if (wasChecked) next.add(collectionId)
        else next.delete(collectionId)
        return next
      })
    }
    const onError = (err: unknown) => {
      rollback()
      setError(String(err))
    }
    // 加入/移除是两个不同签名（asset_ids 数组 vs 单个 asset_id），分开调用避免联合类型无法收窄
    if (wasChecked) {
      removeMember.mutate({ collectionId, assetId: asset.id }, { onSettled: () => clearPending(collectionId), onError })
    } else {
      addMembers.mutate({ collectionId, assetIds: [asset.id] }, { onSettled: () => clearPending(collectionId), onError })
    }
  }

  const clearPending = (collectionId: string) => {
    setPendingCollections((prev) => {
      const next = new Set(prev)
      next.delete(collectionId)
      return next
    })
  }

  return (
    <Dialog open={asset != null} onClose={onClose} title="编辑资产">
      {asset && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <FieldLabel>名称</FieldLabel>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="资产名称" />
          </label>

          <label className="flex flex-col gap-1">
            <FieldLabel>描述</FieldLabel>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="补充说明（可选）"
            />
          </label>

          <label className="flex flex-col gap-1">
            <FieldLabel>标签（逗号分隔，保存后整体替换）</FieldLabel>
            <TextInput value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="例如：角色, 场景, 备选" />
          </label>

          <div className="flex flex-col gap-1.5">
            <FieldLabel>归类到集合（勾选即保存）</FieldLabel>
            {collectionsLoading ? (
              <div className="flex items-center gap-2 py-1 text-xs text-text-muted">
                <Loader2 size={13} className="animate-spin" aria-hidden /> 加载集合…
              </div>
            ) : collections.length === 0 ? (
              <p className="py-1 text-[11px] text-text-faint">还没有集合，先在资产库顶部新建集合。</p>
            ) : (
              <div className="flex flex-col gap-1">
                {collections.map((collection) => {
                  const checked = localCollections.has(collection.id)
                  const pending = pendingCollections.has(collection.id)
                  return (
                    <label
                      key={collection.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs',
                        'transition-[background-color,border-color] duration-[120ms] hover:border-border-strong',
                        checked && 'border-accent/50 bg-accent/10',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending}
                        onChange={() => toggleCollection(collection.id)}
                        className="size-3.5 accent-[var(--color-accent)]"
                      />
                      <span className="flex-1 truncate text-text">{collection.name}</span>
                      <span className="text-[10px] text-text-faint">{collection.member_count}</span>
                      {pending && <Loader2 size={12} className="animate-spin text-text-faint" aria-hidden />}
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={saving || !name.trim()}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
