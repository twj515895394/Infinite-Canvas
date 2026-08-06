/**
 * 资产卡片（切片 19 F11）。
 * - 缩略图复用 MediaThumbnail：图片/视频 poster 走 /api/media-preview，不传原图；
 *   后端 preview_url 已带缩略参数，这里传 content_url 由 MediaThumbnail 统一包装，避免二次编码；
 * - 卡片 hover 反馈仅 color/opacity/transform（≤120ms）；列表卡片用 content-visibility 保障大量资产滚动性能；
 * - 图标/标签/时间均为纯展示，数据来自归一化后的 AssetSummary。
 */
import { Eye, Pencil, Trash2, FileText, Music2, Workflow, Archive, Image as ImageIcon, Video, type LucideIcon } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { cn } from '@/core/utils/cn'
import { MediaThumbnail } from '@/features/media/components/MediaThumbnail'
import {
  formatBytes,
  formatDate,
  formatDuration,
  KIND_LABELS,
  toMediaKind,
  type AssetKind,
  type AssetSummary,
} from '@/features/assets/api'

const KIND_ICONS: Record<AssetKind, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Music2,
  document: FileText,
  workflow: Workflow,
  archive: Archive,
}

export function KindIcon({ kind, size = 14, className }: { kind: AssetKind; size?: number; className?: string }) {
  const Icon = KIND_ICONS[kind] ?? FileText
  return <Icon size={size} className={className} aria-hidden />
}

/** 缩略图（供列表行/回收站复用）：无内容时渲染类型图标占位。 */
export function AssetThumbRow({ asset, className }: { asset: AssetSummary; className?: string }) {
  const version = asset.current_version
  if (!version || !version.content_url) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-surface-subtle', className)}>
        <KindIcon kind={asset.kind} size={18} className="text-text-tertiary" />
      </div>
    )
  }
  return (
    <MediaThumbnail
      url={version.content_url}
      kind={toMediaKind(asset.kind)}
      alt={asset.name}
      width={320}
      className={className}
    />
  )
}

function AssetThumb({ asset, className }: { asset: AssetSummary; className?: string }) {
  const version = asset.current_version
  if (!version || !version.content_url) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-surface-subtle', className)}>
        <KindIcon kind={asset.kind} size={22} className="text-text-tertiary" />
      </div>
    )
  }
  return (
    <MediaThumbnail
      url={version.content_url}
      kind={toMediaKind(asset.kind)}
      alt={asset.name}
      width={480}
      className={cn('transition-transform duration-[120ms] group-hover:scale-[1.02]', className)}
    />
  )
}

function KindBadge({ asset }: { asset: AssetSummary }) {
  return (
    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-surface-overlay px-1.5 py-0.5 text-[10px] text-text">
      <KindIcon kind={asset.kind} size={10} />
      {KIND_LABELS[asset.kind]}
    </span>
  )
}

/** 视频/音频时长角标（无时长不渲染）。 */
function DurationBadge({ asset }: { asset: AssetSummary }) {
  const ms = asset.current_version?.duration_ms
  if (!ms) return null
  return (
    <span className="absolute bottom-1.5 right-1.5 rounded bg-surface-overlay px-1 py-0.5 text-[10px] text-text">
      {formatDuration(ms)}
    </span>
  )
}

export interface AssetCardActions {
  onPreview: () => void
  onEdit: () => void
  onTrash: () => void
}

/** 网格卡片：缩略图点击预览，hover 显示操作；content-visibility 提升长列表滚动性能。 */
export function AssetGridCard({ asset, actions }: { asset: AssetSummary; actions: AssetCardActions }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-[border-color,background-color] duration-[120ms] hover:border-border-strong [content-visibility:auto] [contain-intrinsic-size:auto_230px]">
      <button
        type="button"
        onClick={actions.onPreview}
        aria-label={`预览 ${asset.name}`}
        className="relative aspect-[4/3] w-full overflow-hidden bg-surface-subtle"
      >
        <AssetThumb asset={asset} />
        <KindBadge asset={asset} />
        <DurationBadge asset={asset} />
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <span className="truncate text-xs font-medium text-text" title={asset.name}>
          {asset.name}
        </span>
        <div className="flex min-h-4 flex-wrap gap-1">
          {asset.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-muted">
              {tag}
            </span>
          ))}
          {asset.tags.length > 2 && <span className="text-[10px] text-text-faint">+{asset.tags.length - 2}</span>}
        </div>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[11px] text-text-faint">{formatDate(asset.updated_at)}</span>
          <div className="flex gap-0.5 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 focus-within:opacity-100">
            <IconButton label={`预览 ${asset.name}`} size="sm" onClick={actions.onPreview}>
              <Eye size={14} aria-hidden />
            </IconButton>
            <IconButton label={`编辑 ${asset.name}`} size="sm" onClick={actions.onEdit}>
              <Pencil size={14} aria-hidden />
            </IconButton>
            <IconButton label={`删除 ${asset.name}`} size="sm" onClick={actions.onTrash}>
              <Trash2 size={14} aria-hidden />
            </IconButton>
          </div>
        </div>
      </div>
    </article>
  )
}

/** 列表行：更紧凑的信息密度，适合大量资产浏览。 */
export function AssetListRow({ asset, actions }: { asset: AssetSummary; actions: AssetCardActions }) {
  return (
    <div className="group flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 transition-[border-color,background-color] duration-[120ms] hover:border-border-strong [content-visibility:auto]">
      <button
        type="button"
        onClick={actions.onPreview}
        aria-label={`预览 ${asset.name}`}
        className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-subtle"
      >
        <AssetThumb asset={asset} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-text" title={asset.name}>
            {asset.name}
          </span>
          <span className="shrink-0 text-[10px] text-text-faint">{KIND_LABELS[asset.kind]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {asset.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-muted">
              {tag}
            </span>
          ))}
          {asset.tags.length > 3 && <span className="text-[10px] text-text-faint">+{asset.tags.length - 3}</span>}
        </div>
      </div>
      <span className="hidden w-16 shrink-0 text-right text-[11px] text-text-faint sm:block">
        {formatBytes(asset.current_version?.size_bytes ?? 0)}
      </span>
      <span className="hidden w-32 shrink-0 text-right text-[11px] text-text-faint md:block">
        {formatDate(asset.updated_at)}
      </span>
      <div className="flex gap-0.5 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 focus-within:opacity-100">
        <IconButton label={`预览 ${asset.name}`} size="sm" onClick={actions.onPreview}>
          <Eye size={14} aria-hidden />
        </IconButton>
        <IconButton label={`编辑 ${asset.name}`} size="sm" onClick={actions.onEdit}>
          <Pencil size={14} aria-hidden />
        </IconButton>
        <IconButton label={`删除 ${asset.name}`} size="sm" onClick={actions.onTrash}>
          <Trash2 size={14} aria-hidden />
        </IconButton>
      </div>
    </div>
  )
}
