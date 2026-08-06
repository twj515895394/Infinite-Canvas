# Studio V2 第一版使用指南

> 适用：Infinite-Canvas Studio V2 个人版 MVP  
> 日期：2026-08-06  
> 范围：启动、主流程、备份、旧版回退、生产静态托管、常见问题

---

## 1. 这是什么

Studio V2 是全新的 React 创作界面：

- 项目 / 画布（React Flow）
- 图片 / 视频 / ComfyUI 生成
- 资产库
- Agent / Skill / Runtime 管理与真实执行（Dock + agent-task 节点）

旧前端 `static/` 仍保留，可作为过渡期回退入口。新旧共享同一 FastAPI 后端（默认端口 **3888**）。

---

## 2. 本地开发启动

### 2.0 一键启动（推荐，Windows）

仓库根目录双击或运行：

```bat
run-studio-v2.bat
```

| 服务 | 端口 | 地址 |
|---|---|---|
| 后端 FastAPI（含旧 UI） | **3888** | `http://127.0.0.1:3888/` |
| Studio V2 新 UI（Vite） | **13888** | `http://127.0.0.1:13888/` |

- 新 UI 使用 **13888**（非 5173/3000），降低与其它前端工程冲突概率；`strictPort` 占用即失败。
- 脚本会：复用已占用的 3888 后端、缺依赖时 `npm install`、新开两个控制台窗口、打开浏览器到 13888。
- 旧入口 `run.bat` 仍只起后端并打开旧 UI，行为不变。

### 2.1 后端（手动）

```bat
.venv\Scripts\python.exe main.py
```

- 监听：`http://127.0.0.1:3888`
- V2 API：`/api/v2/*`
- 旧 API：`/api/*`

### 2.2 前端（手动）

```bat
cd studio-v2
npm install
npm run dev
```

- 打开：`http://127.0.0.1:13888/`
- Vite 将 `/api`、`/ws` 代理到 3888
- SPA 路由 `/assets` 不会被后端静态目录劫持

### 2.3 可选：OpenAI 兼容 LLM（生成测试）

| 项 | 示例 |
|---|---|
| Base URL | `http://localhost:8317` |
| API Key | 本地自备 |
| 模型 | 以该服务 `/v1/models` 为准 |

在 **设置 → API Provider** 中新增 / 编辑 Provider 并测试连接。

### 2.4 Agent Runtime（真执行）

本机已安装的 CLI 可在 **Agent → Runtimes** 创建并 Probe：

- Claude CLI / Claude Code
- Pi
- omp（oh-my-pi）

Probe 成功后，在 **Agents** 绑定 Runtime（可选 Skill），即可从 Dock 或画布 agent-task 节点执行。

---

## 3. 主流程（冒烟清单）

按顺序走通即视为第一版主链路可用：

1. **启动**  
   后端 3888 + 前端 **13888** 均无报错（推荐 `run-studio-v2.bat`）。
2. **项目**  
   打开「项目」→ 新建项目 → 进入项目详情。
3. **画布**  
   新建画布 → 添加节点（提示词 / 图片生成 / 素材 / Agent 任务）→ 连线 → 自动保存 → 刷新后内容仍在。
4. **生成**  
   配置 Provider → 图片或视频节点提交 → Task Shelf 看到运行/成功/失败 → 失败可重试。
5. **资产**  
   资产库上传/导入 → 预览 → 拖入画布 → 生成结果「保存到资产库」。
6. **Agent**  
   Runtime Probe → 创建 Agent →（可选）扫描/导入 Skill 并绑定 → 打开 Agent Dock 提交任务 → 查看状态/结果/取消。  
   或在画布添加「Agent 任务」节点执行，点「查看结果」打开 Dock。
7. **回退**  
   设置页「打开旧版前端」可用。

更细的 F15 agent-task 手测：

1. 工具条出现「Agent 任务」  
2. 无 Agent 时 Inspector 空状态可跳转 Center  
3. 执行后节点状态 chip 更新（取消选中后仍更新）  
4. 「查看结果」Dock 的 `activeTaskId` 正确  
5. 素材节点连到 `assets` 口后，提交含 attachment version  

---

## 4. 数据目录与备份

重大升级、清盘或换机前：**先停后端**，再整目录复制：

| 路径 | 内容 |
|---|---|
| `data/` | `projects.json`、Provider 配置、`studio-v2/studio.db`（画布/资产/Agent/Task） |
| `assets/` | 上传与入库素材文件 |
| `output/` | 生成输出（若改过「存储目录」，以设置为准） |
| `API/.env` | 本地密钥（**勿提交 Git**） |

恢复：覆盖同名路径后重新启动后端。  
设置页也有「数据目录备份」提示。

---

## 5. 旧版回退

- **设置 → 旧版回退 → 打开旧版前端**
- 开发态（13888）：跳到 `http://127.0.0.1:3888/`
- 生产同域托管时：跳到站点根路径 `/`（旧 `index.html`）

延后功能仍走旧 UI：RunningHub、Midjourney 专项、独立对话、提示词库。

---

## 6. 生产静态托管（个人本机）

目标：只起一个后端进程，同时提供 API + Studio V2 UI。

### 6.1 构建前端

```bat
cd studio-v2
npm ci
npm run build
```

产物目录：`studio-v2/dist/`（含 `index.html` 与 hashed assets）。

### 6.2 推荐部署方式（过渡期并行）

个人版 MVP **不强制**改 `main.py` 默认根路由（旧 UI 仍可从 `/` 进入）。推荐：

**方案 A — 反向代理（推荐）**

用 Caddy / nginx / 系统反向代理：

- `/api`、`/ws`、`/assets/*`（媒体文件）、`/output`、`/static` → FastAPI `3888`
- `/app/*` 或独立子域 → `studio-v2/dist` 静态文件，`try_files` 回退 `index.html`

**方案 B — 后端挂载 dist（可选）**

在确认不再需要根路径旧 UI 作为默认入口后，可将 `studio-v2/dist` 挂到例如 `/app`：

```python
# 示意：勿直接堆进 main.py 业务逻辑；可放独立启动模块
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

DIST = BASE_DIR / "studio-v2" / "dist"
app.mount("/app/assets", StaticFiles(directory=DIST / "assets"), name="studio-v2-assets")

@app.get("/app")
@app.get("/app/{path:path}")
async def studio_v2_spa(path: str = ""):
    candidate = DIST / path
    if path and candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(DIST / "index.html")
```

注意：

- 现有 `app.mount("/assets", …)` 是**媒体文件目录**，与 SPA 路由 `/assets` 冲突；生产应用方案 A 的路径拆分，或把 V2 SPA 挂在 `/app` 前缀下（方案 B）。
- Vite `base` 若使用子路径，构建前设置 `base: '/app/'` 并重新 build。
- 开发期继续用 13888 + proxy，不要依赖生产挂载调试 HMR。

### 6.3 健康检查

- `GET /api/v2/bootstrap` 返回 200
- 浏览器打开 V2 入口后，项目列表可加载
- 设置页旧版回退仍能打开旧 UI

---

## 7. 常见问题

### 页面空白 / 行为怪异

多文件改动后 Vite HMR 可能陈旧。重启 `npm run dev`，必要时硬刷新。

### API 失败 Toast

全局 Toast 会提示加载/操作失败；页面内仍有「重试」。表单字段错误走行内校验，不弹 Toast。

### 画布保存冲突

多人同时写同一画布（或旧标签页）可能 409。按提示重新加载后再编辑。

### Agent Probe / 执行失败

1. Runtime 可执行路径是否正确  
2. CLI 是否已登录  
3. 后端控制台日志  
4. Tasks Tab 查看失败详情  

### 测试命令

```bat
cd studio-v2
npx vitest run
npm run build

.venv\Scripts\python.exe -m pytest --ignore=tests/test_canvas_log_cleanup.py
```

`test_canvas_log_cleanup.py` 为历史陈旧测试，可忽略。

---

## 8. 明确延后（不影响第一版验收）

- RunningHub 新 UI  
- Midjourney 新 UI  
- 独立对话页  
- 提示词库  
- 完整 Event Hub / Blob GC / 多租户  

---

## 9. 相关文档

| 文档 | 用途 |
|---|---|
| `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md` | MVP 范围与验收 |
| `docs/adr-001-studio-v2-greenfield-frontend-and-additive-backend.md` | 新旧并行架构 |
| `docs/README.md` | 设计文档索引 |
| `.scratch/studio-v2-mvp/issues/24-f16-stability-polish.md` | 本切片验收项 |
