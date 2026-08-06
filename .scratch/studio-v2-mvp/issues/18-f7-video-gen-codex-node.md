# 18 - 视频生成与 Codex/GPT Image 2 Skill 节点

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F3（视频/Codex 部分）、用户故事 16/19

## 要构建什么

视频生成节点（Video-Generation）：主要可用路径接入（复用现有视频接口）、参数配置、等待/结果/失败重试、结果可被资产库引用；Codex / GPT Image 2 Skill 生图能力：在图片生成节点中可探测并调用现有 CLI helper（复用现有 `/api/codex/*` 检测与执行），探测失败明确提示。

## 索引的设计文档

- `docs/current-backend-api-capability-inventory.md`（视频生成接口、`/api/codex/status` 与 Codex 执行复用评估）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§7.1 视频生成/Codex 保留项）
- `docs/studio-v2-react-flow-node-model-and-registry-design.md`（Video-Generation 节点、buildExecution）

## 验收标准

- [ ] 视频生成主要路径可用：提交 → 等待 → 结果展示 → 失败重试。
- [ ] 视频结果可被后续"输出入资产库"引用（返回稳定引用）。
- [ ] Codex/GPT Image 2 Skill：可探测状态；可用时执行生图并展示结果；不可用时明确提示原因（未安装/未登录）。
- [ ] 视频预览使用 Poster/缩略图，不整段加载卡顿（性能预算）。
- [ ] E2E：视频生成路径 + Codex 生图（或明确降级提示）各一次。

## 被阻塞于

- [15-f6-image-gen-node](./15-f6-image-gen-node.md)
