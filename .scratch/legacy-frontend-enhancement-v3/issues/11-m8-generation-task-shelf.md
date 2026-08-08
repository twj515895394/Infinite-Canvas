# 11 - M8 Generation Task Shelf（轮询架 + 可选挂载）

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M8、用户故事 60–63

## 要构建什么

在 Legacy 壳提供轻量 **Task Shelf**：经 M4 对接 generation-tasks，展示图/视频/Comfy 等任务排队与终态，支持取消/重试（后端允许时），可选跳回关联画布节点。旧节点生成路径可继续直打 `/api/*`；新挂载点可自愿写入 task id 引用，**渐进迁移、不中断**旧主路径。轮询即可，不强制 SSE。

本切片**不阻塞** Agent P0 宣布可用。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M8）
- Studio V2 Task Shelf / generation feature（只读对照）
- `API/v2` generation_tasks 行为

## 验收标准

- [ ] Shelf 可打开并列出 v2 generation tasks（有数据时）。
- [ ] 活跃任务轮询至终态；失败态可读。
- [ ] 取消/重试在后端支持时可用。
- [ ] 旧单节点 `/api/*` 生成仍可用（回归）。
- [ ] 未挂载 v2 的节点不因此报错。
- [ ] 请求经 M4。

## 被阻塞于

- [06-m4-legacy-v2-api-client](./06-m4-legacy-v2-api-client.md)
