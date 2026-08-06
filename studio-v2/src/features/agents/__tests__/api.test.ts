/**
 * Agent Center API 层纯函数测试（切片 20 F13）。
 * 覆盖 DTO 归一化、状态判定、formatDate、错误文案；不渲染组件、不打真实网络。
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/core/api/client'
import {
  errorMessage,
  formatDate,
  isTaskActive,
  normalizeAgent,
  normalizeProbe,
  normalizeRuntime,
  normalizeSkill,
  normalizeSkillDetail,
  normalizeTask,
} from '@/features/agents/api'

describe('normalizeRuntime', () => {
  it('补齐缺字段并归一化 last_probe', () => {
    const rt = normalizeRuntime({
      id: 'rtp_1',
      name: 'Codex',
      adapter_type: 'cli-stdio',
      enabled: 1,
      status: 'ready',
      revision: 2,
      capabilities: ['text-generation', 1, null],
      last_probe_at: 1_700_000_000_000,
      last_probe: {
        id: 'prb_1',
        runtime_profile_id: 'rtp_1',
        status: 'ready',
        version: '0.1.0',
        authenticated: true,
        capabilities: ['text-generation'],
        started_at: 1_700_000_000_000,
      },
    })
    expect(rt.id).toBe('rtp_1')
    expect(rt.enabled).toBe(true) // 非 boolean 回落默认 true（后端缺省启用）
    expect(rt.capabilities).toEqual(['text-generation'])
    expect(rt.last_probe?.version).toBe('0.1.0')
    expect(rt.last_probe?.authenticated).toBe(true)
  })

  it('非法 probe 丢弃为 null', () => {
    const rt = normalizeRuntime({ id: 'rtp_x', last_probe: { version: '1' } })
    expect(rt.last_probe).toBeNull()
  })
})

describe('normalizeProbe', () => {
  it('id 缺失返回 null', () => {
    expect(normalizeProbe({ status: 'ready' })).toBeNull()
  })
})

describe('normalizeSkill / normalizeSkillDetail', () => {
  it('summary 默认值安全', () => {
    const s = normalizeSkill({ id: 'skl_1', name: 'Demo' })
    expect(s.skill_key).toBe('')
    expect(s.enabled).toBe(true)
    expect(s.binding_count).toBe(0)
    expect(s.source_types).toEqual([])
  })

  it('detail 过滤非法版本', () => {
    const d = normalizeSkillDetail({
      id: 'skl_1',
      name: 'Demo',
      versions: [{ id: 'skv_1', version: '1.0.0', validation_status: 'ready' }, { version: 'bad' }],
      active_version_id: 'skv_1',
    })
    expect(d.versions).toHaveLength(1)
    expect(d.versions[0].version).toBe('1.0.0')
    expect(d.active_version_id).toBe('skv_1')
  })
})

describe('normalizeAgent', () => {
  it('组装 runtime_profile 与 skill_bindings', () => {
    const agent = normalizeAgent({
      id: 'agt_1',
      name: '助手',
      slug: 'assistant',
      runtime_profile_id: 'rtp_1',
      runtime_profile: { id: 'rtp_1', name: 'Codex', adapter_type: 'cli-stdio', enabled: true, status: 'ready' },
      current_revision: 3,
      instructions: 'be helpful',
      skill_bindings: [
        {
          id: 'asb_1',
          agent_profile_id: 'agt_1',
          skill_id: 'skl_1',
          skill: { id: 'skl_1', name: 'Skill A', skill_key: 'skill-a' },
          version_constraint: '*',
          enabled: true,
          priority: 10,
        },
        { skill_id: 'bad' }, // 无 id → 丢弃
      ],
    })
    expect(agent.runtime_profile.name).toBe('Codex')
    expect(agent.instructions).toBe('be helpful')
    expect(agent.skill_bindings).toHaveLength(1)
    expect(agent.skill_bindings[0].skill.name).toBe('Skill A')
  })
})

describe('normalizeTask', () => {
  it('归一化 agent/skill/run 与状态', () => {
    const task = normalizeTask({
      id: 'tsk_1',
      session_id: 'ses_1',
      agent_profile: { id: 'agt_1', name: '助手', slug: 'a' },
      requested_skill: { id: 'skl_1', skill_key: 'k', name: 'Skill' },
      message: 'hello',
      status: 'running',
      latest_run: {
        id: 'run_1',
        task_id: 'tsk_1',
        attempt: 1,
        status: 'running',
        runtime_profile_id: 'rtp_1',
        created_at: 100,
      },
      created_at: 100,
      updated_at: 200,
      error: { code: 'X', message: 'boom' },
    })
    expect(task.agent_profile.name).toBe('助手')
    expect(task.requested_skill?.name).toBe('Skill')
    expect(task.latest_run?.id).toBe('run_1')
    expect(task.error?.message).toBe('boom')
  })
})

describe('isTaskActive', () => {
  it('活跃态为 true，终态为 false', () => {
    expect(isTaskActive('queued')).toBe(true)
    expect(isTaskActive('running')).toBe(true)
    expect(isTaskActive('waiting_input')).toBe(true)
    expect(isTaskActive('cancel_requested')).toBe(true)
    expect(isTaskActive('succeeded')).toBe(false)
    expect(isTaskActive('failed')).toBe(false)
    expect(isTaskActive('cancelled')).toBe(false)
  })
})

describe('formatDate', () => {
  it('Epoch 毫秒格式化为 YYYY-MM-DD HH:mm；非法返回空串', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(0)).toBe('')
    expect(formatDate(undefined)).toBe('')
    // 固定 UTC 偏移下至少保证年月日位宽（本地时区）
    const s = formatDate(Date.UTC(2026, 0, 2, 3, 4))
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})

describe('errorMessage', () => {
  it('优先 ApiError.detail，其次 Error.message', () => {
    expect(
      errorMessage(
        new ApiError({ title: 'T', status: 400, code: 'X', detail: '详细错误' }, 400),
      ),
    ).toBe('详细错误')
    expect(errorMessage(new Error('e1'))).toBe('e1')
    expect(errorMessage('x', 'fallback')).toBe('fallback')
  })
})
