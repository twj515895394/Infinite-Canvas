/**
 * 项目/画布 query key 与类型面冒烟（F16 补齐项目详情链路）。
 * 不打网络，只锁契约形状，防止 key 漂移导致缓存失效。
 */
import { describe, expect, it } from 'vitest'
import { projectKeys } from '@/features/projects/api'

describe('projectKeys', () => {
  it('detail / canvases 嵌套在 projects 之下', () => {
    expect(projectKeys.all).toEqual(['projects'])
    expect(projectKeys.detail('prj_1')).toEqual(['projects', 'prj_1'])
    expect(projectKeys.canvases('prj_1')).toEqual(['projects', 'prj_1', 'canvases'])
  })
})
