/**
 * CSW-01 Widget installation 管理面单元测试。
 *
 * 覆盖验收点：
 * - A06（管理面）：路径只落 /api/adm/customer-service/widget-installations*；
 *   installation 不签发 shop_key，列表投影熔断 secret；
 * - 接入代码只含 script + public widget_id，绝不出现任何 secret（负例锁死）；
 * - allowed_origins 解析拒绝非法 origin / 通配 / 路径。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  buildEmbedCode,
  isValidOrganizationId,
  isValidPublicWidgetId,
  parseAllowedOriginsInput,
  toWidgetInstallation,
  toWidgetInstallationList,
} from './widgetInstallationsPure'
import {
  createWidgetInstallation,
  listWidgetInstallations,
  revokeWidgetInstallation,
} from './widgetInstallations'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

function captureCalls(responder?: (_url: string, _body: unknown) => unknown) {
  const calls: Array<{ method: string; url: string; body: unknown }> = []
  mutableClient.get = (url: unknown) => {
    calls.push({ method: 'GET', url: String(url), body: null })
    const payload = responder?.(String(url), null) ?? { installations: [] }
    return { data: { code: 0, msg: 'success', payload } }
  }
  mutableClient.post = (url: unknown, body: unknown) => {
    calls.push({ method: 'POST', url: String(url), body })
    const payload = responder?.(String(url), body) ?? {}
    return { data: { code: 0, msg: 'success', payload } }
  }
  return calls
}

const SCOPE = { organizationId: '1234567890123456789', workspaceId: '9876543210987654321' }

describe('installation API 路径（A06）', () => {
  it('list/create/revoke 全部落在 /customer-service/widget-installations 下且带租户条件', async () => {
    const calls = captureCalls((url) => {
      if (url.endsWith('/revoke')) return { installation: { id: '1', public_widget_id: 'wgt_pub_x' } }
      if (url.includes('/widget-installations/')) return { installation: { id: '1', public_widget_id: 'wgt_pub_x' } }
      return { installation: { id: '1', public_widget_id: 'wgt_pub_x' } }
    })
    await listWidgetInstallations(SCOPE)
    await createWidgetInstallation({
      ...SCOPE,
      displayName: '商城客服',
      allowedOrigins: ['https://shop.example.com'],
      branding: { displayName: 'Example', primaryColor: '#2563eb' },
      consentVersion: 'v1',
    })
    await revokeWidgetInstallation({ ...SCOPE, installationId: '555555555555555555' })
    expect(calls).toHaveLength(3)
    expect(calls[0]?.url).toBe('/customer-service/widget-installations')
    expect(calls[1]?.url).toBe('/customer-service/widget-installations')
    expect(calls[2]?.url).toBe('/customer-service/widget-installations/555555555555555555/revoke')
    for (const call of calls) {
      expect(call.url.includes('/api/v1')).toBe(false)
    }
    // 创建 body 白名单键：绝无 secret 字段
    const createBody = calls[1]?.body as Record<string, unknown>
    expect(Object.keys(createBody).sort()).toEqual([
      'allowed_origins',
      'branding',
      'consent_version',
      'display_name',
      'organization_id',
      'workspace_id',
    ])
  })

})

describe('installation 投影熔断（A04/A06）', () => {
  it('列表行命中敏感键整体丢弃；白名单字段保留', () => {
    expect(
      toWidgetInstallation({
        id: '1',
        public_widget_id: 'wgt_pub_x',
        display_name: 'A',
        shop_key: 'sk_live_OOPS',
        allowed_origins: ['https://shop.example.com/'],
        branding: { display_name: 'Example', primary_color: '#2563eb', logo_url: 'https://x/y.png' },
        consent_version: 'v1',
        status: 'active',
      })
    ).toBeNull()
    const clean = toWidgetInstallation({
      id: '1',
      public_widget_id: 'wgt_pub_x',
      display_name: 'A',
      allowed_origins: ['https://shop.example.com/', 'not-a-origin'],
      branding: { display_name: 'Example', primary_color: 'javascript:alert(1)' },
      consent_version: 'v1',
      status: 'revoked',
    })
    expect(clean).not.toBeNull()
    expect(clean?.allowed_origins).toEqual(['https://shop.example.com'])
    expect(clean?.branding.primary_color).toBeNull()
    expect(clean?.status).toBe('revoked')
  })

  it('toWidgetInstallationList 容忍数组与 {installations} 两种形状', () => {
    expect(toWidgetInstallationList({ installations: [{ id: '1', public_widget_id: 'w' }] })).toHaveLength(1)
    expect(toWidgetInstallationList([{ id: '2', public_widget_id: 'w2' }])).toHaveLength(1)
    expect(toWidgetInstallationList(null)).toEqual([])
  })

  it('created_at 按 epoch 秒 number 惯例规范化为 string；null 落 null（W4-7 回归）', () => {
    const row = toWidgetInstallation({
      id: '1',
      public_widget_id: 'wgt_pub_x',
      created_at: 1789638174,
      allowed_origins: [],
      branding: {},
      status: 'active',
    })
    expect(row?.created_at).toBe('1789638174')
    expect(toWidgetInstallation({ id: '2', public_widget_id: 'w', created_at: null })?.created_at).toBeNull()
    expect(
      toWidgetInstallation({ id: '3', public_widget_id: 'w', created_at: '2026-09-17T00:00:00Z' })?.created_at,
    ).toBe('2026-09-17T00:00:00Z')
  })
})

describe('接入代码只含公开标识（负例锁死）', () => {
  const EMBED = { widgetOrigin: 'https://cs.example.com' }
  it('embed code 只包含 loader 地址和公开 widget id', () => {
    const code = buildEmbedCode('wgt_pub_abc123', EMBED)
    expect(code).toContain('<script async')
    expect(code).toContain('src="https://cs.example.com/loader.js"')
    expect(code).toContain('data-widget-id="wgt_pub_abc123"')
    expect(code).not.toContain('data-org-id')
    expect(code).not.toMatch(/shop_key|shop-key|secret|token|sk_live|signature/i)
  })

  it('非法 public_widget_id / origin 拒绝生成（防注入）', () => {
    expect(() => buildEmbedCode('wgt"><script>alert(1)</script>', EMBED)).toThrow()
    expect(() => buildEmbedCode('wgt_pub_ok', { widgetOrigin: 'javascript:alert(1)' })).toThrow()
    expect(() => buildEmbedCode('wgt_pub_ok', { widgetOrigin: 'https://cs.example.com/path' })).toThrow()
    expect(isValidPublicWidgetId('wgt_pub_ok')).toBe(true)
    expect(isValidPublicWidgetId('bad id')).toBe(false)
    expect(isValidOrganizationId('1234567890123456789')).toBe(true)
    expect(isValidOrganizationId('0')).toBe(false)
    expect(isValidOrganizationId('12a')).toBe(false)
  })

  it('allowed_origins 解析：拒通配/路径/非 http(s)，去重', () => {
    const parsed = parseAllowedOriginsInput('https://a.example.com\nhttps://b.example.com/, https://a.example.com\ngit://x\nhttps://c.example.com/path')
    expect(parsed.origins).toEqual(['https://a.example.com', 'https://b.example.com'])
    expect(parsed.errors).toEqual(['git://x', 'https://c.example.com/path'])
  })
})
