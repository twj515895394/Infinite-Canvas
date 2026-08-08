# 09 - M6 Agent Task Smart Node（config + 执行 + poller + Dock）

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M6、用户故事 45–52；测试决策 M6 config

## 要构建什么

在 Smart Canvas 增加 **Agent 任务节点**（类型名最终与领域词一致，如 `smart-agent-task`）：配置 Agent、可选 Skill、说明；上下文/资产入边；执行走与 Dock **同一** Task 创建路径（M4/M5）。

节点 config **只存引用**，禁止塞 messages/steps 全文。建议形状：

```text
agent_profile_id, skill_id?, instruction,
active_task_id, latest_successful_task_id, session_id?,
result_summary? (短), task_history[] (有界)
```

纯函数：parse/validate/canSubmit、submit/终态 patch、换 Agent 清 skill、从入边推导 contextRefs。画布级 poller 写回 Status Bus（不依赖选中）。「查看结果」打开 Dock 并定位 Task。未配置 Agent 时引导而非难懂报错。出边完整下游消费可降级为端口声明 + summary（follow-up 不挡本片）。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M6）
- `docs/studio-v2-agent-skill-runtime-and-management-design.md` §15.4
- Studio V2 F15 agentTaskNode 语义（只读对照）

## 验收标准

- [ ] 可添加工具加入 Agent 任务节点并配置 Agent/Skill/说明。
- [ ] 执行后节点仅存 Task ID/摘要/有界历史；无全文日志。
- [ ] 取消选中后状态芯片仍更新（画布级 poller + Status Bus）。
- [ ] 「查看结果」打开 Dock 且 activeTask 正确。
- [ ] 重跑产生新 Task，历史保留旧 ID。
- [ ] 入边资产在提交 body 中体现 version/引用（后端契约允许时）。
- [ ] 无 Agent 时空态引导。
- [ ] M6 config 纯函数自动化测试通过。
- [ ] 不存在第三套 createTask 实现。

## 被阻塞于

- [01-m3-node-run-status-bus](./01-m3-node-run-status-bus.md)
- [06-m4-legacy-v2-api-client](./06-m4-legacy-v2-api-client.md)
- [08-m5-agent-dock](./08-m5-agent-dock.md)
