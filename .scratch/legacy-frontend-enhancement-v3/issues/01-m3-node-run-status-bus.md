# 01 - M3 Node Run Status Bus 纯逻辑 + 徽章/连线接线

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M3、用户故事 22–27

## 要构建什么

在 Legacy Smart Canvas 建立**唯一**节点运行态投影源（Status Bus）：统一排队/运行/完成/失败（及级联轮次序号）的写入与订阅。节点头徽章、级联连线 class、后续追踪面板与 Composer 禁用态只读该投影，禁止各 UI 私自改写互相不一致的 `runStatus`。

瞬时运行态默认不进入画布持久化快照；提供 `setStatus` / `clearEphemeral` / `snapshot` / `subscribe` 概念接口。先落地纯逻辑并接好现有徽章与连线消费点，为级联面板与 Agent 节点 poller 打底。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M3、测试决策 M3）
- `docs/adr/0002-legacy-frontend-native-esm-refactoring.md`
- `CONTEXT.md`（State Store / Smart Canvas 术语）

## 验收标准

- [ ] Status Bus 纯模块可独立测试：status patch 合并、多订阅者通知、`clearEphemeral` 清除瞬时态。
- [ ] 瞬时态（queued/running 等）不写入画布 persist snapshot；仅保留产品允许的持久字段策略有单测锁定。
- [ ] Smart Canvas 节点头徽章与级联相关连线样式改为消费 Bus 投影，取消选中节点后状态仍可被外部 `setStatus` 更新并反映到 UI。
- [ ] 现有单节点生成/级联路径在接线后行为不回归（手测：跑一次生成见徽章变化）。
- [ ] M3 自动化测试通过（PRD 必测项）。

## 被阻塞于

无 - 可以立即开始
