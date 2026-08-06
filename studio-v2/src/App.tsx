/**
 * 路由表。URL 可恢复项目与工作区（契约：docs/studio-v2-frontend-architecture-overall-design.md）。
 */
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from '@/app/AppShell'
import ProjectsPage from '@/features/projects/ProjectsPage'
import CanvasPage from '@/features/canvas/CanvasPage'
import SettingsPage from '@/features/settings/SettingsPage'
import AssetsPage from '@/features/assets/AssetsPage'
import AgentsPage from '@/features/agents/AgentsPage'
import { ProjectDetailPage } from '@/routes/pages'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/canvases/:canvasId" element={<CanvasPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Route>
    </Routes>
  )
}
