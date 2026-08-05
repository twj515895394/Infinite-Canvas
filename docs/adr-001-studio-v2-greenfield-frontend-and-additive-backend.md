# ADR-001：Studio V2 采用 Greenfield 前端与增量式后端演进

> 状态：Accepted  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`

---

## 1. 决策背景

Infinite-Canvas 当前前端主要由原生 HTML、CSS 和 JavaScript 构成，核心画布、任务、素材、模型配置和交互逻辑已经高度耦合。

Studio V2 的目标并不是继续修补旧界面，也不是把 `canvas.js` 逐段翻译成 React，而是建设一套新的 AI 影视创作 Studio，包括：

- 项目与创作设定。
- 剧本、角色、场景、道具、镜头和分镜。
- 素材与版本。
- 图片、视频、音频和工作流任务。
- Agent、Skill、Tool、Artifact 和权限管理。
- React Flow 生产流程画布。
- 新的 UI、交互和动效系统。

现有 Python + FastAPI 后端已经具备大量可复用能力，包括供应商配置、图片和视频生成、ComfyUI、RunningHub、文件处理、素材库、对话、Codex CLI 和 Gemini CLI 等。

因此需要明确新旧前端和后端接口的边界，避免后续设计继续以“迁移旧前端”为中心。

---

## 2. 正式决策

### 2.1 Studio V2 是独立 Greenfield 前端

Studio V2 新建独立前端工程，例如：

```text
frontend/
```

或：

```text
studio-v2/
```

它使用：

- React。
- TypeScript。
- Vite。
- React Router。
- React Flow。
- Zustand。
- TanStack Query。
- Zod。
- Tailwind CSS。
- shadcn/ui Base UI 版本。
- Base UI primitives。
- Motion for React。

Studio V2 不以以下方式建设：

- 不把现有 `canvas.js` 机械翻译为 React。
- 不在旧 HTML 中逐步嵌入大量 React Island，最终再拼成新应用。
- 不要求旧页面先完成组件化改造。
- 不要求新前端复用旧页面 DOM、CSS Class 或全局变量。

旧前端和 Studio V2 在过渡期独立运行。

### 2.2 现有后端接口保持兼容

现有 `/api/*` 接口继续服务旧前端和已有集成。

原则上：

- 不为了 Studio V2 随意修改旧接口请求结构。
- 不修改旧接口已有字段的含义。
- 不把旧接口同步改造成 V2 Contract。
- 不要求旧前端同时适配新 DTO。
- 修复旧接口 Bug 时保持兼容。

### 2.3 新能力通过增量接口提供

Studio V2 使用新增接口：

```text
/api/v2/*
/ws/v2/*
```

新增接口可以：

- 调用现有后端函数。
- 组合多个旧接口背后的能力。
- 为旧能力增加稳定 DTO。
- 为长任务增加 Job 模型。
- 增加分页、版本、幂等、事件恢复和权限能力。
- 增加 Project、Artifact、Agent、Skill 等新领域能力。

新增 V2 接口是对现有后端能力的增强和稳定封装，不是替换旧 API。

### 2.4 后端内部实现允许逐步复用与拆分

V2 Router 可以调用现有实现，也可以逐步抽取公共 Service：

```text
Legacy Router ───────┐
                     ├── Existing Service / Adapter / Provider Client
V2 Router ───────────┘
```

允许从 `main.py` 中逐步抽取：

- Provider Service。
- Asset Service。
- Canvas Service。
- Generation Service。
- Agent Gateway。
- Event Hub。

但内部模块拆分不能迫使旧 API 发生不兼容变化。

### 2.5 Legacy Canvas 迁移不是 Studio V2 前置条件

Studio V2 可以使用新的 Canvas Document 和新的持久化模型直接创建新画布。

Legacy Canvas 兼容能力调整为：

- 可选导入工具。
- 历史项目读取适配器。
- 用户明确执行的迁移流程。
- 迁移报告和无法迁移项提示。

它不再是以下工作的前置条件：

- Studio V2 App Shell。
- 新项目创建。
- React Flow 新画布。
- Agent 与 Skill 管理。
- GenerationJob。
- Artifact。

### 2.6 Agent 与 Skill 设计提前

Agent 与 Skill 是 Studio V2 的核心差异化能力，需要尽早确定：

- Agent Runtime 和 Agent Profile 的区别。
- Skill Contract、版本和安装方式。
- Session、Task、Run、Step 和 Tool Call。
- Tool Gateway 与权限审批。
- Context Snapshot。
- Artifact 输出和项目回写。
- Agent 管理页面和 Skill 管理页面。
- 与画布 Agent Task Node 的绑定。

因此 Agent/Skill 详细设计优先级高于 Legacy Canvas 全量迁移设计。

---

## 3. 目标架构边界

```text
┌──────────────────────────────────────────────────────┐
│ Studio V2 Frontend                                   │
│ React + TypeScript + React Flow                      │
└──────────────────────────┬───────────────────────────┘
                           │
                  /api/v2  │  /ws/v2
                           ▼
┌──────────────────────────────────────────────────────┐
│ Studio V2 Backend Boundary                           │
│ Project / Canvas / Asset / Artifact                  │
│ GenerationJob / Agent / Skill / Tool / Event         │
└──────────────────────────┬───────────────────────────┘
                           │
              Service / Adapter reuse
                           ▼
┌──────────────────────────────────────────────────────┐
│ Existing FastAPI Capabilities                        │
│ Providers / ComfyUI / RunningHub / Jimeng            │
│ Files / Media / Asset Library / Conversations        │
│ Codex CLI / Gemini CLI                               │
└──────────────────────────┬───────────────────────────┘
                           │
                  Existing /api/*
                           ▼
┌──────────────────────────────────────────────────────┐
│ Legacy Frontend                                      │
└──────────────────────────────────────────────────────┘
```

---

## 4. 数据边界

### 4.1 Legacy 数据

旧前端继续读取和写入当前数据：

- `data/canvases`。
- 当前素材库 JSON。
- 当前 conversation 文件。
- 当前 history 和 queue 数据。

### 4.2 Studio V2 数据

Studio V2 新领域建议独立持久化：

- Project。
- ProjectBible。
- Canvas V2 Document / Operation。
- Asset Version / Reference。
- Artifact / Artifact Version。
- GenerationJob。
- Agent Runtime / Profile。
- Skill / Skill Version / Installation。
- Agent Session / Task / Run。
- Tool Call / Permission Request。
- Studio Event。

初期可使用 SQLite 加文件目录，不要求先引入外部数据库。

### 4.3 禁止隐式双写

除非某个兼容流程经过专项设计，否则不允许：

- Studio V2 每次保存时自动回写 Legacy Canvas JSON。
- 旧前端操作时自动生成 V2 Operation。
- 新旧前端同时编辑同一份画布并期望自动合并。

需要互通时使用明确的导入、复制或兼容 Adapter。

---

## 5. API 演进规则

### 5.1 旧接口

```text
/api/*
/ws/stats
```

要求：

- 保持兼容。
- 只进行必要修复。
- 不承载新的 Studio 领域模型。

### 5.2 V2 接口

```text
/api/v2/*
/ws/v2/events
```

要求：

- 使用明确 Pydantic Request / Response Model。
- 生成稳定 OpenAPI。
- 支持标准错误模型。
- 长任务 Job 化。
- 需要时支持 revision、cursor、idempotency 和 event replay。
- 不直接暴露供应商私有协议。

### 5.3 复用方式

优先级：

```text
复用现有底层实现
> 抽取公共 Service
> 增加 V2 Adapter
> 必要时新增实现
```

禁止为了避免少量重复而让 V2 Contract 依赖 Legacy 响应结构。

---

## 6. 对现有设计文档的影响

以下表达需要按本 ADR 理解：

- “渐进迁移”指功能分阶段建设和用户逐步切换，不指旧前端代码逐步改写成新前端。
- “Legacy Adapter”是兼容能力，不是新画布的默认存储路径。
- “新旧并行”指两个前端和两组 API Contract 可同时运行，不代表同一画布需要双写。
- “旧数据迁移”降级为独立兼容专题，不阻塞 Agent、Skill 和新项目能力。

当其他文档与本 ADR 冲突时，本 ADR 优先。

---

## 7. 调整后的设计优先级

```text
1. Studio V2 App Shell、UI 与基础设施
2. /api/v2 P0 Contract
3. React Flow Node Model 与 Node Registry
4. Agent、Skill、Runtime、Tool、Permission、Artifact
5. Asset / Artifact 数据模型
6. GenerationJob 和 Event Hub
7. AI 影视创作领域对象
8. Legacy Canvas 可选导入和兼容
9. 完整实施计划与验收
```

---

## 8. 验收标准

该决策落实后应满足：

1. 删除旧前端目录不会影响 Studio V2 编译，但实际发布阶段仍保留旧前端。
2. Studio V2 不引用旧页面 DOM、旧 CSS 或 `canvas.js` 全局变量。
3. 旧前端不需要理解 `/api/v2` DTO。
4. 旧 API 不因 Studio V2 开发发生破坏性变更。
5. Studio V2 可以创建全新的 Project 和 Canvas，不依赖 Legacy Canvas。
6. Agent/Skill 模块可以在没有 Legacy 数据迁移的情况下开发和测试。
7. Legacy Canvas 导入失败不会影响 Studio V2 主流程。
