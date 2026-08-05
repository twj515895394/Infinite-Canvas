/**
 * 共享上传组件（切片 10 F9）。
 * 选择文件 → 自动上传（XHR 进度）→ 成功回调 UploadedFile[]；失败显示可理解错误并可重试；可取消。
 * 取消/中断不产生残留状态（unmount 时 abort 进行中请求；取消不触发 onUploaded、不显示错误）。
 * 资产库与画布可复用；上传结果 url 即稳定标识（后续可经 V2 ingest 转为 Asset）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw, Upload, X } from 'lucide-react'
import { cn } from '@/core/utils/cn'
import { Button } from '@/components/ui/button'
import {
  MAX_UPLOAD_BYTES,
  UploadAbortError,
  UploadError,
  uploadFiles,
  type UploadedFile,
} from '@/features/media/api'

export interface UploadButtonProps {
  multiple?: boolean
  accept?: string
  label?: string
  onUploaded: (files: UploadedFile[]) => void
  className?: string
  disabled?: boolean
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; percent: number }
  | { phase: 'error'; message: string; files: File[] }

export function UploadButton({
  multiple = true,
  accept,
  label = '上传',
  onUploaded,
  className,
  disabled,
}: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const [state, setState] = useState<UploadState>({ phase: 'idle' })

  // 中断场景残留清理：unmount 时中止进行中的上传
  useEffect(() => {
    return () => abortRef.current?.()
  }, [])

  const startUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) return
      const oversized = files.find((f) => f.size > MAX_UPLOAD_BYTES)
      if (oversized) {
        setState({ phase: 'error', message: `${oversized.name} 超过 50MB，无法上传`, files })
        return
      }
      const handle = uploadFiles(files, {
        onProgress: (percent) => setState({ phase: 'uploading', percent }),
      })
      abortRef.current = handle.abort
      handle.promise
        .then((uploaded) => {
          abortRef.current = null
          setState({ phase: 'idle' })
          onUploaded(uploaded)
        })
        .catch((err) => {
          abortRef.current = null
          if (err instanceof UploadAbortError) {
            setState({ phase: 'idle' }) // 取消不是错误，不残留提示
            return
          }
          setState({
            phase: 'error',
            message: err instanceof UploadError ? err.message : '上传失败，请重试',
            files,
          })
        })
    },
    [onUploaded],
  )

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = '' // 允许重复选择同一文件
    startUpload(files)
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={onPick}
        aria-label={label}
      />
      {state.phase === 'uploading' ? (
        <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface-raised px-3">
          <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden />
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-subtle">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150 ease-ui"
              style={{ width: `${Math.max(state.percent, 4)}%` }}
            />
          </div>
          <button
            type="button"
            aria-label="取消上传"
            title="取消上传"
            className="text-text-tertiary transition-colors duration-120 hover:text-text"
            onClick={() => {
              abortRef.current?.()
              setState({ phase: 'idle' })
            }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : state.phase === 'error' ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-danger">{state.message}</p>
          <div className="flex gap-1.5">
            <Button variant="danger" size="sm" onClick={() => startUpload(state.files)}>
              <RotateCcw className="size-3.5" aria-hidden />
              重试
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setState({ phase: 'idle' })}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="default"
          size="md"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className={className}
        >
          <Upload className="size-4" aria-hidden />
          {label}
        </Button>
      )}
    </div>
  )
}
