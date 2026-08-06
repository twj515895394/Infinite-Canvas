# Infinite-Canvas 设计文档索引

> 日期：2026-08-05  
> 当前阶段：Studio V2 个人版 MVP 设计收口，下一步制定开发计划与任务拆分

---

## 1. 当前实施基线

### 1.1 个人版 MVP 范围、功能保留与实施基线

[`studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`](./studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md)

这是第一版开发、计划拆分和验收的最高优先级产品范围文档，用于确定：

- 第一版只围绕新 UI、核心旧功能、新资产库、Agent / Skill 四条主线。
- 第一版必须建设的页面、功能和最少新增 API。
- 现有功能在新 UI 中的位置与接入策略。
- RunningHub、Midjourney、独立对话和提示词库明确延后。
- 资产库与 Agent / Skill 的 MVP 裁剪范围。
- 完整 Event Hub、复杂 GenerationJob、Blob GC 和专业影视领域模型不阻塞第一版。
- 后续开发计划必须采用的阶段边界与验收清单。

当完整专项设计与个人版第一期范围发生冲突时，第一版实施以本文为准；专项设计作为后续演进基线。

### 1.2 Greenfield 前端与增量后端 ADR

[`adr-001-studio-v2-greenfield-frontend-and-additive-backend.md`](./adr-001-studio-v2-greenfield-frontend-and-additive-backend.md)

用于确定：

- Studio V2 使用独立新前端，不改写旧 `canvas.js`。
- 旧前端和 Studio V2 在过渡期独立运行。
- 现有 `/api/*` 保持兼容。
- 新能力通过少量 `/api/v2/*` 增量提供。
- Legacy 导入和旧数据迁移不阻塞第一版。

---

## 2. 第一版开发前应阅读的文档

### 2.1 前端总体架构

[`studio-v2-frontend-architecture-overall-design.md`](./studio-v2-frontend-architecture-overall-design.md)

确定 React、TypeScript、Vite、React Flow、状态管理、目录结构和旧前端边界。

### 2.2 页面信息架构与核心流程

[`studio-v2-information-architecture-and-core-workflows.md`](./studio-v2-information-architecture-and-core-workflows.md)

确定 App Shell、Navigation、Main Workspace、Inspector、Task Shelf、页面路由和主要用户流程。

> 第一版页面范围以个人版 MVP 文档为准，不要求实现其中全部影视创作工作区。

### 2.3 UI、交互与动效设计系统

[`studio-v2-ui-interaction-and-motion-design-system.md`](./studio-v2-ui-interaction-and-motion-design-system.md)

确定 Tailwind CSS、shadcn/ui Base UI、Base UI、Motion for React、视觉 Token、组件状态和动效边界。

### 2.4 React Flow 节点与 Node Registry

[`studio-v2-react-flow-node-model-and-registry-design.md`](./studio-v2-react-flow-node-model-and-registry-design.md)

确定统一 `studio-node` Host、Node Registry、节点配置、Port、连接、Inspector、Undo/Redo 和任务绑定边界。

### 2.5 当前后端 API 能力盘点

[`current-backend-api-capability-inventory.md`](./current-backend-api-capability-inventory.md)

用于核对现有项目、画布、上传、媒体、资产、ComfyUI、即梦、Codex、Provider 和设置接口，决定直接复用或轻量包装。

### 2.6 `/api/v2` P0 Contract

[`studio-v2-api-v2-p0-contract-and-openapi-design.md`](./studio-v2-api-v2-p0-contract-and-openapi-design.md)

作为 DTO、错误模型、分页、Revision 和 OpenAPI 规范参考。

> 第一版不要求一次性实现文档中全部 `/api/v2`；最少接口清单以个人版 MVP 文档为准。

### 2.7 Agent、Skill、Runtime 总体设计

[`studio-v2-agent-skill-runtime-and-management-design.md`](./studio-v2-agent-skill-runtime-and-management-design.md)

确定 Agent、Skill、Runtime、Task、Context、Tool、Permission 和 Agent Center 的领域边界。

### 2.8 Agent / Skill P0 Contract 与 SQLite

[`studio-v2-agent-skill-p0-contract-and-sqlite-design.md`](./studio-v2-agent-skill-p0-contract-and-sqlite-design.md)

作为 Agent、Skill、Runtime 和 Task 数据表、DTO 与 Adapter 的完整参考。

> 个人版第一版允许暂缓多 Attempt、Lease、Heartbeat、复杂 Permission Grant 和完整 Session Resume。

### 2.9 Asset、Artifact、Version 与 Reference

[`studio-v2-asset-artifact-version-reference-and-provenance-design.md`](./studio-v2-asset-artifact-version-reference-and-provenance-design.md)

作为 Asset、AssetVersion、Artifact、引用和来源追踪的完整演进设计。

> 第一版只实现 Asset、AssetVersion、Tag、Collection、回收站和轻量 Artifact，不强制 Blob Store、GC 和完整 Provenance。

---

## 3. 后续增强设计文档

以下文档已经完成，但不作为个人版 MVP 的完整实现前置条件。

### 3.1 Studio V2 后端 API 总体目标

[`studio-v2-backend-api-gap-and-v2-design.md`](./studio-v2-backend-api-gap-and-v2-design.md)

用于后续逐步领域化后端、统一任务、资产和 Agent Gateway。

### 3.2 GenerationJob 状态机、Executor 与 Adapter

[`studio-v2-generation-job-state-machine-executor-and-adapter-design.md`](./studio-v2-generation-job-state-machine-executor-and-adapter-design.md)

用于后续统一图片、视频、ComfyUI、RunningHub、即梦、Midjourney、Codex 和其他执行器。

第一版允许使用现有接口、轻量 Adapter、轮询和简单 Task Shelf，不要求先完成完整 Job / Attempt / Fallback 平台。

### 3.3 Event Hub、Outbox、Replay 与实时通信

[`studio-v2-event-hub-outbox-replay-and-realtime-design.md`](./studio-v2-event-hub-outbox-replay-and-realtime-design.md)

用于后续建设可靠事件、Replay、慢消费者和断线恢复。

第一版 Agent Task 可使用 SSE、简单 WebSocket 或短轮询；完整 Event Hub 不阻塞发布。

---

## 4. 第一版正式范围

### 4.1 必须实现

```text
A. 新 React UI 与 React Flow 画布
B. 核心现有功能接入
C. 新资产库
D. Agent / Skill 管理与真实执行闭环
```

核心现有功能包括：

- 项目和画布 CRUD。
- 画布编辑与保存。
- 通用图片生成。
- 视频生成主要路径。
- ComfyUI。
- 即梦主要能力。
- Codex / GPT Image 2 Skill。
- 文件上传、媒体预览、本地素材和共享目录导入。
- Provider 配置、检测和存储目录设置。
- 基础 Task Shelf 和旧版回退入口。

### 4.2 本次明确延后

```text
RunningHub
Midjourney
独立聊天 / Conversation
提示词库 / Prompt Library
```

相关旧接口和旧页面不删除，后续统一接入新 UI。

### 4.3 不阻塞第一版的高级能力

- 完整 GenerationJob、Attempt、Executor Registry 和 Fallback。
- 完整 Event Hub、Outbox Replay 和慢消费者机制。
- 内容寻址 Blob Store、物理去重和 Blob GC。
- 完整 Provenance 图谱。
- Artifact Version、Diff、Apply 和 Revert。
- 复杂 Agent Permission Grant。
- 多 Runtime Session Resume。
- 多 Agent 编排。
- Project Bible、Script、Character、Scene、Shot、Storyboard 和 Continuity 专业模型。
- 企业级认证、用户、项目权限和多租户。

---

## 5. 当前设计完成状态

| 设计项 | 状态 | 第一版用途 |
|---|---|---|
| 个人版 MVP 范围与功能保留矩阵 | 已完成 v1.0 | 第一版实施基线 |
| Greenfield 前端与增量后端 ADR | 已完成 Accepted | 第一版架构约束 |
| 前端总体架构 | 已完成 v1.0 | 直接使用 |
| 页面信息架构与核心流程 | 已完成 v1.0 | 按 MVP 裁剪使用 |
| UI、交互与动效设计系统 | 已完成 v1.0 | 直接使用 |
| React Flow 节点模型与 Node Registry | 已完成 v1.0 | 按 MVP 节点集实现 |
| 当前后端 API 能力盘点 | 已完成 v1.0 | 功能接入依据 |
| `/api/v2` P0 DTO 与 OpenAPI | 已完成 v1.0 | 按最少接口实现 |
| Agent、Skill、Runtime 总体设计 | 已完成 v1.0 | 按 MVP 裁剪实现 |
| Agent / Skill P0 Contract 与 SQLite | 已完成 v1.0 | 按 MVP 表和状态裁剪 |
| Asset / Artifact / Version / Provenance | 已完成 v1.0 | 第一版实现 Asset 子集 |
| GenerationJob 完整设计 | 已完成 v1.0 | 后续增强参考 |
| Event Hub 完整设计 | 已完成 v1.0 | 后续增强参考 |
| RunningHub / Midjourney 新 UI | 延后 | 后续批次 |
| 对话 / 提示词库新 UI | 延后 | 后续批次 |
| 开发计划与任务拆分 | 已完成（`.scratch/studio-v2-mvp/`） | 实施依据 |
| 第一版使用指南（启动/备份/回退/托管） | 已完成 | [`studio-v2-first-release-guide.md`](./studio-v2-first-release-guide.md) |

---

## 6. 第一版发布

实施阶段 1–4 功能已落地；阶段 5 稳定性见：

- 使用与冒烟：[`studio-v2-first-release-guide.md`](./studio-v2-first-release-guide.md)
- 验收清单：个人版 MVP 基线 §14
- 切片：`.scratch/studio-v2-mvp/issues/24-f16-stability-polish.md`、`25-f17-release-acceptance.md`

开发阶段回顾：

1. 新 UI 工程骨架、项目和画布闭环。
2. 核心旧功能逐项接入。
3. 新资产库。
4. Agent / Skill 管理和执行闭环。
5. 稳定性、测试、旧版回退和第一版发布。

计划中必须标明：

- 前端任务。
- 后端任务。
- 数据库与 Migration。
- API 依赖。
- 可并行关系。
- 验收用例。
- 第一版发布门槛。
- 明确延后项。

---

## 7. 决策优先级

当文档出现不一致时，第一版按以下顺序处理：

```text
个人版 MVP 范围文档
> Accepted ADR
> 最新专项详细设计
> 总体设计
> 现有实现
```

---

## 8. 文档维护规则

- 第一版新增需求必须先判断是否属于四条 MVP 主线。
- RunningHub、Midjourney、对话和提示词库的任务不得混入第一版关键路径。
- 不得为了完整 Event Hub、GenerationJob 或专业影视领域模型延迟个人版闭环。
- 旧 `/api/*` 和旧前端行为修改时必须进行兼容性评估。
- 新 UI 不能复制旧 `canvas.js` 的全局状态和 DOM 操作架构。
- API 调用必须进入 Feature API 层，供应商字段不能扩散到通用组件。
- Agent 和 Skill 第一版必须形成真实执行闭环，不能只交付管理页面。
- 资产库第一版必须支持上传、导入、搜索、标签、Collection、版本、画布拖放和 Agent Context。
- 开发计划和验收清单发生变化时，必须同步更新个人版 MVP 文档。
