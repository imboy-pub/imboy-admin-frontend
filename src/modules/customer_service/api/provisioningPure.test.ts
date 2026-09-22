/**
 * ADM-01 开通向导纯函数单元测试。
 *
 * 覆盖验收点：
 * - A01：provisioning 响应投影保留 audit（actor/target/before/after）；
 * - A04：origin 严格校验复用（无通配/路径）；
 * - A05：snippet 只含 public widget id——结构上无 organization 参数，
 *   负例锁死 data-org-id / secret / token / shop_key。
 */
import { describe, expect, it } from 'bun:test'
import {
  buildProvisionSnippet,
  toCsProvisioningAuditEntry,
  toCsProvisioningAuditList,
  toCsProvisioningResult,
} from './provisioningPure'

const VALID_RESULT = {
  organization_id: '1234567890123456789',
  workspace_id: '9876543210987654321',
  business_identity_id: '111111111111111111',
  identity_created: true,
  seat_enabled: true,
  seat: { enabled: true, max_concurrent: 3 },
}

describe('toCsProvisioningResult（EADM-05 真实后端字段投影）', () => {
  it('解析真实形状：business_identity_id / identity_created / seat.{enabled,max_concurrent}', () => {
    const result = toCsProvisioningResult(VALID_RESULT)
    expect(result).not.toBeNull()
    expect(result?.organization_id).toBe('1234567890123456789')
    expect(result?.workspace_id).toBe('9876543210987654321')
    expect(result?.business_identity_id).toBe('111111111111111111')
    expect(result?.identity_created).toBe(true)
    expect(result?.seat?.enabled).toBe(true)
    expect(result?.seat?.max_concurrent).toBe(3)
    // 后端不出站审计数组：恒定空
    expect(result?.audits).toEqual([])
  })

  it('幂等命中（已存在）：identity_created=false 透传', () => {
    const result = toCsProvisioningResult({
      organization_id: '1234567890123456789',
      workspace_id: '9876543210987654321',
      business_identity_id: '111111111111111111',
      identity_created: false,
      seat: { enabled: 'true', max_concurrent: 3 },
    })
    expect(result?.identity_created).toBe(false)
    expect(result?.seat?.enabled).toBe(true)
  })

  it('缺 organization/workspace/business_identity 事实 → null（fail-closed）', () => {
    expect(toCsProvisioningResult(null)).toBeNull()
    expect(toCsProvisioningResult({})).toBeNull()
    expect(toCsProvisioningResult({ ...VALID_RESULT, organization_id: undefined })).toBeNull()
    expect(toCsProvisioningResult({ ...VALID_RESULT, business_identity_id: undefined })).toBeNull()
    expect(toCsProvisioningResult({ ...VALID_RESULT, workspace_id: '' })).toBeNull()
  })

  it('business_identity_id 以 number 传输 → 投影拒绝（TSID-string 纪律）', () => {
    const result = toCsProvisioningResult({
      ...VALID_RESULT,
      business_identity_id: 42,
    })
    expect(result).toBeNull()
  })

  it('顶层命中敏感键 → 整体拒绝', () => {
    expect(toCsProvisioningResult({ ...VALID_RESULT, shop_key: 'leak' })).toBeNull()
  })
})

describe('toCsProvisioningAuditEntry（审计五键白名单）', () => {
  it('缺 action/actor/target 返回 null', () => {
    expect(toCsProvisioningAuditEntry({ action: 'a', actor: 'b' })).toBeNull()
    expect(toCsProvisioningAuditEntry('not-an-object')).toBeNull()
  })

  it('列表解析过滤非法条目', () => {
    const list = toCsProvisioningAuditList([
      { action: 'a', actor: 'b', target: 'c', before: 'x', after: 'y' },
      null,
      { actor: 'no-action' },
    ])
    expect(list).toHaveLength(1)
    expect(list[0]?.target).toBe('c')
  })
})

describe('buildProvisionSnippet（A05）', () => {
  const ORIGIN = 'https://widget.example.com'
  const WIDGET_ID = 'wgt_pub_demo1'

  it('生成只含 public widget id 的 snippet；origin 只出现在 loader src', () => {
    const snippet = buildProvisionSnippet(WIDGET_ID, { widgetOrigin: ORIGIN })
    expect(snippet).toBe(
      `<script async src="${ORIGIN}/loader.js" data-widget-id="${WIDGET_ID}"></script>`
    )
  })

  it('负例：snippet 不含租户参数与任何 secret（锁死）', () => {
    const snippet = buildProvisionSnippet(WIDGET_ID, { widgetOrigin: ORIGIN })
    expect(snippet.includes('data-org-id')).toBe(false)
    expect(snippet.includes('organization')).toBe(false)
    expect(snippet.includes('1234567890123456789')).toBe(false)
    expect(snippet.includes('secret')).toBe(false)
    expect(snippet.includes('token')).toBe(false)
    expect(snippet.includes('shop_key')).toBe(false)
  })

  it('public_widget_id 形状非法 → 拒绝生成', () => {
    expect(() => buildProvisionSnippet('bad id with space', { widgetOrigin: ORIGIN })).toThrow()
    expect(() => buildProvisionSnippet('', { widgetOrigin: ORIGIN })).toThrow()
  })

  it('A04 口径：通配 / 路径 / 非 http(s) origin 全部拒绝', () => {
    expect(() => buildProvisionSnippet(WIDGET_ID, { widgetOrigin: 'https://*.example.com' })).toThrow()
    expect(() => buildProvisionSnippet(WIDGET_ID, { widgetOrigin: 'https://widget.example.com/path' })).toThrow()
    expect(() => buildProvisionSnippet(WIDGET_ID, { widgetOrigin: 'ftp://widget.example.com' })).toThrow()
    expect(() => buildProvisionSnippet(WIDGET_ID, { widgetOrigin: 'not a url' })).toThrow()
  })

  it('origin 规范化：端口精确保留，默认端口归一', () => {
    expect(
      buildProvisionSnippet(WIDGET_ID, { widgetOrigin: 'http://localhost:3000/' }).includes(
        'src="http://localhost:3000/loader.js"'
      )
    ).toBe(true)
    expect(
      buildProvisionSnippet(WIDGET_ID, { widgetOrigin: 'https://widget.example.com:443' }).includes(
        'src="https://widget.example.com/loader.js"'
      )
    ).toBe(true)
  })
})
