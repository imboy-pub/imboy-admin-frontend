/**
 * Admin 企业应用治理 — 纯函数层测试（熔断 / 投影 / 语义 / 失败分类 / RBAC）。
 *
 * 本文件是 brief 三条硬要求的**主证据**：
 *  A. secret only-once 与「无 secret hydration」：
 *     - 读面投影的键集合被逐键钉死（`credential` 视图在**类型层面**没有 secret）；
 *     - 任何带 secret/digest 键的响应 → `assertNoSecretFields` 抛错；
 *     - 投递面带 payload/body 键 → `assertNoPayloadFields` 抛错；
 *     - 签发响应里的 digest 家族（除 `secret` 外）一律熔断。
 *  B. RBAC 越权负例（纯函数闸门）：无 write 权限时 `assertWriteAllowed` 抛错。
 *  C. 审计 before/after：只对白名单字段产出 diff，且空变更不产出噪声。
 */
import { describe, expect, it } from 'bun:test'
import {
  APPLICATION_STATUS_LABELS,
  AUDIT_ACTION_LABELS,
  READ_PERMISSION,
  SCOPE_CATALOG,
  WRITE_PERMISSION,
  auditActionLabel,
} from './contracts'
import {
  applicationStatusLabel,
  assertStatusTransition,
  assertWriteAllowed,
  buildAuditDiff,
  canReadGovernance,
  canWriteGovernance,
  classifyGovernanceFailure,
  credentialExpiryLabel,
  credentialExpiryState,
  diffScopes,
  formatRate,
  governanceFailureMessage,
  hasPermission,
  impliedScopes,
  isScopeDowngrade,
  lastUsedLabel,
  nextAllowedStatuses,
  requiresExplicitConfirmation,
  toApplicationDetailFromPayload,
  toApplicationPage,
  toApplicationStatus,
  toAuditEntry,
  toAuditList,
  toCredentialMeta,
  toCredentialMetaList,
  toDeliveryList,
  toDeliveryRow,
  toDeliveryStats,
  toGrantList,
  toGrantView,
  toIssuedCredentialOnce,
  toScopeList,
  validateScopeSelection,
} from './pureFunctions'
import { assertNoPayloadFields, assertNoSecretFields, collectForbiddenKeys, collectStringValues } from './guards'

const ORG = '1234567890123456789'
const APP = '2234567890123456789'
const CRED = '3234567890123456789'

const FULL_PERMS = [READ_PERMISSION, WRITE_PERMISSION]
const READONLY_PERMS = [READ_PERMISSION]
const NO_PERMS: string[] = []

// ---------------------------------------------------------------------------
// A. 熔断守卫
// ---------------------------------------------------------------------------

describe('A. 熔断守卫（secret / digest / payload 不得进入读面）', () => {
  it('collectForbiddenKeys 递归且大小写不敏感', () => {
    const hits = collectForbiddenKeys(
      { data: { items: [{ Secret: 'x' }] }, nested: { token_digest: 'y' } },
      ['secret', 'token_digest']
    )
    expect(hits.length).toBe(2)
    expect(hits.map((hit) => hit.path).sort()).toEqual(['data.items[0].Secret', 'nested.token_digest'])
  })

  it('读面响应带 secret → 抛错（不静默渲染）', () => {
    expect(() => assertNoSecretFields({ id: CRED, secret: 'ib_int_x.y' }, 'credentials')).toThrow(
      /禁止的 secret\/digest 字段/
    )
    expect(() => assertNoSecretFields({ items: [{ id: CRED, credential_secret: 'z' }] }, 'credentials')).toThrow()
    expect(() => assertNoSecretFields({ items: [{ id: CRED, sha256_digest: 'd' }] }, 'credentials')).toThrow()
  })

  it('读面响应带 hash/token 家族也熔断（digest 回显的等价形态）', () => {
    for (const key of ['token_digest', 'token_hash', 'secret_hash', 'signing_key', 'private_key']) {
      expect(() => assertNoSecretFields({ [key]: 'v' }, 'read')).toThrow()
    }
  })

  it('干净的 credential 元数据响应通过熔断', () => {
    expect(() =>
      assertNoSecretFields({ id: CRED, credential_prefix: 'ib_int_abc', status: 'active' }, 'credentials')
    ).not.toThrow()
  })

  it('签发响应：豁免 `secret` 本身，但 digest 家族仍熔断', () => {
    expect(() =>
      assertNoSecretFields({ credential: { id: CRED }, secret: 'ib_int_a.b' }, 'issue', true)
    ).not.toThrow()
    expect(() =>
      assertNoSecretFields({ credential: { id: CRED }, secret: 'x', secret_digest: 'y' }, 'issue', true)
    ).toThrow()
  })

  it('投递面响应带 payload / body → 抛错', () => {
    expect(() => assertNoPayloadFields({ items: [{ id: '1', payload: '{}' }] }, 'deliveries')).toThrow(
      /禁止的 payload\/body 字段/
    )
    expect(() => assertNoPayloadFields({ items: [{ id: '1', request_body: 'hi' }] }, 'deliveries')).toThrow()
    expect(() => assertNoPayloadFields({ items: [{ id: '1', response_body: 'hi' }] }, 'deliveries')).toThrow()
    expect(() => assertNoPayloadFields({ items: [{ id: '1', body_cipher: 'c' }] }, 'deliveries')).toThrow()
  })

  it('投递元数据（无 payload）通过熔断', () => {
    expect(() =>
      assertNoPayloadFields({ items: [{ id: '1', status: 'retry', attempt_count: 2 }] }, 'deliveries')
    ).not.toThrow()
  })

  it('collectStringValues 覆盖全部嵌套字符串（指纹回显比对的遍历器）', () => {
    const values = collectStringValues({ a: 'x', b: [{ c: 'y' }], d: 1, e: null })
    expect(values.sort()).toEqual(['x', 'y'])
  })
})

// ---------------------------------------------------------------------------
// B. 白名单投影
// ---------------------------------------------------------------------------

describe('B. 白名单投影（视图键集合被钉死，无隐式 hydration）', () => {
  it('Application 摘要只保留白名单键；未知状态 fail-safe 到 unknown', () => {
    const row = toApplicationSummaryLike({ status: 'weird-new-status' })
    expect(row.status).toBe('unknown')
    expect(applicationStatusLabel(row.status)).toBe('未知状态（fail-safe）')
    expect(applicationStatusLabel('active')).toBe(APPLICATION_STATUS_LABELS.active)
  })

  it('Application 摘要丢弃白名单外的字段（含 page_token 之类）', () => {
    const page = toApplicationPage(
      {
        items: [
          {
            id: APP,
            organization_id: ORG,
            name: 'OA 应用',
            status: 'active',
            scopes: ['application:read', 'unknown:scope', '*'],
            version: 3,
            created_at: 'T1',
            updated_at: 'T2',
            internal_notes: 'should-be-dropped',
          },
        ],
        total: 1,
        page: 1,
        size: 10,
      },
      10
    )
    expect(page.items.length).toBe(1)
    const item = page.items[0]!
    expect(Object.keys(item).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'organizationId',
      'scopes',
      'status',
      'updatedAt',
      'version',
    ])
    // '*' 与未登记 scope 被丢弃（不猜测、不透传）
    expect(item.scopes).toEqual(['application:read'])
    expect(page.total).toBe(1)
  })

  it('credential 视图的键集合恰为白名单（**没有** secret / digest 任何形态）', () => {
    const meta = toCredentialMeta({
      id: CRED,
      credential_prefix: 'ib_int_abc',
      status: 'active',
      created_at: 'T1',
      expires_at: 'T9',
      last_used_at: 'T5',
      revoked_at: '',
      version: 2,
      secret: 'SHOULD-NOT-APPEAR',
      secret_digest: 'SHOULD-NOT-APPEAR',
    })
    expect(meta).not.toBeNull()
    expect(Object.keys(meta!).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'id',
      'lastUsedAt',
      'prefix',
      'revokedAt',
      'status',
      'version',
    ])
    expect(JSON.stringify(meta)).not.toContain('SHOULD-NOT-APPEAR')
  })

  it('credential 列表丢弃无 id 的行（不渲染空壳）', () => {
    expect(toCredentialMetaList([{ id: CRED }, { nope: 1 }, null]).length).toBe(1)
  })

  it('到期状态派生：已撤销 / 已过期 / 有效 / 无到期 / 未识别 五态', () => {
    const now = Date.parse('2026-09-22T00:00:00Z')
    expect(credentialExpiryState({ status: 'revoked', expiresAt: '2030-01-01T00:00:00Z' }, now)).toBe('revoked')
    expect(credentialExpiryState({ status: 'active', expiresAt: '2020-01-01T00:00:00Z' }, now)).toBe('expired')
    expect(credentialExpiryState({ status: 'active', expiresAt: '2030-01-01T00:00:00Z' }, now)).toBe('active')
    expect(credentialExpiryState({ status: 'active', expiresAt: '' }, now)).toBe('noExpiry')
    expect(credentialExpiryState({ status: 'active', expiresAt: 'not-a-date' }, now)).toBe('unknown')
    expect(credentialExpiryState({ status: 'unknown', expiresAt: '' }, now)).toBe('unknown')
    expect(credentialExpiryLabel('expired')).toBe('已过期')
    expect(credentialExpiryLabel('noExpiry')).toBe('有效（无到期）')
  })

  it('last-used 空值不伪造成「刚刚」', () => {
    expect(lastUsedLabel('')).toBe('从未使用')
    expect(lastUsedLabel('2026-09-22 10:00:00')).toBe('2026-09-22 10:00:00')
  })

  it('Grant 视图：scope 白名单外丢弃，workspace 范围未知 fail-safe', () => {
    const grant = toGrantView({
      id: '9',
      workspace_scope_kind: 'weird',
      workspace_ids: ['11', 12, ''],
      scopes: ['groups:write', '*'],
      status: 'weird',
      version: 4,
      valid_from: 'A',
      valid_to: 'B',
      secret: 'x',
    })
    expect(grant!.workspaceScopeKind).toBe('unknown')
    expect(grant!.status).toBe('unknown')
    expect(grant!.scopes).toEqual(['groups:write'])
    expect(grant!.workspaceIds).toEqual(['11', '12'])
    expect(JSON.stringify(grant)).not.toContain('"secret"')
  })

  it('Grant 列表丢弃无 id 行；workspace_scope_kind=none 的 org 全域 Grant 正常解析', () => {
    expect(toGrantList([{ id: '1', workspace_scope_kind: 'none', status: 'active' }]).length).toBe(1)
    expect(toGrantList([{ nope: 1 }]).length).toBe(0)
  })

  it('投递行视图键集合恰为元数据白名单（**无** payload 字段）', () => {
    const row = toDeliveryRow({
      id: '5',
      event_id: '6',
      event_type: 'message.created',
      status: 'retry',
      attempt_count: 2,
      max_attempts: 5,
      endpoint_generation: 3,
      ledger_version: 7,
      replay_of: null,
      correlation_id: 'c1',
      next_retry_at: 'T',
      last_error_class: 'timeout',
      created_at: 'T1',
      updated_at: 'T2',
      terminal_at: '',
      payload: 'SECRET-BODY',
      response_body: 'SECRET-BODY',
    })
    expect(Object.keys(row!).sort()).toEqual([
      'attemptCount',
      'correlationId',
      'createdAt',
      'endpointGeneration',
      'eventId',
      'eventType',
      'id',
      'lastErrorClass',
      'ledgerVersion',
      'nextRetryAt',
      'replayOf',
      'status',
      'terminalAt',
    ])
    expect(JSON.stringify(row)).not.toContain('SECRET-BODY')
  })

  it('投递列表丢弃无 id 行', () => {
    expect(toDeliveryList([{ id: '1' }, {}]).length).toBe(1)
  })

  it('投递健康度：成功率口径 = success/(success+dead)，与后端一致', () => {
    const stats = toDeliveryStats({ success: 9, dead: 1, retry: 3, pending: 2, total: 15, payload: 'x' })
    expect(stats.successRate).toBeCloseTo(0.9, 6)
    expect(stats.deadLetterRate).toBeCloseTo(0.1, 6)
    expect(stats.total).toBe(15)
    expect(formatRate(0.9)).toBe('90%')
    expect(formatRate(0.875)).toBe('87.5%')
    expect(formatRate(1)).toBe('100%')
    // 后端显式给 rate 时以后端为口径单点（比率是 0..1 浮点，不能按整数截断）
    expect(toDeliveryStats({ success: 1, dead: 1, success_rate: 0.25 }).successRate).toBe(0.25)
    expect(toDeliveryStats({ success: 1, dead: 1, success_rate: '0.5' }).successRate).toBe(0.5)
    // 越界 / 非数字 rate 视为缺失，回退本地口径（不产出 NaN / 荒谬百分比）
    expect(toDeliveryStats({ success: 3, dead: 1, success_rate: 42 }).successRate).toBeCloseTo(0.75, 6)
    expect(toDeliveryStats({ success: 3, dead: 1, success_rate: 'nope' }).successRate).toBeCloseTo(0.75, 6)
    // 全零时成功率不 NaN
    expect(toDeliveryStats({}).successRate).toBe(1)
  })

  it('审计条目：只保留白名单字段，before/after 变化才产出 diff', () => {
    const entry = toAuditEntry({
      id: '1',
      action: 'application_scopes_changed',
      actor_account: 'super',
      target_kind: 'application',
      target_id: APP,
      created_at: 'T1',
      before: { scopes: ['a', 'b'], status: 'active', payload: 'x' },
      after: { scopes: ['a'], status: 'active' },
    })
    expect(entry!.changed.length).toBe(1)
    expect(entry!.changed[0]!.field).toBe('scopes')
    expect(entry!.changed[0]!.before).toBe('a, b')
    expect(entry!.changed[0]!.after).toBe('a')
    expect(auditActionLabel('application_scopes_changed')).toBe(AUDIT_ACTION_LABELS.application_scopes_changed)
    expect(auditActionLabel('unknown_action')).toBe('unknown_action')
  })

  it('审计条目：无 action 无时间的行被丢弃', () => {
    expect(toAuditList([{ before: {}, after: {} }]).length).toBe(0)
  })

  it('toScopeList：未登记 / 通配一律丢弃（不猜测、不透传）', () => {
    expect(toScopeList(['application:read', '*', 'nope:write', 7, null])).toEqual(['application:read'])
    expect(toScopeList('application:read')).toEqual([])
  })

  it('toApplicationStatus：四态逐字，其它一律 unknown', () => {
    for (const status of ['draft', 'active', 'disabled', 'archived'] as const) {
      expect(toApplicationStatus(status)).toBe(status)
    }
    expect(toApplicationStatus('enabled')).toBe('unknown')
    expect(toApplicationStatus(undefined)).toBe('unknown')
  })

  it('详情响应接受顶层与 {application:{...}} 两种形状；缺 id 抛错', () => {
    const flat = toApplicationDetailFromPayload({ id: APP, organization_id: ORG, status: 'active', version: 2 })
    expect(flat.id).toBe(APP)
    expect(flat.status).toBe('active')
    const wrapped = toApplicationDetailFromPayload({
      application: { id: APP, organization_id: ORG, status: 'disabled', name: 'OA' },
    })
    expect(wrapped.status).toBe('disabled')
    expect(wrapped.name).toBe('OA')
    expect(() => toApplicationDetailFromPayload({ nope: 1 })).toThrow(/形状非法/)
    expect(() => toApplicationDetailFromPayload(null)).toThrow(/形状非法/)
  })
})

function toApplicationSummaryLike(raw: Record<string, unknown>) {
  const page = toApplicationPage({ items: [{ id: APP, ...raw }] }, 10)
  return page.items[0]!
}

// ---------------------------------------------------------------------------
// C. 语义判定
// ---------------------------------------------------------------------------

describe('C. 语义判定（生命周期 / scope / CAS / 审计 diff）', () => {
  it('生命周期迁移表逐条：合法放行、非法拒绝、终态无出口、未知态 fail-closed', () => {
    expect(() => assertStatusTransition('draft', 'active')).not.toThrow()
    expect(() => assertStatusTransition('active', 'disabled')).not.toThrow()
    expect(() => assertStatusTransition('disabled', 'active')).not.toThrow()
    expect(() => assertStatusTransition('active', 'archived')).not.toThrow()
    expect(() => assertStatusTransition('archived', 'active')).toThrow(/非法生命周期迁移/)
    expect(() => assertStatusTransition('draft', 'disabled')).toThrow(/非法生命周期迁移/)
    expect(() => assertStatusTransition('active', 'active')).toThrow(/无需迁移/)
    expect(() => assertStatusTransition('unknown', 'active')).toThrow(/不可识别/)
    expect(nextAllowedStatuses('unknown')).toEqual([])
    expect(nextAllowedStatuses('archived')).toEqual([])
  })

  it('INV-4：三个高危 scope 不被 messages:send 隐含（无任何隐含闭包）', () => {
    expect(impliedScopes('messages:send')).toEqual(['messages:send'])
    for (const scope of SCOPE_CATALOG) {
      expect(impliedScopes(scope)).toEqual([scope])
    }
  })

  it('scope 校验：目录外拒绝、空集拒绝、通配拒绝、结果按目录顺序归一', () => {
    expect(validateScopeSelection(['groups:write', 'application:read'])).toEqual([
      'application:read',
      'groups:write',
    ])
    expect(() => validateScopeSelection(['*'])).toThrow(/未登记的 scope/)
    expect(() => validateScopeSelection(['nope:write'])).toThrow(/未登记的 scope/)
    expect(() => validateScopeSelection([])).toThrow(/至少需要一个 scope/)
    expect(() => validateScopeSelection(['   '])).toThrow(/至少需要一个 scope/)
    // 去重
    expect(validateScopeSelection(['files:write', 'files:write'])).toEqual(['files:write'])
  })

  it('高危 scope 提交提示只对三个高危 scope 触发', () => {
    expect(requiresExplicitConfirmation(['messages:send_as_human'])).toBe(true)
    expect(requiresExplicitConfirmation(['friend_requests:create'])).toBe(true)
    expect(requiresExplicitConfirmation(['webhooks:manage'])).toBe(true)
    expect(requiresExplicitConfirmation(['messages:send'])).toBe(false)
    expect(requiresExplicitConfirmation(['application:read', 'files:write'])).toBe(false)
  })

  it('scope diff / 降级判定', () => {
    expect(diffScopes(['a:1', 'b:2'], ['b:2', 'c:3'])).toEqual({ added: ['c:3'], removed: ['a:1'] })
    expect(diffScopes(['b:2'], ['b:2'])).toEqual({ added: [], removed: [] })
    expect(isScopeDowngrade(['a', 'b'], ['b'])).toBe(true)
    expect(isScopeDowngrade(['a', 'b'], ['b', 'c'])).toBe(false)
    expect(isScopeDowngrade(['a'], ['a'])).toBe(false)
  })

  it('审计 diff 只对白名单字段、数组按集合比较（顺序无关）', () => {
    const diff = buildAuditDiff(
      { scopes: ['b', 'a'], status: 'active', secret: 'x', unrelated: 1 },
      { scopes: ['a', 'b'], status: 'disabled' }
    )
    expect(diff.map((item) => item.field)).toEqual(['status'])
    expect(diff[0]!.before).toBe('active')
    expect(diff[0]!.after).toBe('disabled')
    // 顺序变化不算变化
    expect(buildAuditDiff({ scopes: ['a', 'b'] }, { scopes: ['b', 'a'] }).length).toBe(0)
    // 缺失值 / 空值统一渲染为 —（因此「空 → 空」不产生噪声行）
    expect(buildAuditDiff({ valid_to: 'A' }, { valid_to: '' })[0]!.after).toBe('—')
    expect(buildAuditDiff({}, { valid_to: '' }).length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// D. 签发响应的唯一允许形状
// ---------------------------------------------------------------------------

describe('D. 签发 / 轮换响应形状（唯一携带 secret 的响应）', () => {
  it('接受 {credential:{...}, secret} 与扁平 {id, secret} 两种形状', () => {
    const wrapped = toIssuedCredentialOnce(
      { credential: { id: CRED, credential_prefix: 'ib_int_a' }, secret: 'ib_int_a.S' },
      'issue'
    )
    expect(wrapped.credential.id).toBe(CRED)
    expect(wrapped.secret).toBe('ib_int_a.S')
    const flat = toIssuedCredentialOnce({ id: CRED, credential_prefix: 'ib_int_a', secret: 'ib_int_a.S' }, 'issue')
    expect(flat.credential.id).toBe(CRED)
  })

  it('缺少 secret / 缺少 id / 带 digest → 抛错（fail-loud）', () => {
    expect(() => toIssuedCredentialOnce({ credential: { id: CRED } }, 'issue')).toThrow(/缺少一次性 secret/)
    expect(() => toIssuedCredentialOnce({ secret: 'x' }, 'issue')).toThrow(/缺少 credential id/)
    expect(() => toIssuedCredentialOnce(null, 'issue')).toThrow(/形状非法/)
    expect(() =>
      toIssuedCredentialOnce({ credential: { id: CRED }, secret: 'x', token_digest: 'd' }, 'issue')
    ).toThrow(/禁止的 secret\/digest 字段/)
  })
})

// ---------------------------------------------------------------------------
// E. 失败分类
// ---------------------------------------------------------------------------

describe('E. 失败分类（含未接线诚实失败）', () => {
  it('401/403/404/409/422/429/5xx 各归其位', () => {
    expect(classifyGovernanceFailure({ code: 401 })).toBe('unauthenticated')
    expect(classifyGovernanceFailure({ code: 403 })).toBe('forbidden')
    expect(classifyGovernanceFailure({ code: 404 })).toBe('notFound')
    expect(classifyGovernanceFailure({ code: 409, msg: 'stale_version' })).toBe('versionConflict')
    expect(classifyGovernanceFailure({ code: 409, msg: 'cas_mismatch' })).toBe('versionConflict')
    expect(classifyGovernanceFailure({ code: 409, msg: 'other' })).toBe('conflict')
    expect(classifyGovernanceFailure({ code: 422 })).toBe('validation')
    expect(classifyGovernanceFailure({ code: 400 })).toBe('validation')
    expect(classifyGovernanceFailure({ code: 429 })).toBe('rateLimited')
    expect(classifyGovernanceFailure({ code: 503 })).toBe('serverError')
    expect(classifyGovernanceFailure({ code: 500 })).toBe('serverError')
  })

  it('404 + wired=false → aggregationUnavailable（PENDING_A0_WIRING 的诚实失败）', () => {
    expect(classifyGovernanceFailure({ code: 404 }, { wired: false })).toBe('aggregationUnavailable')
    expect(governanceFailureMessage('aggregationUnavailable')).toContain('PENDING_A0_WIRING')
  })

  it('非 envelope 错误（网络层）归类为 network/unknown', () => {
    expect(classifyGovernanceFailure(new TypeError('Failed to fetch'))).toBe('network')
    expect(classifyGovernanceFailure(null)).toBe('unknown')
    expect(classifyGovernanceFailure({ code: 418 })).toBe('unknown')
    expect(classifyGovernanceFailure({ code: '409', msg: 'stale_version' })).toBe('versionConflict')
  })

  it('前端守卫抛出的契约违约被单独分类（不被吞成 unknown）', () => {
    expect(classifyGovernanceFailure(new Error('响应含禁止的 secret/digest 字段：secret (read)'))).toBe(
      'contractViolation'
    )
    expect(classifyGovernanceFailure(new Error('响应含禁止的 payload/body 字段：payload (deliveries)'))).toBe(
      'contractViolation'
    )
    expect(classifyGovernanceFailure(new Error('已签发的 secret 在后续响应中被二次回显 (read)'))).toBe(
      'contractViolation'
    )
    expect(governanceFailureMessage('contractViolation')).toContain('熔断')
    // 前端权限闸门抛出的错误按 forbidden 呈现（否则会被 unknown 文案掩盖）
    expect(classifyGovernanceFailure(new Error('缺少 enterprise_business:write 权限，拒绝执行：issue_credential'))).toBe(
      'forbidden'
    )
  })

  it('每类失败都有非空中文文案（UI 不会出现空提示）', () => {
    const kinds = [
      'contractViolation',
      'aggregationUnavailable',
      'unauthenticated',
      'forbidden',
      'notFound',
      'versionConflict',
      'conflict',
      'validation',
      'rateLimited',
      'serverError',
      'network',
      'unknown',
    ] as const
    for (const kind of kinds) {
      expect(governanceFailureMessage(kind).length).toBeGreaterThan(4)
    }
    expect(governanceFailureMessage('forbidden')).toContain(READ_PERMISSION)
  })
})

// ---------------------------------------------------------------------------
// F. RBAC 纯闸门（越权负例）
// ---------------------------------------------------------------------------

describe('F. RBAC 纯闸门（UI 隐藏之外的第二道锁）', () => {
  it('hasPermission / canRead / canWrite 逐条', () => {
    expect(hasPermission(FULL_PERMS, READ_PERMISSION)).toBe(true)
    expect(hasPermission(READONLY_PERMS, WRITE_PERMISSION)).toBe(false)
    expect(canReadGovernance(FULL_PERMS)).toBe(true)
    expect(canReadGovernance(READONLY_PERMS)).toBe(true)
    expect(canReadGovernance(NO_PERMS)).toBe(false)
    expect(canWriteGovernance(FULL_PERMS)).toBe(true)
    expect(canWriteGovernance(READONLY_PERMS)).toBe(false)
    expect(canWriteGovernance(NO_PERMS)).toBe(false)
  })

  it('assertWriteAllowed：只读 / 无权限一律抛错（fail-closed，不依赖 UI 隐藏）', () => {
    expect(() => assertWriteAllowed(FULL_PERMS, 'issue_credential')).not.toThrow()
    expect(() => assertWriteAllowed(READONLY_PERMS, 'issue_credential')).toThrow(new RegExp(WRITE_PERMISSION))
    expect(() => assertWriteAllowed(NO_PERMS, 'revoke_credential')).toThrow(/拒绝执行/)
    expect(() => assertWriteAllowed(['enterprise_business:read', '*'], 'issue_grant')).toThrow()
  })

  it('后端的真实角色矩阵在前端闸门下逐角色成立（role 1 读写 / role 2 只读 / role 3-6 全拒）', () => {
    // 源：imboy src/adm/adm_index_handler.erl role_acl/1
    const rolePermissions: Record<string, string[]> = {
      '1:super_admin': [READ_PERMISSION, WRITE_PERMISSION],
      '2:ops_admin': [READ_PERMISSION],
      '3:audit_admin': [],
      '4:moderator': [],
      '5:security_admin': [],
      '6:support': [],
    }
    expect(canReadGovernance(rolePermissions['1:super_admin']!)).toBe(true)
    expect(canWriteGovernance(rolePermissions['1:super_admin']!)).toBe(true)
    expect(canReadGovernance(rolePermissions['2:ops_admin']!)).toBe(true)
    expect(canWriteGovernance(rolePermissions['2:ops_admin']!)).toBe(false)
    for (const role of ['3:audit_admin', '4:moderator', '5:security_admin', '6:support']) {
      expect(canReadGovernance(rolePermissions[role]!)).toBe(false)
      expect(canWriteGovernance(rolePermissions[role]!)).toBe(false)
    }
  })
})
