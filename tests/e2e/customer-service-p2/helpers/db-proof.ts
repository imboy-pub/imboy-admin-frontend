/**
 * P2-E2E-01（A7）：DB 直证扩展（psql 只读 + 一次性夹具操作）。
 * P1 的 db-proof.ts（canonical message/rating/session state/asset）原样复用；
 * 这里补 P2 专用的坐席/事件表证明面。
 */
import { spawnSync } from 'node:child_process'
import { PG } from './env'

export {
  fetchAssetRows,
  fetchCanonicalMessages,
  fetchSessionRating,
  fetchSessionState,
} from '../../customer-service-real/helpers/db-proof'

function psql(sql: string): string {
  const result = spawnSync(
    'docker',
    ['exec', PG.container, 'psql', '-U', PG.user, '-d', PG.database, '-At', '-c', sql],
    { encoding: 'utf8', timeout: 30_000 }
  )
  if (result.status !== 0) {
    throw new Error(`psql failed (${result.status}): ${result.stderr}`)
  }
  return result.stdout
}

/** 坐席行启用位与在岗状态（A04 撤权降级的落库证明）。
 * 带重试：环境抖动下 docker exec 偶发空输出，读不到即重试（最多 5 次）。 */
export function fetchSeatState(orgId: string, identityId: string): { enabled: boolean; exists: boolean } | null {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const out = psql(
      `select coalesce(enabled::text,''), count(*) from customer_service_seat` +
        ` where organization_id = ${orgId} and business_identity_id = ${identityId} group by enabled`
    )
    const line = out.trim()
    if (line !== '' && !line.startsWith('|')) {
      const parts = line.split('|')
      // PG18 bool::text = true/false（列输出才是 t/f）——两种口径都认。
      return { enabled: parts[0] === 't' || parts[0] === 'true', exists: Number(parts[1] ?? 0) > 0 }
    }
  }
  return null
}

/** A04 一次性夹具：停用坐席（真实治理动作的落库等价物，后续恢复用 true）。 */
export function setSeatEnabled(orgId: string, identityId: string, enabled: boolean): void {
  psql(`update customer_service_seat set enabled = ${enabled ? 'true' : 'false'}` + ` where organization_id = ${orgId} and business_identity_id = ${identityId}`)
}

/** A03 一次性夹具：清理本作用域已消费事件（模拟保留窗外游标→resync.required）。
 * 这是测试范围级的夹具绕行：customer_service_event 带 append-only 触发器，
 * 修剪旧事件以界定流重放窗口前临时 DISABLE，DELETE 后（即使失败，finally）
 * 立即 ENABLE 恢复；append-only 是生产运行时保证，不受本夹具影响。 */
export function pruneSeatEventsBelow(orgId: string, workspaceId: string, keepAboveId: string | null): number {
  const where =
    keepAboveId === null
      ? `organization_id = ${orgId} and workspace_id = ${workspaceId}`
      : `organization_id = ${orgId} and workspace_id = ${workspaceId} and id <= ${keepAboveId}`
  psql(`alter table customer_service_event disable trigger trg_customer_service_event_append_only`)
  try {
    const out = psql(`with del as (delete from customer_service_event where ${where} returning 1) select count(*) from del`)
    return Number(out.trim() || 0)
  } finally {
    psql(`alter table customer_service_event enable trigger trg_customer_service_event_append_only`)
  }
}

/** 会话 visit token 行（A04 访客面吊销目标定位）。 */
export function latestVisitTokenRowSince(orgId: string, sinceIso: string): string | null {
  const out = psql(
    `select id from customer_service_visit_token where organization_id = ${orgId}` +
      ` and created_at >= '${sinceIso.replace(/'/g, '')}'::timestamptz order by created_at desc limit 1`
  )
  const v = out.trim()
  return v === '' ? null : v
}

/** 直查会话评分列之外的评级时间戳是否落库（只看非空，不断言绝对值：DF-6
 * 已知租户面 claimed_at/closed_at/rating_at 存在量纲污染，禁绝对值断言）。 */
export function sessionRatingPresent(sessionId: string): boolean {
  const out = psql(`select coalesce(rating::text,'') from customer_service_session where id = ${sessionId}`)
  return out.trim() !== ''
}

/** A04 夹具：移除坐席行（offboarding/assignment ended 落库等价物）。 */
export function removeSeatRow(orgId: string, identityId: string): boolean {
  const out = psql(
    `delete from customer_service_seat where organization_id = ${orgId} and business_identity_id = ${identityId} returning 1`
  )
  return out.trim() === '1'
}

/** A04 夹具恢复：坐席行重建（幂等）并置回启用。 */
export function restoreSeatRow(orgId: string, identityId: string, createdByUserId: string): void {
  psql(
    `insert into customer_service_seat(organization_id,business_identity_id,function_key,enabled,max_concurrent,created_by_user_id)` +
      ` select ${orgId},${identityId},'customer_service',true,1,${createdByUserId} where not exists` +
      ` (select 1 from customer_service_seat where organization_id=${orgId} and business_identity_id=${identityId})`
  )
  setSeatEnabled(orgId, identityId, true)
}

/** A03 幂等夹具：清理历次失败运行残留的 active 会话——坐席 max_concurrent=1，
 *  残留 assignment 会让本轮 claim 409（seat_at_capacity）。返回关闭条数。 */
export function closeStaleActiveSessions(orgId: string, workspaceId: string): number {
  const out = psql(
    `with cls as (update customer_service_session set status='closed', closed_at=now() at time zone 'utc'` +
      ` where organization_id=${orgId} and workspace_id=${workspaceId} and status='active' returning 1)` +
      ` select count(*) from cls`
  )
  return Number(out.trim() || 0)
}
