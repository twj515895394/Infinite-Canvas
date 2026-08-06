/**
 * 回收站视图（切片 19 F11）。
 * - 列表查询 status=trashed（DELETE 默认进回收站）；
 * - 恢复（POST restore）后资产回到 active 并出现在正常列表；
 * - 彻底删除（purge=true）物理清除，需确认；被画布节点引用时后端返回 409。
 */
import { useState } from 'react'
import { Loader2, RotateCcw, Trash2, Trash } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState, LoadingState } from '@/components/ui/page-state'
import { formatDate, KIND_LABELS, useAssets, usePurgeAsset, useRestoreAsset, type AssetSummary } from '@/features/assets/api'
import { AssetThumbRow } from './AssetCard'

export function RecycleBin() {
  const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useAssets({
    sort: 'updated_at_desc',
    status: 'trashed',
    limit: 48,
  })
  const restoreAsset = useRestoreAsset()
  const purgeAsset = usePurgeAsset()
  const [purgeTarget, setPurgeTarget] = useState<AssetSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assets = data?.pages.flatMap((page) => page.items) ?? []

  if (isLoading) {
    return <LoadingState label="加载回收站…" className="flex-1 py-16" />
  }

  if (isError) {
    return (
      <ErrorState
        title="回收站加载失败"
        className="flex-1 py-8"
        onRetry={() => void refetch()}
      />
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
      )}

      {assets.length === 0 ? (
        <EmptyState
          icon={Trash}
          title="回收站是空的"
          hint="删除的资产会先进入回收站，可以随时恢复。"
          className="flex-1"
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 transition-[border-color,background-color] duration-[120ms] hover:border-border-strong"
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-subtle">
                <AssetThumbRow asset={asset} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-text" title={asset.name}>
                  {asset.name}
                </span>
                <span className="text-[11px] text-text-faint">
                  {KIND_LABELS[asset.kind]} · {formatDate(asset.updated_at)}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                <IconButton
                  label={`恢复 ${asset.name}`}
                  size="sm"
                  onClick={() => restoreAsset.mutate(asset.id, { onError: (err) => setError(String(err)) })}
                >
                  <RotateCcw size={14} aria-hidden />
                </IconButton>
                <IconButton label={`彻底删除 ${asset.name}`} size="sm" onClick={() => setPurgeTarget(asset)}>
                  <Trash2 size={14} aria-hidden />
                </IconButton>
              </div>
            </div>
          ))}
          {hasNextPage && (
            <Button variant="ghost" size="sm" className="self-center" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
              加载更多
            </Button>
          )}
        </div>
      )}

      <Dialog open={purgeTarget != null} onClose={() => setPurgeTarget(null)} title="彻底删除资产">
        {purgeTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">
              确定彻底删除「{purgeTarget.name}」吗？物理文件将被清除，此操作不可恢复。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPurgeTarget(null)}>
                取消
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={purgeAsset.isPending}
                onClick={() =>
                  purgeAsset.mutate(purgeTarget.id, {
                    onSuccess: () => setPurgeTarget(null),
                    onError: (err) => {
                      setPurgeTarget(null)
                      setError(String(err))
                    },
                  })
                }
              >
                {purgeAsset.isPending ? '删除中…' : '彻底删除'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
