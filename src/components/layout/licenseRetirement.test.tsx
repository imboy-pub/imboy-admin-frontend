/**
 * License UI 退役回归（退役提交 88eb15d；第三期 P3-7 补欠账）。
 *
 * 退役合同：
 * 1. LicenseExpiryBanner / QuotaWarningBanner 组件与其测试文件不复存在；
 * 2. sidebarSchema（直接项与组内 children）无 license/quota 入口；
 * 3. App.tsx 无 license 路由/横幅注册。
 *
 * 边界：API 层 license 字段（adminConfig/systemHealth）是后端合同投影，
 * 后端仍下发这些字段，不属于本退役合同——见 services/api/*。
 */
import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultConfig } from './sidebarSchema'

function allItems(): { path?: string; label: string }[] {
  const flat: { path?: string; label: string }[] = []
  for (const item of defaultConfig.items as Array<Record<string, unknown>>) {
    flat.push(item as { path?: string; label: string })
    if (Array.isArray(item.children)) {
      for (const child of item.children) {
        flat.push(child as { path?: string; label: string })
      }
    }
  }
  return flat
}

describe('License UI 退役回归（88eb15d）', () => {
  it('退役组件与其测试文件不复存在', () => {
    const retired = [
      'LicenseExpiryBanner.tsx',
      'LicenseExpiryBanner.test.tsx',
      'QuotaWarningBanner.tsx',
    ]
    for (const f of retired) {
      expect(existsSync(join(import.meta.dir, f))).toBe(false)
    }
  })

  it('sidebarSchema 无 license/quota 入口（直接项与组内 children）', () => {
    const hits = allItems().filter((i) =>
      /licen[cs]e|quota/i.test(`${i.path ?? ''} ${i.label}`),
    )
    expect(hits).toEqual([])
  })

  it('App.tsx 无 license 路由/横幅注册', () => {
    const appSrc = readFileSync(join(import.meta.dir, '../../App.tsx'), 'utf8')
    expect(/licen[cs]e/i.test(appSrc)).toBe(false)
  })
})
