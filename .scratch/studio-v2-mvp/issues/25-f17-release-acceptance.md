# 25 - 第一版发布验收

Status: ready-for-human
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 第一版验收标准

## 要构建什么

对照 MVP 基线文档 §14 验收清单逐项走查并记录结果：UI（新 UI 为主入口、加载/错误/空状态）、功能保留（项目/画布 CRUD、保存重开一致、图片/视频生成、ComfyUI、即梦、Codex、上传预览、Provider/存储设置）、资产库（上传/导入/生成结果建 Asset、预览、搜索/标签/Collection、版本、拖入画布、Agent 上下文、回收站）、Agent/Skill（Runtime Probe、Agent CRUD、Skill 发现/导入/绑定、Dock 真实 Task、上下文、状态与结果、取消、Artifact/资产保存、失败错误）。产出发布结论：通过 / 不通过及遗留项清单。此切片需要人工确认发布。

## 索引的设计文档

- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§14 验收清单）
- `docs/README.md`（第一版发布门槛）
- [PRD](../PRD.md)（第一版验收标准）

## 验收标准

- [ ] §14.1 UI 验收项全部通过或记录遗留项。
- [ ] §14.2 功能保留验收项全部通过或记录遗留项。
- [ ] §14.3 资产库验收项全部通过或记录遗留项。
- [ ] §14.4 Agent/Skill 验收项全部通过或记录遗留项。
- [ ] 明确延后项（RunningHub/Midjourney/对话/提示词库）已标记为后续，不影响验收。
- [ ] 产出发布结论文档（通过/不通过 + 遗留项 + 回滚方案），并同步更新 MVP 基线文档的验收状态。

## 被阻塞于

- [24-f16-stability-polish](./24-f16-stability-polish.md)
