# 02 - 前端工程初始化 + App Shell + 设计系统

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F1

## 要构建什么

在仓库根目录新建独立 `studio-v2/` 前端工程（React 18+ / TypeScript / Vite / React Router / TanStack Query / Zustand / Zod / Tailwind CSS / shadcn/ui Base UI 版 / Base UI primitives / Motion for React / Lucide），搭建 App Shell 四区布局（两级左侧导航 + TopBar + Main + 右侧 Inspector 340px + 底部 Task Shelf 占位），落地 Design/Motion Token（语义色、4px 基线、动效 ≤180ms、默认 Spring 无 Bounce）、P0 组件库（Button/IconButton/Tooltip/Popover/Menu/ContextMenu/Dialog/Sheet/Tabs/Input/Select/Combobox/Toast/NodeCard/Inspector/Task Shelf/MediaThumbnail/Command Palette/Skeleton/Empty/Error）、全局 Toast/Dialog/Command Palette 基础设施、设置页路由框架（Provider/Storage/Runtime/Appearance/Legacy 入口占位）、URL 可恢复项目与工作区。动效只改 transform/opacity、禁 transition:all；强制 Accessibility（Reduced Motion/对比度/键盘导航）。

## 索引的设计文档

- `docs/studio-v2-frontend-architecture-overall-design.md`（技术选型、四层架构、状态分离原则）
- `docs/studio-v2-ui-interaction-and-motion-design-system.md`（Token、P0 组件清单、动效边界、Accessibility）
- `docs/studio-v2-information-architecture-and-core-workflows.md`（App Shell 四区布局规格、页面路由）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§6.1 App Shell、§12 前端模块边界）

## 验收标准

- [ ] `npm run dev` 启动后新前端可访问，旧 `static/` 前端不受影响。
- [ ] App Shell 四区布局正确渲染（导航/TopBar/Main/Inspector/Task Shelf），Inspector 宽度 340px。
- [ ] Design Token 完整（语义色/间距 4px 基线/字号/动效时长曲线），组件消费 Token 而非硬编码。
- [ ] P0 组件清单中组件全部存在且可交互（Toast/Dialog/Command Palette 可用快捷键唤起）。
- [ ] 路由可恢复：URL 中项目与工作区上下文刷新后恢复。
- [ ] Reduced Motion 下动效降级；键盘可完整操作导航与对话框。
- [ ] 空路由/错误路由显示 Empty/Error 状态，无白屏。
- [ ] TypeScript 构建（`tsc --noEmit`）与 Vite build 通过。

## 被阻塞于

无 - 可以立即开始
