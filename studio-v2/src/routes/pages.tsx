/**
 * 路由页面。MVP 页面清单（契约：docs/studio-v2-personal-mvp-scope-... §6）：
 * 项目首页 / 生成画布 / 资产库 / Agent Center / 设置页。
 * 各页面功能在对应切片（F2/F4/F5/F11/F13）实现，本阶段为骨架占位。
 */
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-semibold text-text">{title}</h1>
      <p className="max-w-md text-sm text-text-muted">{description}</p>
      <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
        返回项目首页
      </Button>
    </div>
  )
}

export function ProjectsPage() {
  return (
    <PlaceholderPage
      title="项目首页"
      description="项目列表、创建、打开、重命名、删除与最近项目将在此实现（切片 08）。"
    />
  )
}

export function ProjectDetailPage() {
  return (
    <PlaceholderPage
      title="项目详情"
      description="该项目的画布列表与创建将在此实现（切片 09/17）。"
    />
  )
}

export function CanvasPage() {
  return (
    <PlaceholderPage
      title="生成画布"
      description="React Flow 画布、节点编辑、保存与生成执行将在此实现（切片 09/14/15/17）。"
    />
  )
}

export function AssetsPage() {
  return (
    <PlaceholderPage
      title="资产库"
      description="素材浏览、上传、标签、搜索与回收站将在此实现（切片 19）。"
    />
  )
}

export function AgentsPage() {
  return (
    <PlaceholderPage
      title="Agent Center"
      description="Agents / Skills / Runtimes / Tasks 管理将在此实现（切片 20）。"
    />
  )
}

export function SettingsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-semibold text-text">设置</h1>
      <p className="max-w-md text-sm text-text-muted">
        Provider 配置、存储目录、Runtime 探测与旧版回退将在此实现（切片 11）。
      </p>
      <a
        href="http://127.0.0.1:3888/"
        target="_blank"
        rel="noreferrer"
        className="text-sm text-accent hover:underline"
      >
        返回旧版前端（回退入口）
      </a>
    </div>
  )
}
