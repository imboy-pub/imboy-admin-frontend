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
  identity: { id: '111111111111111111' },
  assignment: { id: '222222222222222222' },
  seat: {
    business_identity_id: '111111111111111111',
    workspace_id: '9876543210987654321',
    enabled: true,
    status: 'enabled',
  },
  repaired: false,
  audit: [
    {
      action: 'cs_identity.create',
      actor: 'adm-1',
      target: 'identity:111111111111111111',
      before: null,
      after: '{"status":"active"}',
    },
    {
      action: 'cs_seat.enable',
      actor: 'adm-1',
      target: 'seat:111111111111111111',
      before: '{"enabled":false}',
      after: '{"enabled":true}',
    },
  ],
}

describe('toCsProvisioningResult（A01 投影）', () => {
  it('解析嵌套形状：identity/assignment/seat/audit 全量投影', () => {
    const result = toCsProvisioningResult(VALID_RESULT)
    expect(result).not.toBeNull()
    expect(result?.organization_id).toBe('1234567890123456789')
    expect(result?.identity_id).toBe('111111111111111111')
    expect(result?.assignment_id).toBe('222222222222222222')
    expect(result?.seat?.enabled).toBe(true)
    expect(result?.repaired).toBe(false)
    expect(result?.audits).toHaveLength(2)
    expect(result?.audits[0]?.actor).toBe('adm-1')
    expect(result?.audits[1]?.before).toBe('{"enabled":false}')
    expect(result?.audits[1]?.after).toBe('{"enabled":true}')
  })

  it('解析平铺 *_id 形状（BE-S01b 未定稿的容错口径）', () => {
    const result = toCsProvisioningResult({
      organization_id: '1234567890123456789',
      workspace_id: '9876543210987654321',
      identity_id: '111111111111111111',
      assignment_id: '222222222222222222',
      seat: { business_identity_id: '111111111111111111', enabled: 'true', status: 'enabled' },
      audit_entries: VALID_RESULT['audit'],
    })
    expect(result?.identity_id).toBe('111111111111111111')
    expect(result?.seat?.enabled).toBe(true)
    expect(result?.audits).toHaveLength(2)
  })

  it('缺 organization/workspace/identity 事实 → null（fail-closed）', () => {
    expect(toCsProvisioningResult(null)).toBeNull()
    expect(toCsProvisioningResult({})).toBeNull()
    expect(toCsProvisioningResult({ ...VALID_RESULT, organization_id: undefined })).toBeNull()
    expect(toCsProvisioningResult({ ...VALID_RESULT, identity: {} })).toBeNull()
  })

  it('TSID 以 number 传输 → 投影拒绝（TSID-string 纪律）', () => {
    const result = toCsProvisioningResult({
      ...VALID_RESULT,
      identity: { id: 42 },
      identity_id: undefined,
    })
    expect(result).toBeNull()
  })

  it('顶层命中敏感键 → 整体拒绝；audit 条目命中敏感键 → 单条丢弃', () => {
    expect(toCsProvisioningResult({ ...VALID_RESULT, shop_key: 'leak' })).toBeNull()
    const withLeakyAudit = toCsProvisioningResult({
      ...VALID_RESULT,
      audit: [
        ...VALID_RESULT['audit'],
        { action: 'x', actor: 'a', target: 't', secret: 'leak' },
      ],
    })
    expect(withLeakyAudit?.audits).toHaveLength(2)
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
