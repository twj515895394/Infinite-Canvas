# 07 - Agent Profile 与 Skill 管理后端

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 M3（Agent/Skill 管理部分）

## 要构建什么

Agent Profile 与 Skill 管理后端：Agent Profile CRUD（`/api/v2/agent-profiles` GET/POST/PATCH/DELETE，字段含名称、描述、runtime_profile_id、model、instructions、enabled、context_policy、output_mode）+ 复制 + 启用/禁用 + 测试运行（`POST /api/v2/agent-profiles/{agent_id}/test`）；Skill 管理（`/api/v2/skills` list、`POST /api/v2/skills/discover` 扫描内置目录、`POST /api/v2/skills/import` 本地目录/ZIP、`enable`/`disable`/`test`），Skill Package 保留 skill.yaml + SKILL.md + 可选 schemas/prompts/scripts，基础 Manifest 校验并返回校验错误，版本记录（skill_versions 固定版本）；Skill 绑定 Agent（`GET/POST/DELETE /api/v2/agent-profiles/{agent_id}/skills`）。第一版不要求 Git 自动更新、Marketplace、SemVer 求解。

## 索引的设计文档

- `docs/studio-v2-agent-skill-runtime-and-management-design.md`（Agent/Skill 分离、Skill Package 结构、版本固定）
- `docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`（agent_profiles、skills、skill_installations、skill_versions、agent_skill_bindings 表、DTO）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§9.3 Agent、§9.4 Skill、§11.2 API 清单）

## 验收标准

- [ ] Agent Profile CRUD + 复制 + 启用/禁用完整；绑定 Runtime 与 Skill 关联正确。
- [ ] Skill discover 扫描内置目录返回 Skill 列表（含版本、校验状态）；import 从本地目录和 ZIP 成功安装。
- [ ] Manifest 校验：非法 skill.yaml / 缺 SKILL.md 返回校验错误并展示；合法包正常导入。
- [ ] Skill enable/disable 状态切换；绑定到 Agent 后关联可见。
- [ ] `test` 运行返回可执行结果或明确失败原因（复用 Task 执行链路）。
- [ ] 不存在 Agent/Skill 返回 404 `AGENT_NOT_FOUND` / `SKILL_NOT_FOUND`。
- [ ] 后端测试：Agent CRUD/复制、Skill discover/import/校验错误/enable/disable/bind 各一条用例。

## 被阻塞于

- [01-b1-v2-backend-skeleton](./01-b1-v2-backend-skeleton.md)
