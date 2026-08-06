/**
 * 导入/上传对话框（切片 19 F11）。
 * - 上传文件：multipart → /api/v2/assets/ingest/upload（XHR 进度/可取消，50MB 上限）；
 * - 远程 URL / 本地路径：JSON → /api/v2/assets/ingest（remote_url / local_file，按源独立成败）；
 * - 共享的标签与集合（可选）；成功后经 invalidation 刷新列表（新资产出现在列表顶部）。
 */
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CloudUpload, Globe, Loader2, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldLabel, SelectField, TextArea, TextInput } from '@/components/ui/form'
import { MAX_UPLOAD_BYTES } from '@/features/media/api'
import { cn } from '@/core/utils/cn'
import {
  assetKeys,
  IngestUploadAbortError,
  IngestUploadError,
  ingestUpload,
  normalizeIngestResults,
  splitTags,
  useCollections,
  useIngest,
  type IngestOutcome,
} from '@/features/assets/api'

type ImportMode = 'upload' | 'remote' | 'local'

const MODE_TABS: { value: ImportMode; label: string; hint: string }[] = [
  { value: 'upload', label: '上传文件', hint: '从本机选择文件上传，创建为资产' },
  { value: 'remote', label: '远程 URL', hint: '从公网 http/https 地址导入' },
  { value: 'local', label: '本地路径', hint: '导入本地素材目录中的文件（相对路径）' },
]

function ResultList({ outcomes }: { outcomes: IngestOutcome[] }) {
  if (outcomes.length === 0) return null
  return (
    <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
      {outcomes.map((outcome) => (
        <li
          key={outcome.index}
          className={cn(
            'flex items-start gap-1.5 rounded-md px-2 py-1 text-xs',
            outcome.ok ? 'bg-surface text-text-muted' : 'bg-danger/10 text-danger',
          )}
        >
          {outcome.ok ? (
            <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-success" aria-hidden />
          ) : (
            <XCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="font-medium">{outcome.ok ? outcome.name : '导入失败'}</span>
            {outcome.detail && !outcome.ok && <span className="block text-[11px] opacity-80">{outcome.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: collectionsData } = useCollections()
  const ingest = useIngest()

  const [mode, setMode] = useState<ImportMode>('upload')
  const [tagsText, setTagsText] = useState('')
  const [collectionId, setCollectionId] = useState('')

  // upload 模式状态
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [uploadOutcomes, setUploadOutcomes] = useState<IngestOutcome[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)

  // remote/local 文本
  const [sourceText, setSourceText] = useState('')

  const collections = collectionsData?.collections ?? []
  const tags = splitTags(tagsText)
  const collection = collectionId || null

  // 每次打开时重置为初始状态，避免上次结果残留
  useEffect(() => {
    if (!open) return
    setMode('upload')
    setTagsText('')
    setCollectionId('')
    setSourceText('')
    setUploadOutcomes([])
    setUploadError(null)
    setUploadPercent(0)
  }, [open])

  // 关闭时中止进行中的上传
  const handleClose = () => {
    abortRef.current?.()
    onClose()
  }

  const startUpload = (files: File[]) => {
    if (files.length === 0) return
    const oversized = files.filter((file) => file.size > MAX_UPLOAD_BYTES)
    if (oversized.length > 0) {
      setUploadError(`${oversized[0].name} 超过 50MB，无法上传`)
      return
    }
    setUploading(true)
    setUploadError(null)
    setUploadOutcomes([])
    setUploadPercent(0)
    const handle = ingestUpload(files, {
      tags,
      collectionId: collection,
      onProgress: (percent) => setUploadPercent(percent),
    })
    abortRef.current = handle.abort
    handle.promise
      .then((result) => {
        const merged: IngestOutcome[] = [
          ...result.assets.map((asset, index) => ({ index, ok: true, name: asset.name })),
          ...result.failures.map((failure, index) => ({
            index: index + result.assets.length,
            ok: false,
            name: failure.title,
            detail: failure.detail,
          })),
        ]
        setUploadOutcomes(merged)
        setUploading(false)
        abortRef.current = null
        qc.invalidateQueries({ queryKey: assetKeys.all })
      })
      .catch((err: unknown) => {
        if (err instanceof IngestUploadAbortError) return
        setUploading(false)
        abortRef.current = null
        setUploadError(err instanceof IngestUploadError ? err.message : '上传失败，请重试')
      })
  }

  const cancelUpload = () => {
    abortRef.current?.()
    setUploading(false)
  }

  const submitIngest = () => {
    const lines = sourceText.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length === 0) return
    ingest.mutate(
      {
        sources: lines.map((line) =>
          mode === 'remote' ? { type: 'remote_url' as const, url: line } : { type: 'local_file' as const, path: line },
        ),
        tags,
        collection_id: collection,
      },
      { onError: (err) => setUploadError(String(err)) },
    )
  }

  const outcomes = mode === 'upload' ? uploadOutcomes : (ingest.data ? normalizeIngestResults(ingest.data.results) : [])
  const submitting = ingest.isPending
  const busy = uploading || submitting

  return (
    <Dialog open={open} onClose={handleClose} title="导入/上传资产" className="max-w-xl">
      <div className="flex flex-col gap-3">
        <div className="flex gap-1 rounded-md bg-surface p-0.5">
          {MODE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              disabled={busy}
              onClick={() => setMode(tab.value)}
              className={cn(
                'flex-1 rounded px-2 py-1.5 text-xs transition-[background-color,color] duration-[120ms]',
                mode === tab.value ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text',
                busy && 'cursor-not-allowed opacity-50',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-text-faint">{MODE_TABS.find((tab) => tab.value === mode)?.hint}</p>

        {mode === 'upload' ? (
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                startUpload(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex h-24 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-surface text-text-muted',
                'transition-[border-color,background-color] duration-[120ms] hover:border-accent hover:text-text',
                busy && 'pointer-events-none opacity-60',
              )}
            >
              {uploading ? (
                <>
                  <Loader2 size={18} className="animate-spin text-accent" aria-hidden />
                  <span className="text-xs">{Math.round(uploadPercent)}%</span>
                </>
              ) : (
                <>
                  <CloudUpload size={18} aria-hidden />
                  <span className="text-xs">点击选择文件（单个 ≤ 50MB）</span>
                </>
              )}
            </button>
            {uploading && (
              <div className="h-1 w-full overflow-hidden rounded bg-surface-raised">
                <div
                  className="h-full rounded bg-accent transition-[width] duration-[120ms]"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            )}
            {uploading && (
              <Button variant="ghost" size="sm" onClick={cancelUpload}>
                <X size={13} aria-hidden /> 取消上传
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <TextArea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={4}
              placeholder={mode === 'remote' ? '每行一个 URL，例如：\nhttps://example.com/photo.png' : '每行一个相对路径，例如：\nref/photo.png'}
              disabled={busy}
            />
            <Button variant="primary" size="sm" className="self-end" onClick={submitIngest} disabled={busy || sourceText.trim() === ''}>
              {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Globe size={13} aria-hidden />}
              {submitting ? '导入中…' : mode === 'remote' ? '导入 URL' : '导入路径'}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <FieldLabel>标签（可选，逗号分隔）</FieldLabel>
            <TextInput value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="例如：参考, 素材" disabled={busy} />
          </label>
          <label className="flex flex-col gap-1">
            <FieldLabel>归类到集合（可选）</FieldLabel>
            <SelectField value={collectionId} onChange={(e) => setCollectionId(e.target.value)} disabled={busy}>
              <option value="">不归类</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </SelectField>
          </label>
        </div>

        {uploadError && (
          <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            <span>{uploadError}</span>
            <button className="text-danger hover:underline" onClick={() => setUploadError(null)} aria-label="关闭错误提示">
              <X size={12} aria-hidden />
            </button>
          </div>
        )}

        <ResultList outcomes={outcomes} />

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            关闭
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
