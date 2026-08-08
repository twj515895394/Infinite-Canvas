# 14 - v3 冒烟清单与发布门禁文档

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK（文档与清单由代理完成；真机勾选可由人执行）

## 父问题

[PRD](../PRD.md) —— 用户故事 73–76、冒烟清单、验收总标准

## 要构建什么

编写并维护 **Legacy Frontend Enhancement v3** 的发布门禁材料：

1. 手测冒烟清单（级联追踪、模板、Agent Center/Dock/节点、资产桥、Task Shelf、旧路径回归、光标/主题）。
2. 真机 Agent 步骤（本机 CLI Runtime Probe → 执行 → 取消），标明环境依赖，不挡无 CLI 的 UI 验收。
3. 失败态预期（Toast/面板、旧 `/api/*` 回退仍可用）。
4. 与 PRD 验收总标准对照表（P0/P1/P2）。
5. 注明 `studio-v2/` 仅契约对照、非默认壳。

代理交付文档；清单项由执行者在环境中勾选。不关闭其它 issue，不改产品范围。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（冒烟与验收）
- `docs/studio-v2-first-release-guide.md`（可参考结构，内容改为 Legacy v3）
- 各 01–13 issue 验收标准

## 验收标准

- [ ] 仓库内存在 v3 冒烟/门禁文档（路径在本 issue 评论或 PRD「进一步说明」可发现）。
- [ ] 清单覆盖 PRD 冒烟 6 条及 P0（M1–M6）关键路径。
- [ ] 含真机 CLI 与「无 CLI 时如何验收 UI」分支说明。
- [ ] 含旧生成路径与画布保存重开回归项。
- [ ] 含 design-system/光标约定抽查项。
- [ ] 文档声明 Studio V2 非默认入口。

## 被阻塞于

- 文档骨架可立即开始。
- 完整勾选建议至少在以下合并后：  
  [03-m1-cascade-tracker-panel](./03-m1-cascade-tracker-panel.md)、  
  [05-m2-chain-preset-apply](./05-m2-chain-preset-apply.md)、  
  [09-m6-agent-task-smart-node](./09-m6-agent-task-smart-node.md)  
  （P1/P2 项随 10–13 交付补勾）
