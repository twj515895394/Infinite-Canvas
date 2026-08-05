# Infinite-Canvas 设计文档索引

> 日期：2026-08-05  
> 当前主题：Studio V2 前端重构、UI 设计系统与后端 API 演进

---

## 1. 阅读顺序

### 1.1 前端总体方向

[`studio-v2-frontend-architecture-overall-design.md`](./studio-v2-frontend-architecture-overall-design.md)

用于确定：

- 为什么不继续扩展原生 `canvas.js`。
- React + TypeScript + Vite + React Flow 技术路线。
- Studio V2 工作区总体结构。
- 前端状态管理、性能和渐进迁移原则。
- Agent Runtime 外置复用边界。

> 说明：总体设计中的 UI primitives 初始建议为 Radix UI。后续详细设计已根据新项目技术现状和动效要求，将最终选型调整为 shadcn/ui Base UI 版本 + Base UI primitives。详细决策以 `studio-v2-ui-interaction-and-motion-design-system.md` 为准。

### 1.2 当前后端 API 能力基线

[`current-backend-api-capability-inventory.md`](./current-backend-api-capability-inventory.md)

用于确定：

- 当前 FastAPI 已经具备的真实能力。
- 现有 API 分组和主要接口。
- 哪些接口可以直接复用。
- 哪些接口需要通过 V2 Adapter 包装。
- 当前接口在任务、画布、资产、事件和 Agent 方面的结构性限制。

### 1.3 Studio V2 后端 API 目标设计

[`studio-v2-backend-api-gap-and-v2-design.md`](./studio-v2-backend-api-gap-and-v2-design.md)

用于确定：

- 为什么后端不需要整体重写。
- `/api/v2` 的领域边界。
- P0、P1、P2 接口优先级。
- Project、Canvas、Asset、Artifact、GenerationJob 和 Agent Gateway 模型。
- 增量画布保存、统一任务和可恢复事件设计。
- Studio V2 前后端并行开发边界。

### 1.4 页面信息架构与核心流程

[`studio-v2-information-architecture-and-core-workflows.md`](./studio-v2-information-architecture-and-core-workflows.md)

用于确定：

- App Shell 的 Top Bar、Navigation、Main Workspace、Inspector 和 Task Shelf。
- 项目、素材、剧本、角色、场景、镜头、分镜、生成流程与 Agent 的页面关系。
- 路由、导航、Command Palette 和上下文恢复。
- 从项目到生成、从剧本到镜头、从素材到角色、Agent Artifact 回写等核心流程。
- 第一阶段实际需要建设的页面范围。

### 1.5 UI、交互与动效设计系统

[`studio-v2-ui-interaction-and-motion-design-system.md`](./studio-v2-ui-interaction-and-motion-design-system.md)

用于确定：

- 简洁、克制、专业、即时响应的视觉方向。
- 从 Apple Design 与 Emil Kowalski 设计工程方法中吸收的交互原则。
- Tailwind CSS + shadcn/ui Base UI + Base UI primitives + Motion for React 最终选型。
- Color、Typography、Spacing、Radius、Elevation 和 Motion Token。
- Button、Popover、Dialog、Sheet、Inspector、NodeCard、Asset Preview 和 Agent UI 的状态与动效。
- React Flow 与动效库之间的性能边界。
- Reduced Motion、High Contrast 和 UI 验收规则。

---

## 2. 当前已确定的核心决策

1. 保留 Python + FastAPI 后端。
2. Legacy API 与 Studio V2 API 并行。
3. 新前端使用 React + TypeScript + Vite。
4. 生产流程画布使用 React Flow。
5. 不继续把 `static/js/canvas.js` 作为长期主架构扩展。
6. 页面采用稳定的 App Shell：Navigation + Main Workspace + Inspector + Task Shelf。
7. UI primitives 使用 Base UI，组件源码基座使用 shadcn/ui Base UI 版本。
8. 高频微交互使用 CSS Transition 和 Base UI 状态；复杂可中断动效使用 Motion for React。
9. React Flow 节点位置更新不套 Motion Layout，UI 动效不得牺牲画布性能。
10. UI 参考 Apple Design 的响应、连续性、空间关系和克制原则，但不复制 Apple 产品外观。
11. 图片、视频、ComfyUI 和供应商任务统一为 GenerationJob。
12. 画布保存由全量快照演进为 Operation + Snapshot。
13. 素材演进为 Asset + AssetVersion + Reference。
14. 结构化成果使用 Artifact + Version + Link。
15. 实时事件使用 `/ws/v2/events`，支持 sequence 和断线补拉。
16. Agent Runtime 复用 Claude CLI、Codex CLI、Pi、oh-my-pi 等实现。
17. Infinite-Canvas 只实现 Agent Gateway、ACP/CLI Adapter、上下文、工具、事件和 Artifact 集成，不实现新的 Agent Harness。

---

## 3. 当前文档完成状态

| 设计项 | 状态 |
|---|---|
| 前端总体架构 | 已完成 v1.0 |
| 当前后端 API 能力盘点 | 已完成 v1.0 |
| Studio V2 后端 API 总体设计 | 已完成 v1.0 |
| 页面信息架构与核心流程 | 已完成 v1.0 |
| UI、交互与动效设计系统 | 已完成 v1.0 |
| `/api/v2` P0 DTO 与 OpenAPI | 待设计 |
| React Flow 节点模型与 Node Registry | 待设计 |
| Legacy Canvas 数据迁移 | 待设计 |
| Asset / Artifact 数据模型 | 待设计 |
| GenerationJob 状态机 | 待设计 |
| Event Hub 详细协议 | 待设计 |
| Agent Gateway 详细协议 | 待设计 |
| 实施任务和里程碑 | 待设计 |

---

## 4. 后续详细设计顺序

建议按以下顺序继续：

1. `/api/v2` P0 DTO 与 OpenAPI 详细定义。
2. React Flow 节点模型、Node Registry、Handle 和 Inspector 设计。
3. Legacy Canvas JSON 到 V2 Document 的迁移映射。
4. Asset、AssetVersion、Artifact 和引用关系数据模型。
5. GenerationJob 状态机和供应商 Adapter 设计。
6. Studio Event Envelope、WebSocket 重连和补拉机制。
7. Agent Gateway、Skill Registry、Session、Task 和 Tool Gateway 设计。
8. 可交互 UI Prototype 和组件 Storybook。
9. 分阶段实施任务、验收标准和开发里程碑。

---

## 5. 决策优先级

当文档出现不一致时，按以下优先级处理：

```text
最新专项详细设计
> 最新总体设计补充
> 前端总体设计
> 现有实现
```

已经明确被后续文档修订的选型，不再以旧文档中的初始建议为准。

---

## 6. 文档维护规则

- 总体架构决策修改时，必须记录变更原因和受影响文档。
- 当前后端新增或删除 API 时，同步更新能力盘点文档。
- `/api/v2` Contract 修改时，必须同步更新 OpenAPI、前端 Zod Schema 和本目录设计文档。
- Design Token 和 Motion Token 修改时，必须同步组件 Story 和视觉回归用例。
- Legacy API 进入废弃状态时，记录替代接口和迁移期限。
- 供应商专用字段不得直接扩散到 Studio V2 公共 DTO。
- UI 评审意见必须说明可用性、连续性、可访问性或性能原因，不能只用“更高级”“更好看”作为结论。
