/**
 * agent-task 节点纯函数测试（切片 23 F15）。
 * 覆盖 config 收窄、校验/引导、提交/状态 patch、连线→上下文；不渲染组件。
 */
import { describe, expect, it } from 'vitest'
import {
  agentTaskGuide,
  agentTaskSubtitle,
  canSubmitAgentTask,
  contextRefsFromIncomingEdges,
  parseAgentTaskConfig,
  patchAfterTaskStatus,
  patchAfterTaskSubmit,
  pushTaskHistory,
  validateAgentTaskConfig,
  AGENT_TASK_HISTORY_LIMIT,
} from '@/features/canvas/agentTaskNode'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/ports'

describe('parseAgentTaskConfig / validateAgentTaskConfig', () => {
  it('缺字段安全默认；instruction 兼容 message 别名', () => {
    expect(parseAgentTaskConfig(undefined)).toEqual({
      agent_profile_id: '',
      skill_id: null,
      instruction: '',
      active_task_id: null,
      latest_successful_task_id: null,
      session_id: null,
      result_summary: null,
      task_history: [],
    })
    expect(parseAgentTaskConfig({ message: 'hi', skill_id: 'sk1' }).instruction).toBe('hi')
    expect(parseAgentTaskConfig({ skill_id: '' }).skill_id).toBeNull()
  })

  it('缺 Agent 或说明时校验失败', () => {
    expect(validateAgentTaskConfig({})).toMatch(/Agent/)
    expect(validateAgentTaskConfig({ agent_profile_id: 'a1' })).toMatch(/说明/)
    expect(validateAgentTaskConfig({ agent_profile_id: 'a1', instruction: '  ' })).toMatch(/说明/)
    expect(validateAgentTaskConfig({ agent_profile_id: 'a1', instruction: '分析镜头' })).toBeNull()
  })
})

describe('agentTaskGuide / canSubmitAgentTask', () => {
  it('无可用 Agent 时引导去 Center', () => {
    const g = agentTaskGuide({ config: {}, agentsAvailable: 0 })
    expect(g.kind).toBe('no-agents')
    expect(g.message).toMatch(/Agent Center/)
  })

  it('有 Agent 但未选/未填说明时分别引导', () => {
    expect(agentTaskGuide({ config: {}, agentsAvailable: 2 }).kind).toBe('missing-agent')
    expect(
      agentTaskGuide({ config: { agent_profile_id: 'a1' }, agentsAvailable: 2 }).kind,
    ).toBe('missing-instruction')
    expect(
      agentTaskGuide({
        config: { agent_profile_id: 'a1', instruction: 'go' },
        agentsAvailable: 2,
      }).kind,
    ).toBeNull()
  })

  it('可提交：配置齐全且无活动 Task；活动中不可重复提交', () => {
    const ok = { agent_profile_id: 'a1', instruction: 'run' }
    expect(canSubmitAgentTask({ config: ok, agentsAvailable: 1 })).toBe(true)
    expect(canSubmitAgentTask({ config: ok, agentsAvailable: 0 })).toBe(false)
    expect(
      canSubmitAgentTask({
        config: { ...ok, active_task_id: 't1' },
        agentsAvailable: 1,
        activeTaskStatus: 'running',
      }),
    ).toBe(false)
    expect(
      canSubmitAgentTask({
        config: { ...ok, active_task_id: 't1' },
        agentsAvailable: 1,
        activeTaskStatus: 'succeeded',
      }),
    ).toBe(true)
    // 有 active id 但状态未知 → 保守不可提交
    expect(
      canSubmitAgentTask({
        config: { ...ok, active_task_id: 't1' },
        agentsAvailable: 1,
      }),
    ).toBe(false)
  })
})

describe('pushTaskHistory / patchAfterTaskSubmit / patchAfterTaskStatus', () => {
  it('历史去重前置并截断', () => {
    const h = pushTaskHistory(['t2', 't3'], 't1')
    expect(h[0]).toBe('t1')
    expect(pushTaskHistory(['t1', 't2'], 't1')[0]).toBe('t1')
    expect(pushTaskHistory(['t1', 't2'], 't1')).toHaveLength(2)
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`)
    expect(pushTaskHistory(many, 'new')).toHaveLength(AGENT_TASK_HISTORY_LIMIT)
    expect(pushTaskHistory(many, 'new')[0]).toBe('new')
  })

  it('提交后写入 active/session，旧 active 进历史，清空摘要', () => {
    const patch = patchAfterTaskSubmit({
      config: {
        agent_profile_id: 'a1',
        instruction: 'x',
        active_task_id: 'old',
        result_summary: 'prev',
        task_history: ['h0'],
      },
      taskId: 'new',
      sessionId: 's1',
    })
    expect(patch).toEqual({
      active_task_id: 'new',
      session_id: 's1',
      task_history: ['old', 'h0'],
      result_summary: null,
    })
  })

  it('成功状态写 latest + 短摘要；非当前 active 的旧轮询不覆盖', () => {
    const base = {
      agent_profile_id: 'a1',
      instruction: 'x',
      active_task_id: 't-new',
      task_history: [] as string[],
    }
    const ok = patchAfterTaskStatus({
      config: base,
      taskId: 't-new',
      status: 'succeeded',
      resultSummary: 'done result',
    })
    expect(ok.latest_successful_task_id).toBe('t-new')
    expect(ok.result_summary).toBe('done result')
    expect(ok.task_history).toEqual(['t-new'])

    const stale = patchAfterTaskStatus({
      config: base,
      taskId: 't-old',
      status: 'succeeded',
      resultSummary: 'stale',
    })
    expect(stale).toEqual({})

    const long = 'x'.repeat(600)
    const clipped = patchAfterTaskStatus({
      config: base,
      taskId: 't-new',
      status: 'succeeded',
      resultSummary: long,
    })
    expect(String(clipped.result_summary)).toHaveLength(500)
  })

  it('失败/取消也进历史，不写 latest', () => {
    const patch = patchAfterTaskStatus({
      config: { active_task_id: 't1', task_history: [] },
      taskId: 't1',
      status: 'failed',
    })
    expect(patch.task_history).toEqual(['t1'])
    expect(patch.latest_successful_task_id).toBeUndefined()
  })
})

describe('contextRefsFromIncomingEdges', () => {
  const nodes: CanvasNode[] = [
    {
      id: 'asset1',
      type: 'asset',
      position: { x: 0, y: 0 },
      config: { asset_id: 'a1', asset_version_id: 'v1', name: '角色图' },
    },
    {
      id: 'prompt1',
      type: 'prompt',
      position: { x: 0, y: 0 },
      config: { prompt: 'hello' },
    },
    {
      id: 'agent1',
      type: 'agent-task',
      position: { x: 100, y: 0 },
      config: {},
    },
  ]
  const edges: CanvasEdge[] = [
    { id: 'e1', source: 'asset1', sourceHandle: 'out', target: 'agent1', targetHandle: 'assets' },
    { id: 'e2', source: 'prompt1', sourceHandle: 'out', target: 'agent1', targetHandle: 'context' },
  ]

  it('素材带 version → asset 引用；其他节点 → node 引用', () => {
    const refs = contextRefsFromIncomingEdges({ nodeId: 'agent1', nodes, edges })
    expect(refs).toHaveLength(2)
    const asset = refs.find((r) => r.reference_type === 'asset')
    expect(asset).toMatchObject({
      reference_id: 'a1',
      version_ref: 'v1',
      title: '角色图',
    })
    const node = refs.find((r) => r.reference_type === 'node')
    expect(node).toMatchObject({ reference_id: 'prompt1' })
  })

  it('无连线返回空', () => {
    expect(contextRefsFromIncomingEdges({ nodeId: 'agent1', nodes, edges: [] })).toEqual([])
  })
})

describe('agentTaskSubtitle', () => {
  it('优先摘要 → task id → agent 名 → instruction 截断', () => {
    expect(agentTaskSubtitle({ result_summary: 'ok' })).toBe('ok')
    expect(agentTaskSubtitle({ active_task_id: 'task_1' })).toBe('task_1')
    expect(agentTaskSubtitle({}, '分析员')).toBe('分析员')
    expect(agentTaskSubtitle({ instruction: '短' })).toBe('短')
    expect(agentTaskSubtitle({})).toBe('未配置')
  })
})
