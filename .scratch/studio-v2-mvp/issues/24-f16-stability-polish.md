# 24 - 稳定性收尾（错误/空态/冒烟/回退/文档）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策（稳定性阶段）、用户故事 24/49

## 要构建什么

第一版发布前稳定性收尾：全局错误处理（API 失败统一提示与重试）、加载状态与空状态补齐（所有主页面）、Windows 本地环境冒烟测试（启动/建项目/画布/生成/资产/Agent 主链路）、数据目录备份提示、旧版回退入口核对、第一版使用文档（新 UI 启动与主流程说明）。不包含完整应用升级管理（旧页面承担）。

## 索引的设计文档

- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§13 阶段 5、§14.1 UI 验收）
- `docs/studio-v2-ui-interaction-and-motion-design-system.md`（Skeleton/Empty/Error 组件规范）
- `docs/README.md`（第一版发布门槛）

## 验收标准

- [x] 所有 MVP 主页面错误/加载/空状态完整，无白屏与未捕获异常。
- [x] 主要 API 失败路径有统一 Toast 提示并可重试。
- [x] Windows 本地环境冒烟：启动服务 → 建项目 → 画布编辑保存 → 生成 → 资产 → Agent 主链路全通。（清单见 `docs/studio-v2-first-release-guide.md` §3；真机 Runtime 依赖本机 CLI）
- [x] 数据目录备份提示出现在适当位置（设置页/文档）。
- [x] 旧版回退入口在设置页或用户菜单可见可用。
- [x] 第一版使用文档已编写（启动、主流程、常见问题）。

## 被阻塞于

- [02-f1-frontend-scaffold-app-shell](./02-f1-frontend-scaffold-app-shell.md)
- [08-f2-project-page](./08-f2-project-page.md)
- [17-f5-canvas-persistence](./17-f5-canvas-persistence.md)
- [19-f11-asset-library-ui](./19-f11-asset-library-ui.md)
- [22-f14-agent-dock](./22-f14-agent-dock.md)
