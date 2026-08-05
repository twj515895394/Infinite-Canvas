# Infinite-Canvas 现有后端 API 能力盘点与复用评估

> 文档状态：现状基线（As-Is Baseline）  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 代码基线：`main` 分支，提交 `307a8c25ddd19a38c79f8f146343227139ccbd03`  
> 核心后端文件：`main.py`，Blob SHA `c2e9e1b4896bedd548c07cf58f9c501ef8bf3172`

---

## 1. 文档目的

本文档从当前 FastAPI 后端代码出发，梳理 Infinite-Canvas 已经具备的后端能力、现有 API 分组、主要请求与返回形态，以及这些接口对 Studio V2 新前端的复用价值。

本文档回答三个问题：

1. 当前后端已经能做什么。
2. 哪些现有 API 可以直接被 Studio V2 使用。
3. 哪些 API 虽然存在，但只适合作为 Legacy 或底层实现，不应直接成为新前端的长期 Contract。

本文档不替代运行时 FastAPI 自动生成的 `/docs` 和 `/openapi.json`。运行时 OpenAPI 用于查看精确请求字段；本文档用于架构分析、能力分类和前端重构决策。

---

## 2. 评估标记

| 标记 | 含义 |
|---|---|
| A：直接复用 | 接口边界较清晰，Studio V2 可以直接使用或只需补充响应模型 |
| B：适配复用 | 底层能力可用，但建议通过 `/api/v2` Adapter/BFF 包装后再给新前端使用 |
| C：Legacy 保留 | 为现有页面或特定供应商流程服务，不建议成为 Studio V2 的公共接口 |
| D：管理接口 | 配置、诊断、更新类能力，应与创作工作区接口隔离 |

---

## 3. 当前后端总体形态

当前后端基于 Python + FastAPI，主要能力集中在 `main.py` 中，包含：

- REST API。
- WebSocket。
- Server-Sent Events。
- 文件上传、下载和媒体预览代理。
- 本地文件系统与 JSON 文件持久化。
- 项目与画布管理。
- 素材库和提示词库。
- 图片、视频、LLM、ComfyUI、RunningHub、即梦和 Midjourney 等生成能力。
- 上游 API Provider 配置与连通性检测。
- Codex CLI、Gemini/Antigravity CLI 和即梦 CLI 的状态检测与帮助命令。
- 对话记录与简单 Agent Chat。
- 应用更新、备份和回滚。

当前后端不是“没有能力”，而是大量能力直接堆叠在一个应用文件中，接口风格、任务状态和响应格式尚未形成统一领域层。

---

## 4. 横切能力现状

## 4.1 OpenAPI

FastAPI 未关闭默认文档，因此运行时通常可访问：

```text
/docs
/openapi.json
```

现状问题：

- 很多接口没有声明 `response_model`。
- 部分请求直接使用 `Dict[str, Any]` 或裸 `dict`。
- 一些响应把上游 `raw` 数据直接返回。
- 相似任务的状态字段和错误结构不完全一致。

因此 OpenAPI 能反映路由与请求模型，但还不能直接作为稳定的 Studio V2 SDK Contract。

## 4.2 CORS

当前配置允许任意来源、任意方法和任意 Header。开发环境方便，但生产环境需要按部署地址收紧。

## 4.3 请求校验

存在 FastAPI `RequestValidationError` 自定义处理，返回：

```json
{
  "detail": "用户可读错误",
  "errors": []
}
```

这是可复用能力，但 Studio V2 仍需要统一业务错误结构和错误码。

## 4.4 身份与权限

当前没有完整的用户认证与项目权限体系。

部分对话接口通过：

```text
X-User-Id
```

区分用户；部分本地文件修改接口使用同源校验。该机制不等于正式的登录、授权和项目权限控制。

## 4.5 持久化

当前主要使用：

- JSON 文件。
- 本地目录。
- 进程内 Queue、Lock 和任务 Map。

优点是部署简单；主要限制是：

- 部分异步任务在服务重启后会丢失。
- 缺少跨实体查询和引用完整性。
- 不适合后续复杂的项目、镜头、资产版本和 Agent Task 关系。

## 4.6 实时通信

当前 WebSocket：

```text
WS /ws/stats?client_id={clientId}
```

已支持或广播的事件包括：

- `stats`
- `pong`
- `new_image`
- `canvas_updated`
- `asset_library_updated`

现有 WebSocket 可继续服务 Legacy 页面，但缺少：

- 项目或任务级订阅。
- 事件 ID 和严格递增序号。
- 断线重连后的事件补拉。
- Agent 流式消息、Tool Call、权限请求等标准事件。
- 生成任务统一状态事件。

## 4.7 SSE

当前聊天流式接口使用 SSE：

```text
POST /api/chat/stream
```

SSE 可继续用于单次文本流，但 Studio V2 的多任务中心更适合统一到可恢复的事件通道。

---

## 5. 当前能力总览

| 能力域 | 当前能力 | 结论 |
|---|---|---|
| 应用信息与更新 | 版本、连通性、更新、备份、回滚 | 完整，属于管理域 |
| 文件与媒体 | 上传、下载、预览、格式转换、存储目录 | 较完整，可作为底层媒体服务 |
| 本地素材目录 | 文件夹、移动、删除、Caption、智能分类 | 较完整，适合底层导入管理 |
| 共享目录 | 注册目录、树浏览、文件读取、导入 | 可用，但需权限和安全边界 |
| 资产库 | 库、分类、条目、批量移动/删除/分类、工作流资产 | 功能较多，但数据模型偏文件库 |
| 提示词库 | 库、分类、条目 CRUD | 可直接复用一部分 |
| 项目 | 列表、创建、更新、删除 | 仅基础容器能力 |
| 画布 | CRUD、回收站、快照保存、版本冲突检测、广播 | 可用，但保存粒度过粗 |
| 供应商配置 | Provider CRUD、测试、拉模型 | 较完整，属于管理域 |
| 图片生成 | 多供应商同步/异步接口 | 能力强，但入口分散 |
| 视频生成 | Canvas Video、即梦、RunningHub 等 | 能力存在，但状态不统一 |
| ComfyUI | 实例配置、上传、工作流、运行、任务查询 | 可作为生成执行后端 |
| RunningHub | 应用/工作流信息、提交、查询、上传 | 完整的供应商专用适配 |
| 对话 | 会话 CRUD、普通聊天、简单 Agent Chat、流式聊天 | 可用于 Legacy Chat，不等同 Agent Gateway |
| Agent CLI | Codex/Gemini CLI 状态和帮助 | 仅检测与辅助，不具备 Session/Task/Event API |
| 历史和队列 | 历史读取/删除、简单队列位置 | 不足以支持统一任务中心 |

---

## 6. API 能力目录

## 6.1 应用信息、更新与诊断

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/app-info` | 当前版本、仓库与应用信息 | D |
| GET | `/api/check-update` | 检查 GitHub/ModelScope 更新 | D |
| GET | `/api/update-connectivity` | 批量检测更新相关网络目标 | D |
| GET | `/api/update-connectivity/probe` | 按名称检测单个网络目标 | D |
| POST | `/api/update-from-github` | 从指定更新源更新应用 | D |
| GET | `/api/update-backups` | 查询更新备份 | D |
| POST | `/api/update-rollback` | 回滚指定备份 | D |

Studio V2 建议：保留在 Settings/Admin 页面，不混入创作域 API Client。

---

## 6.2 存储、文件和媒体代理

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/storage-settings` | 获取上传、生成、本地素材目录配置 | D/B |
| PATCH | `/api/storage-settings` | 修改存储目录配置 | D |
| GET | `/api/storage-files` | 按 kind 分页列出存储文件 | A |
| GET | `/api/storage-files/{kind}/{rel_path:path}` | 读取存储文件 | A |
| POST | `/api/storage-files/delete` | 批量删除存储文件 | B |
| GET | `/api/media-preview` | 为图片或视频生成缓存预览图 | A |
| GET | `/api/image-jpeg` | 转换图片为 JPEG，可按宽度缩放 | A |
| GET | `/api/view` | 从 ComfyUI 或本地查找并返回媒体 | C/B |
| GET | `/api/download-output` | 本地或远端媒体代理下载/内联预览 | A |
| POST | `/api/upload` | 上传文件并同步到可用 ComfyUI 后端 | C/B |
| POST | `/api/ai/upload` | 上传图片、视频、音频参考文件 | A |
| POST | `/api/ai/upload-base64` | Base64 上传到本地输入目录 | C |
| POST | `/api/comfyui/upload-base64` | Base64 上传到 ComfyUI 输入目录 | C |
| GET | `/api/asset-classification-prompt` | 获取素材分类 Prompt | D/B |
| PATCH | `/api/asset-classification-prompt` | 更新素材分类 Prompt | D |

已具备的可复用能力：

- 媒体 URL 代理。
- 本地文件读取。
- 缩略图和视频帧预览。
- 上传和下载。
- 图片格式兼容。

主要缺口：

- 缺少统一 `Asset` 元数据和版本 ID。
- 文件 URL、资产 ID 和生成结果之间没有强关联。
- 删除接口缺少引用检查与回收站语义。

---

## 6.3 本地素材管理

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/local-assets` | 返回本地素材树和条目 | B |
| POST | `/api/local-assets/upload` | 上传素材到指定文件夹 | B |
| POST | `/api/local-assets/import-urls` | 从远程 URL 导入 | B |
| POST | `/api/local-assets/folders` | 创建文件夹 | B |
| PATCH | `/api/local-assets/folders` | 重命名文件夹 | B |
| PATCH | `/api/local-assets/items` | 重命名素材 | B |
| POST | `/api/local-assets/delete` | 删除素材 | B |
| POST | `/api/local-assets/move` | 批量移动素材 | B |
| POST | `/api/local-assets/caption` | 调用模型批量反推图片描述 | B |
| PATCH | `/api/local-assets/caption` | 手工保存描述 | B |
| POST | `/api/local-assets/classify` | 批量智能分类 | B |

现有接口以文件路径为主，适合继续作为底层 LocalStorageAdapter，不建议让 Studio V2 的项目、角色和镜头直接持有文件路径。

---

## 6.4 共享文件夹

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/shared-folders` | 查询已注册共享目录 | B |
| POST | `/api/shared-folders` | 注册共享目录 | D/B |
| DELETE | `/api/shared-folders/{folder_id}` | 取消注册 | D/B |
| GET | `/api/shared-folders/{folder_id}/tree` | 浏览共享目录树 | B |
| GET | `/api/shared-folders/{folder_id}/file` | 读取共享媒体文件 | B |
| POST | `/api/shared-folders/import` | 将共享文件导入资产库 | B |

风险：目录注册和文件读取属于本机高权限能力，后续应增加允许根目录、路径策略、用户权限和审计日志。

---

## 6.5 资产库

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/asset-library` | 获取完整资产库 | B |
| POST | `/api/asset-library/libraries` | 创建资产库 | B |
| PATCH | `/api/asset-library/libraries/{library_id}` | 重命名资产库 | B |
| DELETE | `/api/asset-library/libraries/{library_id}` | 删除资产库 | B |
| POST | `/api/asset-library/categories` | 创建分类 | B |
| PATCH | `/api/asset-library/categories/{category_id}` | 重命名分类 | B |
| DELETE | `/api/asset-library/categories/{category_id}` | 删除分类 | B |
| POST | `/api/asset-library/items` | 添加单个条目 | B |
| POST | `/api/asset-library/items/batch` | 批量添加条目 | B |
| PATCH | `/api/asset-library/items/{item_id}` | 重命名条目 | B |
| DELETE | `/api/asset-library/items/{item_id}` | 删除条目及本地文件 | B |
| POST | `/api/asset-library/items/delete` | 批量删除 | B |
| POST | `/api/asset-library/items/move` | 批量移动 | B |
| POST | `/api/asset-library/items/crop` | 批量裁切或生成裁切结果 | B |
| POST | `/api/asset-library/items/classify` | 批量智能分类 | B |
| POST | `/api/asset-library/items/{item_id}/register-avatar` | 注册平台 Avatar | C/B |
| POST | `/api/asset-library/items/{item_id}/avatar-status` | 查询 Avatar 状态 | C/B |
| POST | `/api/asset-library/workflows/upload` | 上传工作流资产 | B |
| POST | `/api/canvas-workflows/import` | 导入画布工作流文件 | B |
| POST | `/api/smart-canvas/group-export` | 导出智能画布分组内容 | C/B |

现有优势：

- 基础 CRUD 和批量操作比较完整。
- 已支持图片、工作流等不同资源类型。
- 已具备分类、Caption 和智能分类。

现有不足：

- `GET /api/asset-library` 返回完整库，数据量大时不适合新前端。
- 缺少标准分页、关键词搜索、标签筛选和增量同步。
- 缺少 `project_id`、`entity_type`、`entity_id` 等领域归属。
- 缺少资产版本、派生关系、引用关系和删除保护。
- 素材条目与文件系统仍高度耦合。

---

## 6.6 提示词库

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/prompt-libraries` | 获取提示词库 | A/B |
| POST | `/api/prompt-libraries` | 创建提示词库 | A/B |
| PATCH | `/api/prompt-libraries/{library_id}` | 重命名提示词库 | A/B |
| DELETE | `/api/prompt-libraries/{library_id}` | 删除提示词库 | A/B |
| POST | `/api/prompt-libraries/items` | 新增提示词 | A/B |
| PATCH | `/api/prompt-libraries/items/{item_id}` | 更新提示词 | A/B |
| DELETE | `/api/prompt-libraries/items/{item_id}` | 删除提示词 | A/B |
| POST | `/api/prompt-libraries/items/delete` | 批量删除提示词 | A/B |
| POST | `/api/prompt-libraries/categories` | 新增分类 | A/B |
| PATCH | `/api/prompt-libraries/categories/{category_id}` | 重命名分类 | A/B |
| DELETE | `/api/prompt-libraries/categories/{category_id}` | 删除分类 | A/B |

该模块是当前最容易直接接入 Studio V2 的模块之一，后续主要补充分页、搜索、版本和项目级模板即可。

---

## 6.7 项目管理

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/projects` | 查询项目列表 | A/B |
| POST | `/api/projects` | 创建项目 | A/B |
| POST | `/api/projects/{project_id}` | 更新名称和排序 | B |
| DELETE | `/api/projects/{project_id}` | 删除项目，画布移回默认项目 | B |

当前项目只是画布分组容器，不包含 AI 影视项目所需的：

- 项目 Bible。
- 剧本。
- 角色、场景、道具。
- 镜头和分镜。
- 项目级模型与风格设置。
- 项目成员或权限。
- 项目归档和版本。

---

## 6.8 画布管理

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/canvases` | 获取画布列表 | A/B |
| GET | `/api/canvases/trash` | 获取回收站画布 | A/B |
| POST | `/api/canvases` | 创建画布 | A/B |
| GET | `/api/canvases/{canvas_id}/meta` | 获取轻量元数据 | A |
| POST | `/api/canvases/{canvas_id}/meta` | 更新标题、图标等元数据 | B |
| GET | `/api/canvases/{canvas_id}` | 获取完整画布 JSON | B |
| PUT | `/api/canvases/{canvas_id}` | 保存完整节点、连接、视口、日志和设置 | B |
| POST | `/api/canvases/{canvas_id}/touch` | 刷新更新时间 | C |
| DELETE | `/api/canvases/{canvas_id}` | 软删除 | A/B |
| POST | `/api/canvases/{canvas_id}/restore` | 恢复 | A/B |
| DELETE | `/api/canvases/{canvas_id}/purge` | 永久删除 | B |
| GET | `/api/canvas-assets` | 扫描所有画布中的素材 | C/B |
| POST | `/api/canvas-assets/check` | 批量检查 URL 是否存在 | B |
| POST | `/api/canvas-assets/download` | 批量下载画布素材 | B |
| GET | `/api/smart-canvas/prompt-templates` | 获取内置提示词模板 | A/B |

当前 `CanvasSaveRequest` 包含：

```text
title
icon
nodes
connections
viewport
logs
settings
client_id
base_updated_at
```

服务端通过 `base_updated_at` 检查旧版本覆盖，并在冲突时返回 409；保存后广播 `canvas_updated`。

该能力可以作为 Legacy 兼容基础，但存在以下问题：

- 每次保存完整画布快照，节点多时 Payload 和冲突范围较大。
- 节点数据是 `Dict[str, Any]`，没有版本化 Schema。
- 节点坐标修改与节点业务数据修改使用同一个保存接口。
- 日志也被保存进画布主体。
- 缺少增量操作、批量坐标提交和服务端 revision。

---

## 6.9 对话与简单 Agent Chat

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/conversations` | 查询用户会话 | C/B |
| POST | `/api/conversations` | 创建会话 | C/B |
| GET | `/api/conversations/{conversation_id}` | 获取会话 | C/B |
| DELETE | `/api/conversations/{conversation_id}` | 删除会话 | C/B |
| POST | `/api/chat` | 普通对话或图片模式 | C |
| POST | `/api/chat/agent` | 通过一次决策执行简单 Agent 动作 | C |
| POST | `/api/chat/stream` | SSE 流式聊天 | C/B |

这些接口是 Chat 功能，不是完整 Agent Runtime 接口。当前缺少：

- Agent Profile。
- Agent Session 生命周期。
- ACP/CLI 进程映射。
- Tool Call 和 Tool Result。
- 权限请求。
- Task 重试、取消和恢复。
- Artifact 输出。
- 事件回放。

---

## 6.10 Provider、模型和 CLI 状态

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/config` | 获取公开 AI 配置 | D/B |
| GET | `/api/models` | 获取聊天、图片和视频模型列表 | A/B |
| GET | `/api/providers` | 获取公开 Provider 配置 | D/B |
| PUT | `/api/providers` | 保存 Provider 配置 | D |
| POST | `/api/providers/test-connection` | 测试连接并尝试返回模型 | D |
| POST | `/api/providers/probe-async` | 探测异步任务协议 | D |
| POST | `/api/providers/fetch-models` | 按临时表单参数拉取模型 | D |
| GET | `/api/providers/{provider_id}/fetch-models` | 从已保存 Provider 拉取模型 | D |
| GET | `/api/codex/status` | 检测 Codex CLI 和图像辅助工具 | D/B |
| POST | `/api/codex/help` | 执行受限 Codex 帮助命令 | D |
| GET | `/api/gemini-cli/status` | 检测 Gemini/Antigravity CLI | D/B |
| POST | `/api/gemini-cli/help` | 执行受限帮助命令 | D |
| GET | `/api/jimeng/status` | 检测即梦 CLI 状态 | D/B |
| GET | `/api/jimeng/credit` | 查询额度 | D/B |
| POST | `/api/jimeng/login/start` | 启动登录流程 | D |
| GET | `/api/jimeng/login/status` | 查询登录状态 | D |
| POST | `/api/jimeng/logout` | 登出 | D |
| POST | `/api/jimeng/help` | 获取命令帮助 | D |
| POST | `/api/jimeng/query-media` | 按 submit_id 查询任务 | B/C |

现有 CLI 接口主要用于检测和配置，不足以支撑 Studio V2 Agent Dock。

---

## 6.11 图片、视频和生成任务

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| POST | `/api/online-image` | 统一入口的一部分，执行在线图片生成 | B |
| POST | `/api/image-task-query` | 查询供应商异步图片任务 | B |
| POST | `/api/canvas-image-tasks` | 创建进程内异步图片任务 | B/C |
| GET | `/api/canvas-image-tasks/{task_id}` | 查询画布图片任务 | B/C |
| POST | `/api/canvas-comfy-tasks` | 创建进程内 ComfyUI 任务 | B/C |
| GET | `/api/canvas-comfy-tasks/{task_id}` | 查询 ComfyUI 任务 | B/C |
| GET | `/api/image-params` | 根据 Provider/Model 返回图片参数定义 | A/B |
| POST | `/api/canvas-video` | 按 Provider 执行视频生成 | B |
| POST | `/api/canvas-llm` | 画布 LLM 请求 | B/C |
| POST | `/api/generate` | 本地 ComfyUI 生图与队列 | C/B |
| POST | `/generate` | ModelScope Z-Image 云端生成 | C |
| POST | `/api/ms/generate` | ModelScope 通用图片生成 | C |
| POST | `/api/angle/generate` | ModelScope 角度控制生成 | C |
| POST | `/api/angle/poll_status` | 轮询角度控制任务 | C |
| POST | `/api/smart-canvas/minimax-export` | 使用 ffmpeg 拼接导出视频 | B |

当前核心问题是同一“生成任务”有多种入口和状态模型：

- 有的接口同步等待结果。
- 有的返回 `task_id`。
- 有的返回 `submit_id`。
- 有的使用进程内 Map。
- 有的由前端直接轮询供应商专用查询接口。
- 错误字段、进度字段和结果字段不统一。

Studio V2 不应继续为每个供应商编写独立任务状态机。

---

## 6.12 Midjourney

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| POST | `/api/midjourney/submit` | 提交生成任务 | C/B |
| POST | `/api/midjourney/actions` | 执行放大、变体等操作 | C/B |
| POST | `/api/midjourney/modal` | 提交 Modal 参数 | C/B |
| GET | `/api/midjourney/tasks/{task_id}` | 查询任务 | C/B |

这是供应商专用能力，建议后续由统一 Generation Job Adapter 包装。

---

## 6.13 RunningHub

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/runninghub/app-info` | 查询 WebApp 信息 | C/B |
| POST | `/api/runninghub/submit` | 提交 WebApp 任务 | C/B |
| POST | `/api/runninghub/workflow-submit` | 提交工作流任务 | C/B |
| GET | `/api/runninghub/workflow-info` | 查询远端工作流节点信息 | C/B |
| GET | `/api/runninghub/workflows` | 查询已配置工作流 | B |
| GET | `/api/runninghub/workflows/{workflow_id:path}` | 获取本地工作流配置 | B |
| POST | `/api/runninghub/workflows/fetch` | 拉取并解析远端工作流 | B |
| PUT | `/api/runninghub/workflows/{workflow_id:path}` | 保存本地配置 | B |
| DELETE | `/api/runninghub/workflows/{workflow_id:path}` | 删除本地配置 | B |
| GET | `/api/runninghub/query` | 查询任务状态和结果 | C/B |
| POST | `/api/runninghub/upload-asset` | 上传素材到 RunningHub | C/B |

供应商适配已较完整，应保留在后端内部；新前端不应直接理解 `webappId`、RunningHub code 或钱包查询细节。

---

## 6.14 ComfyUI 实例和工作流

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/comfyui/instances` | 获取 ComfyUI 实例列表 | D/B |
| PUT | `/api/comfyui/instances` | 保存实例列表 | D |
| GET | `/api/workflows` | 获取本地工作流列表 | A/B |
| GET | `/api/workflows/{name:path}` | 获取工作流 JSON 和配置 | A/B |
| POST | `/api/workflows` | 上传工作流 | B |
| PUT | `/api/workflows/{name:path}/config` | 保存字段配置 | B |
| DELETE | `/api/workflows/{name:path}` | 删除非内置工作流 | B |
| POST | `/api/workflows/{name:path}/run` | 运行工作流 | B |

这些能力可成为 Studio V2 的 Workflow Registry 和 Generation Executor 底层实现，但应补充统一工作流 ID、版本、能力声明和 Job 语义。

---

## 6.15 历史与队列

| 方法 | 路径 | 作用 | 评估 |
|---|---|---|---|
| GET | `/api/history` | 读取生成历史，可按类型过滤 | C/B |
| POST | `/api/history/delete` | 删除历史记录 | C/B |
| GET | `/api/queue_status` | 查询指定 client_id 队列位置 | C |

当前历史是结果记录，队列是简单进程内结构；二者均不能直接替代 Studio V2 的任务中心。

---

## 7. Studio V2 可直接继承的后端能力

以下能力不需要重写，只需整理接口和响应模型：

1. FastAPI 应用和静态文件托管。
2. 文件上传、下载和媒体代理。
3. 缩略图、视频帧和 JPEG 转换。
4. 本地素材目录与共享目录导入。
5. 资产库和提示词库的基础 CRUD。
6. 项目与画布的基础 CRUD。
7. 画布冲突检测和更新广播。
8. Provider 配置、连通性和模型发现。
9. ComfyUI 实例、工作流和执行能力。
10. RunningHub、即梦、Midjourney、ModelScope 等供应商适配。
11. ffmpeg 导出能力。
12. CLI 安装与登录状态检测。

---

## 8. 不应直接继承为新前端 Contract 的部分

以下能力应保留实现，但通过新接口包装：

1. 供应商专用任务提交和轮询接口。
2. `canvas-image-tasks` 和 `canvas-comfy-tasks` 的进程内任务 Map。
3. 完整画布 JSON 全量保存。
4. 完整资产库一次性返回。
5. 直接以文件路径作为业务引用。
6. `/api/chat/agent` 的简单决策模式。
7. 由前端解析上游 `raw` 响应。
8. 通过 `client_id` 查询简单队列位置。
9. 缺少资源引用检查的文件删除。

---

## 9. 当前 API 的主要结构性问题

## 9.1 接口没有版本边界

所有功能集中在 `/api` 下，Legacy 页面、管理页面和未来 Studio API 混合。

## 9.2 响应格式不统一

存在：

```text
{ success, data }
{ ok }
{ files }
{ task_id, status }
{ conversation, message }
直接数组
FileResponse
StreamingResponse
上游 raw
```

## 9.3 长任务语义不统一

图片、视频、ComfyUI、RunningHub、即梦和 Midjourney 各自维护状态。

## 9.4 领域模型不足

当前有项目和画布，但没有影视创作核心实体。

## 9.5 实时事件不可恢复

WebSocket 没有 Event Store、sequence 补拉和项目订阅。

## 9.6 数据删除缺少引用保护

资产与文件可能已被画布、镜头或生成任务引用，当前删除流程没有统一引用检查。

## 9.7 后端模块耦合

大量路由、供应商调用、文件逻辑、数据模型和任务状态集中在 `main.py`，后续新增接口应进入独立 router/service，而不是继续无限追加。

---

## 10. 现状结论

现有后端完全可以继续作为 Studio V2 的基础，不需要整体更换技术栈。

真正需要新增的是一层稳定的 Studio V2 领域 API：

```text
Studio V2 Frontend
        ↓
/api/v2 + /ws/v2/events
        ↓
Domain Services / Job Service / Agent Gateway
        ↓
现有文件、画布、资产、ComfyUI 和供应商实现
```

下一份文档《Studio V2 后端 API 能力差距与 V2 接口总体设计》将在本盘点基础上明确需要新增的领域模型、接口、事件和迁移优先级。
