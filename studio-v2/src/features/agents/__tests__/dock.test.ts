/**
 * Agent Dock 纯函数测试（切片 22 F14）。
 * 覆盖上下文转换、Task body 组装、结果提取/文件化；不渲染组件。
 */
import { describe, expect, it } from 'vitest'
import {
  buildTaskCreateBody,
  extractResultText,
  normalizeEventsPage,
  normalizeSession,
  resultToFile,
} from '@/features/agents/dockApi'
import {
  assetToContextRef,
  nodeToContextRef,
  toSelectionRefs,
  type DockContextRef,
} from '@/features/agents/dockStore'

describe('assetToContextRef / nodeToContextRef', () => {
  it('资产无版本返回 null；有版本生成 asset 引用', () => {
    expect(assetToContextRef({ id: 'a1', name: 'x', current_version: null })).toBeNull()
    const ref = assetToContextRef({ id: 'a1', name: '海报', current_version: { id: 'av1' } })
    expect(ref).toEqual({
      key: 'asset:a1:av1',
      reference_type: 'asset',
      reference_id: 'a1',
      version_ref: 'av1',
      title: '海报',
      required: false,
    })
  })

  it('节点引用取 config.name 或 type', () => {
    expect(nodeToContextRef({ id: 'n1', type: 'image-generation', config: { name: '图1' } }).title).toContain('图1')
    expect(nodeToContextRef({ id: 'n2', type: 'asset', config: {} }).reference_type).toBe('node')
  })
})

describe('toSelectionRefs / buildTaskCreateBody', () => {
  const refs: DockContextRef[] = [
    {
      key: 'asset:a1:av1',
      reference_type: 'asset',
      reference_id: 'a1',
      version_ref: 'av1',
      title: '海报',
    },
    {
      key: 'node:n1',
      reference_type: 'node',
      reference_id: 'n1',
      title: '节点',
    },
  ]

  it('toSelectionRefs 保留 type/id/version', () => {
    const out = toSelectionRefs(refs)
    expect(out).toHaveLength(2)
    expect(out[0].version_ref).toBe('av1')
    expect(out[1].reference_type).toBe('node')
  })

  it('buildTaskCreateBody 合并 canvas 引用与 attachment 版本', () => {
    const body = buildTaskCreateBody({
      sessionId: 'ses_1',
      agentProfileId: 'agt_1',
      message: 'hello',
      skillId: 'skl_1',
      projectId: 'p1',
      contextRefs: refs,
      canvasId: 'can_1',
      idempotencyKey: 'k1',
    })
    expect(body.agent_profile_id).toBe('agt_1')
    expect(body.skill_id).toBe('skl_1')
    expect(body.idempotency_key).toBe('k1')
    const ctx = body.context as {
      selection_refs: { reference_type: string; reference_id: string }[]
      attachment_asset_version_ids: string[]
      project_id: string
    }
    expect(ctx.project_id).toBe('p1')
    expect(ctx.attachment_asset_version_ids).toEqual(['av1'])
    expect(ctx.selection_refs.some((r) => r.reference_type === 'canvas' && r.reference_id === 'can_1')).toBe(true)
  })

  it('不重复追加已有 canvas 引用', () => {
    const withCanvas: DockContextRef[] = [
      ...refs,
      { key: 'canvas:can_1', reference_type: 'canvas', reference_id: 'can_1', title: '画布' },
    ]
    const body = buildTaskCreateBody({
      sessionId: 'ses_1',
      agentProfileId: 'agt_1',
      message: 'hi',
      contextRefs: withCanvas,
      canvasId: 'can_1',
      idempotencyKey: 'k2',
    })
    const ctx = body.context as { selection_refs: { reference_type: string }[] }
    expect(ctx.selection_refs.filter((r) => r.reference_type === 'canvas')).toHaveLength(1)
  })
})

describe('extractResultText / resultToFile', () => {
  it('优先 result_summary，其次最后一条 assistant 消息', () => {
    expect(
      extractResultText({
        task: {
          id: 't',
          session_id: 's',
          project_id: null,
          agent_profile: { id: 'a', name: 'A', slug: 'a' },
          requested_skill: null,
          message: 'user msg',
          status: 'succeeded',
          active_run_id: null,
          revision: 1,
          latest_run: {
            id: 'r',
            task_id: 't',
            attempt: 1,
            status: 'succeeded',
            runtime_profile_id: 'rtp',
            result_summary: '  summary  ',
            created_at: 1,
            started_at: null,
            finished_at: null,
            error: null,
          },
          created_at: 1,
          updated_at: 1,
          finished_at: 1,
          error: null,
        },
        events: [{ sequence: 1, event_type: 'message-completed', role: 'assistant', content: 'from event', created_at: 1 }],
      }),
    ).toBe('summary')

    expect(
      extractResultText({
        events: [
          { sequence: 1, event_type: 'message', role: 'user', content: 'q', created_at: 1 },
          { sequence: 2, event_type: 'message-completed', role: 'assistant', content: 'answer', created_at: 2 },
        ],
      }),
    ).toBe('answer')
  })

  it('resultToFile 生成 txt/json', async () => {
    const txt = resultToFile('hello', 'text', 'r')
    expect(txt.name).toBe('r.txt')
    expect(txt.type).toBe('text/plain')
    expect(await txt.text()).toBe('hello')

    const json = resultToFile('{"a":1}', 'json', 'r')
    expect(json.name).toBe('r.json')
    expect(json.type).toBe('application/json')
    expect(await json.text()).toContain('"a"')

    // 非法 JSON 时包一层 {text}
    const wrapped = resultToFile('not-json', 'json', 'r')
    expect(await wrapped.text()).toContain('not-json')
  })
})

describe('normalizeSession / normalizeEventsPage', () => {
  it('session 缺字段回落', () => {
    const s = normalizeSession({ id: 'ses_1', agent_profile_id: 'agt_1' })
    expect(s.id).toBe('ses_1')
    expect(s.agent_profile.name).toBe('Agent')
    expect(s.status).toBe('ready')
  })

  it('events 页过滤非法项并解析 run', () => {
    const page = normalizeEventsPage({
      task_id: 'tsk_1',
      status: 'running',
      next_cursor: 3,
      events: [
        { sequence: 1, event_type: 'message', role: 'user', content: 'hi', created_at: 1 },
        { event_type: 'bad' },
      ],
      run: { id: 'run_1', status: 'running', result_summary: null, error: { message: 'x' } },
    })
    expect(page.events).toHaveLength(1)
    expect(page.run?.id).toBe('run_1')
    expect(page.run?.error?.message).toBe('x')
    expect(page.next_cursor).toBe(3)
  })
})
