/**
 * ComfyUI 工作流 Feature 纯逻辑测试（F8）。
 * - encodeWorkflowPath：含路径分隔符的工作流名逐段编码；
 * - workflowFieldDefault / workflowFieldValue：字段值解析优先级（config > default > 类型缺省）；
 * - buildComfyPayload：节点 config → 提交载荷；
 * - Task Shelf store mergeBackend：comfy 任务恢复标签与类型。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildComfyPayload,
  encodeWorkflowPath,
  workflowFieldDefault,
  workflowFieldValue,
  type WorkflowFieldDef,
} from '@/features/generation/api'
import { useGenerationStore } from '@/features/generation/store'

const textareaField: WorkflowFieldDef = { id: 'f_prompt', node: '46', input: 'value', name: '提示词', type: 'textarea', default: '' }
const numberField: WorkflowFieldDef = { id: 'f_duration', node: '132', input: 'value', name: '时长', type: 'number', default: 8 }
const boolField: WorkflowFieldDef = { id: 'f_use_audio', name: '音频', type: 'boolean', default: false }
const ratioField: WorkflowFieldDef = {
  id: 'f_ratio',
  node: '115',
  input: 'aspect_ratio',
  name: '比例',
  type: 'dropdown',
  default: '16:9 (Widescreen)',
  options: ['16:9 (Widescreen)', '1:1 (Square)'],
}

describe('encodeWorkflowPath', () => {
  it('普通名称原样返回', () => {
    expect(encodeWorkflowPath('MiniMax_H3.json')).toBe('MiniMax_H3.json')
  })

  it('含路径分隔符的名称逐段编码（保留斜杠给后端 {name:path}）', () => {
    expect(encodeWorkflowPath('custom/测试.json')).toBe('custom/%E6%B5%8B%E8%AF%95.json')
  })
})

describe('workflowFieldDefault', () => {
  it('按类型返回缺省值', () => {
    expect(workflowFieldDefault(textareaField)).toBe('')
    expect(workflowFieldDefault(numberField)).toBe(0)
    expect(workflowFieldDefault(boolField)).toBe(false)
  })
})

describe('workflowFieldValue', () => {
  it('优先 config.field_values，其次字段 default，最后类型缺省', () => {
    expect(workflowFieldValue({ field_values: { f_duration: 12 } }, numberField)).toBe(12)
    expect(workflowFieldValue({}, numberField)).toBe(8)
    expect(workflowFieldValue({}, textareaField)).toBe('')
  })

  it('dropdown 字段缺省用字段 default', () => {
    expect(workflowFieldValue({}, ratioField)).toBe('16:9 (Widescreen)')
  })

  it('清除覆盖（值为 undefined）后回退到字段 default', () => {
    expect(workflowFieldValue({ field_values: { f_duration: undefined } }, numberField)).toBe(8)
  })

  it('null default 视为未设置，落到类型缺省', () => {
    const f: WorkflowFieldDef = { ...textareaField, default: null }
    expect(workflowFieldValue({}, f)).toBe('')
  })
})

describe('buildComfyPayload', () => {
  it('从 config 组装载荷并裁剪工作流名', () => {
    const payload = buildComfyPayload({
      workflow: '  custom/测试.json  ',
      field_values: { f_prompt: 'hello', f_duration: 8 },
    })
    expect(payload).toEqual({ workflow: 'custom/测试.json', field_values: { f_prompt: 'hello', f_duration: 8 } })
  })

  it('缺失字段回退空值，field_values 浅拷贝不被外部改动', () => {
    const values = { f_prompt: 'hi' }
    const payload = buildComfyPayload({ workflow: '', field_values: values })
    expect(payload.workflow).toBe('')
    expect(payload.field_values).toEqual(values)
    payload.field_values.f_prompt = 'mutated'
    expect(values.f_prompt).toBe('hi')
  })
})

describe('Task Shelf store comfy 恢复', () => {
  beforeEach(() => {
    useGenerationStore.getState().reset()
  })

  it('mergeBackend 为 comfy 任务标记类型与标签', () => {
    useGenerationStore.getState().mergeBackend([
      { id: 'c1', type: 'comfy', workflow: 'MiniMax_H3.json', status: 'running', created_at: 2, updated_at: 2 },
      { id: 'g1', type: 'image', status: 'succeeded', created_at: 1, updated_at: 1 },
    ])
    const tasks = useGenerationStore.getState().tasks
    const comfy = tasks.find((t) => t.taskId === 'c1')
    expect(comfy?.kind).toBe('comfy')
    expect(comfy?.label).toBe('ComfyUI 工作流')
    expect(comfy?.workflow).toBe('MiniMax_H3.json')
    expect(tasks.find((t) => t.taskId === 'g1')?.kind).toBe('image')
    expect(tasks.find((t) => t.taskId === 'g1')?.label).toBe('生成任务')
  })
})
