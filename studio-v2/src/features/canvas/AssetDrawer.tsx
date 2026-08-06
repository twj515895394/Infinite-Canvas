/**
 * 画布 Asset Drawer（F12）：画布页左侧可折叠资产面板。
 * - 复用 assets 查询与缩略图；拖拽资产卡片到画布创建 asset 节点（dataTransfer 只携带引用）；
 * - 回收站（trashed）资产禁拖（拖拽源禁用 + 拖拽时提示），满足验收"回收站资产拖入被拒绝或明确提示"；
 * - 动效契约（apple-design）：面板开合仅 transform/opacity（≤180ms）；卡片 hover 仅颜色过渡。
 */
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Loader2, PanelLeftClose, PanelLeftOpen, Inbox } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { cn } from '@/core/utils/cn'
import { ASSET_DRAG_MIME, assetToDragPayload, useAssets, type AssetDragPayload, type AssetSummary } from '@/features/assets/api'
import { MediaThumbnail } from '@/features/media/components/MediaThumbnail'
import { toMediaKind } from '@/features/assets/api'

function DrawerItem({ asset, onDragStart, onDragEnd }: {
  asset: AssetSummary
  onDragStart: (payload: AssetDragPayload) => void
  onDragEnd: () => void
}) {
  const payload = assetToDragPayload(asset)
  const trashed = asset.lifecycle_status === 'trashed'
  return (
    <div
      draggable={payload != null}
      onDragStart={(e) => {
        if (!payload) return
        e.dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify(payload))
        e.dataTransfer.effectAllowed = 'copy'
        onDragStart(payload)
      }}
      onDragEnd={onDragEnd}
      title={trashed ? '回收站资产不能拖入画布' : `拖入画布：${asset.name}`}
      className={cn(
        'flex cursor-grab items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5',
        'transition-[background-color,border-color] duration-[120ms]',
        payload ? 'hover:border-border-strong hover:bg-surface-raised' : 'cursor-not-allowed opacity-50',
      )}
    >
      <div className="size-8 shrink-0 overflow-hidden rounded bg-bg">
        {payload ? (
          <MediaThumbnail
            url={payload.contentUrl}
            kind={toMediaKind(payload.kind)}
            alt={asset.name}
            width={96}
          />
        ) : (
          <Inbox size={14} className="p-2 text-text-faint" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-text">{asset.name}</p>
        <p className="truncate text-[10px] text-text-faint">
          {trashed ? '已回收（不可拖入）' : asset.kind}
        </p>
      </div>
    </div>
  )
}

export function AssetDrawer() {
  const [open, setOpen] = useState(true)
  const [dragging, setDragging] = useState(false)
  const reduceMotion = useReducedMotion()
  const query = useAssets({ sort: 'updated_at_desc', limit: 60 })
  const assets = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="relative flex h-full shrink-0">
      {/* 折叠态细条：悬停在左边缘时提示可展开 */}
      {!open && (
        <div className="flex w-9 flex-col items-center border-r border-border bg-surface py-2">
          <IconButton label="展开资产面板" size="sm" onClick={() => setOpen(true)}>
            <PanelLeftOpen size={14} aria-hidden />
          </IconButton>
        </div>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            initial={reduceMotion ? false : { x: -16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduceMotion ? undefined : { x: -16, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="flex h-full w-60 flex-col border-r border-border bg-surface"
          >
            <header className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
              <span className="pl-1 text-[11px] font-medium text-text">资产</span>
              <IconButton label="收起资产面板" size="sm" onClick={() => setOpen(false)}>
                <PanelLeftClose size={14} aria-hidden />
              </IconButton>
            </header>
            {query.isLoading ? (
              <div className="flex flex-1 items-center justify-center text-text-faint">
                <Loader2 size={15} className="animate-spin" aria-hidden />
              </div>
            ) : query.isError ? (
              <p className="p-3 text-[11px] text-text-faint">资产加载失败</p>
            ) : assets.length === 0 ? (
              <p className="p-3 text-[11px] text-text-faint">暂无资产 — 先到资产库导入素材</p>
            ) : (
              <div className="flex-1 overflow-y-auto p-2">
                <div className="flex flex-col gap-1">
                  {assets.map((asset) => (
                    <DrawerItem
                      key={asset.id}
                      asset={asset}
                      onDragStart={() => setDragging(true)}
                      onDragEnd={() => setDragging(false)}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* 拖拽进行中的轻提示：落点提示画布（apple-design：反馈持续于交互全程） */}
            <AnimatePresence>
              {dragging && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="border-t border-border px-3 py-2 text-[10px] text-accent"
                >
                  拖到右侧画布创建节点
                </motion.p>
              )}
            </AnimatePresence>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}
