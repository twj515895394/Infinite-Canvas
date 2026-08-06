/**
 * 视频生成 Feature 纯逻辑测试（F7）。
 * - buildVideoPayload：节点 config → 提交载荷（默认值回退、seed 空转 null）；
 * - toStableVideoResult / isVideoResult：稳定引用提取与结果类型判别（轮询投影分派依据）；
 * - VIDEO_RATIOS / VIDEO_DURATIONS：参数面板选项。
 */
import { describe, expect, it } from 'vitest'
import {
  buildVideoPayload,
  isVideoResult,
  toStableVideoResult,
  VIDEO_DURATIONS,
  VIDEO_RATIOS,
} from '@/features/generation/api'

describe('buildVideoPayload', () => {
  it('从 config 组装完整载荷', () => {
    const payload = buildVideoPayload({
      prompt: '  一只飞行的龙  ',
      provider: 'comfly',
      model: 'veo3-fast',
      duration: 8,
      aspect_ratio: '9:16',
      resolution: '1080p',
      seed: 42,
      enable_upsample: true,
    })
    expect(payload).toEqual({
      prompt: '一只飞行的龙',
      provider_id: 'comfly',
      model: 'veo3-fast',
      duration: 8,
      aspect_ratio: '9:16',
      resolution: '1080p',
      seed: 42,
      enable_upsample: true,
    })
  })

  it('缺失字段回退默认值，seed 空转 null', () => {
    expect(buildVideoPayload({})).toEqual({
      prompt: '',
      provider_id: '',
      model: '',
      duration: 5,
      aspect_ratio: '16:9',
      resolution: '',
      seed: null,
      enable_upsample: false,
    })
    expect(buildVideoPayload({ seed: '' }).seed).toBeNull()
  })
})

describe('toStableVideoResult / isVideoResult', () => {
  it('提取 videos + items 稳定引用', () => {
    const out = toStableVideoResult({
      videos: ['/output/a.mp4'],
      video_items: [{ url: '/output/a.mp4', kind: 'video', name: 'a.mp4' }],
    })
    expect(out).toEqual({
      videos: ['/output/a.mp4'],
      items: [{ url: '/output/a.mp4', kind: 'video', name: 'a.mp4' }],
    })
  })

  it('缺失结果安全返回空数组', () => {
    expect(toStableVideoResult(null)).toEqual({ videos: [], items: [] })
    expect(toStableVideoResult(undefined)).toEqual({ videos: [], items: [] })
  })

  it('按结果形状判别视频/图片（轮询投影分派依据）', () => {
    expect(isVideoResult({ videos: ['/output/a.mp4'] })).toBe(true)
    expect(isVideoResult({ images: ['/output/a.png'] })).toBe(false)
    expect(isVideoResult(null)).toBe(false)
    expect(isVideoResult(undefined)).toBe(false)
  })
})

describe('视频参数面板选项', () => {
  it('时长选项为常用值', () => {
    expect([...VIDEO_DURATIONS]).toEqual([5, 8, 10])
  })

  it('比例选项含横竖屏与方形', () => {
    const values = VIDEO_RATIOS.map((r) => r.value)
    expect(values).toContain('16:9')
    expect(values).toContain('9:16')
    expect(values).toContain('1:1')
  })
})
