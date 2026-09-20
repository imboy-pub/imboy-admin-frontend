/**
 * P1-E2E-01（A6-E2E）：DB 直证（psql 只读 + 吊销负例夹具）。
 *
 * 页面证明之外的第二证明面（A03）：canonical message 行落在企业真源表
 * enterprise_message（客服域复用同一真源），评分落 customer_service_session.rating，
 * 附件落 enterprise_asset（conversation_id/message_id 绑定）。
 */
import { spawnSync } from 'node:child_process'
import { PG } from './env'

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

export interface CanonicalMessageRow {
  id: string
  conversation_id: string
  sender_type: string
  client_msg_id: string | null
  body_present: boolean
}

/** 按会话 id 直查 canonical message 行（visible 语义）。 */
export function fetchCanonicalMessages(conversationId: string): CanonicalMessageRow[] {
  const out = psql(
    `select id, conversation_id, sender_type, coalesce(client_msg_id,''), (body_cipher is not null and length(body_cipher) > 0)` +
      ` from enterprise_message where conversation_id = ${conversationId} and visibility = 'visible' order by id`
  )
  return out
    .split('\n')
    .filter((line) => line.includes('|'))
    .map((line) => {
      const parts = line.split('|')
      return {
        id: parts[0] ?? '',
        conversation_id: parts[1] ?? '',
        sender_type: parts[2] ?? '',
        client_msg_id: parts[3] === '' ? null : (parts[3] ?? null),
        body_present: parts[4] === 't',
      }
    })
}

/** 直查会话评分（rating 1..5；未评为 null/空）。 */
export function fetchSessionRating(sessionId: string): number | null {
  const out = psql(`select coalesce(rating::text,'') from customer_service_session where id = ${sessionId}`)
  const v = out.trim()
  return v === '' ? null : Number(v)
}

/** 直查会话状态与归属（转接/关闭证明）。 */
export function fetchSessionState(sessionId: string): { status: string; identity: string | null; version: number } | null {
  const out = psql(
    `select status, coalesce(business_identity_id::text,''), version from customer_service_session where id = ${sessionId}`
  )
  const line = out.trim()
  if (line === '') return null
  const parts = line.split('|')
  return { status: parts[0] ?? '', identity: parts[1] === '' ? null : (parts[1] ?? null), version: Number(parts[2] ?? 0) }
}

/** 直查附件资产行（asset 与 conversation/message 绑定证明）。 */
export function fetchAssetRows(conversationId: string): Array<{ id: string; status: string; messageBound: boolean }> {
  const out = psql(
    `select id, coalesce(status,''), (message_id is not null) from enterprise_asset` +
      ` where conversation_id = ${conversationId} order by id`
  )
  return out
    .split('\n')
    .filter((line) => line.includes('|'))
    .map((line) => {
      const parts = line.split('|')
      return { id: parts[0] ?? '', status: parts[1] ?? '', messageBound: parts[2] === 't' }
    })
}

/** 最近一次 bootstrap 落库的 visit token 行 id（吊销负例夹具定位用）。 */
export function latestVisitTokenId(orgId: string, contactId: string): string | null {
  const out = psql(
    `select id from customer_service_visit_token where organization_id = ${orgId} and contact_id = ${contactId}` +
      ` order by created_at desc limit 1`
  )
  const v = out.trim()
  return v === '' ? null : v
}

/** 页面窗口内（since 之后）该 org 最新 visit token 行 id（吊销页面 app 的 token）。 */
export function latestVisitTokenRowSince(orgId: string, sinceIso: string): string | null {
  const out = psql(
    `select id from customer_service_visit_token where organization_id = ${orgId}` +
      ` and created_at >= '${sinceIso.replace(/'/g, '')}'::timestamptz order by created_at desc limit 1`
  )
  const v = out.trim()
  return v === '' ? null : v
}

/** 直查 visit token 行的 revoked_at epoch 秒（吊销落库证明）。 */
export function fetchVisitTokenRevokedAt(visitTokenId: string): number | null {
  const out = psql(
    `select coalesce(extract(epoch from revoked_at)::bigint::text,'') from customer_service_visit_token where id = ${visitTokenId}`
  )
  const v = out.trim()
  return v === '' ? null : Number(v)
}

/** 吊销负例夹具：DB 通道标记 visit token 吊销（revoked_at 置时间）。 */
export function revokeVisitTokenRow(visitTokenId: string): void {
  psql(`update customer_service_visit_token set revoked_at = now() where id = ${visitTokenId} and revoked_at is null`)
}
