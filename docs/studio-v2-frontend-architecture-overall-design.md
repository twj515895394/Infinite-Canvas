# Infinite-Canvas Studio V2 前端重构总体设计

> 文档状态：总体设计基线（Baseline）  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 后续文档：页面信息架构、设计系统、React Flow 节点模型、Agent 交互协议、旧数据迁移方案、性能专项设计

---

## 1. 文档目的

本文档用于确定 Infinite-Canvas 下一阶段前端重构的总体方向、技术选型、系统边界、迁移策略和验收标准，作为后续详细设计与开发实施的共同基线。

本次设计重点解决以下问题：

1. 当前无限画布拖拽、缩放、框选、卡片操作存在卡顿和交互不稳定问题。
2. 当前页面视觉层级、组件规范和信息密度缺乏统一设计，整体 UI 体验较差。
3. 当前前端以原生 JavaScript、HTML 和 CSS 为主，单体文件持续膨胀，画布引擎、业务逻辑、状态管理和 UI 逻辑高度耦合。
4. 后续平台将扩展到剧本、角色、场景、镜头、分镜、图片、视频、音频、ComfyUI 工作流和 Agent Task 等复杂业务对象，现有前端结构难以持续承载。
5. Agent 能力应复用 Claude CLI、Codex CLI、Pi、oh-my-pi 等成熟 Agent Runtime，不在本项目内重新实现 Agent Harness。

本文档只确定总体架构，不在本阶段展开所有页面和节点的字段级设计。

---

## 2. 核心结论

本次总体设计作出以下正式决策：

### 2.1 后端总体架构保持不变

继续使用现有 Python + FastAPI 后端，保留现有模型调用、ComfyUI 调度、文件处理、资产访问、WebSocket 和任务执行能力。

本次前端重构不要求将后端迁移到 Node.js、Java 或其他技术体系，也不要求先完成 `main.py` 的全面服务化拆分。

后端需要配合完成的主要工作是：

- 稳定和规范前后端 API Contract。
- 提供 Studio V2 所需的 REST 与 WebSocket 接口。
- 增加旧画布数据与新前端模型之间的兼容适配。
- 后续逐步把超大文件中的接口与业务模块拆分，但该工作不是 Studio V2 启动的前置条件。

### 2.2 新建独立的 Studio V2 前端

不再继续把现有 `static/js/canvas.js` 作为长期主架构扩展。

在仓库中新增独立的现代前端工程，例如：

```text
frontend/
```

技术基座选定为：

- React
- TypeScript
- Vite
- React Router
- React Flow
- Zustand
- TanStack Query
- Zod
- Tailwind CSS
- Radix UI
- shadcn/ui
- TanStack Virtual

### 2.3 React Flow 作为第一阶段核心画布引擎

React Flow 用于承载具有明确类型、输入、输出、状态和依赖关系的生产画布，包括：

- 素材节点
- Prompt 节点
- 图片生成节点
- 视频生成节点
- 音频生成节点
- ComfyUI 工作流节点
- Agent Task 节点
- 镜头节点
- 分镜节点
- Artifact 结果节点
- 节点之间的数据与执行关系

第一阶段不使用 PixiJS 从零实现完整画布交互，也不继续维护自研 DOM 画布作为未来核心引擎。

### 2.4 自由创意画板与生产流程画布分离

系统中存在两类不同的空间编辑需求：

1. 生产流程画布：强调节点、连线、输入输出、执行状态和依赖关系。
2. 自由创意画板：强调素材自由摆放、情绪板、分镜墙、便签、标注、绘制和空间组织。

两类需求不强制由一个底层引擎同时承担。

总体策略为：

- 第一阶段使用 React Flow 完成生产流程画布。
- 第二阶段根据产品需求和许可证评估，选择 tldraw 或独立轻量自由画板实现情绪板与自由分镜墙。
- 时间轴单独建设，不塞入无限画布引擎。

### 2.5 Agent Runtime 外置复用

Infinite-Canvas 不实现新的 Agent Harness，不复制 Claude Code、Codex、Pi 或 oh-my-pi 已具备的规划、工具调用、上下文维护和执行循环。

平台只实现 Agent Host / Agent Gateway 能力：

- 管理 Agent Profile。
- 创建和恢复 Agent Session。
- 通过 ACP 或 CLI Adapter 启动外部 Agent Runtime。
- 向 Agent 提供项目上下文、素材、Skill 和工具能力。
- 接收流式消息、计划、工具调用、权限请求、执行结果和 Artifact。
- 将 Agent 输出写回项目、画布、镜头或资产系统。

前端不直接绑定任何特定 CLI 实现。

---

## 3. 当前架构问题分析

## 3.1 当前前端形态

当前主画布主要由以下文件构成：

```text
static/canvas.html
static/css/canvas.css
static/js/canvas.js
static/js/smart-canvas.js
```

当前实现具有以下特征：

- 使用原生 DOM API 管理大量元素。
- 通过全局变量保存画布、节点、视口、选中状态和弹窗状态。
- 画布移动、节点拖拽、图片预览、视频加载、生成任务、资产库和 Agent 面板等逻辑位于同一前端运行上下文。
- 大量使用 `getElementById`、`querySelectorAll`、`innerHTML`、`dataset`、`classList` 和手工事件绑定。
- 已经通过懒加载、异步图片解码、缩略图代理、视口附近高清图加载等方式进行局部优化，但整体结构仍然存在明显上限。

当前问题不是单纯的 CSS 样式问题，也不是增加少量 `debounce`、`requestAnimationFrame` 或图片懒加载就能根治的问题。

## 3.2 性能问题的结构性原因

主要风险包括：

1. **全局状态粒度过大**  
   任意节点、面板或画布状态变化都可能影响较大范围的 DOM 更新。

2. **编辑器状态与服务端状态混杂**  
   节点坐标、拖拽中间态、远端持久化数据、生成任务状态和弹窗状态缺少清晰边界。

3. **拖拽与业务逻辑耦合**  
   画布事件处理容易触发渲染、资源加载、保存或其他业务操作。

4. **节点内部承载内容过重**  
   图片、视频、表单、Prompt、状态、操作按钮和日志可能同时挂载。

5. **缺少成熟画布引擎的交互约束**  
   平移、缩放、多选、框选、吸附、连线、快捷键和撤销重做均需要自行维护一致性。

6. **单体文件持续膨胀**  
   功能增加后，问题定位、修改影响分析、单元测试和多人协作成本持续升高。

## 3.3 UI 问题的结构性原因

当前 UI 不美观并非只由配色造成，核心原因包括：

- 缺少统一的 Design Token。
- 缺少统一的组件库和卡片规范。
- 不同功能在同一节点内堆叠，信息密度不可控。
- Hover、Selected、Focused、Running、Success、Error 等状态缺乏一致视觉语言。
- 弹窗、浮层、右键菜单、属性面板和工具栏缺乏统一布局规则。
- 业务页面与画布组件分别手写样式，难以保持一致。

---

## 4. 设计目标与非目标

## 4.1 设计目标

### 4.1.1 交互目标

- 画布平移、缩放、拖拽和多选应保持稳定、连续和低延迟。
- 节点拖动过程中不触发远端保存和重型业务计算。
- 节点数量增加后，视口外内容不应持续造成高额渲染成本。
- 图片和视频节点应采用分级加载策略。
- 所有核心操作应支持可预期的快捷键、撤销和重做。

### 4.1.2 架构目标

- 画布引擎、业务领域、后端数据、Agent UI 和通用组件清晰分层。
- 新增节点类型不需要修改超大核心文件。
- 前端只依赖统一 Agent 协议，不依赖具体 CLI。
- 新旧版本能够并行运行和逐步迁移。
- 后端不因前端重构被迫整体重写。

### 4.1.3 产品目标

- 从“图片生成无限画布”升级为“AI 影视创作 Studio”。
- 支持项目、剧本、角色、场景、镜头、分镜、素材、生成任务和 Agent 协同。
- 画布是工作空间之一，而不是所有业务对象唯一的承载方式。

## 4.2 非目标

本阶段明确不做：

- 不实现新的通用 Agent Harness。
- 不从零实现类似 Figma、tldraw 或 React Flow 的完整画布内核。
- 不立即替换 FastAPI 后端。
- 不要求一次性迁移全部现有页面和功能。
- 不在总体设计阶段确定所有节点的最终字段。
- 不在第一阶段建设完整专业剪辑时间轴。
- 不在第一阶段强制引入 tldraw。

---

## 5. 总体目标架构

```text
┌─────────────────────────────────────────────────────────────┐
│                     Studio V2 Web App                       │
│          React + TypeScript + Vite + React Router           │
├─────────────────────────────────────────────────────────────┤
│ App Shell                                                   │
│ ├── Project Navigation                                      │
│ ├── Workspace Tabs                                          │
│ ├── Global Search / Command Palette                         │
│ ├── Asset Drawer                                            │
│ ├── Agent Dock                                              │
│ └── Task / Notification Center                              │
├─────────────────────────────────────────────────────────────┤
│ Workspaces                                                  │
│ ├── Project Overview                                        │
│ ├── Asset Library                                           │
│ ├── Script Editor                                           │
│ ├── Character & Scene Design                                │
│ ├── Shot List                                               │
│ ├── Storyboard Board                                        │
│ ├── Generation Flow (React Flow)                            │
│ └── Timeline（后续独立模块）                                 │
├─────────────────────────────────────────────────────────────┤
│ Frontend Domain Layer                                       │
│ ├── Project / Script / Character / Scene                    │
│ ├── Shot / Storyboard / Asset / Artifact                    │
│ ├── Generation Job / Workflow                               │
│ └── Agent Profile / Session / Task / Event                  │
├─────────────────────────────────────────────────────────────┤
│ Frontend Infrastructure                                     │
│ ├── Zustand：编辑器与临时状态                               │
│ ├── TanStack Query：服务端状态                              │
│ ├── Zod：API 与事件校验                                     │
│ ├── REST Client                                             │
│ └── WebSocket Event Client                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Existing FastAPI Backend                   │
│ ├── Existing APIs                                           │
│ ├── Studio V2 API Adapter                                   │
│ ├── Asset / Artifact Service                                │
│ ├── Generation / ComfyUI Job Service                       │
│ ├── Agent Gateway                                           │
│ ├── ACP Client / CLI Adapters                               │
│ └── WebSocket Event Hub                                     │
└─────────────────────────────────────────────────────────────┘
                              │
             ┌────────────────┼─────────────────┐
             ▼                ▼                 ▼
      Claude CLI / ACP   Codex CLI / ACP   Pi / oh-my-pi
```

---

## 6. 技术选型

## 6.1 应用框架：React + TypeScript + Vite

### 选型结论

选定 React、TypeScript 和 Vite 作为 Studio V2 的应用基座。

### 原因

- React Flow、Radix UI、shadcn/ui 和大量编辑器生态均以 React 为主要集成环境。
- TypeScript 能约束节点、事件、Artifact、Agent Task 和 API DTO 等复杂类型。
- Vite 适合独立前端工程开发，并可在生产构建后由 FastAPI 托管静态文件。
- 组件化有利于拆分当前超大单体脚本。

### 约束

- 禁止将现有 `canvas.js` 机械翻译为一个超大的 `CanvasPage.tsx`。
- 页面、领域、画布节点、编辑器命令和基础设施必须分层。

## 6.2 核心画布：React Flow

### 选型结论

React Flow 作为第一阶段生产流程画布的核心引擎。

### 适用范围

- 节点拖拽与缩放。
- 节点连接与 Handle。
- 多选、框选和视口操作。
- 自定义节点和自定义边。
- MiniMap、Controls、Node Toolbar。
- 生成链路和任务状态展示。
- 节点式工作流和 Agent 任务编排。

### 不适用范围

- 专业视频剪辑时间轴。
- 高自由度手绘白板。
- 大量纯图形 Sprite 的 GPU 场景。

## 6.3 自由画板：第二阶段评估 tldraw

### 选型结论

不在第一阶段立即引入，但将 tldraw 作为自由情绪板、分镜墙和标注画板的优先候选。

### 引入条件

- 明确需要自由旋转、绘制、便签、箭头、Frame、Group 和空间排版。
- 完成商业许可证或替代方案评估。
- 与 React Flow 工作区保持数据层统一，而非互相嵌套。

## 6.4 状态管理：Zustand + TanStack Query

### Zustand 负责

- 当前 viewport。
- 当前选择集。
- 拖拽与缩放临时状态。
- 本地草稿。
- 右键菜单、浮层、属性面板状态。
- 编辑器命令栈。
- WebSocket 事件合并后的局部 UI 状态。

### TanStack Query 负责

- 项目数据。
- 资产数据。
- 剧本、角色、场景和镜头。
- 画布持久化数据。
- Artifact 与生成任务。
- Agent Profile 与历史 Session。
- 缓存、失效、重试和远端同步。

### 原则

不得把服务端数据、拖拽中间态和弹窗状态混入同一个全局 Store。

## 6.5 API 校验：Zod

所有 REST 返回值、WebSocket 事件和本地持久化数据都应通过 Zod Schema 校验。

目的：

- 防止后端字段变化导致前端静默错误。
- 支持旧版 Canvas JSON 的版本识别和迁移。
- 为 Agent Event 和 Artifact 建立稳定边界。

## 6.6 UI：Tailwind CSS + Radix UI + shadcn/ui

### 选型结论

使用 Tailwind CSS 管理样式约束，使用 Radix UI 提供可访问的交互基础组件，使用 shadcn/ui 作为可定制组件起点。

### 原则

- shadcn/ui 不是最终视觉设计，必须建立项目自己的 Design Token 和 Studio 组件规范。
- 禁止各页面独立复制按钮、弹窗、菜单和卡片样式。
- 节点卡片必须使用统一的 `NodeCard` 体系。

## 6.7 大列表：TanStack Virtual

资产库、任务列表、生成历史、Prompt 历史和长消息列表采用虚拟化渲染。

禁止在资产数量较多时把全部图片或视频元素同时挂载到 DOM。

---

## 7. 前端分层设计

## 7.1 App Shell

App Shell 提供跨工作区的稳定框架：

- 项目导航。
- 工作区切换。
- 全局命令面板。
- Agent Dock。
- 资产抽屉。
- 任务与通知中心。
- 用户设置和模型配置入口。

App Shell 不直接实现具体画布业务。

## 7.2 Workspace 层

建议逐步形成以下工作区：

| 工作区 | 主要职责 | 主要交互形态 |
|---|---|---|
| Project Overview | 项目状态与入口 | Dashboard |
| Asset Library | 图片、视频、音频和文档管理 | 虚拟化网格/列表 |
| Script Editor | 剧本与段落编辑 | 文档编辑器 |
| Character & Scene | 角色、场景和道具设定 | 表单 + 素材卡片 |
| Shot List | 镜头结构化管理 | 表格/列表 |
| Storyboard Board | 分镜编排与审阅 | 卡片墙/自由画板 |
| Generation Flow | 生成流程与任务连接 | React Flow |
| Timeline | 视频与音频时序 | 独立时间轴 |

## 7.3 Domain 层

前端领域对象至少包括：

```typescript
type ProjectId = string;
type AssetId = string;
type ArtifactId = string;
type ShotId = string;
type AgentTaskId = string;
```

核心领域：

- Project
- Script
- Character
- Scene
- Prop
- Shot
- Storyboard
- Asset
- Artifact
- GenerationJob
- Workflow
- AgentProfile
- AgentSession
- AgentTask
- AgentEvent

领域对象不得与 React Flow 的原始 Node 对象完全绑定，应通过 Adapter 转换。

## 7.4 Canvas Engine 层

React Flow 相关代码必须集中在 `canvas/flow` 中，主要包含：

- Node Registry
- Edge Registry
- Command System
- Selection Controller
- Viewport Controller
- Persistence Adapter
- Clipboard Adapter
- Keyboard Shortcuts
- Layout Adapter
- Performance Instrumentation

业务节点只能通过注册机制进入画布，不允许在画布核心组件中不断追加大型 `switch`。

---

## 8. 节点体系总体设计

## 8.1 节点类型

第一阶段建议支持：

```typescript
type StudioNodeKind =
  | 'asset'
  | 'prompt'
  | 'image-generation'
  | 'video-generation'
  | 'audio-generation'
  | 'comfy-workflow'
  | 'agent-task'
  | 'shot'
  | 'storyboard'
  | 'artifact';
```

后续可扩展：

- Character Node
- Scene Node
- Script Segment Node
- Review Node
- Approval Node
- Batch Node
- Export Node

## 8.2 节点显示层级

节点至少支持三种显示层级：

### Compact

默认未选中状态，只显示：

- 缩略图或图标。
- 标题。
- 核心状态。
- 少量关键参数。
- 输入输出 Handle。

### Selected

节点被选中后显示：

- 快速操作。
- 核心配置摘要。
- 候选结果。
- 错误或进度信息。

### Inspector

完整编辑在右侧属性面板完成：

- Prompt 编辑。
- 模型与参数。
- 输入素材。
- Agent Skill。
- 任务日志。
- 版本与历史。

原则上不在画布节点中长期挂载完整复杂表单。

## 8.3 Node Registry

建议使用注册模式：

```typescript
interface StudioNodeDefinition<TData> {
  kind: StudioNodeKind;
  component: React.ComponentType<StudioNodeProps<TData>>;
  schema: ZodSchema<TData>;
  defaultSize: { width: number; height: number };
  capabilities: NodeCapability[];
  inspector: React.ComponentType<InspectorProps<TData>>;
}
```

新增节点时只注册定义，不修改核心画布流程。

---

## 9. 状态与数据流

## 9.1 三类状态严格分离

### Server State

- 项目。
- 资产。
- 镜头。
- 画布快照。
- Artifact。
- 生成任务。
- Agent Session。

由 TanStack Query 管理。

### Editor State

- 视口。
- 选择集。
- 拖拽状态。
- 临时连线。
- 本地未提交坐标。
- 撤销重做栈。

由 Zustand 管理。

### Ephemeral UI State

- Dialog。
- Popover。
- Tooltip。
- Context Menu。
- Hover。
- 当前 Inspector Tab。

按组件局部状态或轻量 UI Store 管理。

## 9.2 写入策略

### 拖拽期间

- 只更新浏览器内存。
- 使用 transform 完成视觉移动。
- 不调用后端。
- 不更新所有节点对象。

### 拖拽结束

- 合并节点坐标变化。
- 通过批量接口保存。
- 失败时保留本地状态并提示重试。

### 自动保存

- 采用 debounce + dirty set。
- 自动保存与用户主动保存共享版本号。
- 服务端使用 revision 或 updatedAt 防止旧写入覆盖新版本。

## 9.3 节点订阅

节点组件只订阅自身需要的状态，禁止所有节点订阅完整 `nodes` 数组。

推荐：

```typescript
const node = useStudioStore(state => state.nodesById[nodeId]);
```

并对节点组件使用 `React.memo` 和稳定 selector。

---

## 10. 性能设计

## 10.1 性能原则

1. 拖动路径不进行网络请求。
2. 拖动路径不执行图片尺寸探测和复杂业务计算。
3. 视口外节点尽量不进行重型内容渲染。
4. 视频节点默认显示 Poster，不默认挂载真实播放器。
5. 图片节点按缩略图、预览图、原图分级加载。
6. 节点内容更新不应触发所有节点重渲染。
7. 资产网格和长列表必须虚拟化。
8. WebSocket 高频事件需要按任务合并和节流。
9. 后台任务日志不直接无限追加到当前 DOM。
10. 性能监控必须在开发阶段接入，而不是上线后再补。

## 10.2 初步性能预算

以下指标作为第一版目标，后续性能专项设计可进一步校准：

| 场景 | 目标 |
|---|---|
| 空画布平移/缩放 | 主观无明显卡顿，保持接近 60 FPS |
| 100 个轻量节点 | 拖动、缩放和框选稳定 |
| 300 个混合节点 | 通过可见元素渲染与节点降级保持可操作 |
| 节点拖动响应 | 输入到视觉反馈尽量控制在单帧级 |
| 拖动结束保存 | 不阻塞下一次交互 |
| 资产库 1000+ 项 | 仅渲染可视区域附近内容 |
| 视频节点 | 未激活时不加载完整播放器 |
| 高频任务事件 | UI 合并刷新，不逐 Token 重绘整个页面 |

## 10.3 节点降级策略

缩放比例较低时：

- 隐藏非必要文字。
- 不渲染完整表单。
- 视频仅显示静态缩略图。
- 图片切换为更小预览。
- 减少阴影、模糊和复杂动画。

节点离开视口时：

- 停止视频播放。
- 暂停高分辨率图片加载。
- 卸载重型预览内容。
- 保留轻量占位结构。

---

## 11. UI 与设计系统

## 11.1 Design Token

至少建立以下 Token：

```text
Color
├── background
├── surface
├── border
├── text
├── accent
└── status

Typography
├── font family
├── title
├── body
├── caption
└── mono

Space
├── page
├── panel
├── card
└── inline

Shape
├── radius
├── border width
└── shadow

Motion
├── duration
├── easing
└── reduced motion
```

## 11.2 核心组件

优先建设：

- Button
- IconButton
- Input
- Textarea
- Select
- Tabs
- Tooltip
- Popover
- Dialog
- Drawer
- ContextMenu
- CommandMenu
- SplitPane
- NodeCard
- NodeHeader
- NodeStatusBadge
- MediaThumbnail
- ArtifactCard
- TaskProgress
- AgentMessage
- ToolCallCard
- PermissionCard
- EmptyState
- ErrorState

## 11.3 NodeCard 统一规范

每个节点卡片统一由以下区域构成：

```text
┌──────────────────────────────┐
│ Header：图标 / 标题 / 状态    │
├──────────────────────────────┤
│ Preview：图片 / 视频 / 摘要   │
├──────────────────────────────┤
│ Meta：模型 / 尺寸 / 时长      │
├──────────────────────────────┤
│ Actions：主要快捷操作         │
└──────────────────────────────┘
```

需要统一定义：

- 默认状态。
- Hover 状态。
- Selected 状态。
- Running 状态。
- Success 状态。
- Warning 状态。
- Error 状态。
- Disabled 状态。

---

## 12. Agent 集成边界

## 12.1 Agent 相关前端模型

```typescript
interface AgentProfile {
  id: string;
  name: string;
  runtimeType: string;
  capabilities: string[];
}

interface AgentSession {
  id: string;
  profileId: string;
  projectId: string;
  status: 'starting' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
}

interface AgentTask {
  id: string;
  sessionId: string;
  skillId?: string;
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  status: string;
}

interface AgentEvent {
  taskId: string;
  sequence: number;
  type:
    | 'message_delta'
    | 'plan'
    | 'tool_call'
    | 'tool_result'
    | 'permission_request'
    | 'artifact_created'
    | 'status_changed'
    | 'error';
  payload: unknown;
}
```

## 12.2 前端职责

- 展示 Agent Profile。
- 创建 Session 和 Task。
- 选择项目上下文、素材和 Skill。
- 展示流式消息。
- 展示 Plan 和 Tool Call。
- 处理权限确认。
- 展示任务状态。
- 接收 Artifact 并写入画布或资产库。

## 12.3 前端不负责

- 自主规划循环。
- Tool Registry 执行。
- CLI 进程生命周期细节。
- 不同 Agent Runtime 的协议差异。
- Agent 上下文压缩算法。
- 模型供应商特定逻辑。

这些能力统一由后端 Agent Gateway 与 ACP/CLI Adapter 处理。

## 12.4 Agent Task Node

React Flow 中的 Agent Task Node 是一次可观察、可追踪的领域任务，不代表前端自己实现一个 Agent。

节点主要展示：

- Agent Profile。
- Skill 和版本。
- 输入 Artifact。
- 当前状态。
- 计划摘要。
- 最近 Tool Call。
- 输出 Artifact。
- 继续、取消、重试等操作。

---

## 13. 后端兼容与 API 边界

## 13.1 后端保留项

- FastAPI 应用。
- 当前模型供应商调用能力。
- ComfyUI 集成。
- 当前文件与媒体代理能力。
- 当前 WebSocket 能力。
- 现有数据和配置。

## 13.2 建议新增 API 分组

```text
/api/v2/projects
/api/v2/assets
/api/v2/artifacts
/api/v2/canvases
/api/v2/nodes
/api/v2/shots
/api/v2/storyboards
/api/v2/generation-jobs
/api/v2/agent-profiles
/api/v2/agent-sessions
/api/v2/agent-tasks
/ws/v2/events
```

这些路径是总体命名建议，详细设计阶段可以根据现有 API 复用情况调整。

## 13.3 API Contract 原则

- 统一错误结构。
- 统一分页结构。
- 统一任务状态枚举。
- 所有长任务返回 Job ID。
- 所有事件包含 `eventId`、`sequence`、`timestamp` 和关联对象 ID。
- 前端可在 WebSocket 重连后按 sequence 补拉事件。
- 画布保存支持 revision 或 ETag。
- Artifact 使用统一引用，不把大量二进制或 Base64 写入画布 JSON。

## 13.4 生产部署

开发环境：

```text
Vite Dev Server
    └── proxy /api 与 /ws 到 FastAPI
```

生产环境：

```text
Vite build
    └── frontend/dist
        └── FastAPI 或 Nginx 托管
```

---

## 14. 旧数据兼容与迁移

## 14.1 迁移原则

不采用一次性大爆炸迁移。

新旧前端并行存在：

```text
Legacy Canvas：/canvas 或现有入口
Studio V2：/studio-v2
```

## 14.2 数据适配层

建立独立适配器：

```text
Legacy Canvas JSON
        ↓
LegacyCanvasAdapter
        ↓
Studio Canvas Model
        ↓
React Flow Nodes / Edges
```

新前端领域模型不得直接依赖旧 JSON 的全部历史字段。

## 14.3 迁移阶段

### 阶段 A：只读导入

- 新前端读取旧画布。
- 转换为 React Flow 节点。
- 不修改旧数据格式。

### 阶段 B：双格式保存

- 新前端保存 Studio V2 数据。
- 必要时同步生成旧格式兼容数据。

### 阶段 C：V2 主格式

- Studio V2 格式成为主格式。
- 旧格式仅用于导入与兼容。

### 阶段 D：Legacy 退役

- 在功能和数据验证完成后停止默认使用旧画布。
- 旧入口保留一段观察期。

---

## 15. 推荐目录结构

```text
frontend/
├── src/
│   ├── app/
│   │   ├── router/
│   │   ├── providers/
│   │   └── layouts/
│   ├── pages/
│   │   ├── ProjectOverview/
│   │   ├── AssetLibrary/
│   │   ├── ScriptEditor/
│   │   ├── CharacterSceneDesign/
│   │   ├── ShotList/
│   │   ├── StoryboardBoard/
│   │   ├── GenerationFlow/
│   │   └── Timeline/
│   ├── canvas/
│   │   ├── flow/
│   │   ├── nodes/
│   │   ├── edges/
│   │   ├── commands/
│   │   ├── selection/
│   │   ├── persistence/
│   │   └── adapters/
│   ├── agent/
│   │   ├── AgentDock/
│   │   ├── TaskTimeline/
│   │   ├── ToolCallCard/
│   │   ├── PermissionCard/
│   │   └── stores/
│   ├── assets/
│   ├── artifacts/
│   ├── generation/
│   ├── design-system/
│   ├── components/
│   ├── api/
│   ├── stores/
│   ├── schemas/
│   ├── types/
│   └── utils/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── index.html
```

后端后续可按需要逐步整理：

```text
backend/
├── api/
├── services/
├── agent_gateway/
├── generation/
├── assets/
└── models/
```

后端目录拆分仅作为后续演进方向，不是本次前端重构的启动条件。

---

## 16. 实施阶段

## 16.1 Phase 0：基线与验证

目标：验证技术路线，不迁移全部业务。

交付：

- `frontend` 工程初始化。
- React Flow 技术原型。
- 100～300 节点性能验证。
- 图片和视频节点降级验证。
- FastAPI 代理与静态部署验证。
- Design Token 初稿。

## 16.2 Phase 1：App Shell 与设计系统

交付：

- 全局布局。
- 项目导航。
- 工作区路由。
- Agent Dock 占位框架。
- 基础组件库。
- 明暗主题和尺寸规范。
- API Client 和 WebSocket Client。

## 16.3 Phase 2：Generation Flow

交付：

- React Flow 主画布。
- 节点拖拽、缩放、框选、多选。
- MiniMap 和 Controls。
- 复制粘贴。
- 撤销重做。
- 节点右键菜单。
- Inspector。
- 旧 Canvas JSON 只读导入。

## 16.4 Phase 3：生成节点迁移

交付：

- Asset Node。
- Prompt Node。
- Image Generation Node。
- Video Generation Node。
- Comfy Workflow Node。
- Artifact Node。
- 生成进度和结果展示。

## 16.5 Phase 4：Agent 接入

交付：

- Agent Profile 选择。
- Session 与 Task。
- Agent Task Node。
- 流式消息。
- Plan、Tool Call 和权限确认。
- Artifact 回写。
- Codex/Claude/Pi 等后端适配的统一前端展示。

## 16.6 Phase 5：影视创作工作区

交付：

- 剧本编辑器。
- 角色与场景设计。
- 镜头表。
- 分镜工作区。
- 项目资产引用。
- 镜头到生成流程的连接。

## 16.7 Phase 6：自由画板与时间轴

交付：

- 评估并引入 tldraw 或替代自由画板。
- 情绪板和自由分镜墙。
- 独立时间轴原型。
- 视频和音频 Artifact 时序编排。

## 16.8 Phase 7：默认入口切换

条件：

- 核心功能覆盖旧画布。
- 数据迁移稳定。
- 性能指标达标。
- 关键用户操作无阻断。

完成后：

- Studio V2 成为默认入口。
- Legacy Canvas 进入维护模式。

---

## 17. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| React Flow 节点内容过重 | 仍可能卡顿 | Compact 节点、Inspector、可见区渲染、分级加载 |
| 新旧数据模型差异大 | 迁移成本上升 | 独立 Adapter、版本化 Schema、分阶段迁移 |
| 后端 API 不稳定 | 前端返工 | Zod 校验、API Contract、v2 路径、兼容层 |
| Agent 事件种类持续增加 | UI 复杂化 | 统一 AgentEvent Envelope 和事件注册机制 |
| 设计系统流于组件换皮 | UI 仍不统一 | 先定义 Token、状态和信息密度，再实现组件 |
| tldraw 许可证限制 | 商业化风险 | 第二阶段专项评估，不作为第一阶段强依赖 |
| 同时开发过多工作区 | 进度失控 | 第一阶段只聚焦 App Shell + Generation Flow |
| 直接重写全部功能 | 长期不可交付 | 新旧并行、按节点和页面增量迁移 |

---

## 18. 第一阶段验收标准

Studio V2 第一阶段达到以下条件，才视为总体技术路线验证成功：

### 架构

- 新前端为独立 React + TypeScript + Vite 工程。
- 不复用现有 `canvas.js` 作为新画布核心。
- React Flow 与业务领域通过 Adapter 解耦。
- 服务端状态和编辑器状态分离。

### 功能

- 支持节点创建、移动、缩放、框选、多选和连接。
- 支持图片、视频、生成任务和 Artifact 基础节点。
- 支持右侧 Inspector。
- 支持旧画布数据导入演示。
- 支持 FastAPI REST 与 WebSocket 通信。

### 性能

- 节点拖动过程中无后端保存请求。
- 多节点移动不会触发所有节点完整重渲染。
- 未激活视频节点不挂载完整播放器。
- 资产列表采用虚拟化。
- 100 个常规节点下拖拽、缩放和框选无明显卡顿。
- 300 个混合节点下仍可进行基本操作。

### UI

- 建立统一 Design Token。
- 建立 NodeCard 统一视觉规范。
- Hover、Selected、Running、Success 和 Error 状态一致。
- 工具栏、弹窗、菜单和属性面板使用统一组件体系。

### 迁移

- Legacy Canvas 与 Studio V2 可并行访问。
- 新前端故障不影响旧画布继续使用。
- 旧数据转换失败时能明确提示，不静默丢失数据。

---

## 19. 后续细化设计清单

总体设计确认后，按以下顺序继续输出详细设计：

1. **Studio V2 页面信息架构设计**  
   明确项目页、素材库、剧本、镜头、分镜、生成流程、Agent Dock 和时间轴之间的关系。

2. **设计系统与画布 UI 规范**  
   明确颜色、字体、间距、卡片、工具栏、Inspector 和状态视觉规范。

3. **React Flow 画布详细设计**  
   明确节点、边、Handle、选择、拖拽、快捷键、命令系统和持久化。

4. **节点领域模型与 Node Registry 设计**  
   明确各节点 Schema、输入输出、能力、状态和扩展机制。

5. **旧 Canvas JSON 迁移设计**  
   明确字段映射、版本识别、兼容策略和回滚机制。

6. **Agent Gateway 与前端事件协议设计**  
   明确 ACP/CLI Adapter、Session、Task、事件、权限和 Artifact 回写。

7. **资产与 Artifact 模型设计**  
   明确原始素材、生成结果、版本、引用关系和缩略图策略。

8. **性能专项设计**  
   明确基准场景、监控指标、渲染策略、媒体资源管理和压测方案。

9. **前后端 API v2 设计**  
   明确 DTO、错误码、分页、Job、WebSocket 重连和版本控制。

10. **实施任务拆分与里程碑计划**  
    将总体方案拆分为可直接进入 Codex/Claude CLI 执行的开发任务。

---

## 20. 架构决策摘要

| 决策项 | 决策 |
|---|---|
| 后端是否重写 | 否，保留 FastAPI |
| 前端是否继续扩展原生 canvas.js | 否，进入维护模式 |
| 新前端框架 | React + TypeScript + Vite |
| 核心生产画布 | React Flow |
| 自由画板 | 第二阶段评估 tldraw |
| 是否使用 PixiJS 自研画布 | 第一阶段不采用 |
| 编辑器状态 | Zustand |
| 服务端状态 | TanStack Query |
| API 校验 | Zod |
| UI 基座 | Tailwind CSS + Radix UI + shadcn/ui |
| 大列表 | TanStack Virtual |
| Agent Harness | 不自研 |
| Agent Runtime | 复用 Claude CLI、Codex CLI、Pi、oh-my-pi 等 |
| Agent 接入 | 后端 Agent Gateway + ACP/CLI Adapter |
| 迁移方式 | Studio V2 与 Legacy Canvas 并行，渐进迁移 |

---

## 21. 最终原则

本次重构应始终遵循以下原则：

> 保留已经可用的后端和生成能力，替换已经成为体验和维护瓶颈的前端画布架构。

> React 负责应用，React Flow 负责生产画布，状态库负责编辑器状态，Query 层负责服务端数据，设计系统负责统一 UI。

> 画布只是 AI 影视创作平台的一个工作区，不能继续承担所有业务页面和全部领域对象。

> Agent Runtime 使用成熟外部实现，Infinite-Canvas 只负责 Agent Host、上下文、工具、事件与 Artifact 集成。

> 新旧版本并行，先建立可验证的 Studio V2，再逐步迁移，而不是停止现有功能后进行一次性重写。
