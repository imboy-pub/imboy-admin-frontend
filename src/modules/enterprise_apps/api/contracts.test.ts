/**
 * Admin 企业应用治理 — 冻结合同测试。
 *
 * 钉住的东西（路径漂移 / 权限码漂移 / scope 目录漂移一律红）：
 *  1. A-01..A-14 的 method+path 逐字字符串（checkpoint §0.5）；
 *  2. 权限码恰为后端已声明的 `enterprise_business:read|write`；
 *  3. scope 目录恰为后端固定 17 值，**无 wildcard**，三个高危 scope 不被隐含（INV-4）；
 *  4. 禁键清单包含 secret / digest / payload 家族；
 *  5. 分页边界夹紧（1..100，缺省 10）。
 */
import { describe, expect, it } from 'bun:test'
import { impliedScopes } from './pureFunctions'
import {
  APPLICATION_STATUSES,
  CREDENTIAL_SAFE_KEYS,
  DEFAULT_PAGE_SIZE,
  DELIVERY_SAFE_KEYS,
  ENDPOINTS,
  MAX_PAGE_SIZE,
  NEVER_IMPLIED_SCOPES,
  PAYLOAD_FORBIDDEN_KEYS,
  READ_PERMISSION,
  SCOPE_CATALOG,
  SECRET_FORBIDDEN_KEYS,
  STATUS_TRANSITIONS,
  WRITE_PERMISSION,
  clampPage,
  clampPageSize,
} from './contracts'

const ORG = '1234567890123456789'
const APP = '2234567890123456789'
const CRED = '3234567890123456789'
const GRANT = '4234567890123456789'

describe('FULL-04 冻结合同 / contracts', () => {
  it('权限码恰为后端 role_acl 已声明的两个码（不新增权限码）', () => {
    expect(READ_PERMISSION).toBe('enterprise_business:read')
    expect(WRITE_PERMISSION).toBe('enterprise_business:write')
  })

  it('A-01..A-14 路径逐字冻结（全部挂在 /enterprise 之下 → /api/adm/enterprise/...）', () => {
    expect(ENDPOINTS.applications(ORG)).toBe(`/enterprise/organizations/${ORG}/applications`)
    expect(ENDPOINTS.applications(ORG, { page: 2, size: 10, status: 'active', q: 'x' })).toBe(
      `/enterprise/organizations/${ORG}/applications?page=2&size=10&status=active&q=x`
    )
    expect(ENDPOINTS.applicationDetail(ORG, APP)).toBe(`/enterprise/organizations/${ORG}/applications/${APP}`)
    expect(ENDPOINTS.applicationStatus(ORG, APP)).toBe(
      `/enterprise/organizations/${ORG}/applications/${APP}/status`
    )
    expect(ENDPOINTS.applicationScopes(ORG, APP)).toBe(
      `/enterprise/organizations/${ORG}/applications/${APP}/scopes`
    )
    expect(ENDPOINTS.credentials(ORG, APP)).toBe(`/enterprise/organizations/${ORG}/applications/${APP}/credentials`)
    expect(ENDPOINTS.issueCredential(ORG, APP)).toBe(
      `/enterprise/organizations/${ORG}/applications/${APP}/credentials`
    )
    expect(ENDPOINTS.rotateCredential(ORG, APP, CRED)).toBe(
      `/enterprise/organizations/${ORG}/applications/${APP}/credentials/${CRED}/rotate`
    )
    expect(ENDPOINTS.revokeCredential(ORG, APP, CRED)).toBe(
      `/enterprise/organizations/${ORG}/applications/${APP}/credentials/${CRED}`
    )
    expect(ENDPOINTS.grants(ORG, APP)).toBe(`/enterprise/organizations/${ORG}/applications/${APP}/grants`)
    expect(ENDPOINTS.issueGrant(ORG, APP)).toBe(`/enterprise/organizations/${ORG}/applications/${APP}/grants`)
    expect(ENDPOINTS.grant(ORG, APP, GRANT)).toBe(
      `/enterprise/organizations/${ORG}/applications/${APP}/grants/${GRANT}`
    )
    expect(ENDPOINTS.deliveryStats(ORG, APP)).toBe(
      `/enterprise/organizations/${ORG}/applications/${APP}/delivery-stats`
    )
    expect(ENDPOINTS.deliveries(ORG, APP)).toBe(`/enterprise/organizations/${ORG}/applications/${APP}/deliveries`)
    expect(ENDPOINTS.auditLogs(ORG, APP)).toBe(`/enterprise/organizations/${ORG}/applications/${APP}/audit-logs`)
  })

  it('admin 治理面前缀不是 internal 前缀（结构上不可能误调 INV-2/INV-3 禁面）', () => {
    const all = [
      ENDPOINTS.applications(ORG),
      ENDPOINTS.applicationDetail(ORG, APP),
      ENDPOINTS.applicationStatus(ORG, APP),
      ENDPOINTS.applicationScopes(ORG, APP),
      ENDPOINTS.credentials(ORG, APP),
      ENDPOINTS.issueCredential(ORG, APP),
      ENDPOINTS.rotateCredential(ORG, APP, CRED),
      ENDPOINTS.revokeCredential(ORG, APP, CRED),
      ENDPOINTS.grants(ORG, APP),
      ENDPOINTS.grant(ORG, APP, GRANT),
      ENDPOINTS.deliveryStats(ORG, APP),
      ENDPOINTS.deliveries(ORG, APP),
      ENDPOINTS.auditLogs(ORG, APP),
    ]
    for (const path of all) {
      expect(path.startsWith('/enterprise/')).toBe(true)
      expect(path).not.toContain('/api/internal')
      expect(path).not.toContain('internal/v1')
      expect(path).not.toContain('/api/v1')
    }
  })

  it('缺少必填 ID 时抛错（不发出半截路径请求）', () => {
    expect(() => ENDPOINTS.applications('')).toThrow()
    expect(() => ENDPOINTS.applicationDetail('', APP)).toThrow()
    expect(() => ENDPOINTS.applicationDetail(ORG, '   ')).toThrow()
    expect(() => ENDPOINTS.rotateCredential(ORG, APP, '')).toThrow()
  })

  it('scope 目录恰为后端固定 17 值，顺序逐字一致', () => {
    expect(SCOPE_CATALOG).toEqual([
      'application:read',
      'identities:read',
      'identities:write',
      'groups:read',
      'groups:write',
      'workspaces:read',
      'projects:read',
      'channels:read',
      'files:write',
      'messages:send',
      'messages:send_as_human',
      'friend_requests:create',
      'webhooks:manage',
      'sso:exchange',
      'customer_service:read',
      'customer_service:write',
      'workspaces:write',
    ])
    expect(SCOPE_CATALOG.length).toBe(17)
    expect(SCOPE_CATALOG).not.toContain('*')
    expect(SCOPE_CATALOG.some((scope) => scope.includes('*'))).toBe(false)
  })

  it('INV-4 的三个高危 scope 在册且标记为「不被隐含」', () => {
    expect(NEVER_IMPLIED_SCOPES).toEqual([
      'messages:send_as_human',
      'friend_requests:create',
      'webhooks:manage',
    ])
    for (const scope of NEVER_IMPLIED_SCOPES) {
      expect(SCOPE_CATALOG).toContain(scope)
    }
  })

  it('生命周期四态与迁移表（archived 为终态）', () => {
    expect(APPLICATION_STATUSES).toEqual(['draft', 'active', 'disabled', 'archived'])
    expect(STATUS_TRANSITIONS.archived).toEqual([])
    expect(STATUS_TRANSITIONS.active).toEqual(['disabled', 'archived'])
    expect(STATUS_TRANSITIONS.disabled).toEqual(['active', 'archived'])
    expect(STATUS_TRANSITIONS.draft).toEqual(['active', 'archived'])
  })

  it('credential / delivery 白名单里不存在 secret 或 payload 键', () => {
    const forbiddenRoots = ['secret', 'payload', 'body', 'cipher', 'digest', 'token', 'hmac']
    for (const key of [...CREDENTIAL_SAFE_KEYS, ...DELIVERY_SAFE_KEYS]) {
      const lowered = key.toLowerCase()
      for (const root of forbiddenRoots) {
        expect(lowered.includes(root)).toBe(false)
      }
    }
  })

  it('禁键清单覆盖 secret / digest / payload 家族', () => {
    for (const key of ['secret', 'secret_digest', 'credential_secret', 'token_digest', 'signing_key']) {
      expect(SECRET_FORBIDDEN_KEYS).toContain(key as (typeof SECRET_FORBIDDEN_KEYS)[number])
    }
    for (const key of ['payload', 'request_body', 'response_body', 'body']) {
      expect(PAYLOAD_FORBIDDEN_KEYS).toContain(key as (typeof PAYLOAD_FORBIDDEN_KEYS)[number])
    }
  })

  it('分页夹紧：缺省 10，越界夹到 [1,100]，page 最小 1', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10)
    expect(MAX_PAGE_SIZE).toBe(100)
    expect(clampPageSize(0)).toBe(10)
    expect(clampPageSize(-5)).toBe(10)
    expect(clampPageSize(999)).toBe(100)
    expect(clampPageSize(10)).toBe(10)
    expect(clampPageSize(Number.NaN)).toBe(10)
    expect(clampPage(0)).toBe(1)
    expect(clampPage(-1)).toBe(1)
    expect(clampPage(3)).toBe(3)
  })
})

// Read and write permissions remain independent; no implied seat grant.
it('客服坐席读写 scope 不互相隐含', () => {
  expect(impliedScopes('customer_service:read')).toEqual(['customer_service:read'])
  expect(impliedScopes('customer_service:write')).toEqual(['customer_service:write'])
})
