# Infinite-Canvas Studio V2 页面信息架构与核心用户流程设计

> 文档状态：详细设计基线  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 前置文档：  
> - `docs/studio-v2-frontend-architecture-overall-design.md`  
> - `docs/current-backend-api-capability-inventory.md`  
> - `docs/studio-v2-backend-api-gap-and-v2-design.md`

---

## 1. 文档目的

本文档确定 Studio V2 的页面信息架构、桌面布局、工作区边界、导航方式和核心用户流程，作为前端路由、App Shell、页面原型和后端 P0 API 设计的共同输入。

本文档重点解决：

1. 新界面不再把所有能力都堆叠在无限画布和顶部按钮中。
2. 项目、素材、剧本、角色、场景、镜头、分镜、生成流程、任务和 Agent 之间形成稳定的信息关系。
3. 用户在不同工作区切换时保持上下文，不反复寻找同一个素材或对象。
4. 高频操作距离短、反馈快，低频高级能力不占据主界面。
5. 让界面视觉简洁，但不以“隐藏一切”冒充简单。

---

## 2. 产品心智模型

Studio V2 的核心心智模型为：

```text
Workspace（工作空间）
└── Project（项目）
    ├── Project Bible（项目设定）
    ├── Script（剧本）
    ├── Characters（角色）
    ├── Scenes（场景）
    ├── Props（道具）
    ├── Shots（镜头）
    ├── Storyboards（分镜）
    ├── Assets（素材）
    ├── Generation Flows（生成流程）
    ├── Artifacts（结构化成果）
    ├── Jobs（生成任务）
    └── Agent Sessions / Tasks
```

### 2.1 关键原则

- **项目是最高业务容器。** 画布、素材和 Agent Task 都应归属于项目，而不是彼此孤立。
- **画布是工作区之一。** 画布不再承担项目管理、素材管理、配置管理和所有结构化编辑。
- **素材和成果分离。** Asset 表示媒体资源；Artifact 表示剧本、角色设定、镜头方案、报告等结构化成果。
- **任务和结果分离。** GenerationJob / AgentTask 记录执行过程；结果通过 AssetVersion 或 ArtifactVersion 落地。
- **选中对象驱动 Inspector。** 同一个右侧 Inspector 根据当前选中对象切换内容，避免每种对象都弹出独立大窗。

---

## 3. 总体页面地图

```text
/studio-v2
├── /projects
│   ├── 最近项目
│   ├── 全部项目
│   └── 回收站
├── /projects/:projectId
│   ├── /overview
│   ├── /bible
│   ├── /script
│   ├── /characters
│   ├── /scenes
│   ├── /props
│   ├── /shots
│   ├── /storyboards
│   ├── /assets
│   ├── /flows
│   │   └── /:canvasId
│   ├── /artifacts
│   ├── /tasks
│   └── /settings
├── /settings
│   ├── /providers
│   ├── /models
│   ├── /storage
│   ├── /comfyui
│   ├── /workflows
│   ├── /agents
│   └── /appearance
└── /legacy
```

### 3.1 路由设计原则

- URL 应能直接恢复项目和工作区。
- 画布、镜头、素材和任务应有可复制的深链接。
- 面板开关、临时选择和 Hover 不写入 URL。
- 需要分享或恢复的对象 ID 写入 URL 或 Query。
- 返回操作优先返回同一项目上一次工作区，而不是总回项目列表。

---

## 4. App Shell 总体布局

Studio V2 为桌面优先的专业创作工具，采用稳定的四区域结构。

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Top Bar：项目路径 / 当前对象 / 保存状态 / 搜索 / 运行 / 全局操作           │
├───────────────┬──────────────────────────────────────────┬─────────────────┤
│ Navigation    │                                          │ Inspector       │
│ Rail / Sidebar│             Main Workspace               │ Context Panel   │
│               │                                          │                 │
│ 项目与工作区   │ 画布 / 素材网格 / 剧本 / 镜头表 / 分镜    │ 属性 / 输入 /     │
│ 导航           │                                          │ 版本 / 日志       │
├───────────────┴──────────────────────────────────────────┴─────────────────┤
│ Task Shelf：仅在存在运行中、等待确认或失败任务时出现                        │
└────────────────────────────────────────────────────────────────────────────┘
```

## 4.1 左侧 Navigation Rail / Sidebar

左侧分两级：

### Rail

常驻窄栏，用于：

- 项目入口。
- 工作区入口。
- 全局搜索。
- Agent Dock。
- 任务中心。
- 设置。

建议宽度：

```text
Collapsed Rail: 52～60px
Expanded Sidebar: 220～256px
```

### Expanded Sidebar

按当前工作区展示二级导航：

- 项目下的画布列表。
- 角色列表。
- 场景列表。
- 镜头分组。
- 素材文件夹和筛选器。
- Artifact 类型。

### 左侧设计约束

- 当前工作区必须有明确高亮。
- 图标只用于辅助识别，重要入口必须有文本名称。
- 不用颜色区分十几个功能；颜色只表示状态或少数固定类别。
- Sidebar 可折叠，但折叠后 Tooltip 必须可用。
- 折叠与展开不改变主内容的业务状态。

## 4.2 Top Bar

Top Bar 只承载跨工作区的重要操作：

左侧：

- 返回。
- 项目名称。
- 当前工作区或当前对象路径。
- 可点击 Breadcrumb。

中间：

- 当前对象标题。
- 保存状态。
- 冲突或离线状态。

右侧：

- Command Palette / 搜索。
- 撤销、重做。
- 当前工作区主要动作。
- 运行或生成。
- Agent 快捷入口。
- 账户与设置。

### Top Bar 约束

- 不再把所有节点类型平铺为一排按钮。
- 每个工作区最多保留一个视觉最强的 Primary Action。
- 次要操作进入 More Menu、右键菜单或 Command Palette。
- 保存状态应安静显示，不使用持续闪烁或大面积提示。

## 4.3 Main Workspace

Main Workspace 根据路由装载具体工作区。

工作区内部可以拥有自己的局部工具栏，但必须遵守：

- 工具栏靠近其影响内容。
- 高频操作常驻。
- 低频设置进入 Inspector 或菜单。
- 不同工作区的选择、过滤和滚动状态分别缓存。

## 4.4 Inspector

右侧 Inspector 是统一上下文面板，建议宽度：

```text
Default: 340px
Resizable Range: 300～480px
Collapsed: 0px
```

Inspector 的 Tab 根据对象动态显示：

```text
Properties | Inputs | Results | Versions | Activity
```

示例：

- 选中图片生成节点：参数、输入图、结果、运行记录。
- 选中角色：角色信息、参考素材、版本、相关镜头。
- 选中镜头：景别、运动、时长、角色、场景、分镜和生成结果。
- 选中 Agent Task：上下文、计划、Tool Call、权限和 Artifact。

### Inspector 原则

- 节点卡片只显示摘要，完整表单进入 Inspector。
- Inspector 不应覆盖 Main Workspace。
- Inspector 切换对象时保留当前 Tab，若该对象不支持则回到 Properties。
- 未选中对象时显示当前工作区帮助、批量操作或空状态。

## 4.5 Task Shelf

Task Shelf 位于底部，仅在以下条件出现：

- 有运行中的生成任务。
- 有等待用户授权的 Agent Task。
- 有失败任务需要处理。
- 用户主动展开历史任务。

默认折叠为一行摘要：

```text
3 Running · 1 Waiting · 2 Failed
```

展开后显示：

- 任务名称。
- 所属项目和对象。
- 当前阶段。
- 进度。
- 预计或已耗时。
- 取消、重试、查看结果。

Task Shelf 不应因为每个 Token 或日志事件持续改变高度。

---

## 5. 全局导航与命令体系

## 5.1 Command Palette

Command Palette 是低频功能和键盘工作流的统一入口。

建议快捷键：

```text
Windows / Linux: Ctrl + K
macOS: Command + K
```

支持：

- 跳转项目和工作区。
- 创建对象。
- 创建节点。
- 搜索素材。
- 搜索镜头。
- 运行当前流程。
- 打开 Provider 设置。
- 执行撤销、重做、复制链接等命令。

### 命令规则

- 命令名称使用动词开头，例如“创建图片生成节点”。
- 命令附带所属范围，例如“当前画布”“当前项目”。
- 危险操作不能仅依赖模糊搜索结果直接执行。
- 键盘触发 Command Palette 时应瞬时出现，不添加明显开场动画。

## 5.2 全局搜索

全局搜索与 Command Palette 可以共享入口，但结果区域应区分：

- Commands。
- Projects。
- Assets。
- Characters。
- Scenes。
- Shots。
- Artifacts。
- Tasks。

结果支持键盘导航、预览和打开所在上下文。

---

## 6. 项目列表与项目概览

## 6.1 项目列表

项目列表默认展示：

- 最近打开。
- 置顶项目。
- 全部项目。
- 回收站。

项目卡片只显示：

- 封面。
- 项目名。
- 更新时间。
- 最近工作区。
- 运行任务摘要。

禁止在项目卡片中堆叠大量统计数字和操作按钮。

## 6.2 项目概览

项目概览不是传统数据大屏，而是项目继续工作的入口。

建议结构：

```text
Project Header
├── 项目封面和名称
├── 一句话描述
├── 当前阶段
└── Continue Working

Recent Work
├── 最近画布
├── 最近镜头
└── 最近 Artifact

Production Status
├── 剧本状态
├── 角色/场景准备状态
├── 镜头完成度
└── 运行任务

Project Notes / Agent Suggestions
```

最重要的按钮是“继续上次工作”，而不是展示所有统计。

---

## 7. Asset Library 工作区

## 7.1 页面布局

```text
Sidebar: Libraries / Folders / Smart Filters
Main: Virtualized Grid or List
Inspector: Metadata / References / Versions / Activity
```

Top Bar 局部动作：

- 上传。
- 从 URL 导入。
- 从共享文件夹导入。
- 搜索。
- 筛选。
- 视图切换。

## 7.2 资产筛选

至少支持：

- 类型：图片、视频、音频、文档、工作流。
- 来源：上传、生成、共享目录、外部抓取。
- 项目。
- 角色、场景、镜头引用。
- 标签。
- 创建时间。
- 模型或工作流。
- 有无描述、分类和版本。

## 7.3 素材交互

单击：选中并在 Inspector 展示。

双击或 Enter：打开预览。

拖拽：

- 拖到画布创建 Asset Node。
- 拖到角色或场景建立参考关系。
- 拖到生成节点作为输入。

右键菜单：

- 在新窗口预览。
- 添加到当前画布。
- 创建版本。
- 移动。
- 添加标签。
- 查看引用。
- 删除。

## 7.4 预览

图片、视频和音频使用统一 Preview Surface。

预览支持：

- 上一项、下一项。
- 缩放。
- 图片对比。
- 视频帧定位。
- 版本切换。
- 添加到当前工作对象。

从缩略图打开预览时可以使用 Shared Element Transition，但必须保持轻量并支持 Reduced Motion。

---

## 8. Script、Character、Scene 与 Shot 工作区

## 8.1 Script Editor

Script Editor 采用文档编辑，而不是画布节点。

页面结构：

```text
Outline Sidebar | Script Editor | Context Inspector
```

支持：

- 章节、场次、段落导航。
- 角色和场景引用。
- Agent 辅助改写。
- 从剧本生成场次和镜头草案。
- 版本比较。

Agent 输出必须先作为建议或新版本，不直接静默覆盖用户内容。

## 8.2 Character / Scene / Prop

采用列表加详情页：

```text
Entity List | Entity Detail | Inspector
```

详情页包括：

- 基础设定。
- 视觉描述。
- 参考素材。
- 一致性提示词。
- 版本。
- 关联镜头。
- 生成入口。

## 8.3 Shot List

Shot List 使用结构化表格或分组列表，不使用无限画布。

核心列：

- 镜头号。
- 场次。
- 景别。
- 机位和运动。
- 时长。
- 角色。
- 场景。
- 状态。
- 当前分镜。
- 当前生成结果。

支持：

- 多选批量修改。
- 拖拽排序。
- 按场次分组。
- 在 Inspector 编辑完整字段。
- 打开关联生成流程。

## 8.4 Storyboard

第一阶段使用有序卡片墙：

- 按镜头顺序排列。
- 支持拖拽排序。
- 每个卡片显示画面、镜头号、时长、状态。
- Inspector 编辑画面描述、对白、摄影和生成记录。

第二阶段再引入自由画板模式，不在第一阶段把结构化分镜和自由情绪板混在一起。

---

## 9. Generation Flow 工作区

## 9.1 布局

```text
Top Bar: Canvas Breadcrumb / Save / Undo / Run
Left: Node Library（按需展开）
Center: React Flow Canvas
Right: Inspector
Bottom: Task Shelf
Floating: Zoom / Fit / MiniMap / Selection Actions
```

## 9.2 节点创建

提供三种入口：

1. 画布空白处双击或快捷键打开 Node Picker。
2. 左侧 Node Library 拖入。
3. 从资产、镜头或 Artifact 直接创建关联节点。

Node Picker 按意图分组：

```text
Inputs
├── Asset
├── Prompt
├── Shot
└── Artifact

Generate
├── Image
├── Video
├── Audio
└── Comfy Workflow

Process
├── LLM
├── Loop / Batch
├── Transform
└── Agent Task

Outputs
├── Artifact
├── Asset Save
└── Export
```

不把供应商名称作为一级节点类型。供应商和模型在 Inspector 中选择。

## 9.3 节点层级

默认节点为 Compact：

- 标题。
- 预览。
- 状态。
- 两到三个关键参数。
- 输入输出 Handle。

选中后：

- 显示快速操作。
- Inspector 展示完整配置。

运行中：

- 节点只显示当前阶段和轻量进度。
- 详细日志进入 Activity Tab 或 Task Shelf。

## 9.4 画布快捷操作

建议：

```text
Space + Drag        平移
Wheel / Trackpad    缩放或平移，遵循系统习惯
F                   适配选中
Shift + F           适配全部
Delete / Backspace  删除选中
Ctrl/Cmd + D        复制
Ctrl/Cmd + G        分组
Ctrl/Cmd + Z        撤销
Ctrl/Cmd + Shift+Z  重做
Enter               打开 Inspector / 编辑
Escape              退出当前模式
```

快捷键必须可配置并避免与浏览器、输入框冲突。

## 9.5 运行流程

运行入口分为：

- Run Node。
- Run Selected。
- Run From Here。
- Run Flow。

执行前仅在真正必要时提示：

- 缺少输入。
- 费用风险。
- 会覆盖已确认结果。
- 涉及外部文件写入或 Agent 高风险工具。

普通生成不使用重复确认框。

---

## 10. Agent Dock 与 Agent Task

## 10.1 Agent Dock

Agent Dock 是跨工作区的辅助面板，可以停靠在右侧或独立抽屉中。

主要区域：

```text
Header: Agent Profile / Runtime / Session
Context: 当前项目、当前对象、已选素材
Conversation: 消息、Plan、Tool Call、结果
Composer: 输入、附件、Skill、运行模式
```

## 10.2 上下文注入

用户应清楚看到 Agent 获得了哪些上下文：

- 当前项目。
- 当前工作区。
- 当前选中对象。
- 手动添加的素材。
- Skill。
- 可用工具。

上下文以可移除 Chip 展示，禁止静默把整个项目全部塞入 Agent。

## 10.3 Agent Task Node

当用户需要把 Agent 工作变成可追踪流程时，将 Session 中的任务固定为 Agent Task Node。

节点显示：

- Agent Profile。
- Skill。
- 当前状态。
- Plan 摘要。
- 最近 Tool Call。
- 产出的 Artifact。

完整对话和工具日志仍在 Agent Dock 或 Inspector 中查看。

## 10.4 权限请求

权限请求必须：

- 明确说明将执行什么。
- 说明影响范围。
- 提供允许一次、允许本 Session、拒绝。
- 对不可逆操作提供更明确确认。

普通读取和低风险查询不应频繁打断用户。

---

## 11. 核心用户流程

## 11.1 从项目到图片生成

```text
打开项目
→ 进入 Generation Flow
→ 从 Asset Drawer 拖入参考图
→ 创建 Image Generation Node
→ 连接参考图
→ 在 Inspector 选择模型和参数
→ Run Node
→ Task Shelf 展示进度
→ 结果写入 AssetVersion
→ 用户确认结果并关联到镜头/角色/场景
```

关键体验要求：

- 创建节点后焦点自动进入最需要填写的字段。
- 运行后不强制打开日志。
- 结果出现时节点就地更新，不跳转页面。
- 用户可以继续操作其他节点。

## 11.2 从剧本到镜头和分镜

```text
Script Editor 选中场次
→ 调用“生成镜头草案”
→ Agent 或 LLM 产生 Shot Draft Artifact
→ 用户审阅差异
→ 批量创建 Shot
→ Shot List 调整顺序和字段
→ Storyboard 工作区生成分镜草图
→ 选中镜头进入关联 Generation Flow
```

## 11.3 从素材库到角色参考

```text
Asset Library 选中多张图片
→ Add to Character Reference
→ 选择或创建角色
→ 生成引用关系
→ Character Detail 展示参考集
→ 可创建一致性提示词或角色版本
```

## 11.4 Agent 生成项目方案

```text
打开 Agent Dock
→ 选择 Agent Profile 与 Skill
→ 添加项目和选中场次为上下文
→ 创建 Agent Task
→ 查看 Plan
→ Agent 调用读取工具
→ 如需写入，出现权限请求
→ 输出 Project Plan Artifact
→ 用户选择应用、另存版本或丢弃
```

## 11.5 失败与重试

```text
任务失败
→ 节点显示 Error 状态
→ Task Shelf 聚合失败任务
→ Inspector 显示用户可理解的原因
→ 提供 Retry / Edit Inputs / Switch Provider / View Raw
→ 重试创建新的 Attempt，保留旧记录
```

---

## 12. 状态恢复与连续性

每个项目记录：

- 最后工作区。
- 最后打开对象。
- 每个工作区的滚动位置。
- 画布 viewport。
- Inspector 展开状态。
- 用户筛选条件。

这些状态分为：

### 可跨设备同步

- 最近工作区。
- 画布 viewport。
- 固定筛选器。
- Sidebar 展开偏好。

### 仅本地保存

- Hover。
- 临时弹层。
- 未提交拖拽状态。
- 临时选区。

发生后端冲突时，不应直接丢弃本地编辑；应提供：

- Reload Remote。
- Keep Local Copy。
- Compare Changes。

---

## 13. 空状态、加载和错误

## 13.1 空状态

空状态必须提供下一步，而不是只显示“暂无数据”。

示例：

```text
还没有生成流程
创建空白流程 · 从模板创建 · 导入旧画布
```

## 13.2 加载状态

- 页面级加载使用结构稳定的 Skeleton。
- 不用全屏 Spinner 阻塞整个 Studio。
- 局部任务只影响局部区域。
- 已有旧数据时保持旧数据并显示后台刷新状态。

## 13.3 错误状态

错误信息包含：

- 发生了什么。
- 用户可以做什么。
- 是否会丢失数据。
- 技术详情入口。

默认不直接展示上游长 JSON。

---

## 14. 响应式与窗口尺寸

Studio V2 桌面优先。

建议断点：

```text
≥ 1440px：完整 Sidebar + Inspector
1200～1439px：Sidebar 可折叠，Inspector 默认 320px
960～1199px：Rail 常驻，Inspector 以 Overlay/Drawer 打开
< 960px：提供有限查看和轻量操作，不承诺完整画布编辑体验
```

支持拖动调整：

- Sidebar 宽度。
- Inspector 宽度。
- Script Outline 宽度。
- Agent Dock 高度或宽度。

调整结果本地保存。

---

## 15. 与后端 P0 API 的对应关系

| 前端能力 | 主要后端能力 |
|---|---|
| App 启动 | `GET /api/v2/bootstrap` |
| Runtime 状态 | `GET /api/v2/runtime-capabilities` |
| 项目导航 | `/api/v2/projects` |
| 工作区与对象恢复 | Project Preference / Recent Context |
| Generation Flow | `/api/v2/canvases` + operations + snapshot |
| 素材库 | `/api/v2/assets` + versions + references |
| 任务架 | `/api/v2/generation-jobs` + events |
| 实时状态 | `/ws/v2/events` + event replay |
| Agent Dock | `/api/v2/agent-*` |
| Script / Shot / Storyboard | P1 领域 API |

---

## 16. 第一阶段页面实施范围

Phase 1～2 只实现：

1. Studio App Shell。
2. 项目列表和项目概览基础版。
3. Generation Flow。
4. Asset Drawer / Asset Library 基础版。
5. Inspector。
6. Task Shelf。
7. Command Palette。
8. 设置页的 Provider、Storage、ComfyUI 和 Appearance。
9. Legacy Canvas 入口。

暂不在第一阶段完整实现：

- 专业 Script Editor。
- 完整 Character / Scene 数据库。
- 完整 Shot List。
- 自由 Storyboard Board。
- 专业时间轴。

这些工作区先保留路由和导航位置，避免后续重新设计 App Shell。

---

## 17. 信息架构验收标准

- 用户能在三步内从项目进入最近工作对象。
- 高频操作不依赖多层 Modal。
- 所有主要对象都有明确所在项目和工作区。
- 画布节点的完整参数不长期堆叠在节点卡片中。
- 运行任务跨工作区可见，但不遮挡主操作。
- 从素材、镜头和 Agent 结果可以回到其引用对象。
- 页面刷新后能恢复项目、工作区和主要上下文。
- Legacy Canvas 与 Studio V2 入口明确区分。
- 用户始终能回答：我在哪、选中了什么、正在运行什么、下一步可以做什么。

---

## 18. 最终原则

> 页面布局首先服务长期创作效率，不为第一次截图制造复杂视觉效果。

> 高频功能靠位置、快捷键和即时反馈提速；低频功能靠搜索、菜单和 Inspector 保持界面安静。

> 画布、列表、文档和时间轴各自使用最适合的交互模型，不强行统一为一种界面。

> 用户切换工作区时，项目上下文、选中对象、素材引用和运行任务必须保持连续。