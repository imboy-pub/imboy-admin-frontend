/**
 * 组织客服摘要纯函数（CS-ADM-01 / CS-GOV-02A）。
 *
 * 数据源口径（只读事实，全部来自 Admin Cookie `/api/adm` 域）：
 *   GET /api/adm/customer-service/seats?organization_id=<org>
 *     （cs_platform_handler p_platform_seats；customer_service:read 门）
 *     → 键集分页 {seats:[...], next_after_id}；行投影白名单
 *       organization_id / organization_name / display_name /
 *       business_identity_id / function_key / enabled / max_concurrent /
 *       active_count / workspace_id
 *
 * **seat_limit（额度）诚实降级依据**：CS-BE-06 的 seat-limit 治理端点
 * （PUT/GET）只注册在租户面 `/api/v1/cs/organizations/:org_id/seat-limit`
 * （enterprise_owner_admin，Human JWT）；平台 `/api/adm` 域**不投影**
 * seat_limit 事实。本面板按任务纪律禁止混用 Seat JWT/Human JWT，因此
 * 额度恒展示为「平台域不投影」，绝不推导、绝不编造数值。
 *
 * used 口径与 CS-BE-06 对齐：used = enabled 坐席现算计数（无计数列）。
 * active sessions 口径 = Σ active_count（后端同语句子查询
 * customer_service_session.status='active' 现算计数）。
 *
 * 纪律：TSID 全程 string（EntityId，coerceEntityId 收紧，禁 Number()）。
 */
import { coerceEntityId } from '@/lib/entityId'
import type { EntityId } from '@/types/common'
import { classifyOrgError, type OrgFailure } from './pureFunctions'

/** 摘要使用的坐席行事实（出站白名单的安全子集）。 */
export type CsSummarySeatFact = {
  businessIdentityId: EntityId
  displayName: string | null
  enabled: boolean
  maxConcurrent: number
  activeCount: number
  workspaceId: EntityId | null
}

/** 组织级客服摘要（聚合事实 + 诚实截断/额度标记）。 */
export type OrgCsSummary = {
  organizationId: EntityId
  /** 坐席总数（含已停用——运营面语义，可定位并恢复已停用坐席）。 */
  seatTotal: number
  /** 已启用坐席数（CS-BE-06 used 口径：enabled 现算）。 */
  seatUsed: number
  /**
   * 组织级 seat_limit 额度。平台 /api/adm 域不投影该事实（治理端点在
   * 租户面 /api/v1），Admin Cookie 面禁止调用 → 类型恒为 null，UI 如实标注。
   */
  seatLimit: null
  /** enabled 坐席并发上限合计（Σ max_concurrent，仅 enabled）。 */
  maxConcurrentTotal: number
  /** active 会话现算计数（Σ active_count）。 */
  activeSessions: number
  /** 坐席明细行数超出读取安全上限时为 true（UI 诚实标注截断）。 */
  truncated: boolean
  /** 坐席明细（最多 DETAIL_LIMIT 行，供摘要面板核对）。 */
  seats: CsSummarySeatFact[]
}

/** 摘要面板展示的明细行上限（摘要不是列表页；超出截断并如实标注）。 */
export const CS_SUMMARY_DETAIL_LIMIT = 8

/** seat_limit 平台域不投影的固定依据说明（UI 直接渲染，不复制多份）。 */
export const CS_SEAT_LIMIT_PLATFORM_EVIDENCE =
  '额度（seat_limit）事实：平台 /api/adm 域不投影——CS-BE-06 的 seat-limit 治理端点只注册在租户治理面 /api/v1/cs/organizations/:org_id/seat-limit（enterprise_owner_admin，Human JWT），Admin Cookie 面禁止调用。故此处只展示 used（enabled 现算），额度数值不做推导、不编造。'

function toOptionalInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.length > 0 && /^-?\d+$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  return null
}

function toBool(value: unknown): boolean {
  return value === true || value === 'true'
}

/**
 * 原始坐席行 → 摘要事实行；缺 business_identity_id（TSID）返回 null
 * （fail-closed：无主键事实的行不进摘要，宁缺毋假）。
 */
export function toCsSummarySeatFact(raw: unknown): CsSummarySeatFact | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const identityId = coerceEntityId(row.business_identity_id)
  if (identityId.length === 0) return null
  const displayName =
    typeof row.display_name === 'string' && row.display_name.length > 0
      ? row.display_name
      : null
  const workspaceId = coerceEntityId(row.workspace_id)
  return {
    businessIdentityId: identityId,
    displayName,
    enabled: toBool(row.enabled),
    maxConcurrent: toOptionalInt(row.max_concurrent) ?? 0,
    activeCount: toOptionalInt(row.active_count) ?? 0,
    workspaceId: workspaceId.length > 0 ? workspaceId : null,
  }
}

/**
 * 聚合组织级客服摘要。truncated 由调用方（分页读取器）按是否触达安全
 * 上限传入；本函数只做无副作用聚合。
 */
export function aggregateOrgCsSummary(
  organizationId: EntityId,
  rows: readonly unknown[],
  truncated: boolean
): OrgCsSummary {
  const facts = rows
    .map(toCsSummarySeatFact)
    .filter((row): row is CsSummarySeatFact => row !== null)
  let seatUsed = 0
  let maxConcurrentTotal = 0
  let activeSessions = 0
  for (const fact of facts) {
    if (!fact.enabled) continue
    seatUsed += 1
    maxConcurrentTotal += fact.maxConcurrent
    activeSessions += fact.activeCount
  }
  return {
    organizationId,
    seatTotal: facts.length,
    seatUsed,
    seatLimit: null,
    maxConcurrentTotal,
    activeSessions,
    truncated,
    seats: facts.slice(0, CS_SUMMARY_DETAIL_LIMIT),
  }
}

// ===========================================================================
// 错误归类（CS-GOV-02A）：并发冲突 / advisory lock / seat_limit_exceeded
// 必须有可辨识的稳定类别，UI 给出明确反馈（不静默、不误导）。
// ===========================================================================

export type CsSummaryFailure = OrgFailure & {
  /**
   * 409 / advisory lock / seat_limit_exceeded 类并发冲突：
   * 摘要读取与治理写并发时的瞬时态，UI 提示刷新后重试。
   */
  concurrencyConflict: boolean
}

/** advisory lock / 序列化冲突类错误特征（大小写不敏感子串匹配）。 */
const LOCK_ERROR_MARKERS = [
  'seat_limit_exceeded',
  'advisory lock',
  'lock_not_available',
  'could not obtain lock',
  'serialization failure',
  'deadlock detected',
  '40p01',
  '55p03',
] as const

function detailMessage(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e['msg'] === 'string') return e['msg']
    if (typeof e['message'] === 'string') return e['message']
  }
  if (typeof err === 'string') return err
  return ''
}

/** 判定错误是否属并发冲突 / 锁类（含稳定码 seat_limit_exceeded）。 */
export function isCsConcurrencyConflict(err: unknown): boolean {
  const failure = classifyOrgError(err)
  if (failure.kind === 'conflict') return true
  const detail = detailMessage(err).toLowerCase()
  return LOCK_ERROR_MARKERS.some((marker) => detail.includes(marker))
}

/**
 * 摘要错误的稳定归类：复用组织域 classifyOrgError 的基础分类
 * （400/401/403/404/409/422/503/网络），叠加并发冲突布尔标记与
 * 面向客服摘要的行动指引文案。
 */
export function classifyCsSummaryError(err: unknown): CsSummaryFailure {
  const base = classifyOrgError(err)
  const concurrencyConflict = isCsConcurrencyConflict(err)
  const message = concurrencyConflict
    ? `并发冲突（409/advisory lock 类）：客服事实读取可能与坐席治理或额度变更并发，请刷新服务端事实后重试（原始归类：${base.message}）`
    : base.message
  return { ...base, concurrencyConflict, message }
}
