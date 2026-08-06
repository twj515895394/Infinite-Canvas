/**
 * 资产库页面（切片 19 F11，替换占位 AssetsPage）。
 * 结构：标题 + 导入/回收站入口 → 集合栏 → 搜索/类型/排序/视图切换工具栏 → 网格/列表 → 加载更多；
 * 空状态（无资产/无搜索结果）与错误状态用共享 EmptyState；删除默认进回收站（确认后）。
 * 搜索输入本地防抖 300ms 再触发服务端 query（query 匹配名称/描述/标签）。
 */
import { useEffect, useState } from 'react'
import { Inbox, LayoutGrid, List, Loader2, Search, Trash, Upload, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ChipGroup, SelectField } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/core/utils/cn'
import { AssetGridCard, AssetListRow } from '@/features/assets/components/AssetCard'
import { CollectionBar } from '@/features/assets/components/CollectionBar'
import { EditDialog } from '@/features/assets/components/EditDialog'
import { ImportDialog } from '@/features/assets/components/ImportDialog'
import { PreviewDialog } from '@/features/assets/components/PreviewDialog'
import { RecycleBin } from '@/features/assets/components/RecycleBin'
import {
  collectAssets,
  KIND_OPTIONS,
  useAssets,
  useTrashAsset,
  type AssetKind,
  type AssetSort,
  type AssetSummary,
} from '@/features/assets/api'

/** 本地防抖：输入变化后延迟触发服务端查询，避免每键一次请求。 */
function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

type DialogState =
  | { kind: 'import' }
  | { kind: 'preview'; asset: AssetSummary }
  | { kind: 'edit'; asset: AssetSummary }
  | { kind: 'delete'; asset: AssetSummary }
  | null

const SORT_OPTIONS: { value: AssetSort; label: string }[] = [
  { value: 'updated_at_desc', label: '最近更新' },
  { value: 'updated_at_asc', label: '最早更新' },
  { value: 'created_at_desc', label: '最近创建' },
  { value: 'name_asc', label: '名称 A-Z' },
  { value: 'name_desc', label: '名称 Z-A' },
]

export default function AssetsPage() {
  const trashAsset = useTrashAsset()

  const [view, setView] = useState<'library' | 'trash'>('library')
  const [display, setDisplay] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<AssetKind | 'all'>('all')
  const [sort, setSort] = useState<AssetSort>('updated_at_desc')
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [error, setError] = useState<string | null>(null)

  const debouncedSearch = useDebouncedValue(search, 300)

  const query = useAssets({
    kind,
    sort,
    collection_id: collectionId,
    query: debouncedSearch || null,
    limit: 48,
  })
  const assets = collectAssets(query.data?.pages)

  // 进入回收站时清掉集合筛选（trashed 列表不受集合影响，避免残留筛选条件）
  const switchView = (next: 'library' | 'trash') => {
    if (next !== view) {
      setView(next)
      setCollectionId(null)
      setDialog(null)
    }
  }

  const handleTrash = (asset: AssetSummary) => {
    setDialog(null)
    trashAsset.mutate(asset.id, { onError: (err) => setError(String(err)) })
  }

  const hasActiveFilter = kind !== 'all' || collectionId != null || debouncedSearch.trim() !== ''
  const showEmpty = !query.isLoading && !query.isError && assets.length === 0

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-4 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text">资产库</h1>
          <p className="text-sm text-text-muted">浏览、上传与整理创作素材</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === 'trash' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => switchView(view === 'trash' ? 'library' : 'trash')}
          >
            <Trash size={14} aria-hidden /> {view === 'trash' ? '返回资产库' : '回收站'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setDialog({ kind: 'import' })}>
            <Upload size={14} aria-hidden /> 导入/上传
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span>{error}</span>
          <button className="text-danger hover:underline" onClick={() => setError(null)} aria-label="关闭错误提示">
            <X size={13} aria-hidden />
          </button>
        </div>
      )}

      {view === 'trash' ? (
        <RecycleBin />
      ) : (
        <>
          <CollectionBar selectedId={collectionId} onSelect={setCollectionId} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索名称、描述或标签"
                className="h-8 w-full rounded-md border border-border bg-bg pl-8 pr-3 text-xs text-text outline-none focus:border-accent"
              />
            </div>
            <ChipGroup
              options={[{ value: 'all', label: '全部' }, ...KIND_OPTIONS]}
              value={kind}
              onChange={(value) => setKind(value as AssetKind | 'all')}
            />
            <SelectField value={sort} onChange={(e) => setSort(e.target.value as AssetSort)} className="h-8 w-28">
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <div className="flex gap-0.5 rounded-md border border-border bg-surface p-0.5">
              <IconButton
                label="网格视图"
                size="sm"
                className={cn(display === 'grid' && 'bg-surface-raised text-accent')}
                onClick={() => setDisplay('grid')}
              >
                <LayoutGrid size={14} aria-hidden />
              </IconButton>
              <IconButton
                label="列表视图"
                size="sm"
                className={cn(display === 'list' && 'bg-surface-raised text-accent')}
                onClick={() => setDisplay('list')}
              >
                <List size={14} aria-hidden />
              </IconButton>
            </div>
          </div>

          {query.isLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-text-muted">
              <Loader2 size={15} className="animate-spin" aria-hidden /> 加载资产…
            </div>
          ) : query.isError ? (
            <EmptyState
              icon={Inbox}
              title="资产列表加载失败"
              hint="请检查后端服务是否可用后重试。"
              className="flex-1"
              action={
                <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
                  重试
                </Button>
              }
            />
          ) : showEmpty ? (
            hasActiveFilter ? (
              <EmptyState
                icon={Search}
                title="没有匹配的资产"
                hint="换一个关键词或清除筛选条件试试。"
                className="flex-1"
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch('')
                      setKind('all')
                      setCollectionId(null)
                    }}
                  >
                    清除筛选
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title="资产库还是空的"
                hint="上传文件、导入远程 URL 或本地素材，开始积累你的创作资产。"
                className="flex-1"
                action={
                  <Button size="sm" onClick={() => setDialog({ kind: 'import' })}>
                    <Upload size={13} aria-hidden /> 导入/上传
                  </Button>
                }
              />
            )
          ) : (
            <div className="flex flex-1 flex-col gap-3">
              {display === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {assets.map((asset) => (
                    <AssetGridCard
                      key={asset.id}
                      asset={asset}
                      actions={{
                        onPreview: () => setDialog({ kind: 'preview', asset }),
                        onEdit: () => setDialog({ kind: 'edit', asset }),
                        onTrash: () => setDialog({ kind: 'delete', asset }),
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {assets.map((asset) => (
                    <AssetListRow
                      key={asset.id}
                      asset={asset}
                      actions={{
                        onPreview: () => setDialog({ kind: 'preview', asset }),
                        onEdit: () => setDialog({ kind: 'edit', asset }),
                        onTrash: () => setDialog({ kind: 'delete', asset }),
                      }}
                    />
                  ))}
                </div>
              )}
              {query.hasNextPage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-center"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage && <Loader2 size={13} className="animate-spin" aria-hidden />}
                  加载更多
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <ImportDialog open={dialog?.kind === 'import'} onClose={() => setDialog(null)} />

      <PreviewDialog
        asset={dialog?.kind === 'preview' ? dialog.asset : null}
        onClose={() => setDialog(null)}
        onEdit={(asset) => setDialog({ kind: 'edit', asset })}
        onTrash={(asset) => setDialog({ kind: 'delete', asset })}
      />

      <EditDialog asset={dialog?.kind === 'edit' ? dialog.asset : null} onClose={() => setDialog(null)} />

      <Dialog open={dialog?.kind === 'delete'} onClose={() => setDialog(null)} title="移入回收站">
        {dialog?.kind === 'delete' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">
              确定将「{dialog.asset.name}」移到回收站吗？资产仍保留文件，可在回收站恢复。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
                取消
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleTrash(dialog.asset)} disabled={trashAsset.isPending}>
                {trashAsset.isPending ? '移入中…' : '移入回收站'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
