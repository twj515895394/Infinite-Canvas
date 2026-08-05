/**
 * App Shell：四区布局（契约：docs/studio-v2-information-architecture-and-core-workflows.md）
 * - 左侧主导航（两级）
 * - TopBar（项目/页面上下文）
 * - Main 工作区
 * - 右侧 Inspector（340px，MVP 阶段为占位）
 * - 底部 Task Shelf（MVP 阶段为占位）
 */
import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  FolderOpen,
  Images,
  Bot,
  Settings,
  Command,
} from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { cn } from '@/core/utils/cn'

const NAV_ITEMS = [
  { to: '/projects', label: '项目', icon: FolderOpen },
  { to: '/assets', label: '资产库', icon: Images },
  { to: '/agents', label: 'Agent', icon: Bot },
  { to: '/settings', label: '设置', icon: Settings },
]

function SideNav() {
  return (
    <nav className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-2">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 text-accent">
        <Command size={18} aria-hidden />
      </div>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          aria-label={label}
          className={({ isActive }) =>
            cn(
              'flex h-9 w-9 items-center justify-center rounded-md text-text-muted',
              'transition-[background-color,color] duration-[120ms] ease-ui',
              'hover:bg-surface-raised hover:text-text',
              isActive && 'bg-surface-raised text-accent',
            )
          }
        >
          <Icon size={18} aria-hidden />
        </NavLink>
      ))}
    </nav>
  )
}

function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2 text-sm font-medium text-text">
        <span className="text-text-faint">Studio V2</span>
        <span className="text-text-faint">/</span>
        <span>个人创作画布</span>
      </div>
      <div className="flex items-center gap-1">
        <IconButton label="命令面板（占位）" size="sm">
          <Command size={15} aria-hidden />
        </IconButton>
      </div>
    </header>
  )
}

function Inspector() {
  return (
    <aside className="hidden w-[340px] shrink-0 border-l border-border bg-surface lg:flex lg:flex-col">
      <div className="border-b border-border px-4 py-2.5 text-xs font-medium text-text-muted">Inspector</div>
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-text-faint">
        选中节点后在此编辑参数（MVP 阶段）
      </div>
    </aside>
  )
}

function TaskShelf() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border bg-surface px-4">
      <span className="text-xs text-text-faint">Task Shelf</span>
      <span className="text-xs text-text-faint">· 任务状态将在此展示（MVP 阶段）</span>
    </div>
  )
}

export default function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-auto bg-bg">{children ?? <Outlet />}</main>
        </div>
        <Inspector />
      </div>
      <TaskShelf />
    </div>
  )
}
