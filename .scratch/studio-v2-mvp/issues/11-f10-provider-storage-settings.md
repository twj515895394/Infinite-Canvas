# 11 - Provider 与存储设置页

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F3（设置部分）、用户故事 21/22/24

## 要构建什么

设置页落地：现有 API Provider 配置入口（新增/修改/启停/测试，复用现有 Provider CRUD 与测试接口）、存储目录设置（上传/生成/本地目录查看与修改）、基础外观设置（主题/动效降级）、旧版回退入口（链接到旧 `static/` 前端）。第一版不含 RunningHub/Midjourney 专项配置。Provider 能力展示根据当前配置和探测结果，不建设完整 Executor Registry UI。

## 索引的设计文档

- `docs/current-backend-api-capability-inventory.md`（Provider CRUD/检测、Storage Settings、`/api/models` 复用评估）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§6.7 设置页、§7.1 Provider/存储保留项）
- `docs/studio-v2-information-architecture-and-core-workflows.md`（设置页 IA）

## 验收标准

- [ ] Provider 新增/修改/启停/测试可用，测试结果显示成功/失败原因。
- [ ] 存储目录可查看和修改，修改后上传与生成写入新目录。
- [ ] 外观设置生效（主题切换、Reduced Motion 联动）。
- [ ] 旧版回退入口可见且可跳转旧前端。
- [ ] 设置变更立即生效或明确提示重启生效。
- [ ] RunningHub/Midjourney 专项配置不出现在设置页。
- [ ] E2E：新增一个 Provider → 测试 → 修改存储目录 → 回退入口跳转一次通过。

## 被阻塞于

- [02-f1-frontend-scaffold-app-shell](./02-f1-frontend-scaffold-app-shell.md)
