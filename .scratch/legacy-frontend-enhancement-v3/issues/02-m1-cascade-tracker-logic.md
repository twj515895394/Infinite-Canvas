# 02 - M1 Cascade Tracker 纯逻辑（图/轮次/停止/投影）

Status: ready-for-agent  
Type: issue  
Feature: legacy-frontend-enhancement-v3  
Slice: AFK

## 父问题

[PRD](../PRD.md) —— 模块 M1、用户故事 1–4、7–8、11（逻辑层）

## 要构建什么

从 Smart Canvas 巨型脚本中抽出**级联运行核心逻辑**为可测试深模块：尾节点是否可跑、上游图/边集合构建、多轮串行与并发调度边界、停止标志、Comfy 场景并发上限、运行投影（nodeStates / edgeStates / roundIndex / errors / stopping）。

本切片以纯逻辑与单测为主；可不做完整追踪面板 UI（见 03）。对外概念接口：`canRun(tail)`、`start` 所需的图与调度原语、`stop` 标志、`getProjection()`。保持既有产品语义：级联进行中允许其它无关节点单独生成；减少动效时的边动画策略由投影字段表达，UI 在 03 消费。

## 索引的设计文档

- `.scratch/legacy-frontend-enhancement-v3/PRD.md`（M1、测试决策 M1）
- `CONTEXT.md`

## 验收标准

- [ ] `canRun` 覆盖非法尾节点、无链、历史组等边界，单测锁定。
- [ ] 图构建产出稳定的节点序与边 key 集合；与「从尾溯源」语义一致。
- [ ] 停止标志使调度协作式中止；投影含 stopping/errors。
- [ ] 并发 limit：含 Comfy 时受实例数约束，否则有默认上限；单测锁定。
- [ ] `getProjection()` 可推导边 wait/active/done 所需数据。
- [ ] M1 自动化测试通过；旧 `runSmartCascade` 路径可逐步委托或双轨对照，不引入第三套级联语义。

## 被阻塞于

无 - 可以立即开始
