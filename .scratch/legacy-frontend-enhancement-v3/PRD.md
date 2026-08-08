# Legacy Frontend 功能增强 v3 PRD

Status: ready-for-agent  
Type: PRD  
Feature: legacy-frontend-enhancement-v3  
日期: 2026-08-06  
适用仓库: twj515895394/Infinite-Canvas  
分支基线: `feature/original-frontend-optimization`  
前置完成: Legacy UI 审美升级 + Native ESM 脚手架（ADR-0002 阶段）

---

## 实现切片（Issues）

全部 `Status: ready-for-agent`。目录：`.scratch/legacy-frontend-enhancement-v3/issues/`。

| # | 文件 | 阻塞于 |
|---|------|--------|
| 01 | [m3-node-run-status-bus](issues/01-m3-node-run-status-bus.md) | 无 |
| 02 | [m1-cascade-tracker-logic](issues/02-m1-cascade-tracker-logic.md) | 无 |
| 03 | [m1-cascade-tracker-panel](issues/03-m1-cascade-tracker-panel.md) | 01, 02 |
| 04 | [m2-prompt-template-hub](issues/04-m2-prompt-template-hub.md) | 无 |
| 05 | [m2-chain-preset-apply](issues/05-m2-chain-preset-apply.md) | 04 |
| 06 | [m4-legacy-v2-api-client](issues/06-m4-legacy-v2-api-client.md) | 无 |
| 07 | [m5-agent-center](issues/07-m5-agent-center.md) | 06 |
| 08 | [m5-agent-dock](issues/08-m5-agent-dock.md) | 06, 07 |
| 09 | [m6-agent-task-smart-node](issues/09-m6-agent-task-smart-node.md) | 01, 06, 08 |
| 10 | [m7-asset-v2-bridge](issues/10-m7-asset-v2-bridge.md) | 06 |
| 11 | [m8-generation-task-shelf](issues/11-m8-generation-task-shelf.md) | 06 |
| 12 | [m9-esm-deep-wire](issues/12-m9-esm-deep-wire.md) | 01 |
| 13 | [m10-platform-gaps](issues/13-m10-platform-gaps.md) | 无 |
| 14 | [v3-smoke-and-release-gate](issues/14-v3-smoke-and-release-gate.md) | 文档可即开；完整勾选建议 03+05+09 后 |

**可立即并行开工**：01、02、04、06、13（及 14 文档骨架）。


## 问题陈述

创作者已经回到 **Legacy Frontend**（`static/`）作为主界面：Smart Canvas 功能完备、视觉已升级，但下一阶段「功能增强」尚未产品化落地。

具体痛点：

1. **级联运行 / 一键运行** 逻辑已存在于巨型 `smart-canvas.js`，但缺少清晰的运行追踪面板与规范化状态投影，失败排查靠节点徽章与连线动画，难回顾整条链路。
2. **提示词模板与工作流套用** 有基础能力，但缺少「增强版」产品体验（分组检索、一键套到节点/链路、用户模板沉淀），和「工作流模板」心智不完全对齐。
3. **Studio V2 已交付的后端能力**（`/api/v2`：Agent Runtime/Profile/Skill/Task、AssetVersion/Tag/Collection/回收站、统一 Generation Task）在 React 壳 `studio-v2/` 内闭环，**Legacy Frontend 零调用**——主界面用户用不了 Agent 真实执行与新资产模型。
4. **Native ESM 模块**（State Store、Render Engine、NodeFactory、CanvasAPI）仍是旁路脚手架，未驱动热路径；继续在单体文件上堆增强会再次失控。
5. 零散缺口（Avatar 认证平台覆盖、设置页 CLI runtime-capabilities）降低「本地 AI 工作台」完整感。

用户需要的不是再开一套 React 主壳，而是：**在现有 Smart Canvas / 素材库 / 设置体系上，接好已有后端增强，并打磨级联与模板体验**。

## 解决方案

在 Legacy Frontend 上实施 **Enhancement v3**，策略为：

> **后端增量复用 `/api/v2` + 主 UI 继续 Legacy（ADR-0002）**；Studio V2 React 工程保留作参考实现与回退对照，**不再作为默认产品壳推进**。

按优先级交付十条主线模块：

| 优先级 | 模块 | 用户可感知结果 |
|--------|------|----------------|
| P0 并行 | **M1 Cascade Run Tracker** | 级联可追踪、可停止、可回顾 |
| P0 并行 | **M2 Workflow & Prompt Template Hub** | 模板/工作流一键套用更顺手 |
| P0 并行 | **M3 Node Run Status Bus** | 节点/连线/面板状态一致 |
| P0 串行 | **M4 V2 API Client（Legacy）** | 旧前端唯一 v2 出口 |
| P0 | **M5 Agent Center + Dock** | 管理 Runtime/Agent/Skill，Dock 真执行 |
| P0 | **M6 Agent Task Smart Node** | 画布内编入 Agent 任务 |
| P1 | **M7 Asset V2 Bridge** | 旧素材库对齐版本/回收站/Collection |
| P2 | **M8 Generation Task Shelf** | 统一任务架（渐进挂载） |
| P2 穿插 | **M9 ESM Deep Wire** | 状态/渲染热路径模块化，去双写 |
| P2 | **M10 Platform Gaps** | Avatar 多平台、CLI 能力进设置 |

实施顺序：

```text
M1 + M2 + M3          （旧画布增强，不依赖 v2）
M4                    （v2 客户端地基）
  → M5 → M6           （Agent 闭环）
  → M7                （资产桥）
  → M8                （任务架，可后）
M9 穿插服务 M1–M3
M10 随时可插
```

## 用户故事

### A. 级联运行追踪（M1）

1. 作为创作者，我想在 Smart Canvas 选中链路尾节点后看到「可级联运行」提示，以便确认当前图是否构成一键运行链。
2. 作为创作者，我想一键启动级联运行，以便按依赖顺序自动跑完上游到尾节点的生成链。
3. 作为创作者，我想从循环节点启动多轮级联（串行/并发），以便批量出图而不手点每一轮。
4. 作为创作者，我想在运行中随时停止整条或指定循环的级联，以便及时止损。
5. 作为创作者，我想打开级联追踪面板，看到每个节点排队/运行/完成/失败及轮次序号，以便掌握进度。
6. 作为创作者，我想在追踪面板看到边的等待/激活/完成状态，以便理解当前卡在哪一段。
7. 作为创作者，我想在某个节点失败时在面板看到可读错误摘要，以便决定重试或改参。
8. 作为创作者，我想从失败节点或整链发起重试（不重复已成功段，若策略允许），以便减少浪费。
9. 作为创作者，我想在级联进行中仍能对其它无关节点单独生成，以便不阻塞并行灵感探索。
10. 作为创作者，我想在级联结束后保留最近一次运行摘要直到下次启动或手动清除，以便复盘。
11. 作为创作者，我想在 Comfy 多实例场景下级联并发不超过实例能力，以便避免打爆本机 ComfyUI。
12. 作为创作者，我想在系统开启减少动效时级联连线不再闪烁动画，以便无障碍使用。

### B. 工作流与提示词模板增强（M2）

13. 作为创作者，我想在统一入口浏览提示词模板（系统/我的、分组、搜索），以便快速找到常用措辞。
14. 作为创作者，我想把模板一键套用到当前提示词节点或 Composer，以便减少复制粘贴。
15. 作为创作者，我想保存当前提示词为「我的模板」（名称/分组/正文），以便沉淀个人资产。
16. 作为创作者，我想编辑或删除我的模板，以便维护模板库。
17. 作为创作者，我想浏览可套用的工作流/链路预设（若已有导出包或画布片段元数据），以便复用成熟链路结构。
18. 作为创作者，我想将链路预设一键套到当前画布（生成节点骨架 + 合理默认连线，不覆盖未选中区域），以便快速搭台。
19. 作为创作者，我想在套用前预览将创建/修改哪些节点，以便避免误伤现有图。
20. 作为创作者，我想导入/导出工作流包并与模板入口互通，以便团队间共享。
21. 作为创作者，我想在中英文界面下看到模板名称与场景的本地化文案（若资源存在），以便双语工作。

### C. 节点运行状态联动（M3）

22. 作为创作者，我想在节点头看到统一的运行状态徽章（排队/运行/完成/失败），以便扫一眼可知进度。
23. 作为创作者，我想在级联模式下看到轮次或序号标注，以便区分批量中的第几次。
24. 作为创作者，我想让连线样式与节点状态同源更新，以便不会出现「节点已失败但边仍在跑」的不一致。
25. 作为创作者，我想在取消选中节点后仍看到状态继续更新（画布级订阅，不依赖 Inspector 挂载），以便盯整图。
26. 作为创作者，我想在保存/重开画布后不把瞬时运行态当成持久业务数据污染文件（只保留产品规定的可持久字段），以便画布 JSON 干净。
27. 作为创作者，我想通过状态总线让追踪面板、徽章、Composer 按钮禁用态共用同一投影，以便 UI 不打架。

### D. V2 能力进入 Legacy：客户端地基（M4）

28. 作为创作者，我不想关心 `/api` 与 `/api/v2` 的差异，只想功能可用，以便降低心智负担。
29. 作为维护者，我想让 Legacy 所有 v2 调用走唯一客户端，以便错误码、时间戳（Epoch 毫秒）、分页与幂等键一致。
30. 作为维护者，我想在网络/业务错误时得到归一化问题对象（code/message/retryable），以便 UI 统一 Toast 与重试。

### E. Agent Center 与 Dock（M5）

31. 作为创作者，我想从主导航或「更多设置」进入 Agent 管理区，以便配置执行环境而不离开 Legacy 壳。
32. 作为创作者，我想创建/编辑/删除 Runtime，执行 Probe 并看到成功或结构化失败原因，以便确认本机 CLI/端点可用。
33. 作为创作者，我想启用或禁用 Runtime，以便临时下线不可用环境。
34. 作为创作者，我想创建/编辑/复制/启停 Agent，并绑定 Runtime，以便定义执行者。
35. 作为创作者，我想发现内置 Skill、从 ZIP 或本地路径导入 Skill，查看校验结果与版本，以便扩展能力。
36. 作为创作者，我想启用/禁用 Skill 并将其绑定到 Agent，以便组合能力。
37. 作为创作者，我想对 Agent 或 Skill 发起测试运行（按后端契约），以便验证配置。
38. 作为创作者，我想在 Tasks 列表按状态筛选、查看详情、取消或重试任务，以便运维个人任务。
39. 作为创作者，我想打开全局 Agent Dock，选择 Agent/Skill、输入指令、附加资产或画布选中上下文，以便提交真实任务。
40. 作为创作者，我想在 Dock 中看到任务阶段/事件流（轮询即可），以便观察执行过程。
41. 作为创作者，我想取消运行中的 Dock 任务并立刻看到状态反馈，以便止损。
42. 作为创作者，我想把任务文本/JSON 结果下载或保存进资产库，以便留存成果。
43. 作为创作者，我想从素材详情「使用 Agent」打开 Dock 并带上该资产上下文，以便对素材直接提问或处理。
44. 作为创作者，我想在无 Agent/Runtime 时看到空状态并跳转配置引导，以便不被静默失败。

### F. Agent Task 画布节点（M6）

45. 作为创作者，我想在 Smart Canvas 添加 Agent 任务节点，以便把 Agent 编进视觉工作流。
46. 作为创作者，我想在节点上选择 Agent、可选 Skill、填写说明，以便配置单次任务。
47. 作为创作者，我想连接上游上下文/资产口，使提交时自动带上引用（asset 优先带 version），以便减少手工贴链接。
48. 作为创作者，我想执行节点任务并只在节点上保存 Task ID、短摘要与有界历史，以便画布不被日志撑爆。
49. 作为创作者，我想在节点上看到与全局一致的运行状态芯片，即使取消选中也继续刷新，以便盯多节点。
50. 作为创作者，我想点击「查看结果」打开 Dock 并定位到该 Task，以便阅读完整事件。
51. 作为创作者，我想修改说明后重跑生成新 Task，同时保留旧 Task 历史引用，以便对比迭代。
52. 作为创作者，我想在未配置 Agent 时看到引导而非难懂报错，以便完成首次配置。

### G. 资产 V2 桥接（M7）

53. 作为创作者，我想在现有素材库页面继续工作，但享受版本列表与回收站，以便不学两套库。
54. 作为创作者，我想上传/导入时写入 Asset V2（或桥接同步），以便新能力有数据。
55. 作为创作者，我想按标签、Collection、类型搜索筛选资产，以便组织素材。
56. 作为创作者，我想删除资产进回收站并恢复，以便防误删。
57. 作为创作者，我想将资产拖入 Smart Canvas 时引用明确的 AssetVersion，以便生成与 Agent 上下文可追溯。
58. 作为创作者，我想把生成结果一键/自动入库为 Asset，以便闭环。
59. 作为创作者，我想在旧库数据仍在时平滑过渡（只读旧数据或一次性可见迁移提示），以便不丢历史素材。

### H. 统一任务架（M8）

60. 作为创作者，我想在 Legacy 壳内打开 Task Shelf，查看图/视频/Comfy 等任务的排队与终态，以便集中盯进度。
61. 作为创作者，我想取消或重试可重试任务，以便处理失败。
62. 作为创作者，我想从任务跳到相关画布节点（若有绑定），以便回到上下文。
63. 作为创作者，我想在未挂载 v2 任务的旧生成路径上仍能用原有节点内状态，以便渐进迁移不中断。

### I. ESM 深焊与体验基线（M9）

64. 作为创作者，我想平移/缩放画布依然流畅，以便大图操作不卡。
65. 作为维护者，我想让选中态、视口变换、连线增量绘制优先走 State Store / Render Engine，以便增强功能不再复制第三套状态。
66. 作为维护者，我想保持零构建工具与 FastAPI 直托 `static/`，以便部署与热改不变。
67. 作为维护者，我想在过渡期保留必要的 `window` 兼容钩子，以便未迁完的内联回调不炸。

### J. 平台缺口（M10）

68. 作为创作者，我想在素材 Avatar 认证中使用更多已后端支持的平台（不仅限当前白名单），以便多平台视频引用。
69. 作为创作者，我想在尚不支持的平台上看到明确「待接入」而不是静默失败，以便知道边界。
70. 作为创作者，我想在设置页看到 Codex / Gemini / 即梦等 CLI runtime-capabilities 探测结果，以便配置前知道本机是否就绪。
71. 作为创作者，我想在深浅色主题与现有 design-system Token 下使用上述所有新 UI，以便视觉一致。
72. 作为创作者，我想在中英文切换下看到新面板与 Agent 文案的 i18n 键，以便双语可用。

### K. 质量、回退与发布

73. 作为创作者，我想在增强功能失败时得到 Toast/面板内错误而不是白屏，以便继续工作。
74. 作为创作者，我想在 v3 未覆盖或回归时仍能使用原有 Smart Canvas 生成与旧 `/api/*` 路径，以便主路径不因 v2 故障全灭。
75. 作为创作者，我想要一份 v3 验收清单（级联、模板、Agent、资产桥），以便发布前自测。
76. 作为维护者，我想让 Studio V2 React 工程保持可构建但不阻挡 Legacy 发布，以便需要时对照契约。

## 实现决策

### 总体架构

- **产品壳**：Legacy Frontend 为唯一主推 UI；Smart Canvas 为画布主战场。
- **Studio V2**：`studio-v2/` 与已实现 `/api/v2` **保留**；本 PRD **不**要求继续 F17 产品化发布为默认入口。React 实现可作为 M4–M8 的契约与 UX 参考，禁止再复制第三套 Task 创建协议。
- **ADR-0002**：继续 Native ESM、零构建、FastAPI 托管 `static/`；样式优先收口 `design-system.css`；禁止非法逗号连接的 `cursor` 多关键字写法。
- **ADR-001 关系**：后端「增量 `/api/v2`」继续有效；「绿地 React 替换旧 UI」对本 PRD **降级为非目标**。若文档冲突，**以本 PRD + ADR-0002 为准**（产品壳），API 形状仍以 v2 契约与已实现后端为准。
- **main.py**：禁止继续堆业务；v2 已在 `API/v2/`。本 PRD 默认 **不改后端契约**，仅当桥接发现缺口时以最小补丁进 `API/v2/`。
- **单文件纪律**：新逻辑优先进 `static/js/modules/**` 深模块；避免继续膨胀 `smart-canvas.js` 热路径。兼容层可薄包装调用模块。

### 模块划分（深模块）

#### M1 Cascade Run Tracker

- 从 Smart Canvas 抽出级联图构建、轮次调度、停止、并发上限、边状态。
- **对外接口（概念）**：`canRun(tail)`、`start(tail, opts)`、`stop(loopId?)`、`getProjection()`、`subscribe(listener)`。
- UI：追踪面板（列表+状态+错误摘要+停止）；复用现有 Composer 级联按钮与循环节点入口，不发明第二套启动语义。
- 投影字段包含：runId、loopId、nodeStates、edgeStates、roundIndex、errors、stopping。
- 保持现有行为：级联中允许其它节点单独跑；Comfy 并发受实例数约束；减少动效时关闭边动画。

#### M2 Workflow & Prompt Template Hub

- 统一「模板中心」心智：提示词模板 + 工作流/链路套用入口可同壳不同 Tab。
- **对外接口（概念）**：`listTemplates(filter)`、`applyToNode(nodeId, templateId)`、`saveUserTemplate(input)`、`applyChainPreset(presetId, anchor)`、`previewChainPreset(...)`。
- 不新建平行提示词后端，优先复用现有模板 API/本地数据结构；链路预设可先基于现有工作流导入导出能力产品化。
- 套用画布结构必须可预览、可撤销（纳入现有 Undo 或等价快照）。

#### M3 Node Run Status Bus

- 唯一运行态投影源；徽章、连线 cascade class、追踪面板、按钮 disable 只读总线。
- **对外接口（概念）**：`setStatus(nodeId, statusPatch)`、`clearEphemeral()`、`snapshot()`、`subscribe`。
- 瞬时态（running/queued）默认不持久化进画布保存；允许持久的仅产品已有字段（若有）。
- 与 M1 集成：级联状态写入总线，禁止 UI 各写各的 `node.runStatus`。

#### M4 V2 API Client（Legacy）

- Legacy 内 **唯一** `/api/v2` 访问点（Native ESM 模块）。
- 覆盖：Agent runtimes/profiles/skills/sessions/tasks/events、Assets ingest/list/trash、Generation tasks（M8 用）。
- 约定：Epoch 毫秒、problem+json 错误归一、FormData 不硬塞 JSON Content-Type、长任务 timeout、Idempotency-Key 创建任务。
- 禁止页面直接 `fetch('/api/v2/...')`。

#### M5 Agent Center + Dock（Legacy UI）

- 页面：Agents / Skills / Runtimes / Tasks 四区（可用 Tab 或子路由式 hash，贴合现有 `index.html` iframe 导航习惯）。
- Dock：全局浮层；入口含 TopBar/工具区、画布选中上下文、资产「使用 Agent」、Center 测试。
- 执行路径：`createSession` → `createTask` → events 轮询 → cancel/retry；结果保存走资产 ingest 或本地下载（与 V2 F14 语义对齐：无独立 Artifact 表则不造半套）。
- Runtime PATCH 不可改 executable_path/endpoint_url（与后端一致，UI 禁用）。
- 空态/错误态复用 design-system 与现有 Toast 模式。

#### M6 Agent Task Smart Node

- Smart Canvas 节点类型：`smart-agent-task`（名称可最终定稿，须进领域词）。
- Config 只存引用：`agent_profile_id`、`skill_id?`、`instruction`、`active_task_id`、`latest_successful_task_id`、`session_id?`、`result_summary?`（短）、`task_history[]`（有界）。
- 禁止节点内存 messages/steps 全文。
- 执行必须走 M4/M5 同一 Task 创建，禁止第三套协议。
- 画布级 poller 刷新状态（不依赖节点选中）。
- 「查看结果」→ Dock `openDock({ activeTaskId, sessionId, ... })`。
- 端口：上下文/资产入、文本出（出边消费可作为增强，MVP 可先声明端口 + summary，完整下游消费可列 follow-up）。

#### M7 Asset V2 Bridge

- 旧素材库 UI 为壳，数据逐步以 V2 为准；提供 Bridge：list/ingest/trash/restore/version/toCanvasRef。
- 拖入画布：节点持 `asset_version_id`（或等价稳定引用），不要只持易变 URL。
- 旧 `asset_library.json`：允许只读兼容或迁移提示；禁止无说明的静默双写分叉。
- Purge/Hard reference 行为遵循现有 v2 后端（冲突要可读）。

#### M8 Generation Task Shelf

- 轻量任务架 UI + M4 generation-tasks API。
- 旧节点生成路径可继续直打 `/api/*`；新挂载点自愿写入 task id 到节点 config 引用。
- 不强制 SSE；轮询即可。
- 不阻塞 M5/M6 验收。

#### M9 ESM Deep Wire

- 目标：选中、视口 transform、连线增量、节点销毁清理走已有模块；EventBus 事件名稳定文档化。
- 采用绞杀者路线：先读路径双写校验，再切写路径，最后删重复逻辑。
- 保持 `window.SmartCanvasModules` 兼容导出直至调用方迁完。

#### M10 Platform Gaps

- Avatar：扩展支持平台与后端白名单同步；不支持则明确「待接入」。
- 设置页：聚合 runtime-capabilities（CLI 探测）只读展示 + 链到 Agent Runtime 配置。
- 所有新 UI 走 design-system Token 与 i18n 键。

### UI / 交互约束

- 语义色与动效遵循现有 `design-system.css`（Spring 曲线、毛玻璃、紧凑节点）。
- 动效优先 transform/opacity；尊重减少动效。
- 新面板避免巨型行内 style（动态坐标除外）。
- 导航：优先嵌入现有壳，不新增第二套主页框架。

### API 合约

- 只消费已实现 v2：Agent B6–B8、Asset B5、Generation tasks、Projects/Canvases（若桥需要）。
- Task 创建：201 新建 / 200 幂等复用；事件 cursor 轮询。
- 时间：后端 Epoch 毫秒，UI 格式化。
- 若契约不足：先记缺口，最小后端补丁；禁止前端猜测字段。

### 数据与兼容

- 画布文件：Agent 节点 config 向前兼容（未知字段保留）。
- 不删除旧 `/api/*` 生成路径作为回退。
- `data/studio-v2/studio.db` 继续为 v2 元数据源；素材文件目录策略不变。

## 测试决策

### 何为好测试

- 只测 **外部行为与纯函数契约**（输入→输出、状态机迁移、错误码归一），不测 DOM 结构、CSS、Lucide 图标。
- 测试必须在业务规则变更时失败；禁止快照一整页 HTML。
- 不依赖真实外网 LLM；Agent 调度可用后端已有 FakeAdapter/测试开关或纯前端 fixture。

### 本 PRD 必测模块（已确认）

| 模块 | 测什么 | 建议形式 |
|------|--------|----------|
| **M1** | `canRun` 边界；图构建边集合；轮次/停止标志；并发 limit；projection 与边状态推导 | 纯 JS 单测（Node 或现有前端测跑器） |
| **M3** | status patch 合并；瞬时态不进入 persist snapshot；多订阅者通知；clearEphemeral | 纯 JS 单测 |
| **M4** | URL 拼接；problem 归一；Idempotency 头；FormData 不强制 JSON CT；错误 retryable 映射 | 纯 JS + fetch mock |
| **M6 config** | parse/validate/canSubmit；submit 后 patch；终态 patch；history 有界；换 Agent 清 skill；contextRefs 从边推导 | 纯 JS 单测（对齐 V2 agentTaskNode 语义） |

### 明确本阶段不强制自动化

- M2/M5/M7/M8/M9/M10 的 UI 交互：以 **手测/冒烟清单** 验收。
- 真机 CLI Runtime E2E：文档化步骤，不挡 PR 合并（标注环境依赖）。

### 先例

- 后端：`tests/test_v2_agent_*.py`、`tests/test_v2_generation_tasks.py`（契约与状态机）。
- 前端参考：`studio-v2` 内 agentTask/dock 纯函数测（可移植语义，不强制引入 React 测试栈到 Legacy）。
- Legacy 若无现成跑器：允许最小 `node --test` 或现有脚本目录，放在模块旁 `__tests__` 或 `static/js/modules/**/test`。

### 冒烟清单（发布门禁，手测）

1. Smart Canvas：级联启动 → 面板进度 → 停止 → 失败摘要。  
2. 模板：套用提示词 → 保存我的模板 → 再套用。  
3. Agent：Runtime Probe → 建 Agent → Dock 执行 → 取消 → 结果保存/下载。  
4. 画布 Agent 节点：执行 → 芯片更新（取消选中仍更新）→ 查看结果打开 Dock → 重跑历史保留。  
5. 资产：上传/入库 → 拖入画布带 version 引用（M7 交付后）。  
6. 回归：旧单节点生成、Comfy、画布保存重开、光标在空白处可见。

## 超出范围

- 将 Studio V2 React 设为默认主入口或卸载 Legacy。
- RunningHub / Midjourney **新**产品线专项（旧节点已有能力保持，不做新平台包）。
- 独立 Conversation 页、提示词库企业级治理、Skill Marketplace。
- 完整 Event Hub、GenerationJob Attempt/Fallback 平台、Blob GC、完整 Provenance 图谱。
- Artifact 表与 Diff/Apply/Revert；agent-task 完整 autoRun/inputMapping 编排语言。
- 多租户/账号体系；多 Agent 编排；任意脚本无隔离执行。
- 重写 `main.py` 巨型拆分（仅允许 v2 最小缺口补丁）。
- 为 v3 引入 Webpack/Vite 作为 Legacy 必选构建链（与 ADR-0002 冲突）。

## 进一步说明

### 索引文档

| 用途 | 文档 |
|------|------|
| 本阶段架构 | `docs/adr/0002-legacy-frontend-native-esm-refactoring.md`、`CONTEXT.md` |
| v2 API 契约参考 | `docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`、`docs/studio-v2-api-v2-p0-contract-and-openapi-design.md` |
| Agent UX 参考 | `docs/studio-v2-agent-skill-runtime-and-management-design.md` §14–15 |
| 资产参考 | `docs/studio-v2-asset-artifact-version-reference-and-provenance-design.md` |
| 能力盘点 | `docs/current-backend-api-capability-inventory.md` |
| 前序交接 | `.handoff/handoff-20260806-202710.md` 及同日前序 handoff |
| V2 实现对照 | `.scratch/studio-v2-mvp/`（只读参考，非本 feature 任务源） |

### 建议 issue 切片（发布 PRD 后由 to-issues 细化）

1. M1 Cascade Tracker 纯逻辑 + 面板  
2. M3 Status Bus + 徽章/连线接线  
3. M2 Template Hub 增强  
4. M4 V2 Client  
5. M5 Agent Center  
6. M5 Agent Dock  
7. M6 Agent Task 节点  
8. M7 Asset Bridge  
9. M8 Task Shelf  
10. M9 ESM Deep Wire（可拆多条）  
11. M10 Avatar + settings capabilities  
12. 冒烟与手测文档  

### 验收总标准

- P0（M1–M6 + M4）：创作者在 **仅打开 Legacy** 时，完成级联追踪、模板增强、Agent 真执行与画布 Agent 节点闭环。  
- P1（M7）：素材库与画布引用版本化不回归旧主路径。  
- P2（M8–M10）：任务架、ESM 深焊、平台缺口按切片独立验收，不阻塞 P0 宣布可用。  
- 自动化：M1/M3/M4/M6 纯逻辑测试通过。  
- 视觉：新 UI 不破坏 design-system 与光标守护约定。

### 风险

- `smart-canvas.js` 耦合高：M1/M3 抽取时必须行为对比（同图级联前后状态一致）。  
- 旧资产与 V2 双模型：M7 需明确源真相，避免双写腐蚀。  
- Agent 真执行依赖本机 CLI：验收区分「UI 闭环 + Fake/Probe」与「真机 CLI」。  
- 范围膨胀：禁止借 v3 重开 React 主壳或 Event Hub 大平台。

---

## 评论

- 2026-08-06：由对话盘点（handoff 全量 + 代码对照）经 to-prd 生成；模块 M1–M10 与测试范围（M1/M3/M4/M6）已经用户确认。
