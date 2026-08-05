# Infinite-Canvas Studio V2 Agent、Skill、Runtime 与管理系统详细设计

> 文档状态：详细设计基线（Detailed Design Baseline）  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 前置文档：  
> - `docs/adr-001-studio-v2-greenfield-frontend-and-additive-backend.md`  
> - `docs/studio-v2-frontend-architecture-overall-design.md`  
> - `docs/studio-v2-information-architecture-and-core-workflows.md`  
> - `docs/studio-v2-backend-api-gap-and-v2-design.md`  
> - `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`  
> - `docs/studio-v2-react-flow-node-model-and-registry-design.md`

---

## 1. 文档目的

本文档确定 Studio V2 中 Agent、Skill、Runtime、Session、Task、Run、Tool、Permission、Context 和 Artifact 的领域边界、管理界面、运行协议、后端服务、接口、事件、权限和实施顺序。

本文档重点解决：

1. Agent 和 Skill 到底是什么，两者如何关联。
2. 如何复用 Codex CLI、Claude CLI、Gemini CLI、Pi、oh-my-pi 和 ACP 等外部 Runtime，而不重新实现 Agent Harness。
3. 如何管理 Agent Profile、Skill 包、版本、启用状态、运行时和项目级绑定。
4. 如何让 Agent 读取项目上下文并安全调用 Infinite-Canvas 工具。
5. 如何显示计划、消息、Tool Call、权限请求、任务进度和 Artifact。
6. 如何把 Agent 输出写回剧本、角色、场景、镜头、分镜、资产和画布。
7. 如何让 Agent Task Node 与统一 Agent Task 模型连接。
8. 如何避免 Agent 功能最终退化成“一个聊天框加一段 System Prompt”。

---

## 2. 当前后端能力基线

当前后端已经具备部分可复用基础：

### 2.1 对话能力

现有接口包括：

```text
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/{conversation_id}
DELETE /api/conversations/{conversation_id}
POST   /api/chat
POST   /api/chat/agent
POST   /api/chat/stream
```

当前 Conversation 主要是用户对话消息存储。

当前 `/api/chat/agent` 更接近图片创作意图路由器：

- 判断生成图片或回复文本。
- 选择图片 Provider 和模型。
- 根据聊天历史和参考图执行图片任务。

它不是通用 Agent Runtime，不具备：

- Agent Profile。
- Skill Registry。
- Session 恢复。
- Task / Run / Step。
- Tool Call。
- Permission Request。
- Artifact Contract。
- 多 Runtime Adapter。

### 2.2 CLI 探测能力

当前已有：

```text
GET  /api/codex/status
POST /api/codex/help
GET  /api/gemini-cli/status
POST /api/gemini-cli/help
```

这说明后端已经具备：

- 查找本地 CLI 可执行文件。
- 调用子进程。
- 读取 stdout / stderr。
- 处理 Codex、Gemini CLI 相关环境和模型信息。

这些实现可以作为 Runtime Probe 和 CLI Adapter 的基础，但当前尚未形成通用生命周期协议。

### 2.3 特定 Skill 工具

现有 `gpt-image-2-skill` 是一个特定图片生成命令行工具，主要用于：

- 检测可执行文件。
- 处理认证文件。
- 构造图片生成参数。
- 解析输出路径。

它是“一个可执行工具”，不是 Studio Skill Registry 中的通用 Skill 定义。

### 2.4 结论

当前后端应当被视为：

```text
已有 Chat、Provider、CLI Process 和特定工具能力
+
缺少 Agent Platform 领域层
```

新增工作是在现有后端之上增加 Agent Gateway 和 Skill Platform，不修改旧 Chat API。

---

## 3. 核心设计原则

### 3.1 不重新实现 Agent Harness

Infinite-Canvas 不实现：

- 通用自主规划循环。
- 通用 ReAct 内核。
- 通用模型上下文压缩算法。
- 通用 Agent Shell。
- 与 Codex、Claude Code、Pi 重复的工具执行循环。

平台复用外部 Runtime 的规划、推理、上下文和工具调用能力。

### 3.2 Studio 管理控制面，Runtime 负责执行面

```text
Control Plane：Infinite-Canvas
- Agent Profile
- Skill Registry
- Project Context
- Tool Gateway
- Permission
- Session / Task Metadata
- Artifact
- Event
- UI

Execution Plane：External Runtime
- 推理
- 计划
- Runtime 内部循环
- Runtime 原生工具
- Runtime 原生上下文管理
```

### 3.3 Agent 与 Skill 必须分离

Agent 是“执行者配置”，Skill 是“可复用能力定义”。

一个 Agent 可以绑定多个 Skill。
一个 Skill 可以被多个 Agent 使用。

### 3.4 所有执行必须 Task 化

用户在聊天、画布、Command Palette 或批处理页面发起的 Agent 操作，最终都创建 AgentTask。

UI 不直接依赖某个 CLI 进程。

### 3.5 所有上下文必须显式可见

Agent 获得的项目上下文必须能够在 UI 中查看：

- 当前项目。
- 当前剧本版本。
- 当前选择的镜头。
- 当前素材版本。
- 当前画布节点。
- 附加 Artifact。
- 用户额外说明。

禁止依赖不可解释的隐式上下文拼接。

### 3.6 所有副作用必须经过 Tool Gateway 或明确的 Runtime 权限策略

Agent 修改项目、删除素材、发起生成、写文件或访问网络时必须有可审计边界。

### 3.7 输出优先 Artifact 化

有结构价值的 Agent 输出不应只留在聊天消息中。

例如：

- 剧本分析。
- 角色设定。
- 场景清单。
- 镜头表。
- 分镜生成计划。
- Prompt 包。
- 连贯性检查报告。
- 工作流配置。

都应保存为 Artifact 或直接写入对应领域对象，并记录来源 Task。

---

## 4. 核心概念定义

## 4.1 Agent Runtime

Agent Runtime 是实际执行 Agent 的外部环境。

建议类型：

```text
acp
cli-jsonl
cli-stdio
http
embedded-tool
```

示例：

```text
Codex CLI
Claude CLI / Claude Code
Gemini CLI
Pi
oh-my-pi
支持 ACP 的其他 Runtime
```

Runtime 负责：

- 接受输入。
- 生成消息和计划。
- 发起 Tool Call。
- 请求权限。
- 输出结果。
- 维护 Runtime 原生会话。

## 4.2 Runtime Profile

Runtime Profile 是一个可配置的 Runtime 实例。

```typescript
interface AgentRuntimeProfile {
  id: string;
  name: string;
  runtimeType: 'acp' | 'cli-jsonl' | 'cli-stdio' | 'http';
  adapterType: string;
  executable?: string;
  endpoint?: string;
  arguments: string[];
  environmentRefs: string[];
  workingDirectoryPolicy: string;
  capabilities: RuntimeCapability[];
  status: 'available' | 'unavailable' | 'degraded' | 'disabled';
  enabled: boolean;
  revision: number;
}
```

Runtime Profile 不保存明文 Secret，只保存 Secret 引用。

## 4.3 Agent Profile

Agent Profile 是用户在产品中看到的“Agent”。

它定义：

- 名称和头像。
- 职责和默认说明。
- 使用哪个 Runtime Profile。
- 默认模型。
- 默认 Skill。
- 默认 Tool Policy。
- 默认上下文策略。
- 输出偏好。

```typescript
interface AgentProfile {
  id: string;
  name: string;
  description: string;
  icon?: string;
  runtimeProfileId: string;
  model?: string;
  instructions?: string;
  skillBindings: AgentSkillBinding[];
  toolPolicyId: string;
  contextPolicyId: string;
  outputPolicyId: string;
  enabled: boolean;
  revision: number;
}
```

示例 Agent：

```text
剧本分析 Agent
角色设计 Agent
分镜导演 Agent
镜头连续性检查 Agent
视频提示词 Agent
ComfyUI 工作流 Agent
项目开发 Agent
```

## 4.4 Skill

Skill 是版本化、可安装、可验证、可测试的能力包。

Skill 定义：

- 解决什么问题。
- 接受什么输入。
- 输出什么结构。
- 需要哪些工具。
- 需要哪些权限。
- 需要哪些上下文。
- 如何由 Runtime 执行。
- 输出如何转成 Artifact 或领域对象。

Skill 不是 Agent。

例如：

```text
script-to-shot-list
character-reference-sheet
storyboard-prompt-builder
continuity-review
seedance-prompt-builder
comfy-workflow-planner
ui-self-improvement
```

## 4.5 Agent Session

Session 表示用户与某个 Agent 的持续工作上下文。

它可以关联：

- Project。
- Agent Profile。
- Runtime 原生 Session ID。
- Conversation。
- 当前上下文策略。
- 多个 Task。

Session 不是单次执行。

## 4.6 Agent Task

Task 是用户要求 Agent 完成的一项明确工作。

例如：

```text
把剧本第 3 场拆成镜头表
检查角色服装连续性
为 12 个镜头生成 Seedance 提示词
分析当前 React Flow 节点设计文档
```

Task 可以：

- 从 Agent Dock 创建。
- 从某个领域页面创建。
- 从画布 Agent Task Node 创建。
- 从 Skill 详情页测试创建。
- 从自动化工作流创建。

## 4.7 Agent Run

Task 的一次实际执行称为 Run。

Retry 会创建新 Run，不覆盖旧 Run。

```text
Task
├── Run 1 failed
├── Run 2 cancelled
└── Run 3 succeeded
```

## 4.8 Step

Step 是 Run 中可展示的逻辑阶段：

```text
planning
reasoning-summary
message
skill-start
skill-end
tool-call
permission
artifact-create
checkpoint
result
```

Studio 不要求 Runtime 暴露私有思维链，只接收可安全展示的计划、状态摘要和工具执行信息。

## 4.9 Tool

Tool 是 Agent 可调用的操作能力。

Tool 必须具有：

- 稳定 ID。
- 输入 Schema。
- 输出 Schema。
- 权限类别。
- 是否有副作用。
- 是否幂等。
- 超时策略。
- 审计策略。

## 4.10 Permission Request

当 Tool Call 超出自动允许范围时，创建 Permission Request。

用户可以：

```text
允许一次
本 Session 允许
本项目允许
拒绝
```

高风险权限不提供无限期全局允许。

## 4.11 Context Snapshot

每个 Run 启动时固定一个 Context Snapshot。

它记录 Agent 实际看到的：

- 项目 ID 和 Revision。
- Bible Version。
- Script Version。
- Character / Scene / Shot Revision。
- Asset Version。
- Artifact Version。
- Canvas Node Revision。
- 用户输入。
- 选中对象。
- Skill Version。
- Agent Profile Revision。

运行过程中项目发生变化，不会静默改变当前 Run 的输入。

## 4.12 Artifact

Artifact 是 Agent 的结构化成果。

Artifact 必须记录：

- 类型。
- 内容或文件引用。
- 版本。
- 来源 Agent Task / Run。
- 来源 Skill Version。
- 输入 Context Snapshot。
- 关联项目对象。

---

## 5. Agent 与 Skill 的关系

```text
Runtime Profile
      │
      ▼
Agent Profile ───── AgentSkillBinding ───── Skill Version
      │                                        │
      │                                        ├── Input Schema
      │                                        ├── Output Schema
      │                                        ├── Tool Requirements
      │                                        ├── Permission Requirements
      │                                        └── Execution Binding
      ▼
Agent Session
      ▼
Agent Task
      ▼
Agent Run
      ├── Context Snapshot
      ├── Steps
      ├── Tool Calls
      ├── Permission Requests
      └── Artifacts
```

### 5.1 AgentSkillBinding

Agent 绑定 Skill 时允许配置：

```typescript
interface AgentSkillBinding {
  skillId: string;
  versionConstraint: string;
  enabled: boolean;
  priority: number;
  aliases: string[];
  defaultInputs?: Record<string, unknown>;
  runtimeOverrides?: Record<string, unknown>;
}
```

### 5.2 Skill 版本固定

Task 创建时解析实际 Skill Version，并在 Run 中固定：

```text
skill_id = script-to-shot-list
skill_version = 1.4.2
```

Skill 后续升级不会改变历史任务。

---

## 6. Skill Package 规范

建议 Skill 包目录：

```text
my-skill/
├── skill.yaml
├── SKILL.md
├── schemas/
│   ├── input.schema.json
│   └── output.schema.json
├── prompts/
│   ├── system.md
│   └── task.md
├── scripts/
├── assets/
├── examples/
└── tests/
```

不是所有目录都必需。

## 6.1 `skill.yaml`

建议结构：

```yaml
apiVersion: studio.infinite-canvas/v1
kind: Skill

metadata:
  id: script-to-shot-list
  name: 剧本转镜头表
  version: 1.0.0
  description: 将指定剧本场景拆解为结构化镜头列表
  tags:
    - script
    - shot
    - storyboard

spec:
  execution:
    mode: prompt
    runtimeRequirements:
      capabilities:
        - text-generation
        - tool-calling

  inputs:
    schema: schemas/input.schema.json

  outputs:
    schema: schemas/output.schema.json
    artifactType: shot-list

  context:
    required:
      - project-bible
      - script-version
    optional:
      - characters
      - scenes
      - reference-assets

  tools:
    required:
      - project.script.read
      - project.shot.write
      - artifact.write

  permissions:
    defaultPolicy: ask-on-write

  ui:
    icon: list-video
    category: pre-production
    recommendedSurface:
      - script-editor
      - shot-list
```

## 6.2 `SKILL.md`

`SKILL.md` 用于：

- 说明 Skill 的目的。
- Runtime 执行说明。
- 输入和输出语义。
- 质量规则。
- 禁止事项。
- 示例。

它不替代机器可读 Schema。

## 6.3 Skill 执行模式

```typescript
type SkillExecutionMode =
  | 'prompt'
  | 'runtime-native'
  | 'workflow'
  | 'tool-composition'
  | 'delegated-agent'
  | 'hybrid';
```

### prompt

Studio 将 Skill 指令、输入和上下文组装后交给 Runtime。

### runtime-native

Skill 已经安装在某个 Runtime 的原生 Skill 系统中。
Studio 只保存映射：

```yaml
nativeBindings:
  codex:
    name: script-to-shot-list
  claude:
    path: .claude/skills/script-to-shot-list
```

### workflow

Skill 实际触发 Studio Workflow 或 ComfyUI Workflow。

### tool-composition

Skill 主要由确定性的 Tool Pipeline 组成，Agent 负责参数选择或异常处理。

### delegated-agent

当前 Agent 将任务委派给另一个 Agent Profile。

### hybrid

组合 Prompt、Tool、Workflow 和 Runtime Native Skill。

## 6.4 Skill 来源

```typescript
type SkillSource =
  | 'builtin'
  | 'local'
  | 'project'
  | 'git'
  | 'runtime-native'
  | 'imported';
```

### 优先级与覆盖

建议：

```text
Project Override
> User Installed
> Builtin
```

同 ID 不同来源不能静默覆盖，必须通过版本和来源明确选择。

---

## 7. Skill Registry

Skill Registry 负责：

- 扫描 Skill 包。
- 解析 Manifest。
- 读取版本。
- 校验 Schema。
- 校验工具和 Runtime 能力。
- 启用和禁用。
- 安装和卸载。
- 版本升级。
- 运行测试。
- 向 Agent Profile 提供绑定列表。

### 7.1 Skill 状态

```text
discovered
validating
ready
incompatible
disabled
broken
update-available
```

### 7.2 Skill 验证结果

```typescript
interface SkillValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  runtimeCompatibility: RuntimeCompatibility[];
  missingTools: string[];
  missingPermissions: string[];
}
```

### 7.3 安装不等于启用

Skill 可以：

- 已安装但全局禁用。
- 全局启用但未绑定某个 Agent。
- 绑定 Agent 但在某项目禁用。

---

## 8. Runtime Adapter

## 8.1 统一接口

```typescript
interface AgentRuntimeAdapter {
  probe(profile: AgentRuntimeProfile): Promise<RuntimeProbeResult>;
  listCapabilities(profileId: string): Promise<RuntimeCapability[]>;
  createSession(input: RuntimeSessionCreate): Promise<RuntimeSessionHandle>;
  resumeSession(input: RuntimeSessionResume): Promise<RuntimeSessionHandle>;
  submitTask(input: RuntimeTaskSubmit): Promise<RuntimeTaskHandle>;
  sendInput(input: RuntimeUserInput): Promise<void>;
  decidePermission(input: RuntimePermissionDecision): Promise<void>;
  cancelTask(input: RuntimeTaskCancel): Promise<void>;
  closeSession(input: RuntimeSessionClose): Promise<void>;
  streamEvents(handle: RuntimeTaskHandle): AsyncIterable<RuntimeEvent>;
}
```

## 8.2 Adapter 类型

### ACP Adapter

优先用于支持稳定 Agent 协议的 Runtime。

优点：

- Session 和事件语义更清楚。
- Tool Call 和 Permission 更容易结构化。
- 运行时切换成本较低。

### CLI JSONL Adapter

用于能够输出 JSONL 事件的 CLI。

要求：

- stdout 保留协议事件。
- stderr 作为诊断日志。
- 每行独立 JSON。
- 支持 Task ID 或 Session ID。

### CLI stdio Adapter

用于只有文本流的 CLI。

它只能提供较低等级能力：

- 文本消息。
- 进程状态。
- 基础取消。

无法可靠识别 Tool Call 和 Permission 时，不应伪造结构化事件。

### HTTP Adapter

用于远程 Agent 服务。

必须经过域名白名单、认证引用和网络权限策略。

## 8.3 Runtime Capability

```typescript
type RuntimeCapability =
  | 'text-generation'
  | 'multimodal-input'
  | 'tool-calling'
  | 'permission-request'
  | 'session-resume'
  | 'structured-output'
  | 'artifact-output'
  | 'native-skills'
  | 'subagents'
  | 'streaming'
  | 'cancellation';
```

Agent Profile 和 Skill 的可用性由 Capability 计算，不由 UI 写死。

## 8.4 Runtime 探测

探测包括：

- executable 是否存在。
- 版本。
- 登录状态。
- 支持模型。
- 支持协议。
- 支持 Capability。
- 工作目录权限。
- Native Skill 目录。

探测失败不应阻塞其他 Runtime 使用。

---

## 9. Agent Session 与 Task 模型

## 9.1 Session 状态机

```text
creating
  ├── ready
  └── failed

ready
  ├── running
  ├── closing
  └── failed

running
  ├── ready
  ├── waiting_input
  ├── waiting_permission
  ├── closing
  └── failed

closing
  └── closed
```

建议状态：

```typescript
type AgentSessionStatus =
  | 'creating'
  | 'ready'
  | 'running'
  | 'waiting_input'
  | 'waiting_permission'
  | 'closing'
  | 'closed'
  | 'failed';
```

## 9.2 Task 状态机

```typescript
type AgentTaskStatus =
  | 'draft'
  | 'queued'
  | 'preparing'
  | 'running'
  | 'waiting_permission'
  | 'waiting_input'
  | 'succeeded'
  | 'failed'
  | 'cancel_requested'
  | 'cancelled';
```

状态流：

```text
draft
  → queued
  → preparing
  → running
      ├── waiting_permission → running
      ├── waiting_input → running
      ├── succeeded
      ├── failed
      └── cancel_requested → cancelled
```

## 9.3 Run 模型

```typescript
interface AgentRun {
  id: string;
  taskId: string;
  attempt: number;
  runtimeProfileId: string;
  runtimeSessionId?: string;
  skillVersionRefs: SkillVersionRef[];
  agentProfileRevision: number;
  contextSnapshotId: string;
  status: AgentTaskStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: ProblemDetail;
}
```

## 9.4 Retry

Retry 默认：

- 复用原 Task。
- 创建新 Run。
- 默认复用原 Context Snapshot。
- 用户可以选择“使用最新项目上下文重试”。

两种模式必须在 UI 中区分。

---

## 10. Context Builder

Context Builder 将 Studio 领域对象转换为 Runtime 可消费的上下文包。

## 10.1 上下文来源

```text
Project Bible
Script Version
Character
Scene
Prop
Shot
Storyboard Frame
Asset Version
Artifact Version
Canvas Node
Selected Text
User Attachment
Conversation Summary
Previous Task Output
```

## 10.2 Context Policy

```typescript
interface AgentContextPolicy {
  id: string;
  includeProjectBible: boolean;
  includeCurrentWorkspace: boolean;
  includeSelection: boolean;
  includeRelatedEntities: boolean;
  includeConversationHistory: boolean;
  maxTextTokens?: number;
  maxAssets?: number;
  assetDetailLevel: 'metadata' | 'preview' | 'original';
  conflictPolicy: 'snapshot' | 'latest';
}
```

## 10.3 Context Chip

前端必须将上下文显示为 Chip：

```text
项目设定 v4
剧本 v12
场景 03
镜头 S03-08
角色：林夏
参考图 4 张
当前画布节点 3 个
```

用户可以在提交前移除可选上下文。

## 10.4 Context Snapshot

建议结构：

```typescript
interface AgentContextSnapshot {
  id: string;
  projectId: string;
  createdAt: string;
  references: ContextReference[];
  renderedPromptRef?: string;
  attachmentRefs: string[];
  checksum: string;
}
```

大文本和文件不直接复制到数据库，可保存内容引用和 checksum。

---

## 11. Tool Gateway

## 11.1 设计目标

Tool Gateway 是 Agent 访问 Infinite-Canvas 能力的唯一稳定入口。

它提供：

- Tool Registry。
- 输入输出 Schema。
- 权限检查。
- 调用执行。
- 超时和取消。
- 幂等控制。
- 审计日志。
- 结果脱敏。
- Studio Event。

## 11.2 Tool 命名

建议使用领域命名：

```text
project.read
project.bible.read
project.bible.update
script.read
script.create_version
character.list
character.update
scene.list
shot.list
shot.create_batch
storyboard.create_frames
asset.search
asset.read_version
asset.create
artifact.read
artifact.create
artifact.create_version
canvas.read_document
canvas.apply_operations
generation.submit
generation.cancel
workflow.list
workflow.run
```

不要把供应商写入公共 Tool ID：

```text
错误：runninghub.generate_image
正确：generation.submit
```

供应商由参数和后端 Adapter 决定。

## 11.3 Tool 定义

```typescript
interface StudioToolDefinition {
  id: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  permission: ToolPermissionDescriptor;
  sideEffect: 'none' | 'write' | 'destructive' | 'external';
  idempotent: boolean;
  timeoutSeconds: number;
  enabled: boolean;
}
```

## 11.4 Tool Call 状态

```typescript
type ToolCallStatus =
  | 'proposed'
  | 'waiting_permission'
  | 'approved'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'denied'
  | 'cancelled';
```

## 11.5 Tool Result

大结果不直接塞入事件：

```typescript
interface ToolResult {
  summary: string;
  data?: Record<string, unknown>;
  artifactIds?: string[];
  assetIds?: string[];
  resourceRefs?: string[];
}
```

---

## 12. 权限模型

## 12.1 权限类别

```text
project.read
project.write
script.read
script.write
character.read
character.write
scene.read
scene.write
shot.read
shot.write
asset.read
asset.write
asset.delete
artifact.read
artifact.write
canvas.read
canvas.write
generation.submit
generation.cancel
workflow.run
filesystem.read
filesystem.write
process.execute
network.access
git.read
git.write
```

## 12.2 默认策略

建议：

```text
读取当前项目：自动允许
创建 Artifact：自动允许或按项目策略
修改业务对象：首次询问
提交付费生成任务：询问或受预算策略控制
删除：始终询问
文件系统项目目录外访问：始终询问
启动任意进程：始终询问
访问未声明网络域名：始终询问
```

## 12.3 决策范围

```typescript
type PermissionDecisionScope =
  | 'once'
  | 'session'
  | 'project';
```

危险权限不提供全局永久允许。

## 12.4 Permission Request UI

权限卡片必须展示：

- Agent。
- Skill。
- Tool。
- 将执行什么。
- 影响哪些对象。
- 关键参数预览。
- 是否付费。
- 是否可撤销。
- 风险级别。

例如：

```text
分镜导演 Agent 请求：批量创建 24 个镜头
目标项目：短片《回家》
来源 Skill：script-to-shot-list 1.2.0
可撤销：是
```

禁止只显示：

```text
是否允许工具调用？
```

---

## 13. Artifact 输出与回写

## 13.1 输出策略

```typescript
type AgentOutputMode =
  | 'message-only'
  | 'artifact'
  | 'domain-write'
  | 'artifact-and-domain-write';
```

### message-only

适合解释、建议和临时问答。

### artifact

生成结构化成果，等待用户审阅。

### domain-write

直接创建或更新业务对象。

### artifact-and-domain-write

先保存完整 Artifact，再把确认后的结构写入业务对象。

## 13.2 推荐默认

对批量或高影响操作：

```text
先 Artifact Preview
→ 用户确认
→ Domain Write
```

例如剧本拆镜头：

```text
Agent 生成 Shot List Artifact
→ 用户预览差异
→ 应用到项目镜头表
```

## 13.3 Artifact Provenance

Artifact 记录：

```text
agent_profile_id
agent_profile_revision
skill_id
skill_version
session_id
task_id
run_id
context_snapshot_id
tool_call_ids
created_at
```

---

## 14. Agent 管理界面

## 14.1 Agent Center

一级导航建议：

```text
Agent Center
├── Agents
├── Skills
├── Runtimes
├── Tasks
├── Permissions
└── Activity
```

## 14.2 Agents 页面

卡片展示：

- Agent 名称和职责。
- Runtime 状态。
- 默认模型。
- 已绑定 Skill 数。
- 最近任务状态。
- 是否启用。

支持：

```text
新建
复制
启用/禁用
测试
查看任务
编辑
删除
```

删除 Agent Profile 不删除历史 Session、Task 和 Artifact。

## 14.3 Agent 编辑页

Tab：

```text
Overview
Runtime
Instructions
Skills
Tools & Permissions
Context
Output
Test
Activity
```

### Overview

- 名称。
- 图标。
- 描述。
- 推荐使用场景。

### Runtime

- Runtime Profile。
- 模型。
- Runtime 参数。
- Capability 检查。

### Instructions

- Agent 角色说明。
- 默认行为。
- 禁止事项。

### Skills

- 已绑定 Skill。
- 顺序和别名。
- 默认参数。
- 兼容性警告。

### Tools & Permissions

- Tool Policy。
- 权限覆盖。
- 付费任务策略。

### Context

- 默认 Context Policy。
- 自动关联规则。

### Output

- 默认 Artifact 类型。
- 写回策略。

### Test

- 临时输入。
- 上下文预览。
- Runtime 事件。
- Tool Call。
- 输出验证。

## 14.4 Skills 页面

支持视图：

```text
Installed
Builtin
Project
Updates
Broken
```

Skill 卡片展示：

- 名称。
- 版本。
- 来源。
- 类别。
- 兼容 Runtime。
- 所需工具。
- 绑定 Agent 数。
- 状态。

## 14.5 Skill 详情页

Tab：

```text
README
Manifest
Inputs
Outputs
Tools
Versions
Bindings
Examples
Tests
Activity
```

支持：

- 验证。
- 测试运行。
- 启用和禁用。
- 安装更新。
- 回滚版本。
- 导出。
- 查看原始文件。

## 14.6 Runtimes 页面

展示：

- Runtime 名称。
- Adapter 类型。
- 版本。
- 登录状态。
- Capability。
- Native Skill 支持。
- 可执行文件或 Endpoint。
- 最近 Probe 时间。

支持：

- Probe。
- 配置。
- 启用和禁用。
- 查看日志。
- 查看使用它的 Agent。

## 14.7 Tasks 页面

统一查看所有 Agent Task：

```text
Running
Waiting Permission
Waiting Input
Failed
Completed
Cancelled
```

支持过滤：

- Project。
- Agent。
- Skill。
- Runtime。
- Status。
- Date。

## 14.8 Permissions 页面

展示：

- 待审批请求。
- Session 级授权。
- Project 级授权。
- 最近拒绝。
- 权限审计。

---

## 15. 创作工作区中的 Agent UI

## 15.1 Agent Dock

Agent Dock 是创作页面的上下文协作入口。

结构：

```text
Agent Selector
Context Chips
Conversation / Task Timeline
Composer
Active Task
Pending Permission
Artifacts
```

## 15.2 Composer

Composer 支持：

- 自然语言输入。
- `/skill` 选择。
- `@agent` 切换或委派。
- 添加项目对象。
- 添加素材。
- 添加当前选择。
- 选择输出方式。

示例：

```text
/shot-list 把当前场景拆成 12 个镜头，先生成预览，不直接写入。
```

## 15.3 Task Timeline

消息和执行步骤混排，但视觉层级区分：

```text
User Message
Agent Status Summary
Plan
Skill Started
Tool Call
Permission Request
Artifact Preview
Final Result
```

默认折叠低价值日志。

## 15.4 Agent Task Node

画布中的 `agent-task` 节点只保存：

```typescript
interface AgentTaskNodeConfig {
  agentProfileId: string;
  skillId?: string;
  inputMapping: Record<string, PortBinding>;
  outputMode: AgentOutputMode;
  autoRun: boolean;
}
```

节点绑定：

```text
active_task_id
latest_successful_task_id
artifact_ids
```

Task 的消息、Tool Call、Permission 和日志不塞入 Canvas Document。

## 15.5 上下文入口

在以下页面可发起 Agent：

- Script Editor：分析、改写、拆镜头。
- Character：生成设定和一致性检查。
- Scene：生成场景设计和参考计划。
- Shot List：批量优化镜头。
- Storyboard：生成 Prompt 和检查连贯性。
- Asset Library：分类、Caption、参考图分析。
- Generation Flow：执行 Agent Task Node。
- Artifact：审阅和继续加工。

---

## 16. API 设计

## 16.1 Runtime API

```text
GET    /api/v2/agent-runtimes
POST   /api/v2/agent-runtimes
GET    /api/v2/agent-runtimes/{runtime_id}
PATCH  /api/v2/agent-runtimes/{runtime_id}
DELETE /api/v2/agent-runtimes/{runtime_id}
POST   /api/v2/agent-runtimes/{runtime_id}/probe
GET    /api/v2/agent-runtimes/{runtime_id}/capabilities
GET    /api/v2/agent-runtimes/{runtime_id}/native-skills
```

## 16.2 Agent Profile API

```text
GET    /api/v2/agent-profiles
POST   /api/v2/agent-profiles
GET    /api/v2/agent-profiles/{agent_id}
PATCH  /api/v2/agent-profiles/{agent_id}
DELETE /api/v2/agent-profiles/{agent_id}
POST   /api/v2/agent-profiles/{agent_id}/duplicate
POST   /api/v2/agent-profiles/{agent_id}/validate
POST   /api/v2/agent-profiles/{agent_id}/test
```

## 16.3 Skill API

```text
GET    /api/v2/skills
POST   /api/v2/skills/import
POST   /api/v2/skills/discover
GET    /api/v2/skills/{skill_id}
PATCH  /api/v2/skills/{skill_id}
DELETE /api/v2/skills/{skill_id}
POST   /api/v2/skills/{skill_id}/enable
POST   /api/v2/skills/{skill_id}/disable
POST   /api/v2/skills/{skill_id}/validate
POST   /api/v2/skills/{skill_id}/test
GET    /api/v2/skills/{skill_id}/versions
POST   /api/v2/skills/{skill_id}/versions/{version}/activate
GET    /api/v2/skills/{skill_id}/bindings
```

## 16.4 Agent Skill Binding API

```text
GET    /api/v2/agent-profiles/{agent_id}/skills
POST   /api/v2/agent-profiles/{agent_id}/skills
PATCH  /api/v2/agent-profiles/{agent_id}/skills/{skill_id}
DELETE /api/v2/agent-profiles/{agent_id}/skills/{skill_id}
POST   /api/v2/agent-profiles/{agent_id}/skills:reorder
```

## 16.5 Session API

```text
GET    /api/v2/agent-sessions
POST   /api/v2/agent-sessions
GET    /api/v2/agent-sessions/{session_id}
PATCH  /api/v2/agent-sessions/{session_id}
POST   /api/v2/agent-sessions/{session_id}/resume
POST   /api/v2/agent-sessions/{session_id}/close
GET    /api/v2/agent-sessions/{session_id}/messages
```

## 16.6 Task API

```text
GET    /api/v2/agent-tasks
POST   /api/v2/agent-sessions/{session_id}/tasks
GET    /api/v2/agent-tasks/{task_id}
POST   /api/v2/agent-tasks/{task_id}/cancel
POST   /api/v2/agent-tasks/{task_id}/retry
POST   /api/v2/agent-tasks/{task_id}/input
GET    /api/v2/agent-tasks/{task_id}/runs
GET    /api/v2/agent-runs/{run_id}
GET    /api/v2/agent-runs/{run_id}/steps
```

## 16.7 Permission API

```text
GET  /api/v2/permission-requests
GET  /api/v2/permission-requests/{request_id}
POST /api/v2/permission-requests/{request_id}/decide
GET  /api/v2/permission-grants
DELETE /api/v2/permission-grants/{grant_id}
```

决策请求：

```json
{
  "decision": "allow",
  "scope": "once",
  "comment": ""
}
```

## 16.8 Tool API

普通前端不直接任意调用 Agent Tool，但管理和调试需要：

```text
GET  /api/v2/tools
GET  /api/v2/tools/{tool_id}
POST /api/v2/tools/{tool_id}/validate-input
POST /api/v2/tools/{tool_id}/test
GET  /api/v2/tool-calls
GET  /api/v2/tool-calls/{tool_call_id}
```

## 16.9 Context API

```text
POST /api/v2/agent-contexts/preview
POST /api/v2/agent-contexts/snapshots
GET  /api/v2/agent-contexts/snapshots/{snapshot_id}
```

Preview 用于提交前展示 Context Chips 和 Token / Asset 预算。

---

## 17. Task 创建 Contract

请求示例：

```json
{
  "agent_profile_id": "storyboard-director",
  "skill_id": "script-to-shot-list",
  "message": "把当前场景拆成 12 个镜头，先生成预览。",
  "context": {
    "project_id": "project-1",
    "workspace": "script",
    "selection_refs": [
      {
        "type": "script-scene",
        "id": "scene-3",
        "version": 12
      }
    ],
    "attachment_asset_version_ids": []
  },
  "output_policy": {
    "mode": "artifact",
    "artifact_type": "shot-list"
  },
  "permission_policy": {
    "write": "ask",
    "generation": "ask"
  },
  "idempotency_key": "client-generated-key"
}
```

响应：

```json
{
  "task": {
    "id": "task-1",
    "session_id": "session-1",
    "status": "queued",
    "active_run_id": "run-1",
    "created_at": "2026-08-05T09:00:00Z"
  }
}
```

---

## 18. Event 设计

Agent 事件进入统一 `/ws/v2/events`。

## 18.1 事件类型

```text
agent.runtime.status_changed
agent.session.created
agent.session.status_changed
agent.task.created
agent.task.status_changed
agent.run.started
agent.run.completed
agent.message.created
agent.plan.updated
agent.step.started
agent.step.completed
agent.tool_call.proposed
agent.tool_call.started
agent.tool_call.completed
agent.permission.requested
agent.permission.resolved
agent.input.requested
agent.artifact.created
agent.artifact.updated
skill.discovered
skill.validated
skill.updated
runtime.probed
```

## 18.2 消息事件

```json
{
  "type": "agent.message.created",
  "aggregate_type": "agent_task",
  "aggregate_id": "task-1",
  "payload": {
    "message_id": "msg-1",
    "role": "assistant",
    "kind": "status_summary",
    "content": "正在读取场景和角色设定。"
  }
}
```

## 18.3 Tool Call 事件

```json
{
  "type": "agent.tool_call.proposed",
  "payload": {
    "tool_call_id": "tool-call-1",
    "tool_id": "shot.create_batch",
    "arguments_preview": {
      "count": 12,
      "scene_id": "scene-3"
    },
    "permission_required": true
  }
}
```

## 18.4 大内容处理

事件中不发送：

- 完整大 Prompt。
- 完整图片 Base64。
- 大型 JSON Artifact。
- 完整 stdout 日志。

只发送摘要和 Resource Reference。

---

## 19. 后端模块结构

建议新增：

```text
app/
├── api/v2/
│   ├── agent_runtimes.py
│   ├── agent_profiles.py
│   ├── skills.py
│   ├── agent_sessions.py
│   ├── agent_tasks.py
│   ├── permissions.py
│   ├── tools.py
│   └── agent_contexts.py
├── agent/
│   ├── models.py
│   ├── service.py
│   ├── runtime_registry.py
│   ├── skill_registry.py
│   ├── context_builder.py
│   ├── tool_gateway.py
│   ├── permission_service.py
│   ├── artifact_writer.py
│   ├── event_mapper.py
│   └── adapters/
│       ├── base.py
│       ├── acp.py
│       ├── codex_cli.py
│       ├── gemini_cli.py
│       ├── claude_cli.py
│       └── generic_stdio.py
└── repositories/
    ├── agent_runtime_repository.py
    ├── agent_profile_repository.py
    ├── skill_repository.py
    ├── agent_session_repository.py
    ├── agent_task_repository.py
    └── permission_repository.py
```

无需一次性移动旧 `main.py` 接口。

V2 Agent 模块可以独立新增，再逐步复用已有 CLI helper。

---

## 20. 持久化设计

Agent 平台不建议继续只使用零散 JSON 文件。

建议从第一阶段使用 SQLite 保存元数据和状态。

## 20.1 SQLite 表

```text
agent_runtime_profiles
agent_profiles
agent_skill_bindings
skills
skill_versions
skill_installations
agent_sessions
agent_tasks
agent_runs
agent_steps
agent_messages
context_snapshots
context_references
tool_calls
permission_requests
permission_grants
artifact_links
```

## 20.2 文件目录

```text
data/studio-v2/
├── skills/
│   ├── builtin/
│   ├── installed/
│   └── project/
├── agent-workspaces/
├── context-snapshots/
├── task-logs/
└── artifacts/
```

## 20.3 日志

stdout / stderr 可保存为分段日志文件，数据库只保存：

- 路径。
- 大小。
- checksum。
- 摘要。
- 保留期限。

---

## 21. 安全与隔离

### 21.1 工作目录

每个 Session 使用受控工作目录：

```text
data/studio-v2/agent-workspaces/{session_id}
```

需要项目文件时通过显式挂载或 Tool Gateway 提供，不默认把整个应用目录暴露给 Runtime。

### 21.2 Secret

- Skill Manifest 不允许包含明文 Secret。
- Agent Profile 不允许保存明文 Secret。
- Runtime Environment 使用 Secret Reference。
- 日志必须脱敏 Token、API Key 和 Cookie。

### 21.3 命令参数

CLI Adapter 禁止直接拼接 Shell 字符串。

使用参数数组：

```python
subprocess.Popen([exe, "--model", model, "--json"])
```

避免：

```python
subprocess.Popen(f"{exe} --model {model}", shell=True)
```

### 21.4 网络

远程 Runtime 和 Agent 网络 Tool 必须应用域名策略。

### 21.5 删除和覆盖

Agent 删除、覆盖或批量修改对象必须：

- 显示 Diff 或影响摘要。
- 请求明确权限。
- 尽可能支持撤销或版本恢复。

---

## 22. 前端模块结构

```text
src/features/agents/
├── api/
├── components/
│   ├── AgentCard.tsx
│   ├── AgentSelector.tsx
│   ├── AgentDock.tsx
│   ├── AgentTimeline.tsx
│   ├── AgentComposer.tsx
│   ├── ContextChips.tsx
│   ├── PermissionCard.tsx
│   ├── ToolCallCard.tsx
│   └── ArtifactCard.tsx
├── pages/
│   ├── AgentCenterPage.tsx
│   ├── AgentDetailPage.tsx
│   ├── SkillLibraryPage.tsx
│   ├── SkillDetailPage.tsx
│   ├── RuntimePage.tsx
│   ├── AgentTasksPage.tsx
│   └── PermissionsPage.tsx
├── hooks/
├── schemas/
├── stores/
└── types/
```

Agent 任务服务端状态使用 TanStack Query 和 Event Client。

Composer 草稿、面板状态和临时选择使用 Zustand。

---

## 23. UI 与动效要求

Agent UI 遵循 Studio V2 设计系统：

- Task 创建后立即出现，不等待 Runtime 真正启动。
- 状态变化使用短 Crossfade 或 Layout Transition。
- 高频 Token 流不逐字符做重型动画。
- Tool Call 卡片从对应状态位置展开。
- Permission Card 必须稳定，不自动消失。
- Artifact Preview 使用来源明确的 Shared Element Transition。
- 用户取消时立即显示 `cancel_requested`，后台完成取消后再转 `cancelled`。
- Reduced Motion 下取消滑动和弹性效果。

禁止：

- 长时间循环呼吸动画。
- 每个 Agent 消息都弹跳进入。
- 隐藏 Runtime 错误，只显示“失败”。
- 将 stdout 原样刷满主对话区。

---

## 24. P0 实施范围

P0 目标：用户可以管理 Agent 和 Skill，并通过一个 Runtime 完成可审计任务。

### P0.1 Runtime

- Runtime Profile 列表。
- Probe。
- Capability。
- Codex CLI Adapter 或一个可验证的 Runtime Adapter。
- Generic Adapter 接口。

### P0.2 Agent Profile

- CRUD。
- Runtime 绑定。
- Instructions。
- Tool Policy。
- Context Policy。
- Skill Binding。

### P0.3 Skill

- Builtin 和 Local Skill 扫描。
- `skill.yaml`。
- `SKILL.md`。
- 输入输出 Schema。
- Validate。
- Enable / Disable。
- Test。
- 版本固定。

### P0.4 Session / Task

- 创建 Session。
- 创建 Task。
- 流式状态和消息。
- Cancel。
- Retry。
- Task 列表。

### P0.5 Tool / Permission

- Tool Registry。
- Project Read Tool。
- Artifact Write Tool。
- 一个 Domain Write Tool。
- Permission Request 和一次性决策。
- 审计记录。

### P0.6 Artifact

- Agent Report Artifact。
- Structured JSON Artifact。
- Artifact Preview。
- 来源追踪。

### P0.7 UI

- Agent Center。
- Agents。
- Skills。
- Runtimes。
- Task Detail。
- Permission Card。
- Agent Dock 基础版。

---

## 25. P1 实施范围

- 多 Runtime Adapter。
- Session Resume。
- Runtime Native Skill 同步。
- Project Skill Override。
- Skill Import / Export / Upgrade / Rollback。
- Tool Policy 编辑器。
- Context Preview 和预算。
- Domain Diff Preview。
- Agent Task Node。
- Agent 写回 Script、Character、Scene、Shot 和 Storyboard。
- Waiting Input。
- 付费生成预算策略。
- Artifact Version 和应用流程。

---

## 26. P2 实施范围

- Agent Delegation。
- Multi-Agent Task。
- 子 Agent 可视化。
- Skill Marketplace。
- 远程 Agent Runtime。
- Team Shared Agent Profile。
- 定时和条件 Agent Task。
- 自动质量评估。
- Skill Test Suite 和回归基准。

P2 不应阻塞单 Agent、单 Skill 的稳定体验。

---

## 27. 推荐首批内置 Skill

为了验证系统，不应一开始做大量 Skill。

建议首批：

### 27.1 `project-story-analysis`

输入：Script Version。  
输出：Story Analysis Artifact。

### 27.2 `script-to-shot-list`

输入：Script Scene + Project Bible。  
输出：Shot List Artifact。  
确认后可写入 Shot。

### 27.3 `storyboard-prompt-builder`

输入：Shot + Character / Scene Reference。  
输出：Storyboard Prompt Pack。

### 27.4 `continuity-review`

输入：多个 Shot / Storyboard Frame。  
输出：Continuity Report。

### 27.5 `video-prompt-builder`

输入：Shot + Image Reference + 模型目标。  
输出：视频提示词 Artifact。

这五个 Skill 可以覆盖：

- 读取项目上下文。
- 结构化输出。
- Artifact。
- Domain Write。
- 多种页面入口。
- Skill 版本和测试。

---

## 28. 验收标准

### 28.1 Agent 与 Skill

1. Agent Profile 与 Skill 是独立实体。
2. 一个 Skill 可以绑定多个 Agent。
3. Task 固定 Skill Version。
4. Skill 可验证、禁用和测试。
5. Runtime 不兼容时 UI 明确说明原因。

### 28.2 执行

1. 所有 Agent 操作创建 Task 和 Run。
2. Retry 不覆盖历史 Run。
3. Task 可取消。
4. Runtime 错误可诊断。
5. Session 和 Task 状态可恢复。

### 28.3 上下文

1. 用户可看到 Agent 获得的上下文。
2. Run 保存 Context Snapshot。
3. 上下文版本可追踪。
4. 项目后续修改不改变历史 Run 输入。

### 28.4 工具与权限

1. 副作用操作有 Tool Call 记录。
2. 高风险操作必须请求权限。
3. Permission Card 显示具体影响。
4. 权限决策可审计和撤销。
5. Secret 不出现在 Skill、Profile 和日志中。

### 28.5 Artifact

1. 结构化输出可保存 Artifact。
2. Artifact 记录 Agent、Skill、Task 和 Context 来源。
3. 批量写入前可预览。
4. Artifact 可以回写业务对象。

### 28.6 前后端边界

1. 新 Agent API 全部位于 `/api/v2`。
2. 旧 Chat API 不发生破坏性变化。
3. Studio V2 不直接启动 CLI。
4. 前端不依赖 Runtime 私有 stdout 格式。
5. Runtime Adapter 可替换。

---

## 29. 最终结论

Studio V2 的 Agent 能力不应被设计成一个附属聊天功能，而应成为由以下模块组成的完整创作执行平台：

```text
Agent Profile
+
Skill Registry
+
Runtime Adapter
+
Session / Task / Run
+
Context Snapshot
+
Tool Gateway
+
Permission
+
Artifact
+
Event
+
Management UI
```

其中：

- Agent 决定“谁来做”。
- Skill 决定“会做什么、输入输出和质量规则是什么”。
- Runtime 决定“由哪个执行内核完成”。
- Context 决定“本次执行看到了什么”。
- Tool 决定“可以操作什么”。
- Permission 决定“哪些副作用被允许”。
- Artifact 决定“成果如何保存、版本化和回写”。

该体系应优先于 Legacy Canvas 全量迁移实施，并作为 Studio V2 P0/P1 的核心设计主线。
