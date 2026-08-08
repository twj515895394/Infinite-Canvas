# 08 - M5 Agent Dock（执行 / 轮询 / 取消 / 结果保存）

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M5、用户故事 39–43

## 要构建什么

Legacy 全局 **Agent Dock** 浮层：选 Agent/Skill、输入指令、附加资产或画布选中上下文 → `createSession` → `createTask`（幂等键）→ events 轮询 → 取消（响应后立即反映状态）→ 结果本地下载或 ingest 入资产库。

入口至少：壳层/工具区、画布选中上下文、资产「使用 Agent」、Agent Center。换 Agent 时清理 skill/session/activeTask 等脏状态。执行协议与 V2 F14 对齐，**禁止第三套 Task 创建**。无独立 Artifact 表则不造半套 Blob，结果=文件下载+资产 ingest。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M5 Dock）
- `docs/studio-v2-agent-skill-runtime-and-management-design.md` §15
- Studio V2 dockApi / dockStore 语义（只读对照）

## 验收标准

- [ ] 各入口可打开 Dock 并带上对应上下文（资产/节点/空）。
- [ ] 提交后可见阶段/事件更新（轮询即可）。
- [ ] 取消后 UI 立即进入取消中/已取消，终态与后端一致。
- [ ] 结果可下载或保存到资产库（至少一种主路径可用）。
- [ ] 换 Agent 清除不兼容的 skill/task/session 状态。
- [ ] 无 Agent 时引导去 Center，不硬报错。
- [ ] 仅经 M4 创建 Task；与 Center 任务列表可见同一任务。

## 被阻塞于

- [06-m4-legacy-v2-api-client](./06-m4-legacy-v2-api-client.md)
- [07-m5-agent-center](./07-m5-agent-center.md)
