# 20 - Agent Center 前端（Agents/Skills/Runtimes/Tasks 四 Tab）

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F5（管理页部分）、用户故事 34-39

## 要构建什么

Agent Center 页面：四个 Tab——Agents（列表/新建/编辑/复制/启停/绑定 Skill/测试运行/近期 Task）、Skills（列表/扫描内置目录/导入本地目录与 ZIP/启停/查看版本与校验错误/绑定 Agent 视图）、Runtimes（列表/新建编辑/Probe/启停/最近错误）、Tasks（列表/详情/取消/重试）。第一版不建设复杂 Permissions 与 Activity 管理页面。调用 06/07/13 号切片 API。

## 索引的设计文档

- `docs/studio-v2-agent-skill-runtime-and-management-design.md`（Agent Center 页面边界）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§6.5 Agent Center、§9.2-9.4 管理能力）
- `docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`（DTO 与状态展示字段）

## 验收标准

- [ ] 四 Tab 切换正常，列表/详情/操作（新建编辑复制启停）可用。
- [ ] Runtimes：新建/编辑/Probe/启停可用；Probe 结果（版本/能力/错误）完整展示。
- [ ] Skills：discover 扫描、import（目录/ZIP）、enable/disable、版本与校验错误展示可用。
- [ ] Agents：创建/编辑/复制/启停/绑定 Skill/测试运行可用；近期 Task 列表可见。
- [ ] Tasks：列表/详情/取消/重试可用；状态（queued/running/waiting_input/succeeded/failed/cancelled）展示正确。
- [ ] 无数据 Tab 显示空状态；操作失败显示可理解错误。
- [ ] E2E：创建一个 Runtime → Probe → 创建 Agent → 导入 Skill → 绑定 → 测试运行一次通过。

## 被阻塞于

- [02-f1-frontend-scaffold-app-shell](./02-f1-frontend-scaffold-app-shell.md)
- [06-b6-agent-runtime-probe](./06-b6-agent-runtime-probe.md)
- [07-b7-agent-profile-skill](./07-b7-agent-profile-skill.md)
