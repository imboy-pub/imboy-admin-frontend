import { describe, expect, it } from 'bun:test'
import { normalizePluginState } from './plugins'

describe('normalizePluginState', () => {
  it('后端 failed 态归一为前端 error（错误徽标 + 重置/强制卸载入口）', () => {
    expect(normalizePluginState('failed')).toBe('error')
  })

  it('已知六态直通', () => {
    for (const s of ['installed', 'enabled', 'disabled', 'error', 'installing', 'upgrading'] as const) {
      expect(normalizePluginState(s)).toBe(s)
    }
  })

  it('缺失或空值回退 disabled（与历史行为一致）', () => {
    expect(normalizePluginState(undefined)).toBe('disabled')
    expect(normalizePluginState(null)).toBe('disabled')
    expect(normalizePluginState('')).toBe('disabled')
  })
})
