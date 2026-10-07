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

/** 会话 visit token 行（A04 访客面吊销目标定位）。 */
export function latestVisitTokenRowSince(orgId: string, sinceIso: string): string | null {
  const out = psql(
    `select id from customer_service_visit_token where organization_id = ${orgId}` +
      ` and created_at >= '${sinceIso.replace(/'/g, '')}'::timestamptz order by created_at desc limit 1`
  )
  const v = out.trim()
  return v === '' ? null : v
}

/** A04 夹具：移除坐席行（offboarding/assignment ended 落库等价物）。
 * 先终接该坐席的 active 会话（ck_csss_active_requires_identity 要求
 * active 必有 seat 引用——先 closed 再置空），再解除剩余引用（fk_csss_seat
 * RESTRICT），最后删坐席行。结果以「行不存在」复核为准——docker exec 偶发
 * status 0 但 stdout 空，单看 returning 输出会把成功误报为失败。 */
export function removeSeatRow(orgId: string, identityId: string): boolean {
  psql(
    `update customer_service_session set status='closed', closed_at=now() at time zone 'utc'` +
      ` where organization_id = ${orgId} and business_identity_id = ${identityId} and status='active'`
  )
  psql(
    `update customer_service_session set business_identity_id = null` +
      ` where organization_id = ${orgId} and business_identity_id = ${identityId} and status<>'active'`
  )
  for (let attempt = 0; attempt < 3; attempt += 1) {
    psql(
      `delete from customer_service_seat where organization_id = ${orgId} and business_identity_id = ${identityId}`
    )
    const gone =
      psql(
        `select count(*) from customer_service_seat where organization_id = ${orgId} and business_identity_id = ${identityId}`
      ).trim() === '0'
    if (gone) return true
  }
  return false
}

/** A04 夹具恢复：坐席行重建（幂等）并置回启用。
 * created_by 必须是 user 表真实 id（fk_css_created_by）；种子里是首启 admin
 * 用户，从 org 内现存坐席行动态解析，传参仅作无行可依时的兜底。 */
export function restoreSeatRow(orgId: string, identityId: string, createdByUserId: string): void {
  psql(
    `insert into customer_service_seat(organization_id,business_identity_id,function_key,enabled,max_concurrent,created_by_user_id)` +
      ` select ${orgId},${identityId},'customer_service',true,1,` +
      ` coalesce((select created_by_user_id from customer_service_seat where organization_id=${orgId} order by created_at limit 1), ${createdByUserId})` +
      ` where not exists` +
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
