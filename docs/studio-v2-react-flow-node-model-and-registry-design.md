# Infinite-Canvas Studio V2 React Flow 节点模型与 Node Registry 详细设计

> 文档状态：详细设计基线（Detailed Design Baseline）  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 前置文档：  
> - `docs/studio-v2-frontend-architecture-overall-design.md`  
> - `docs/studio-v2-information-architecture-and-core-workflows.md`  
> - `docs/studio-v2-ui-interaction-and-motion-design-system.md`  
> - `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`

---

## 1. 文档目的

本文档确定 Studio V2 生产流程画布的节点领域模型、React Flow 映射方式、端口类型、连接规则、Node Registry、Inspector、命令系统、复制粘贴、撤销重做、运行状态绑定、性能边界和 Legacy Canvas 迁移策略。

本文档重点解决以下问题：

1. 如何避免将现有 `canvas.js` 机械翻译成另一个巨型 `CanvasPage.tsx`。
2. 如何避免每增加一个模型供应商就增加一种顶层节点类型。
3. 如何区分节点配置、领域对象、画布布局、运行任务和临时 UI 状态。
4. 如何让节点、Inspector、端口、快捷操作和执行逻辑通过注册机制扩展。
5. 如何将 React Flow 的交互能力与 `/api/v2` Canvas Operation、GenerationJob 和 Studio Event 对接。
6. 如何兼容现有 `image`、`prompt`、`loop`、`group`、`llm`、`generator`、`midjourney`、`msgen`、`comfy`、`rh`、`video`、`minimax`、`ltxDirector`、`output` 等 Legacy 节点。

---

## 2. 现有节点体系的问题

当前节点的 `type` 同时承担了多种职责：

```text
UI 卡片类型
业务用途
执行协议
供应商名称
模型参数
任务状态
结果存储
```

例如：

```text
generator
midjourney
msgen
comfy
rh
minimax
ltxDirector
video
```

这些类型有一部分是“生成节点”，有一部分是“供应商”，有一部分是“工作流实现”，有一部分是“特定产品功能”。

现有节点对象中还会直接保存：

- `running`
- `lastTaskId`
- `lastTaskStatus`
- `lastPrompt`
- `images`
- `inputs`
- 供应商专用参数
- 页面渲染相关字段

这样会产生以下问题：

1. 新增供应商时节点类型持续膨胀。
2. 节点 Schema 难以稳定。
3. 任务重试和历史记录与节点配置混杂。
4. 画布保存包含大量瞬时状态。
5. Inspector 只能通过大型条件分支实现。
6. 连接规则散落在不同事件处理函数中。
7. Legacy 字段不断积累，无法可靠升级。

Studio V2 必须把这些职责拆开。

---

## 3. 核心设计决策

## 3.1 节点类型表达业务能力，不表达供应商

Studio V2 第一阶段稳定节点类型：

```typescript
type StudioNodeKind =
  | 'asset'
  | 'prompt'
  | 'text-transform'
  | 'batch'
  | 'image-generation'
  | 'video-generation'
  | 'audio-generation'
  | 'workflow'
  | 'agent-task'
  | 'shot'
  | 'storyboard'
  | 'artifact'
  | 'output'
  | 'group'
  | 'note'
  | 'legacy';
```

以下名称不再作为公共顶层 Node Kind：

```text
midjourney
modelscope
runninghub
comfyui
jimeng
minimax
ltx
openai
```

它们改为：

```text
executor
provider_id
workflow_id
model
adapter_config
```

例如：

```json
{
  "kind": "image-generation",
  "config": {
    "executor": "provider",
    "provider_id": "midjourney-main",
    "model": "v6.1"
  }
}
```

或者：

```json
{
  "kind": "workflow",
  "config": {
    "executor": "comfyui",
    "workflow_id": "custom/portrait.json"
  }
}
```

## 3.2 节点模型分为五层

```text
Canvas Node Envelope
├── Identity：节点身份与 Definition 版本
├── Layout：位置、尺寸、父子关系
├── Config：用户可持久化配置
├── Bindings：领域对象与运行对象引用
└── Presentation：持久化的轻量显示偏好
```

运行中的进度、Hover、选中、拖拽和弹层状态不进入持久化节点数据。

## 3.3 React Flow Node 不是领域模型

React Flow Node 只作为画布引擎 DTO：

```text
StudioCanvasNode
        ↓ adapter
ReactFlow Node<StudioFlowNodeData>
```

领域代码、后端 Contract 和迁移代码不直接依赖 React Flow 内部字段。

## 3.4 Node Registry 是唯一扩展入口

新增节点必须通过 Node Registry 注册：

- Schema
- 默认值
- React 组件
- Inspector
- Port 定义
- Connection Policy
- Commands
- Runtime Adapter
- Legacy Migrator
- Search Metadata

禁止在核心画布页面持续增加：

```typescript
if (node.kind === '...')
switch (node.kind)
```

## 3.5 运行态通过 Job Reference 绑定

节点保存的是：

```text
active_job_id
latest_successful_job_id
result_asset_ids
```

任务详情、进度、错误、Attempt 和供应商原始响应由 GenerationJob 管理，不复制进节点配置。

---

## 4. Canvas Document V2

```typescript
interface StudioCanvasDocument {
  schemaVersion: 2;
  canvasId: string;
  revision: number;
  nodes: StudioCanvasNode[];
  edges: StudioCanvasEdge[];
  viewport: StudioViewport;
  groups?: StudioCanvasGroupMetadata[];
  settings: StudioCanvasSettings;
}
```

## 4.1 StudioCanvasNode

```typescript
interface StudioCanvasNode<TConfig = unknown> {
  id: string;
  kind: StudioNodeKind;
  definitionVersion: number;

  layout: {
    position: { x: number; y: number };
    size?: { width: number; height: number };
    parentId?: string;
    extent?: 'parent';
    zIndex?: number;
    hidden?: boolean;
    locked?: boolean;
  };

  config: TConfig;

  bindings?: {
    projectId?: string;
    domainRef?: DomainReference;
    activeJobId?: string;
    latestSuccessfulJobId?: string;
    resultAssetIds?: string[];
    artifactIds?: string[];
  };

  presentation?: {
    title?: string;
    collapsed?: boolean;
    colorToken?: string;
    previewMode?: 'auto' | 'cover' | 'contain' | 'poster' | 'none';
    density?: 'compact' | 'comfortable';
  };

  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    source?: 'studio-v2' | 'legacy-import' | 'agent' | 'template';
    legacy?: Record<string, unknown>;
  };
}
```

## 4.2 DomainReference

```typescript
type DomainReference =
  | { type: 'asset'; id: string; versionId?: string }
  | { type: 'artifact'; id: string; versionId?: string }
  | { type: 'character'; id: string }
  | { type: 'scene'; id: string }
  | { type: 'shot'; id: string }
  | { type: 'storyboard-frame'; id: string }
  | { type: 'agent-task'; id: string }
  | { type: 'generation-job'; id: string };
```

## 4.3 不进入持久化的数据

以下状态只存于 Zustand Editor Store 或 React Flow 内部：

```text
selected
dragging
hovered
resizing
connection preview
context menu
inspector active tab
inline editing
validation highlight
pending operation
optimistic save state
remote cursor
```

---

## 5. React Flow 映射

使用当前 React Flow 包名：

```typescript
import type { Node, Edge } from '@xyflow/react';
```

## 5.1 React Flow Node Data

```typescript
interface StudioFlowNodeData {
  nodeId: string;
  kind: StudioNodeKind;
  definitionVersion: number;
}

type StudioFlowNode = Node<StudioFlowNodeData, 'studio-node'>;
```

React Flow `data` 中只保存用于定位 Store 数据的轻量索引，不复制完整 `config`。

节点组件通过 `nodeId` 使用细粒度 Selector：

```typescript
const node = useStudioCanvasStore(
  useShallow(state => state.nodesById[nodeId])
);
```

禁止：

```typescript
const nodes = useNodes();
const node = nodes.find(...);
```

原因是任何节点移动都会让订阅完整节点数组的组件重新渲染。

## 5.2 React Flow NodeTypes

React Flow 只注册一个稳定包装节点：

```typescript
const nodeTypes = {
  'studio-node': StudioNodeHost,
};
```

`StudioNodeHost` 再根据 Node Registry 解析真正的节点组件：

```typescript
function StudioNodeHost({ id }: NodeProps<StudioFlowNode>) {
  const kind = useNodeKind(id);
  const definition = nodeRegistry.get(kind);
  const Component = definition.canvasComponent;
  return <Component nodeId={id} />;
}
```

这样做的好处：

- React Flow `nodeTypes` 引用稳定。
- 动态插件节点无需重建 `nodeTypes`。
- Registry 可控制版本迁移与缺失节点降级。
- 所有节点统一包裹 NodeFrame、错误边界和性能监控。

## 5.3 Edge 映射

```typescript
interface StudioCanvasEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  kind: 'data' | 'control' | 'reference';
  label?: string;
  disabled?: boolean;
  metadata?: Record<string, unknown>;
}
```

映射到 React Flow：

```typescript
interface StudioFlowEdgeData {
  edgeKind: 'data' | 'control' | 'reference';
  dataType?: StudioDataType;
  validationState?: 'valid' | 'warning' | 'invalid';
}
```

默认边：

```text
data       → smoothstep
control    → step / dashed
reference  → simplebezier / subtle
```

只有正在运行的数据链路可短暂显示流动效果；普通边不持续动画，避免视觉噪声和 GPU 开销。

---

## 6. Node Registry

## 6.1 Registry Definition

```typescript
interface StudioNodeDefinition<TConfig> {
  kind: StudioNodeKind;
  displayName: string;
  description: string;
  category: NodeCategory;
  icon: LucideIconName;
  definitionVersion: number;

  configSchema: ZodType<TConfig>;
  defaultConfig: () => TConfig;
  migrateConfig: (
    config: unknown,
    fromVersion: number
  ) => MigrationResult<TConfig>;

  canvasComponent: ComponentType<StudioNodeCanvasProps>;
  inspectorComponent: ComponentType<StudioNodeInspectorProps<TConfig>>;
  previewComponent?: ComponentType<StudioNodePreviewProps>;

  ports: PortDefinition[] | ((config: TConfig) => PortDefinition[]);
  capabilities: NodeCapability[];
  commands: NodeCommandDefinition[];

  validate: (context: NodeValidationContext<TConfig>) => NodeValidationIssue[];
  buildExecution?: (
    context: NodeExecutionContext<TConfig>
  ) => GenerationJobCreateRequest | AgentTaskCreateRequest;

  serialize?: (config: TConfig) => unknown;
  deserialize?: (raw: unknown) => TConfig;

  legacyAdapters?: LegacyNodeAdapter[];
  searchKeywords: string[];
}
```

## 6.2 Node Category

```typescript
type NodeCategory =
  | 'input'
  | 'prompting'
  | 'generation'
  | 'workflow'
  | 'agent'
  | 'production'
  | 'output'
  | 'organization'
  | 'utility';
```

Node Picker 按 Category 分组，而不是按供应商分组。

## 6.3 Node Capability

```typescript
type NodeCapability =
  | 'executable'
  | 'cancelable'
  | 'retryable'
  | 'duplicable'
  | 'resizable'
  | 'collapsible'
  | 'supports-batch'
  | 'supports-variants'
  | 'accepts-drop'
  | 'domain-linked'
  | 'versioned-output'
  | 'can-convert-to-template';
```

UI 操作根据 Capability 出现，不根据 `kind` 硬编码。

## 6.4 Registry 生命周期

```text
应用启动
  ↓
注册内置节点
  ↓
加载 Feature Flag
  ↓
注册可用扩展节点
  ↓
冻结 Registry
  ↓
加载 Canvas Document
  ↓
逐节点 Schema 校验与迁移
```

生产运行时不允许任意覆盖已注册 Definition。

开发环境重复注册时必须报错。

---

## 7. Port 与 Handle 类型系统

## 7.1 StudioDataType

```typescript
type StudioDataType =
  | 'text'
  | 'prompt'
  | 'image'
  | 'video'
  | 'audio'
  | 'media'
  | 'asset-ref'
  | 'artifact-ref'
  | 'character-ref'
  | 'scene-ref'
  | 'shot-ref'
  | 'storyboard-ref'
  | 'json'
  | 'number'
  | 'boolean'
  | 'job-ref'
  | 'control'
  | 'any';
```

## 7.2 PortDefinition

```typescript
interface PortDefinition {
  id: string;
  direction: 'input' | 'output';
  label: string;
  dataType: StudioDataType;
  required?: boolean;
  multiple?: boolean;
  maxConnections?: number;
  order?: number;
  position?: 'left' | 'right' | 'top' | 'bottom';
  accepts?: StudioDataType[];
  hiddenWhen?: PortVisibilityRule;
  description?: string;
}
```

## 7.3 类型兼容矩阵

基础规则：

| Source | Target | 结果 |
|---|---|---|
| `image` | `image` | 允许 |
| `image` | `media` | 允许 |
| `video` | `media` | 允许 |
| `audio` | `media` | 允许 |
| `prompt` | `text` | 允许，保留 Prompt 语义 |
| `text` | `prompt` | 警告，允许显式转换 |
| `asset-ref` | `image/video/audio` | 根据 Asset Kind 动态验证 |
| `artifact-ref` | `json` | 根据 Artifact Schema 验证 |
| `any` | 任意 | 仅 Legacy/Utility 使用 |
| 任意 | `control` | 禁止，必须为 Control Edge |

禁止通过颜色或名称猜类型，必须使用 Port Definition。

## 7.4 连接验证顺序

```text
1. Source/Target 是否存在
2. 不能连接同一个 Handle
3. 是否允许 Self Loop
4. Port Direction 是否正确
5. Data Type 是否兼容
6. Target 是否达到 maxConnections
7. 是否产生禁止的 Cycle
8. Node Definition 自定义 Policy
9. Domain Reference 是否满足约束
```

全局使用 React Flow `isValidConnection`，内部调用 Registry Connection Service。

```typescript
const isValidConnection: IsValidConnection<StudioFlowEdge> = connection =>
  connectionPolicy.validate(connection, canvasState).valid;
```

不要在每个 Handle 组件重复实现完整校验逻辑。

## 7.5 动态 Handle

节点配置变化导致端口增加、删除或换位时：

1. 重新计算 Registry Port Definition。
2. 更新 Node Port Cache。
3. 调用 `useUpdateNodeInternals(nodeId)`。
4. 校验现有 Edge。
5. 无效 Edge 标记为 orphaned，不立即静默删除。

用户可在 Inspector 中修复或确认删除 orphaned Edge。

---

## 8. 第一阶段节点定义

## 8.1 Asset Node

用途：引用图片、视频、音频或文档素材。

```typescript
interface AssetNodeConfig {
  assetId?: string;
  assetVersionId?: string;
  selectionMode: 'fixed' | 'latest';
  outputMode: 'reference' | 'binary-url';
}
```

输出端口根据 Asset Kind 动态生成：

```text
image → image + asset-ref
video → video + asset-ref
audio → audio + asset-ref
other → asset-ref
```

## 8.2 Prompt Node

```typescript
interface PromptNodeConfig {
  text: string;
  templateId?: string;
  variables: Record<string, string>;
  language?: string;
  negativeText?: string;
}
```

端口：

```text
inputs.variables[]
output.prompt
output.negative_prompt
```

完整编辑在 Inspector 中进行；节点默认只显示摘要。

## 8.3 Text Transform Node

用于替代一部分 Legacy LLM 节点和纯文本处理：

```typescript
interface TextTransformNodeConfig {
  operation: 'llm' | 'template' | 'merge' | 'extract' | 'rewrite';
  providerId?: string;
  model?: string;
  systemPrompt?: string;
  template?: string;
  outputSchema?: Record<string, unknown>;
}
```

## 8.4 Batch Node

用于替代 Legacy `loop` 的部分职责。

```typescript
interface BatchNodeConfig {
  mode: 'each' | 'zip' | 'cartesian' | 'repeat';
  repeatCount?: number;
  concurrency?: number;
  continueOnError?: boolean;
}
```

Batch 是数据组合语义，不在前端自己循环调用供应商接口；执行计划交由后端 GenerationJob/Workflow Adapter。

## 8.5 Image Generation Node

```typescript
interface ImageGenerationNodeConfig {
  executor: 'auto' | 'provider' | 'workflow';
  providerId?: string;
  model?: string;
  workflowId?: string;
  sizePreset?: string;
  width?: number;
  height?: number;
  count: number;
  seed?: number;
  parameters: Record<string, unknown>;
  resultPolicy: 'replace-latest' | 'append-versions';
}
```

端口：

```text
input.prompt
input.negative_prompt
input.reference_images[]
input.mask?
input.character_refs[]
input.scene_refs[]
output.images[]
output.job
```

Midjourney、ModelScope、RunningHub 图像工作流和普通 OpenAI-compatible 生图都映射到该节点或 Workflow Node。

## 8.6 Video Generation Node

```typescript
interface VideoGenerationNodeConfig {
  executor: 'auto' | 'provider' | 'workflow';
  providerId?: string;
  model?: string;
  workflowId?: string;
  duration?: number;
  ratio?: string;
  fps?: number;
  parameters: Record<string, unknown>;
}
```

端口：

```text
input.prompt
input.start_image?
input.end_image?
input.reference_images[]
input.reference_videos[]
input.reference_audio[]
input.shot_ref?
output.video
output.job
```

MiniMax、LTX Director、即梦视频等不再成为独立顶层 Kind。

## 8.7 Workflow Node

```typescript
interface WorkflowNodeConfig {
  executor: 'comfyui' | 'runninghub' | 'custom';
  workflowId: string;
  workflowVersion?: string;
  fieldValues: Record<string, unknown>;
  resultMapping: Record<string, string>;
}
```

动态端口由后端 Workflow Definition 和 Registry Adapter 生成。

## 8.8 Agent Task Node

```typescript
interface AgentTaskNodeConfig {
  profileId: string;
  skillId?: string;
  instruction: string;
  contextPolicy: Record<string, unknown>;
  permissionPolicy: 'ask' | 'safe-auto' | 'deny-tools';
  outputContract?: Record<string, unknown>;
}
```

端口：

```text
input.context[]
input.assets[]
input.artifacts[]
input.shot?
output.artifacts[]
output.assets[]
output.task
```

## 8.9 Shot Node

Shot Node 只引用 Shot Domain，不复制完整镜头数据。

```typescript
interface ShotNodeConfig {
  shotId: string;
  displayFields: string[];
  lockToShotRevision?: number;
}
```

## 8.10 Artifact Node

```typescript
interface ArtifactNodeConfig {
  artifactId: string;
  versionId?: string;
  selectionMode: 'fixed' | 'latest';
  previewMode: 'summary' | 'markdown' | 'structured';
}
```

## 8.11 Output Node

```typescript
interface OutputNodeConfig {
  mode: 'collect' | 'export' | 'review';
  name?: string;
  exportPresetId?: string;
  autoSaveToAssets?: boolean;
}
```

Legacy `output.images` 迁移为 Asset Reference，不在节点内嵌结果数组。

## 8.12 Group Node

Group 是布局容器，不参与数据执行。

```typescript
interface GroupNodeConfig {
  title: string;
  description?: string;
  layoutMode: 'free' | 'horizontal' | 'vertical' | 'grid';
  colorToken?: string;
}
```

子节点通过 React Flow `parentId` 和 `extent: 'parent'` 表达，不再仅依赖 `items: string[]`。

---

## 9. NodeFrame 与节点显示层级

所有节点必须经过统一 `NodeFrame`：

```text
NodeFrame
├── NodeHeader
├── Status / Validation
├── Compact Preview
├── Port Layer
├── Quick Actions
└── Error Boundary
```

## 9.1 Compact

默认状态：

- 标题
- 图标
- 关键预览
- 核心参数摘要
- 状态
- Port

## 9.2 Selected

选中后增加：

- Run / Cancel / Retry
- Open Inspector
- Preview Result
- Duplicate
- More Menu

不在节点内部展开完整模型参数表单。

## 9.3 Inspector

Inspector 是主要配置入口：

```text
Properties
Inputs
Execution
Results
Versions
Activity
Diagnostics
```

每个 Node Definition 提供自己的 Inspector Component，但必须使用统一 Form Field、Section、Validation 和 Save Behavior。

## 9.4 Contextual Zoom

低缩放比例时：

```text
< 0.45  → 仅图标、标题、状态
0.45–0.75 → Compact
> 0.75 → 完整 Compact Preview
```

不要用 CSS `display: none` 隐藏 Handle；需要隐藏时保持 Handle 可测量，使用 opacity/visibility 策略。

---

## 10. Editor Store 设计

```typescript
interface StudioCanvasEditorState {
  nodesById: Record<string, StudioCanvasNode>;
  nodeOrder: string[];
  edgesById: Record<string, StudioCanvasEdge>;
  edgeOrder: string[];

  selection: {
    nodeIds: Set<string>;
    edgeIds: Set<string>;
    primaryNodeId?: string;
  };

  viewport: StudioViewport;
  interaction: {
    draggingNodeIds: Set<string>;
    resizingNodeId?: string;
    connecting?: ConnectionDraft;
  };

  dirty: {
    nodeIds: Set<string>;
    edgeIds: Set<string>;
    viewport: boolean;
  };

  history: CommandHistoryState;
  saveState: CanvasSaveState;
}
```

## 10.1 Store 分片

```text
canvasDocumentSlice
selectionSlice
interactionSlice
commandSlice
clipboardSlice
persistenceSlice
validationSlice
```

GenerationJob、Asset 和 Artifact 数据不放入 Editor Store，由 TanStack Query 管理。

Editor Store 只保存对应 ID 和少量投影状态。

## 10.2 React Flow Change 处理

`onNodesChange` 分三类：

```text
position while dragging → 仅本地更新，不入 History，不调用 API
position drag stop      → 合并为一个 MoveNodesCommand
select                  → Selection Slice，不持久化
remove                  → DeleteSelectionCommand
resize                  → ResizeNodeCommand，结束后持久化
```

---

## 11. Command System

所有可撤销编辑必须以 Command 执行。

```typescript
interface StudioCommand<TPayload = unknown> {
  id: string;
  type: string;
  label: string;
  timestamp: number;
  payload: TPayload;
  execute(context: CommandContext): CommandResult;
  undo(context: CommandContext): CommandResult;
  mergeWith?(next: StudioCommand): StudioCommand | null;
  toOperations(result: CommandResult): CanvasOperation[];
}
```

## 11.1 第一阶段 Command

```text
CreateNodeCommand
UpdateNodeConfigCommand
MoveNodesCommand
ResizeNodeCommand
DeleteSelectionCommand
CreateEdgeCommand
ReconnectEdgeCommand
DeleteEdgeCommand
CreateGroupCommand
UngroupCommand
DuplicateSelectionCommand
PasteCommand
ChangeViewportCommand（不进入用户历史或单独历史）
```

## 11.2 Command 合并

以下操作需要合并：

- 连续输入 Prompt：在 600ms～1000ms 编辑窗口内合并。
- Inspector Slider：Pointer Up 时形成一个 Command。
- 节点拖拽：整个 Drag Gesture 形成一个 Command。
- 多节点拖动：一个 Command。
- 连续 Nudge：短时间内同方向按键合并。

## 11.3 Undo/Redo 边界

Undo/Redo 只撤销画布编辑，不自动撤销已经提交到外部供应商的生成任务。

例如：

```text
创建生成节点 → 可 Undo
修改 Prompt → 可 Undo
提交生成任务 → 不能通过 Canvas Undo 取消
取消任务 → 使用 Cancel Job
任务成功产生 Asset → Asset 有独立生命周期
```

如果撤销删除一个正在运行的节点：

- 默认只删除画布引用。
- 任务继续进入 Task Shelf。
- UI 提示是否同时取消任务。

---

## 12. Clipboard、Duplicate 与模板

## 12.1 Clipboard Payload

```typescript
interface StudioClipboardPayload {
  format: 'infinite-canvas/studio-nodes';
  schemaVersion: 1;
  nodes: StudioCanvasNode[];
  edges: StudioCanvasEdge[];
  domainReferences: ClipboardDomainReference[];
  copiedAt: string;
}
```

## 12.2 粘贴规则

1. 生成新 Node ID 和 Edge ID。
2. 保持节点相对位置。
3. 以鼠标位置或视口中心作为粘贴锚点。
4. 领域引用默认保持引用，不复制 Asset 二进制。
5. 跨项目粘贴时提示：
   - 保持外部引用
   - 复制到目标项目
   - 跳过不可访问引用
6. Active Job 不复制。
7. Result Asset 可按引用复制。
8. Legacy 原始字段不传播到新节点，除非仍为 `legacy` Kind。

## 12.3 Duplicate

Duplicate 使用 Clipboard Service 的内存路径，但不写系统剪贴板。

## 12.4 Node Template

模板保存：

- 节点配置
- 节点关系
- 可参数化变量
- 不保存运行 Job
- 默认不锁定 Asset Version

---

## 13. Selection、Grouping 与布局

## 13.1 Selection

Selection 是编辑器状态，不进入 Canvas Document。

支持：

- 单选
- Shift/Ctrl 多选
- 框选
- Select All
- 按类型选择
- 选择上游/下游
- 选择连接组件

## 13.2 Primary Selection

多选时保留 `primaryNodeId`：

- Inspector 默认显示 Primary Node。
- 多选共同字段可批量编辑。
- 快捷操作根据所有选中节点 Capability 取交集。

## 13.3 Grouping

创建 Group：

1. 计算选中节点 Bounds。
2. 创建 Group Node。
3. 子节点坐标转换为 Parent Relative Position。
4. 设置 `parentId`。
5. 保持外部 Edge 不变。
6. 一个 Command 和一个 Operation Batch 完成。

Group 不改变执行拓扑。

## 13.4 自动布局

自动布局作为 Command：

- 对选中节点运行。
- 支持 Horizontal、Vertical、DAG、Grid。
- 先显示 Preview。
- 用户确认后写入位置。
- 不在拖拽路径自动运行。

第一阶段可接入 Dagre；后续复杂布局再评估 ELK。

---

## 14. 节点运行与 GenerationJob 绑定

## 14.1 执行流程

```text
用户点击 Run
  ↓
Node Definition validate
  ↓
解析所有输入 Edge
  ↓
构建 Typed Input Snapshot
  ↓
buildExecution()
  ↓
POST /api/v2/generation-jobs
  ↓
节点绑定 active_job_id
  ↓
WebSocket 接收进度
  ↓
Job 成功创建 Asset / Artifact
  ↓
更新 result references
```

## 14.2 Input Snapshot

任务创建时必须保存输入快照：

```text
Prompt 文本
Asset Version ID
Artifact Version ID
模型和参数
Workflow Version
Shot Revision
Node Config Revision
```

后续上游节点变化不能静默改变已经运行中的 Job。

## 14.3 节点状态投影

节点 UI 状态从以下数据计算：

```typescript
type NodeRuntimeProjection = {
  status:
    | 'idle'
    | 'invalid'
    | 'queued'
    | 'running'
    | 'waiting'
    | 'succeeded'
    | 'failed'
    | 'cancelled';
  progress?: number;
  message?: string;
  activeJobId?: string;
  latestResultIds?: string[];
};
```

该 Projection 可缓存，但不写回节点 Config。

## 14.4 级联执行

第一阶段不实现无限制“整张图自动执行”。

支持两种明确模式：

```text
Run Node：只执行当前节点，读取现有上游结果
Run Upstream Chain：执行缺失或过期的必要上游节点
```

执行计划由后端生成，避免浏览器自行循环调度供应商任务。

## 14.5 Stale 状态

当成功结果依赖的输入发生变化：

```text
latest result = succeeded
current config/input hash != job input hash
```

节点显示 `stale` 提示，但仍保留旧结果。

用户可选择：

- 重新运行
- 继续使用旧结果
- 锁定当前结果版本

---

## 15. Validation 与 Diagnostics

## 15.1 Validation Issue

```typescript
interface NodeValidationIssue {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  fieldPath?: string;
  portId?: string;
  quickFixCommandId?: string;
}
```

## 15.2 Validation 时机

- 节点创建后
- Config 更新后
- Edge 变化后
- Runtime Capability 变化后
- Provider/Workflow 下线后
- 执行前强校验

## 15.3 Diagnostics Inspector

显示：

- Definition Version
- Config Schema 校验结果
- 输入端口状态
- Executor Capability
- Provider/Model 是否可用
- 当前 Job
- 最新成功 Job
- Stale 原因
- Legacy 迁移信息
- Operation Save 状态

普通用户默认不展开 Diagnostics。

---

## 16. Legacy Canvas 迁移

## 16.1 Legacy 类型映射

| Legacy Type | Studio V2 Kind | 迁移说明 |
|---|---|---|
| `image` | `asset` | URL 先转 Asset/AssetVersion；无法转时保留外部 URL |
| `prompt` | `prompt` | `text` 转 Prompt Config |
| `loop` | `batch` | 根据旧字段映射 `repeat/each`；不确定语义时保留 Legacy Metadata |
| `group` | `group` | `items` 转 parentId；坐标转相对坐标 |
| `promptGroup` | `group` 或 `batch` | 根据实际用途迁移，不能仅凭名称处理 |
| `llm` | `text-transform` | Provider/Model 转 Execution Config |
| `generator` | `image-generation` | API Provider/Model/尺寸参数迁移 |
| `midjourney` | `image-generation` | Provider 固定到 Midjourney Adapter，模式字段迁移 |
| `msgen` | `image-generation` | ModelScope Provider Adapter |
| `comfy` | `workflow` | ComfyUI Workflow ID 与字段映射 |
| `rh` | `workflow` 或 `image-generation` | 根据 webapp/workflow 类型判断 |
| `video` | `video-generation` | Provider/Model/参考素材迁移 |
| `minimax` | `video-generation` | MiniMax Executor Config |
| `ltxDirector` | `video-generation` 或 `workflow` | 根据原节点模式判断 |
| `output` | `output` | 内嵌 images 转 Asset Reference |
| 未知类型 | `legacy` | 原始 JSON 保留，只读展示 |

## 16.2 两阶段迁移

### 阶段 A：只读解析

```text
Legacy JSON
  ↓
LegacyNodeAdapter
  ↓
StudioCanvasDocument in memory
```

不立即覆盖旧文件。

### 阶段 B：显式升级

用户执行“升级为 Studio V2”后：

1. 后端创建 V2 Canvas Snapshot。
2. 保存 Legacy Source Revision。
3. 输出 Migration Report。
4. 不覆盖原 Legacy Canvas。
5. 新旧入口可分别打开。

## 16.3 Migration Report

```typescript
interface CanvasMigrationReport {
  sourceCanvasId: string;
  targetCanvasId: string;
  migratedNodes: number;
  migratedEdges: number;
  warnings: MigrationWarning[];
  unsupportedNodes: string[];
  createdAssetIds: string[];
}
```

## 16.4 Legacy Node

无法可靠转换时使用：

```typescript
interface LegacyNodeConfig {
  legacyType: string;
  raw: Record<string, unknown>;
  reason: string;
  readOnly: true;
}
```

Legacy Node 可展示原始摘要和迁移建议，但不能直接执行，避免错误调用。

---

## 17. 性能约束

React Flow 官方当前仍明确建议：

- 自定义节点和边组件保持稳定引用并使用 Memo。
- 避免组件直接订阅完整 nodes/edges 数组。
- 必要时使用可见元素渲染。

Studio V2 进一步规定：

1. `nodeTypes` 和 `edgeTypes` 在模块级声明。
2. Node Host 使用 `React.memo`。
3. 节点只按 ID 订阅自己的持久化数据和运行投影。
4. 选中状态使用独立 Selector。
5. 节点拖拽不触发 TanStack Query 更新。
6. 节点拖拽不触发 Zod 全图校验。
7. Node Preview 不挂载完整视频播放器。
8. 大图先用 Preview URL。
9. 低缩放比例使用 Contextual Zoom 降级。
10. `onlyRenderVisibleElements` 必须通过基准测试再决定默认开启，不能盲目依赖。
11. 节点位置不使用 Motion Layout 动画。
12. Edge 默认不使用持续动画。
13. Port 动态变化只更新相关节点 Internals。
14. Inspector 编辑不导致所有节点重渲染。

## 17.1 性能基准

```text
100 轻量节点：完整功能，无明显卡顿
300 混合节点：拖拽、缩放、框选稳定
500 节点：启用预览降级，基本编辑可用
1000 节点：允许明显降级，但不能崩溃或失去导航能力
```

## 17.2 性能监控

开发环境记录：

- Node render count
- Canvas frame drops
- Drag gesture duration
- Operation batch size
- Save latency
- Validation duration
- Job event update rate
- Mounted media element count

---

## 18. UI 与动效约束

节点遵循 `studio-v2-ui-interaction-and-motion-design-system.md`：

- Press 状态即时反馈。
- Popover 从触发源出现。
- Inspector Sheet 可中断。
- 状态变化优先使用颜色、图标和短 Crossfade。
- 高频节点选择不使用大幅缩放或弹跳。
- Running 状态不使用整张卡片无限 Pulse。
- 只有用户拖拽释放、Sheet 和 Shared Preview 可使用 Spring。
- Reduced Motion 下关闭节点状态位移动画。

节点执行成功时：

- 状态图标短 Crossfade。
- Result Preview 出现时使用轻微 opacity + scale 0.98→1。
- 不使用烟花、彩带或大面积发光。

---

## 19. 推荐目录结构

```text
frontend/src/canvas/
├── flow/
│   ├── StudioFlow.tsx
│   ├── StudioNodeHost.tsx
│   ├── StudioEdge.tsx
│   ├── connection-policy.ts
│   ├── flow-adapter.ts
│   └── viewport-controller.ts
├── registry/
│   ├── node-registry.ts
│   ├── node-definition.ts
│   ├── built-in-nodes.ts
│   └── registry-errors.ts
├── nodes/
│   ├── asset/
│   ├── prompt/
│   ├── batch/
│   ├── text-transform/
│   ├── image-generation/
│   ├── video-generation/
│   ├── workflow/
│   ├── agent-task/
│   ├── shot/
│   ├── artifact/
│   ├── output/
│   ├── group/
│   └── legacy/
├── ports/
│   ├── port-types.ts
│   ├── compatibility.ts
│   ├── PortHandle.tsx
│   └── port-cache.ts
├── commands/
│   ├── command.ts
│   ├── command-bus.ts
│   ├── history.ts
│   └── commands/
├── clipboard/
├── selection/
├── grouping/
├── persistence/
│   ├── operation-builder.ts
│   ├── autosave.ts
│   └── conflict-resolution.ts
├── validation/
├── runtime/
│   ├── job-projection.ts
│   └── execution-builder.ts
├── migration/
│   ├── legacy-canvas-adapter.ts
│   ├── legacy-node-adapters/
│   └── migration-report.ts
└── stores/
```

---

## 20. 实施阶段

## 20.1 Phase N0：类型与 Registry 骨架

交付：

- StudioCanvasDocument 类型
- Node Registry
- Port 类型系统
- Zod Schema
- `StudioNodeHost`
- Unknown/Legacy Node

## 20.2 Phase N1：基础编辑器

交付：

- Create/Delete/Move/Resize
- Selection
- Edge 创建和验证
- Inspector Host
- Command Bus
- Undo/Redo
- Operation Builder

## 20.3 Phase N2：基础节点

交付：

- Asset
- Prompt
- Image Generation
- Video Generation
- Workflow
- Output
- Group

## 20.4 Phase N3：Job 与事件

交付：

- GenerationJob 创建
- Job Projection
- Task Shelf
- Run/Cancel/Retry
- Result Asset 引用
- Stale 状态

## 20.5 Phase N4：Legacy 迁移

交付：

- Legacy 类型映射
- Migration Report
- 只读导入
- 显式升级
- 不支持节点降级

## 20.6 Phase N5：生产领域和 Agent

交付：

- Shot Node
- Storyboard Node
- Artifact Node
- Agent Task Node
- Batch Node
- Text Transform Node

---

## 21. 测试设计

## 21.1 Unit Test

- Registry 重复注册
- Config Schema 校验
- Definition 版本迁移
- Port Compatibility
- Connection Cycle Policy
- Command execute/undo/merge
- Operation Builder
- Legacy Node Adapter
- Job Projection

## 21.2 Component Test

- NodeFrame 状态
- Inspector 表单
- 动态 Handle
- Validation 提示
- Contextual Zoom
- Reduced Motion
- Keyboard 操作

## 21.3 Integration Test

- 创建节点并保存 Operation
- 冲突后重新加载和重放本地 Command
- 创建 Job 并通过 Event 更新节点
- Job 成功写入 Asset
- 删除运行节点后的任务处理
- Legacy Canvas 导入
- 跨项目复制粘贴

## 21.4 Performance Test

- 100/300/500/1000 节点基准
- 图片和视频混合节点
- 多节点框选移动
- Inspector 高频编辑
- WebSocket 高频 Progress Event
- 大批量粘贴
- Group/Ungroup

---

## 22. 第一阶段验收标准

### 架构

- 节点类型不以供应商名称作为顶层 Kind。
- Node Registry 是新增节点的唯一入口。
- React Flow Node 与 StudioCanvasNode 有明确 Adapter。
- Job 运行数据不写入 Node Config。
- Inspector 不依赖大型 `switch`。

### 功能

- 支持基础节点创建、编辑、连接、复制、粘贴和删除。
- 支持类型化 Port 和连接校验。
- 支持多选、Group、Ungroup。
- 支持 Undo/Redo。
- 支持增量 Canvas Operation。
- 支持 GenerationJob 状态投影。
- 支持 Legacy Canvas 只读导入。

### 性能

- 节点拖拽不调用后端。
- 节点拖拽不触发全图 Schema 校验。
- 一个节点变化不导致所有节点重渲染。
- 300 个混合节点仍可稳定操作。
- 未激活视频节点不挂载播放器。

### 体验

- 节点默认保持 Compact。
- 完整配置在 Inspector。
- 连接失败有具体原因。
- 运行结果保留版本，不静默覆盖。
- Stale 状态清楚但不阻断旧结果使用。
- 不支持的 Legacy 节点明确展示，不静默丢失。

---

## 23. 正式决策摘要

| 决策项 | 决策 |
|---|---|
| React Flow 包 | `@xyflow/react` |
| React Flow Node 类型 | 单一稳定 `studio-node` Host |
| 业务节点扩展 | Node Registry |
| 顶层节点 Kind 是否包含供应商 | 否 |
| 节点完整配置位置 | Inspector |
| 节点运行态 | GenerationJob Projection |
| 端口 | 强类型 Port Definition |
| 连接校验 | 全局 Connection Policy + Definition Policy |
| 编辑操作 | Command System |
| 撤销重做 | Command History，不撤销外部任务 |
| 保存 | Command → Canvas Operations；Checkpoint → Snapshot |
| Group | React Flow Parent/Child，不改变执行拓扑 |
| Legacy | Adapter + Migration Report + Legacy Node 降级 |
| 节点动效 | 克制；不对位置使用 Motion Layout |
| 状态数据 | Zustand Editor State + TanStack Query Server State |

---

## 24. 最终原则

> 节点类型描述用户正在做什么，不描述后端供应商是谁。

> React Flow 负责画布交互，Node Registry 负责节点扩展，Command System 负责可撤销编辑，GenerationJob 负责运行生命周期。

> 节点只保存稳定配置和引用，不保存供应商原始响应、临时进度和页面交互状态。

> 新增节点不应修改画布核心，新接供应商不应新增顶层节点类型。

> Legacy 数据可以降级展示，但不能为了兼容继续污染 Studio V2 的长期模型。
