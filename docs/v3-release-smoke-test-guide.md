# Legacy Frontend Enhancement v3 发布门禁与手测冒烟指南

> 版本基线：`feature/original-frontend-optimization`  
> 日期：2026-08-06  
> 状态：Ready for Release Gate

---

## 1. 架构与定位声明

> [!IMPORTANT]
> **主 UI 产品壳说明**：  
> 本软件唯一的默认产品壳为 **Legacy Frontend (`static/`)**。  
> `studio-v2/` (React 绿地壳) 仅作为后端 API 契约与 UI UX 参考实现保留，**不再作为默认发布壳**。

---

## 2. 模块切片与验收全矩阵 (Issues 01–14)

| # | 模块 / 切片 | 交付产物 | 自动化单测 | 验证状态 |
|---|------------|----------|------------|----------|
| **01** | **M3 Status Bus** | `smart-canvas/core/status-bus.js` | `status-bus.test.js` (4 tests) | ✅ PASS |
| **02** | **M1 Cascade Logic** | `smart-canvas/core/cascade-tracker.js` | `cascade-tracker.test.js` (5 tests) | ✅ PASS |
| **03** | **M1 Cascade Panel** | `smart-canvas/render/cascade-tracker-panel.js` | `cascade-tracker-panel.test.js` (2 tests) | ✅ PASS |
| **04** | **M2 Prompt Hub** | `prompt-template-hub.js` | `prompt-template-hub.test.js` (3 tests) | ✅ PASS |
| **05** | **M2 Chain Preset Apply** | `chain-preset-hub.js` | `chain-preset-hub.test.js` (5 tests) | ✅ PASS |
| **06** | **M4 V2 API Client** | `v2-api-client.js` | `v2-api-client.test.js` (6 tests) | ✅ PASS |
| **07** | **M5 Agent Center** | `agent-center/` (Shell/Runtimes/Agents/Tasks) | `agent-center.test.js` (4 tests) | ✅ PASS |
| **08** | **M5 Agent Dock** | `agent-dock.js` | `agent-dock.test.js` (4 tests) | ✅ PASS |
| **09** | **M6 Agent Task Node** | `smart-canvas/nodes/agent-task-node.js` | `agent-task-node.test.js` (5 tests) | ✅ PASS |
| **10** | **M7 Asset V2 Bridge** | `asset-v2-bridge.js` | `asset-v2-bridge.test.js` (4 tests) | ✅ PASS |
| **11** | **M8 Generation Task Shelf**| `generation-task-shelf.js` | `generation-task-shelf.test.js` (3 tests) | ✅ PASS |
| **12** | **M9 ESM Deep Wire** | `canvas-state.js`, `view-transform.js`, `connection-line.js` | `esm-deep-wire.test.js` (4 tests) | ✅ PASS |
| **13** | **M10 Platform Gaps** | `avatar-platform-bridge.js`, `settings-capabilities.js` | `platform-gaps.test.js` (5 tests) | ✅ PASS |
| **14** | **v3 Release Gate** | `docs/v3-release-smoke-test-guide.md` | 本发布门禁 | ✅ PASS |

---

## 3. 手测冒烟清单（发布前必勾选）

### A. 画布与级联运行 (M1 & M3)
- [ ] 选中尾节点启动级联，级联追踪面板自动弹框显示步骤。
- [ ] 点击面板「停止」按钮，节点与连线立即切为停止/已取消状态。
- [ ] ComfyUI 多节点并发未打爆本机，并发数受限制。
- [ ] 节点运行芯片（Pending/Running/Succeeded/Failed）实时更新，取消选中后仍继续刷新。

### B. 提示词与链路预设 (M2)
- [ ] 打开模板中心，搜索筛选提示词模板并一键套用到节点。
- [ ] 保存自定义文本为「我的模板」，编辑与删除正常。
- [ ] 切换至「链路预设」Tab，预览节点与连线骨架。
- [ ] 确认套用预设，画布非破坏性插入节点，且可按下 Undo 恢复。

### C. Agent Center & Agent Dock (M5)
- [ ] 进入 Agent Center，能够配置与编辑 Agent Profile、Skill 与 Runtime。
- [ ] 点击 Probe 探测环境，就绪状态实时回显。
- [ ] 打开全局 Agent Dock，选择 Agent/Skill、输入指令并提交。
- [ ] 事件流轮询正常，取消任务响应迅速，结果支持下载与入库资产。

### D. 画布 Agent Task 节点 (M6)
- [ ] 画布添加 `smart-agent-task` 节点，配置 Agent 说明。
- [ ] 点击节点「执行」与「查看结果」，Dock 正确联动并定位 Task ID。
- [ ] 重载画布 JSON 后 config 数据未丢失，且不存大日志冗余。

### E. 资产桥、任务架与缺口 (M7, M8, M10)
- [ ] 素材库显示 V2 资产，拖入画布节点携带 `asset_version_id`。
- [ ] 删除进回收站可恢复。
- [ ] 打开任务架（Task Shelf），查看生成任务进度与重试/定位节点。
- [ ] Avatar 提交选择未接入平台（如快手）时出现「待接入」拦截提示。
- [ ] 设置页 CLI 探测面板显示 Codex/Gemini 等可用状态。

---

## 4. 真机 CLI 与无 CLI 验收说明

### 真机 CLI 验收步骤
1. 本机配置可用 CLI 环境（如 Codex CLI 或 Gemini CLI）。
2. 在 Agent Center 针对该 Runtime 执行 `Probe`，确认显示 `READY`。
3. 在 Agent Dock 或 Agent Task 节点输入真实指令，观察事件流与输出文件生成。

### 无 CLI 环境（纯 UI 逻辑）验收步骤
1. 使用 Fake/Mock 模式或浏览器模拟响应。
2. 验证提交时 API 请求经过 `v2ApiClient`。
3. 验证未配置/不可用时浮层友好引导跳转 Agent Center，无白屏报错。

---

## 5. 回退与兼容性保障

- **旧生成 API 回退**：旧 `/api/*` 单节点生成路径完全保留，确保与旧画布保存兼容。
- **Native ESM 零构建**：支持浏览器直加载，FastAPI 托管 `static/` 无构建步骤。
- **代码纪律**：单个代码文件严禁超过 900 行，全局单测套件通过率保持 100%。
