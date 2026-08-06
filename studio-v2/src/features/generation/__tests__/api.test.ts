/**
 * 生成 Feature 纯逻辑测试（F6）。
 * - buildSizeString：ratio/resolution → size 字符串（与旧前端 SIZE_MAP 等价）；
 * - buildSubmitPayload：节点 config → 提交载荷（默认值回退）；
 * - isTaskActive / TASK_STATUS_LABELS：状态机语义。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildSizeString,
  buildSubmitPayload,
  isTaskActive,
  normalizeFieldOptions,
  TASK_STATUS_LABELS,
} from '@/features/generation/api'
import { useGenerationStore } from '@/features/generation/store'
import { useEditorStore } from '@/features/canvas/store'

describe('buildSizeString', () => {
  it('1:1 各分辨率映射为正方形尺寸', () => {
    expect(buildSizeString('1:1', '1k')).toBe('1024x1024')
    expect(buildSizeString('1:1', '2k')).toBe('2048x2048')
    expect(buildSizeString('1:1', '4k')).toBe('4096x4096')
  })

  it('16:9 与 9:16 映射横竖屏尺寸', () => {
    expect(buildSizeString('16:9', '1k')).toBe('1280x720')
    expect(buildSizeString('9:16', '1k')).toBe('720x1280')
  })

  it('auto 分辨率直接透传（gpt-image 自动尺寸）', () => {
    expect(buildSizeString('1:1', 'auto')).toBe('auto')
  })

  it('未知 ratio 回退正方形，未知分辨率回退 1024x1024', () => {
    expect(buildSizeString('21:9', '1k')).toBe('1024x1024')
    expect(buildSizeString('1:1', '8k')).toBe('1024x1024')
  })
})

describe('buildSubmitPayload', () => {
  it('从 config 组装完整载荷', () => {
    const payload = buildSubmitPayload({
      prompt: '  a cat  ',
      provider: 'jimeng',
      model: '5.0',
      size: { ratio: '16:9', resolution: '2k' },
      quality: 'high',
      n: 2,
    })
    expect(payload).toEqual({
      prompt: 'a cat',
      provider_id: 'jimeng',
      model: '5.0',
      size: '2048x1152',
      quality: 'high',
      n: 2,
    })
  })

  it('缺失字段回退默认值', () => {
    const payload = buildSubmitPayload({})
    expect(payload).toEqual({
      prompt: '',
      provider_id: '',
      model: '',
      size: '1024x1024',
      quality: 'auto',
      n: 1,
    })
  })
})

describe('任务状态语义', () => {
  it('active 状态集合正确', () => {
    expect(isTaskActive('queued')).toBe(true)
    expect(isTaskActive('running')).toBe(true)
    expect(isTaskActive('jimeng_pending')).toBe(true)
    expect(isTaskActive('succeeded')).toBe(false)
    expect(isTaskActive('failed')).toBe(false)
    expect(isTaskActive('cancelled')).toBe(false)
  })

  it('状态标签覆盖全部状态', () => {
    expect(TASK_STATUS_LABELS.queued).toBe('排队中')
    expect(TASK_STATUS_LABELS.running).toBe('生成中')
    expect(TASK_STATUS_LABELS.jimeng_pending).toBe('即梦排队中')
    expect(TASK_STATUS_LABELS.succeeded).toBe('成功')
    expect(TASK_STATUS_LABELS.failed).toBe('失败')
    expect(TASK_STATUS_LABELS.cancelled).toBe('已取消')
  })
})

describe('normalizeFieldOptions', () => {
  it('裸数字选项归一化为 {value,label}', () => {
    expect(normalizeFieldOptions([1, 2, 3, 4])).toEqual([
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
    ])
  })

  it('{value,label} 选项原样归一化', () => {
    expect(normalizeFieldOptions([{ value: 'auto', label: '自动' }])).toEqual([{ value: 'auto', label: '自动' }])
  })
})

describe('Task Shelf store', () => {
  beforeEach(() => {
    useGenerationStore.getState().reset()
    useEditorStore.getState().reset()
  })

  it('upsert 新增与去重', () => {
    const store = useGenerationStore.getState()
    store.upsert({ taskId: 't1', label: '图片生成', status: 'queued', createdAt: 1, updatedAt: 1 })
    store.upsert({ taskId: 't2', label: '图片生成', status: 'queued', createdAt: 2, updatedAt: 2 })
    expect(useGenerationStore.getState().tasks).toHaveLength(2)
    useGenerationStore.getState().upsert({ taskId: 't1', label: '图片生成', status: 'running', createdAt: 1, updatedAt: 3 })
    const tasks = useGenerationStore.getState().tasks
    expect(tasks).toHaveLength(2)
    expect(tasks.find((t) => t.taskId === 't1')?.status).toBe('running')
  })

  it('mergeBackend 去重并保留本地 nodeId 关联', () => {
    const store = useGenerationStore.getState()
    store.upsert({ taskId: 't1', nodeId: 'n1', label: '图片生成', status: 'running', createdAt: 1, updatedAt: 1 })
    useGenerationStore.getState().mergeBackend([
      { id: 't1', status: 'succeeded', created_at: 1, updated_at: 2 },
      { id: 't2', status: 'running', created_at: 3, updated_at: 3 },
    ])
    const tasks = useGenerationStore.getState().tasks
    expect(tasks).toHaveLength(2)
    expect(tasks.find((t) => t.taskId === 't1')?.nodeId).toBe('n1')
    expect(tasks.find((t) => t.taskId === 't1')?.status).toBe('running') // 本地条目不被覆盖
  })

  it('clearFinished 只保留非终态任务', () => {
    const store = useGenerationStore.getState()
    store.upsert({ taskId: 't1', label: '图片生成', status: 'running', createdAt: 1, updatedAt: 1 })
    store.upsert({ taskId: 't2', label: '图片生成', status: 'succeeded', createdAt: 2, updatedAt: 2 })
    store.upsert({ taskId: 't3', label: '图片生成', status: 'failed', createdAt: 3, updatedAt: 3 })
    useGenerationStore.getState().clearFinished()
    expect(useGenerationStore.getState().tasks.map((t) => t.taskId)).toEqual(['t1'])
  })
})
