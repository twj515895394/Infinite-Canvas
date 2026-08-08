# 13 - M10 平台缺口（Avatar 白名单 + 设置 CLI 能力）

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M10、用户故事 68–72

## 要构建什么

补齐 Legacy 零散平台体验：

1. **Avatar 认证平台**：前端白名单与后端支持集合同步；新平台在后端已支持时纳入；仍不支持的明确「待接入」，禁止静默失败。
2. **设置页 CLI runtime-capabilities**：只读展示 Codex / Gemini / 即梦等探测结果；可链到 Agent Runtime 配置（若 Center 已存在则链接，否则文案指引）。

所有新 UI 使用 design-system Token 与 i18n。本切片可独立于 Agent 闭环开工；与 07 仅弱增强关系。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M10）
- 现有 `asset-manager` Avatar 白名单与后端 AVATAR 支持集
- 设置页与 runtime-capabilities API（若已有）

## 验收标准

- [ ] Avatar 支持列表与后端一致；扩展或文档化差异。
- [ ] 不支持平台在 UI 标注「待接入」，提交前拦截并提示。
- [ ] 设置页可见 CLI/runtime 探测摘要（可用/不可用/原因）。
- [ ] 有 Agent Center 时可到达 Runtime 配置；无则文案不报错。
- [ ] i18n 与主题下无裸硬编码色导致的刺眼回归。

## 被阻塞于

无 - 可以立即开始
