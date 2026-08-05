/**
 * 共享媒体缩略组件（切片 10 F9）。
 * 图片走 /api/media-preview 缩略（不传原图）；视频原生元素 preload="metadata"（预览不卡顿）；
 * 音频/文件渲染图标。资产库与画布节点均可复用。
 */
import { FileText, Music2 } from 'lucide-react'
import { cn } from '@/core/utils/cn'
import { thumbnailUrl, type MediaKind } from '@/features/media/api'

export interface MediaThumbnailProps {
  url: string
  kind?: MediaKind
  alt?: string
  /** 图片缩略目标宽（像素）。 */
  width?: number
  className?: string
}

export function MediaThumbnail({ url, kind = 'file', alt, width = 512, className }: MediaThumbnailProps) {
  if (kind === 'image') {
    return (
      <img
        src={thumbnailUrl(url, width)}
        alt={alt ?? ''}
        loading="lazy"
        draggable={false}
        className={cn('h-full w-full object-cover', className)}
      />
    )
  }
  if (kind === 'video') {
    return (
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        className={cn('h-full w-full object-cover bg-black', className)}
      />
    )
  }
  if (kind === 'audio') {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-surface-subtle', className)}>
        <Music2 className="size-5 text-text-tertiary" aria-hidden />
      </div>
    )
  }
  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-surface-subtle', className)}>
      <FileText className="size-5 text-text-tertiary" aria-hidden />
    </div>
  )
}
