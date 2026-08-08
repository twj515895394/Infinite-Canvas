# 07 - M5 Agent Center 四区（Runtimes / Agents / Skills / Tasks）

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M5、用户故事 31–38、44（Center 空态）

## 要构建什么

在 Legacy 壳内提供 Agent 管理区（主导航或「更多设置」可达）：四区 **Runtimes / Agents / Skills / Tasks**。

- Runtimes：CRUD 入口、Probe、启停、结构化失败展示；编辑时不可改 executable_path/endpoint_url（与后端一致）。
- Agents：创建/编辑/复制/启停、绑定 Runtime、测试运行（按契约）。
- Skills：discover、ZIP/path 导入、版本与校验展示、启停、绑定到 Agent。
- Tasks：状态筛选、详情、取消/重试、活跃任务轮询。

全部数据经 M4 Client。空态引导配置。视觉用 design-system + i18n。不在本切片实现全局 Dock 浮层（见 08），但 Center 可预留「在 Dock 打开」入口位。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M5 Center）
- `docs/studio-v2-agent-skill-runtime-and-management-design.md` §14
- Studio V2 Agent Center（只读 UX/契约对照）

## 验收标准

- [ ] Legacy 内可达 Agent 管理四区，刷新无白屏。
- [ ] Runtime Probe 成功与失败均有可读反馈。
- [ ] Agent 可创建并绑定 Runtime；Skill 可导入/启停/绑定。
- [ ] Tasks 列表可筛选；可取消/重试（后端允许时）。
- [ ] 无 Runtime/Agent 时有空状态引导，而非静默失败。
- [ ] 所有请求走 M4；无页面直 fetch v2。
- [ ] Runtime 编辑 UI 禁用 path/endpoint 修改。

## 被阻塞于

- [06-m4-legacy-v2-api-client](./06-m4-legacy-v2-api-client.md)
