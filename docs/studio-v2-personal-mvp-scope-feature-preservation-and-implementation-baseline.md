# Infinite-Canvas Studio V2 个人版 MVP 范围、功能保留矩阵与实施基线

> 文档状态：第一版开发范围基线（MVP Scope Baseline）  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 决策背景：本项目第一版为个人使用，不以企业级、多租户、高并发或完整影视制作平台为目标。

---

## 1. 文档目的

本文对前期详细设计进行 MVP 收口，确定第一版只围绕以下四个目标开发：

1. 完整替换现有前端 UI。
2. 保留第一版所需的现有核心功能。
3. 增强资产库。
4. 增加 Agent 和 Skill 的管理与实际应用。

本文是后续制定开发计划、拆分任务和验收第一版的直接范围依据。

本文优先级高于前期专项文档中的 P1、P2 和企业级增强项。前期详细设计仍作为未来演进基线，但未进入本文 MVP 范围的能力不得阻塞第一版发布。

---

## 2. 第一版产品定位

第一版定位为：

```text
一个由全新 React UI 驱动的个人 AI 创作画布，
能够继续使用现有核心生成与画布能力，
提供更好用的资产管理，
并支持管理 Agent、安装 Skill、选择资产上下文和执行任务。
```

第一版不是：

- 企业级多用户平台。
- 多租户 SaaS。
- 完整 AI 影视制作管理系统。
- 通用 Agent 编排平台。
- 高可用分布式任务系统。
- 完整数字资产管理 DAM。
- 一次性替换所有 Legacy API 的后端重写项目。

---

## 3. 第一版成功标准

第一版完成后，用户应能够：

1. 打开全新的 Studio V2 UI，不再依赖旧前端作为主入口。
2. 创建和打开项目、进入画布、保存画布。
3. 在新画布中使用第一版保留的生成和工作流能力。
4. 上传、浏览、搜索、分类和复用图片、视频等素材。
5. 将生成结果自动加入新资产库，并拖回画布使用。
6. 配置至少一个可工作的 Agent Runtime。
7. 创建 Agent、发现或安装 Skill、将 Skill 绑定到 Agent。
8. 在 Agent Dock 中选择资产作为上下文并执行任务。
9. 查看执行状态、取消任务并保存最终结果。
10. 旧前端和旧接口继续存在，可作为过渡期回退入口。

---

## 4. 本轮明确延后的功能

以下功能不进入本次 MVP 开发范围，后续统一补充：

```text
RunningHub
Midjourney
独立对话 / Conversation 页面
提示词库 / Prompt Library
```

具体包括：

- RunningHub WebApp、Workflow、Wallet 和专用管理 UI。
- Midjourney Imagine、Variation、Upscale、Pan、Zoom 等交互。
- 旧聊天会话迁移、新版通用聊天中心和会话历史 UI。
- 提示词库分类、CRUD、模板管理和旧数据迁移。

保留原则：

- 现有后端相关接口不删除。
- 旧前端中相关功能仍可继续使用。
- 新 UI 第一版可以显示“后续支持”或完全隐藏入口。
- 后续接入时优先复用现有 API 和已设计的 Adapter，不要求第一版预留空页面。

---

## 5. MVP 总体技术策略

### 5.1 前端

新建独立前端：

```text
studio-v2/
```

推荐技术：

```text
React
TypeScript
Vite
@xyflow/react
TanStack Query
Zustand
Tailwind CSS
shadcn/ui Base UI
Base UI primitives
Motion for React
```

旧 `static/` 前端继续保留，但不作为新 UI 的代码基础。

### 5.2 后端

第一版后端采取：

```text
现有 /api/* 直接复用
+
少量必要 /api/v2/* 增强
```

不要求先完成完整后端领域重构。

第一版新增后端重点仅为：

- 新资产库最小数据模型与接口。
- Agent、Skill、Runtime、Task 最小数据模型与接口。
- 对现有画布、生成和文件能力的轻量 Adapter/BFF。

### 5.3 数据存储

第一版允许：

- 现有项目、画布和 Provider 配置继续使用原 JSON / 文件目录。
- 新资产库、Agent、Skill 和 Task 元数据使用 SQLite。
- 素材文件继续使用当前本地目录，数据库保存稳定 ID 和路径引用。

第一版不强制：

- 全量内容寻址 Blob Store。
- 完整 SHA-256 物理去重。
- Blob GC。
- 全量 Legacy 数据迁移。

---

## 6. 第一版页面清单

MVP 只建设以下主要页面和工作区。

### 6.1 App Shell

包含：

- 左侧主导航。
- 顶部项目和页面上下文。
- 主工作区。
- 右侧 Inspector。
- 底部或浮动 Task Shelf。
- 全局 Toast、Dialog、Command Menu 基础能力。

### 6.2 项目首页

能力：

- 项目列表。
- 创建项目。
- 打开项目。
- 重命名项目。
- 删除或归档项目。
- 最近项目。

第一版不做复杂项目模板和统计报表。

### 6.3 生成画布

能力：

- 打开和保存画布。
- 创建、删除、移动、复制节点。
- 创建和删除连线。
- 缩放、平移、框选。
- Inspector 编辑节点参数。
- 执行生成或工作流节点。
- 查看运行状态和输出。
- 将资产拖入画布。
- 将输出保存到资产库。
- Agent Task 节点或从画布打开 Agent Dock。

### 6.4 资产库

能力：

- Grid / List 浏览。
- 图片和视频预览。
- 上传文件。
- 导入本地文件。
- 导入远程 URL。
- 标签。
- Collection / 文件夹。
- 搜索和类型筛选。
- 重命名和描述。
- 删除到回收站。
- 查看基础版本列表。
- 拖入画布。
- 作为 Agent 上下文选择。

### 6.5 Agent Center

Tab：

```text
Agents
Skills
Runtimes
Tasks
```

第一版不单独建设复杂 Permissions 和 Activity 管理页面。

### 6.6 Agent Dock

能力：

- 选择 Agent。
- 选择或指定 Skill。
- 输入任务。
- 添加资产上下文。
- 添加当前画布选中节点作为上下文。
- 启动任务。
- 查看状态和流式文本。
- 取消任务。
- 查看最终结果。
- 将结果保存为文本 Artifact 或导入资产库。

### 6.7 设置页

第一版仅包括：

- 现有 API Provider 配置入口。
- 存储目录设置。
- Runtime 配置和探测。
- 基础外观设置。
- 返回旧版入口。

RunningHub 和 Midjourney 专项配置暂不进入新设置页。

---

## 7. 旧功能保留矩阵

### 7.1 第一版必须保留

| 现有能力 | 第一版新 UI 位置 | 接入策略 | 验收要求 |
|---|---|---|---|
| 项目列表、创建、修改、删除 | 项目首页 | 优先复用现有 Project API，必要时轻量包装 | 能完整创建、打开、修改和删除项目 |
| 画布列表、创建、读取、保存、删除 | 项目首页、生成画布 | 复用现有 Canvas API；新前端做 DTO Adapter | 新画布可保存并重新打开，数据不丢失 |
| 画布节点编辑和连线 | 生成画布 | React Flow 重新实现 UI；不复用旧 DOM 代码 | 常用编辑操作可用，Undo/Redo 至少覆盖本地编辑 |
| 通用图片生成 | 图片生成节点 | 第一版可直接调用现有图片生成接口，后续再统一 GenerationJob | 提交参数、显示等待状态、展示结果、失败可重试 |
| 视频生成 | 视频生成节点 | 优先复用现有视频接口；供应商特有字段在 Adapter 中转换 | 至少保留当前主要可用视频生成路径 |
| ComfyUI 上传、Workflow 和执行 | Workflow 节点、设置页 | 复用现有 ComfyUI API | 能选择工作流、配置参数、运行并获取输出 |
| 即梦相关生成能力 | 图片或视频节点的 Provider 选项 | 复用现有接口，第一版不重构完整 Adapter | 原先可用的主要生成入口在新 UI 可调用 |
| Codex / GPT Image 2 Skill 生图 | 图片生成节点 | 复用现有 CLI helper | 能探测、执行并将结果加入资产库 |
| 文件上传与媒体预览 | 资产库、画布 | 复用 `/api/ai/upload`、媒体预览和下载能力 | 常见图片、视频可以上传和预览 |
| 本地素材浏览和导入 | 资产库 | 复用 Local Asset API，导入后创建新 Asset 记录 | 可从允许目录导入素材 |
| 共享目录浏览和导入 | 资产库 | 复用 Shared Folder API | 可注册、浏览和导入共享素材 |
| 存储目录配置 | 设置页 | 复用 Storage Settings API | 上传、生成和本地目录可查看和修改 |
| Provider 配置与检测 | 设置页 | 复用现有 Provider CRUD 和测试 API | 可新增、修改、启停和测试主要 Provider |
| 生成历史或当前任务状态 | Task Shelf | 第一版允许 Adapter + 轮询，不强制完整 Event Hub | 用户可看到运行、成功和失败状态 |
| 旧版入口 | 设置页或用户菜单 | 提供明确链接 | 出现新 UI 未覆盖问题时可以回到旧版 |

### 7.2 第一版允许简化但不能消失

| 能力 | 第一版简化方式 |
|---|---|
| 生成队列 | 使用简单 Task Shelf 和轮询，不实现复杂公平调度 |
| 运行历史 | 只展示近期任务，不做复杂统计、成本报表和高级筛选 |
| 画布冲突 | 个人使用场景先采用 Revision 检测和重新加载，不实现 CRDT |
| 资产删除 | 第一版使用回收站；复杂 Hard Reference 分析后续完善 |
| 文件格式转换 | 继续调用现有媒体辅助接口，不建立完整媒体处理管线 |
| Provider 能力展示 | 先根据当前配置和探测结果展示，不建设完整 Executor Registry UI |
| 实时进度 | 支持轮询或现有 SSE；完整 `/ws/v2/events` 不阻塞第一版 |

### 7.3 明确延后

| 能力 | 原因 |
|---|---|
| RunningHub | 专有配置和工作流交互较多，后续统一接入 |
| Midjourney | 动作类型较多，先不阻塞核心画布重做 |
| 独立聊天与会话历史 | Agent Dock 优先解决任务型协作，普通聊天后补 |
| 提示词库 | 可先在节点和 Skill 中直接输入 Prompt，后续做库管理 |
| 更新、备份和回滚新 UI | 旧版管理入口继续可用，非核心创作链路 |
| 完整应用升级管理 | 继续由旧页面承担 |

---

## 8. 新资产库 MVP 范围

### 8.1 第一版核心实体

```text
Asset
AssetVersion
AssetCollection
AssetTag
```

第一版 Asset 字段至少包括：

```text
id
project_id 可选
kind
name
description
current_version_id
source_type
status
tags
collection_ids
created_at
updated_at
```

AssetVersion 至少包括：

```text
id
asset_id
version_no
file_path 或 content_url
preview_url
mime_type
width
height
duration_ms
size_bytes
source_metadata
created_at
```

### 8.2 第一版必须实现

- 一个逻辑 Asset 可以有多个 Version。
- 生成结果自动创建 Asset。
- 上传和导入素材创建 Asset。
- 能查看当前版本和基础历史版本。
- 画布节点引用明确的 AssetVersion ID。
- Agent Task 可以选择 AssetVersion 作为上下文。
- 标签和 Collection 可以组合使用。
- 搜索至少支持名称、描述和标签。
- 删除进入回收站。

### 8.3 第一版暂缓

- 内容寻址 Blob Store。
- 跨 Asset 物理去重。
- Blob GC。
- 完整 Provenance 图谱。
- Annotation 多模型分析体系。
- Artifact Type Schema Registry。
- Artifact Diff / Apply / Revert 完整框架。
- 跨项目权限和共享。

### 8.4 第一版 Artifact 简化

第一版只提供轻量 Artifact：

```text
id
project_id
title
kind
content_text 或 content_json
source_agent_task_id
created_at
updated_at
```

用途：

- 保存 Agent 的文本报告。
- 保存结构化 JSON 结果。
- 从 Agent Dock 打开和复制。
- 后续升级为完整 ArtifactVersion 和 Apply 模型。

---

## 9. Agent 与 Skill MVP 范围

### 9.1 第一版必须具备的闭环

```text
配置 Runtime
→ Probe Runtime
→ 创建 Agent
→ 发现或安装 Skill
→ 启用 Skill
→ 将 Skill 绑定到 Agent
→ 打开 Agent Dock
→ 选择 Asset / Canvas Context
→ 提交 Task
→ Runtime 执行
→ 查看流式或阶段性结果
→ 取消或完成
→ 保存 Artifact 或资产
```

这条链路必须全部可操作，不能只建设管理页面而没有执行能力。

### 9.2 Runtime

第一版要求至少一个 Runtime 真正可用。

推荐优先级：

```text
1. Codex CLI
2. Generic CLI JSONL / stdio
3. ACP Runtime
```

第一版 Runtime 管理能力：

- 新建和编辑 Runtime Profile。
- 配置可执行文件或 Endpoint。
- Probe。
- 显示版本和基础能力。
- 启用、禁用。
- 查看最近错误。

不要求第一版同时实现 Claude、Gemini、Pi 等全部 Runtime。

### 9.3 Agent

第一版 Agent 字段：

```text
id
name
description
runtime_profile_id
model
instructions
enabled
context_policy
output_mode
created_at
updated_at
```

Agent 页面支持：

- 新建。
- 编辑。
- 复制。
- 启用和禁用。
- 绑定 Skill。
- 测试运行。
- 查看近期 Task。

### 9.4 Skill

第一版 Skill Package 保留：

```text
skill.yaml
SKILL.md
schemas/input.schema.json 可选
schemas/output.schema.json 可选
prompts/ 可选
scripts/ 可选但默认不自动执行
```

第一版 Skill 管理支持：

- 扫描内置目录。
- 从本地目录或 ZIP 导入。
- 基础 Manifest 校验。
- 启用和禁用。
- 查看版本。
- 绑定 Agent。
- 测试运行。
- 查看校验错误。

第一版不要求：

- Git 自动更新。
- Marketplace。
- 复杂 SemVer Constraint 求解。
- Project / User / Builtin 多层覆盖策略完整实现。
- 任意脚本无隔离执行。

### 9.5 Agent Task

第一版 Task 状态简化为：

```text
queued
running
waiting_input
succeeded
failed
cancel_requested
cancelled
```

第一版保留：

- Task 历史。
- 单次 Run。
- 输入消息。
- 选择的 Context 引用。
- Runtime 输出。
- 错误。
- 取消。

第一版可以暂缓：

- 多 Attempt Retry 历史。
- Worker Lease。
- Heartbeat 恢复。
- 分布式 Dispatcher。
- 长期 Session Resume。
- 复杂 Permission Grant。

### 9.6 Context

第一版支持：

- 手动选择 AssetVersion。
- 当前画布 ID。
- 当前选中节点的轻量 JSON。
- 用户附件。
- Skill 指令。
- Agent Instructions。

第一版不自动抓取大量项目领域对象，也不建设复杂 Token Budget Planner。

### 9.7 权限简化

由于是个人使用，第一版采用：

```text
只读操作：默认允许
写入资产库：默认允许
修改画布或项目：执行前确认
提交可能付费的生成：执行前确认
执行外部命令：Runtime 配置时确认
删除：始终确认
```

第一版不建设完整的 Session / Project Permission Grant 管理页面。

---

## 10. 第一版 Agent 应用入口

Agent 不能只存在于 Agent Center。

### 10.1 Agent Dock

所有主要页面可打开 Agent Dock。

第一版至少从以下位置进入：

- 生成画布。
- 资产库。
- Agent Center 测试页。

### 10.2 资产库

支持操作：

```text
选中一张或多张素材
→ 使用 Agent
→ 选择 Agent / Skill
→ 输入任务
```

例如：

- 分析图片内容。
- 生成图片描述。
- 根据参考图生成提示词。
- 检查多张角色图的一致性。

### 10.3 画布

支持：

```text
选中节点
→ 使用 Agent
```

以及基础 `agent-task` 节点：

```text
Agent
Skill
输入端口
输出文本或 Artifact
```

第一版 Agent Task Node 不保存完整日志，只保存 Task ID 和最新结果引用。

---

## 11. 第一版最少新增后端 API

### 11.1 Asset

```text
GET    /api/v2/assets
POST   /api/v2/assets/ingest/upload
POST   /api/v2/assets/ingest
GET    /api/v2/assets/{asset_id}
PATCH  /api/v2/assets/{asset_id}
DELETE /api/v2/assets/{asset_id}
POST   /api/v2/assets/{asset_id}/restore
GET    /api/v2/assets/{asset_id}/versions
POST   /api/v2/assets/{asset_id}/versions
GET    /api/v2/asset-collections
POST   /api/v2/asset-collections
PATCH  /api/v2/asset-collections/{collection_id}
DELETE /api/v2/asset-collections/{collection_id}
```

### 11.2 Runtime、Agent 和 Skill

```text
GET/POST/PATCH/DELETE /api/v2/agent-runtimes
POST /api/v2/agent-runtimes/{runtime_id}/probe

GET/POST/PATCH/DELETE /api/v2/agent-profiles
POST /api/v2/agent-profiles/{agent_id}/test

GET  /api/v2/skills
POST /api/v2/skills/discover
POST /api/v2/skills/import
POST /api/v2/skills/{skill_id}/enable
POST /api/v2/skills/{skill_id}/disable
POST /api/v2/skills/{skill_id}/test

GET/POST/DELETE /api/v2/agent-profiles/{agent_id}/skills
```

### 11.3 Agent Task

```text
POST /api/v2/agent-tasks
GET  /api/v2/agent-tasks
GET  /api/v2/agent-tasks/{task_id}
POST /api/v2/agent-tasks/{task_id}/cancel
GET  /api/v2/agent-tasks/{task_id}/events
```

Task 实时输出第一版可选择：

```text
SSE
或
简单 WebSocket
或
短轮询
```

不强制先完成完整 Event Hub。

### 11.4 轻量 Adapter API

可按实际前端需要增加：

```text
GET /api/v2/bootstrap
GET /api/v2/runtime-capabilities
```

画布、Provider、ComfyUI 和生成能力优先直接复用现有接口，不为了接口形式统一而阻塞开发。

---

## 12. 第一版前端模块边界

```text
studio-v2/src/
├── app/
├── routes/
├── components/
├── features/
│   ├── projects/
│   ├── canvas/
│   ├── generation/
│   ├── assets/
│   ├── agents/
│   ├── skills/
│   ├── runtimes/
│   ├── tasks/
│   └── settings/
├── core/
│   ├── api/
│   ├── events/
│   ├── commands/
│   └── schemas/
└── styles/
```

第一版禁止：

- 把所有 API 调用写进组件。
- 把供应商专有字段扩散到通用 Node Component。
- 复制旧 `canvas.js` 的全局变量模式。
- 先建设大量空页面再补功能。

---

## 13. MVP 开发阶段边界

本文不制定具体人员和工期，但确定后续开发计划必须按以下阶段组织。

### 阶段 1：新 UI 骨架与项目/画布闭环

目标：

```text
新前端可启动
→ 项目可创建和打开
→ 画布可编辑、保存和重新打开
```

包含：

- 工程初始化。
- App Shell。
- Project 页面。
- React Flow Canvas。
- Legacy Canvas DTO Adapter。
- 基础 Inspector。
- 本地 Undo/Redo。

### 阶段 2：核心旧功能接入

目标：

```text
不回旧 UI 也能完成主要生成流程
```

包含：

- 通用图片生成。
- 视频生成。
- ComfyUI。
- 即梦。
- Codex / GPT Image 2 Skill。
- 上传和媒体预览。
- Provider 与存储设置。
- 基础 Task Shelf。

不包含 RunningHub、Midjourney、对话和提示词库。

### 阶段 3：新资产库

目标：

```text
上传、导入和生成结果都进入统一资产库
```

包含：

- SQLite Asset 表。
- Asset API。
- Asset Library UI。
- Version 基础能力。
- Tag 和 Collection。
- 预览、搜索、回收站。
- 画布拖放和输出归档。

### 阶段 4：Agent / Skill 闭环

目标：

```text
至少一个 Runtime、一个 Agent、一个 Skill 能完成真实任务
```

包含：

- Runtime Profile 和 Probe。
- Agent CRUD。
- Skill Discover / Import / Enable / Bind。
- Agent Dock。
- Asset / Canvas Context。
- Task 执行、状态、取消和结果保存。
- 基础 Agent Task Node。

### 阶段 5：稳定性与第一版发布

包含：

- 错误处理。
- 加载状态。
- 空状态。
- 关键流程测试。
- Windows 本地环境测试。
- 数据目录备份提示。
- 旧版回退入口。
- 第一版使用文档。

---

## 14. 第一版验收清单

### 14.1 UI

- [ ] 所有 MVP 主页面使用新 React UI。
- [ ] 旧前端不是默认入口。
- [ ] App Shell、Inspector 和 Task Shelf 交互一致。
- [ ] 主要页面在常见桌面分辨率下正常使用。
- [ ] 加载、错误、空状态完整。

### 14.2 功能保留

- [ ] 项目和画布 CRUD 正常。
- [ ] 画布保存后重新打开内容一致。
- [ ] 通用图片生成正常。
- [ ] 视频生成主要路径正常。
- [ ] ComfyUI 主要工作流正常。
- [ ] 即梦主要入口正常。
- [ ] Codex / GPT Image 2 Skill 正常。
- [ ] 文件上传、预览、下载正常。
- [ ] Provider 和存储设置可用。
- [ ] RunningHub、Midjourney、对话和提示词库明确标记为后续，不影响验收。

### 14.3 资产库

- [ ] 上传、导入和生成结果可以创建 Asset。
- [ ] 图片和视频可以预览。
- [ ] 搜索、标签和 Collection 可用。
- [ ] AssetVersion 基础列表可用。
- [ ] 资产可以拖入画布。
- [ ] 资产可以作为 Agent 上下文。
- [ ] 删除进入回收站并可恢复。

### 14.4 Agent / Skill

- [ ] 至少一个 Runtime Probe 成功。
- [ ] 可以创建和编辑 Agent。
- [ ] 可以发现或导入 Skill。
- [ ] Skill 可以启用、禁用和绑定 Agent。
- [ ] Agent Dock 可以提交真实 Task。
- [ ] Task 可以读取选择的资产或画布上下文。
- [ ] 可以看到运行状态和结果。
- [ ] 可以取消运行中的 Task。
- [ ] 最终结果可以保存为 Artifact 或 Asset。
- [ ] 任务失败时显示可理解错误。

---

## 15. 第一版不应被以下事项阻塞

以下详细设计已经存在，但第一版开发不以完整实现为前置条件：

```text
完整 GenerationJob / Attempt / Fallback 平台
完整 Event Hub、Outbox Replay 和慢消费者机制
完整 Blob Store 和 GC
完整 Provenance 图谱
完整 Artifact Version / Apply / Revert
复杂 Agent Permission Grant
多 Runtime Session Resume
多 Agent 编排
Project Bible、Script、Character、Shot、Storyboard 专业领域模型
企业级认证、用户和项目权限
```

实施时可以保留兼容接口和扩展点，但不得为了未来完整性延迟个人版可用闭环。

---

## 16. 开发计划输入结论

后续开发计划可以直接按以下四条主线拆分：

```text
A. 新 React UI 与画布
B. 现有核心功能接入
C. 新资产库
D. Agent / Skill 管理与执行
```

开发计划需要明确：

- 每个阶段的任务。
- 前后端依赖。
- 对应 API。
- 页面和组件。
- 验收用例。
- 哪些任务可并行。
- 第一版发布门槛。

在本 MVP 范围下，产品设计阶段已经可以结束，下一步进入开发计划与任务拆分。
