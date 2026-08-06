# 06 - Agent Runtime Profile 与 Probe 后端

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 M3（Runtime 部分）

## 要构建什么

Agent Runtime 领域后端：Runtime Profile CRUD（`/api/v2/agent-runtimes` GET/POST/PATCH/DELETE），字段含名称、类型（codex-cli 优先 / generic-cli / acp）、可执行文件路径或 Endpoint、工作目录、环境配置、启用/禁用；`POST /api/v2/agent-runtimes/{runtime_id}/probe` 执行探测（executable 存在性、版本、登录状态、模型、协议、Capability、Native Skill 目录），单次探测失败不阻塞其他 Runtime；probe 结果持久化（agent_runtime_probes 表），展示版本、能力列表与失败原因；查看最近错误。探测输出经 Adapter 归一化为统一能力数据，不解析原始 stdout 文本。

## 索引的设计文档

- `docs/studio-v2-agent-skill-runtime-and-management-design.md`（Runtime Profile/Probe 领域边界、Capability 计算）
- `docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`（agent_runtime_profiles / agent_runtime_probes 表、DTO）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§9.2 Runtime MVP、§11.2 API 清单）

## 验收标准

- [ ] Runtime Profile CRUD 完整；启用/禁用状态可切换。
- [ ] Probe 返回结构化能力（版本/模型/协议/capabilities/错误原因），失败时错误信息可理解且不阻塞其他 Runtime 的 probe。
- [ ] Probe 结果持久化，可查看最近一次及历史 probe 结果。
- [ ] 执行 Codex CLI（若本机已登录）probe 成功并展示能力；未安装/未登录时返回明确失败原因而非崩溃。
- [ ] 不存在 Runtime 返回 404 `RUNTIME_NOT_FOUND`。
- [ ] 后端测试：CRUD、probe 成功/失败路径、禁用状态不参与任务分配、404 各一条用例。

## 被阻塞于

- [01-b1-v2-backend-skeleton](./01-b1-v2-backend-skeleton.md)
