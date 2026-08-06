# 10 - 上传与媒体预览

Status: ready-for-agent
Type: issue
Feature: studio-v2-mvp

## 父问题

[PRD](../PRD.md) —— 实现决策 F3（上传/媒体部分）、用户故事 20

## 要构建什么

新前端通用上传与媒体预览能力：文件上传组件（图片/视频/音频，复用 `/api/ai/upload` 现有接口或经 V2 ingest 包装）、上传进度与错误反馈、媒体预览组件（图片缩放、视频播放、默认 Poster）、下载能力。作为资产库与画布节点引用素材的前置能力，可被资产库和画布复用（共享 MediaThumbnail/Preview 组件）。

## 索引的设计文档

- `docs/current-backend-api-capability-inventory.md`（`/api/ai/upload`、`/api/media-preview`、`/api/download-output` 复用评估）
- `docs/studio-v2-personal-mvp-scope-feature-preservation-and-implementation-baseline.md`（§7.1 上传与媒体预览保留项）
- `docs/studio-v2-ui-interaction-and-motion-design-system.md`（MediaThumbnail 组件规范）

## 验收标准

- [ ] 选择文件后上传成功，显示进度；失败显示可理解错误并可重试。
- [ ] 图片/视频/音频均可预览；视频有默认 Poster，预览不卡顿。
- [ ] 上传结果返回可被资产库引用的稳定标识。
- [ ] 上传组件与预览组件为共享组件，资产库与画布均可复用（无重复实现）。
- [ ] 取消上传/中断场景不产生残留状态。
- [ ] E2E：上传一张图片 → 预览 → 下载闭环一次通过。

## 被阻塞于

- [02-f1-frontend-scaffold-app-shell](./02-f1-frontend-scaffold-app-shell.md)
