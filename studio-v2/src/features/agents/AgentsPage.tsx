/**
 * Agent Center 页面（切片 20 F13）。
 * 四 Tab：Agents / Skills / Runtimes / Tasks。
 * 动效：Tab 内容 crossfade ≤180ms、spring bounce:0；reduced-motion 降级。
 * 第一版不建 Permissions / Activity 管理页（MVP §6.5）。
 */
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '@/core/utils/cn'
import { AgentsTab } from '@/features/agents/components/AgentsTab'
import { RuntimesTab } from '@/features/agents/components/RuntimesTab'
import { SkillsTab } from '@/features/agents/components/SkillsTab'
import { TasksTab } from '@/features/agents/components/TasksTab'

const TABS = [
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'runtimes', label: 'Runtimes' },
  { id: 'tasks', label: 'Tasks' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function AgentsPage() {
  const [tab, setTab] = useState<TabId>('agents')
  const reduced = useReducedMotion()

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 overflow-y-auto px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-text">Agent Center</h1>
        <p className="text-sm text-text-muted">
          管理 Agents、Skills、Runtimes 与 Tasks，完成配置 → 探测 → 绑定 → 测试运行闭环。
        </p>
      </header>

      {/* 分段控件：选中态用 accent 底，切换反馈 ≤120ms */}
      <div
        role="tablist"
        aria-label="Agent Center 分区"
        className="flex w-fit gap-0.5 rounded-lg border border-border bg-surface p-0.5"
      >
        {TABS.map((t) => {
          const selected = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`agent-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                'relative h-8 rounded-md px-3 text-xs font-medium transition-colors duration-[120ms]',
                selected ? 'text-text' : 'text-text-muted hover:text-text',
              )}
            >
              {selected && (
                <motion.span
                  layoutId="agent-center-tab-pill"
                  className="absolute inset-0 rounded-md bg-surface-raised shadow-[0_0_0_1px_var(--color-border)]"
                  transition={
                    reduced
                      ? { duration: 0.12 }
                      : { type: 'spring', bounce: 0, duration: 0.18 }
                  }
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`agent-tab-${tab}`}
        className="min-h-0 flex-1 pb-8"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={
              reduced
                ? { duration: 0.12 }
                : { type: 'spring', bounce: 0, duration: 0.18 }
            }
          >
            {tab === 'agents' && <AgentsTab />}
            {tab === 'skills' && <SkillsTab />}
            {tab === 'runtimes' && <RuntimesTab />}
            {tab === 'tasks' && <TasksTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
