/**
 * 资产预览对话框（切片 19 F11）。
 * - 图片原图 / 视频 / 音频走共享 MediaPreview；文档给下载入口；
 * - 版本列表来自资产详情（GET /assets/{id} 的 versions[]，version_no 倒序），展示基础历史版本；
 * - 操作（编辑/移入回收站）回调页面统一处理，保持单一路径。
 */
import { Bot, Download, Loader2, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { MediaPreview } from '@/features/media/components/MediaPreview'
import { downloadUrl } from '@/features/media/api'
import {
  DERIVATION_LABELS,
  formatBytes,
  formatDate,
  toMediaKind,
  useAssetDetail,
  type AssetSummary,
} from '@/features/assets/api'

function VersionList({ assetId }: { assetId: string }) {
  const { data, isLoading, isError, refetch } = useAssetDetail(assetId)
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden /> 加载版本…
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex items-center justify-between py-3 text-xs text-danger">
        <span>版本列表加载失败</span>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }
  const versions = data?.versions ?? []
  if (versions.length === 0) {
    return <p className="py-3 text-xs text-text-faint">暂无版本记录</p>
  }
  return (
    <ul className="flex flex-col gap-1">
      {versions.map((version) => (
        <li
          key={version.id}
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5"
        >
          <div className="min-w-0">
            <span className="text-xs font-medium text-text">v{version.version_no}</span>
            <span className="ml-2 text-[11px] text-text-muted">
              {DERIVATION_LABELS[version.derivation_type] ?? '其他'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-text-faint">
            <span>{formatDate(version.created_at)}</span>
            <span>{formatBytes(version.size_bytes)}</span>
            <a
              href={downloadUrl(version.content_url, `v${version.version_no}`)}
              className="inline-flex items-center gap-1 text-accent hover:underline"
              title="下载该版本"
            >
              <Download size={12} aria-hidden />
            </a>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function PreviewDialog({
  asset,
  onClose,
  onEdit,
  onTrash,
  onUseAgent,
}: {
  asset: AssetSummary | null
  onClose: () => void
  onEdit: (asset: AssetSummary) => void
  onTrash: (asset: AssetSummary) => void
  /** 选中素材 → 打开 Agent Dock（F14）。 */
  onUseAgent?: (asset: AssetSummary) => void
}) {
  const version = asset?.current_version ?? null
  return (
    <Dialog open={asset != null} onClose={onClose} title={asset?.name ?? '预览'} className="max-w-xl">
      {asset && (
        <div className="flex flex-col gap-3">
          {version && version.content_url ? (
            <div className="flex h-56 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-subtle">
              <MediaPreview url={version.content_url} kind={toMediaKind(asset.kind)} name={asset.name} />
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-text-faint">该资产没有可预览的内容</p>
          )}

          {asset.description && <p className="text-xs leading-relaxed text-text-muted">{asset.description}</p>}

          {asset.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {asset.tags.map((tag) => (
                <span key={tag} className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-muted">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 border-t border-border pt-2 text-[11px] text-text-faint">
            <span>{formatDate(asset.created_at)}</span>
            <span>{formatBytes(version?.size_bytes ?? 0)}</span>
            {asset.reference_count > 0 && <span>被引用 {asset.reference_count} 次</span>}
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-[11px] text-text-muted">版本历史</p>
            <VersionList assetId={asset.id} />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={onClose}>
              关闭
            </Button>
            {onUseAgent && (
              <Button
                variant="primary"
                size="sm"
                disabled={!asset.current_version}
                onClick={() => onUseAgent(asset)}
              >
                <Bot size={13} aria-hidden /> 使用 Agent
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onEdit(asset)}>
              <Pencil size={13} aria-hidden /> 编辑
            </Button>
            <Button variant="danger" size="sm" onClick={() => onTrash(asset)}>
              <Trash2 size={13} aria-hidden /> 移入回收站
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
