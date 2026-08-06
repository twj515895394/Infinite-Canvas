/**
 * Toast store 纯逻辑（F16）：合并 fingerprint、上限、dismiss。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toast, useToastStore } from '@/core/feedback/toastStore'
import { errorMessage, isRetryableError } from '@/core/api/errors'
import { ApiError } from '@/core/api/client'

describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.getState().clear()
  })

  it('push 追加 toast，并按 fingerprint 合并刷新', () => {
    const id1 = toast.danger('加载失败', '第一次', { fingerprint: 'q1' })
    const id2 = toast.danger('加载失败', '第二次', { fingerprint: 'q1' })
    expect(id1).toBe(id2)
    const items = useToastStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0]?.description).toBe('第二次')
  })

  it('不同 fingerprint 各自保留，超过上限只留最近 4 条', () => {
    for (let i = 0; i < 6; i += 1) {
      toast.info(`t${i}`, undefined, { fingerprint: `f${i}` })
    }
    const items = useToastStore.getState().items
    expect(items).toHaveLength(4)
    expect(items.map((t) => t.title)).toEqual(['t2', 't3', 't4', 't5'])
  })

  it('dismiss 按 id 移除', () => {
    const id = toast.success('已保存')
    expect(useToastStore.getState().items).toHaveLength(1)
    toast.dismiss(id)
    expect(useToastStore.getState().items).toHaveLength(0)
  })
})

describe('errorMessage / isRetryableError', () => {
  it('优先 ApiProblem.detail', () => {
    expect(
      errorMessage(new ApiError({ title: 'T', status: 400, code: 'X', detail: '细节' }, 400)),
    ).toBe('细节')
    expect(errorMessage(new Error('e'))).toBe('e')
    expect(errorMessage('x', 'fb')).toBe('fb')
  })

  it('5xx 与 retryable=true 可重试', () => {
    expect(isRetryableError(new ApiError({ title: 'T', status: 503, code: 'X' }, 503))).toBe(true)
    expect(
      isRetryableError(new ApiError({ title: 'T', status: 400, code: 'X', retryable: true }, 400)),
    ).toBe(true)
    expect(
      isRetryableError(new ApiError({ title: 'T', status: 500, code: 'X', retryable: false }, 500)),
    ).toBe(false)
  })
})
