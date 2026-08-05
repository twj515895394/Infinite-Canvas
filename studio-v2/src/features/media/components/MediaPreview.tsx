/**
 * 共享媒体预览组件（切片 10 F9）。
 * 图片显示原图；视频/音频原生播放器；文件给出下载入口。
 * 用于资产库预览与画布节点结果查看。
 */
import { FileDown } from 'lucide-react'
import { cn } from '@/core/utils/cn'
import { downloadUrl, type MediaKind } from '@/features/media/api'

export interface MediaPreviewProps {
  url: string
  kind?: MediaKind
  name?: string
  className?: string
}

export function MediaPreview({ url, kind = 'file', name, className }: MediaPreviewProps) {
  if (kind === 'image') {
    return <img src={url} alt={name ?? ''} className={cn('max-h-full max-w-full object-contain', className)} />
  }
  if (kind === 'video') {
    return <video src={url} controls playsInline preload="metadata" className={cn('max-h-full w-full', className)} />
  }
  if (kind === 'audio') {
    return <audio src={url} controls className={cn('w-full', className)} />
  }
  return (
    <div className={cn('flex flex-col items-center gap-2 text-text-muted', className)}>
      <FileDown className="size-6" aria-hidden />
      <span className="text-xs">{name || '文件'}</span>
      <a href={downloadUrl(url, name)} className="text-xs text-accent hover:underline">
        下载文件
      </a>
    </div>
  )
}
