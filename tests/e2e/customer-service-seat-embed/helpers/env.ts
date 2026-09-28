/**
 * SC-E2E（seat console embed 真实 E2E）— 环境常量与 oracle 工具。
 *
 * 与 hosted/helpers/env.ts 同构，全部为本地 scratch 合成值，零生产凭据/PII。
 *
 * 域名映射（唯一映射，全程一致；详见 README.md）：
 *   生产 https://cs.imboy.pub  →  本地 https://cs.test:18443（seat 网关）
 *   生产商城管理后台 origin    →  https://shop.test:18443（合法宿主）
 *   A06 origin 轮换目标        →  https://shop2.test:18443
 *   负例宿主                   →  https://evil.test:18443
 *   Admin SPA                  →  https://admin.test:18443
 */

import { execFileSync } from 'node:child_process'

/** seat 网关 frame origin（= 生产 https://cs.imboy.pub 的本地等价）。 */
export const CS_ORIGIN = process.env.SC153_E2E_CS_ORIGIN ?? 'https://cs.test:18443'
export const SHOP = 'https://shop.test:18443'
export const SHOP2 = 'https://shop2.test:18443'
export const EVIL = 'https://evil.test:18443'
export const ADMIN_ORIGIN = 'https://admin.test:18443'

/** 坐席侧主 API 面（直连 backend；网关上游同源面见 harness nginx 模板）。 */
export const BE_MAIN = process.env.SC153_E2E_BACKEND ?? 'http://127.0.0.1:9801'

/**
 * scratch 种子固定 TSID（tenancy fixture；见 fixtures/seed-seat-console.sql）。
 * 覆盖口律：harness 用同名环境变量 sed 种子；测试侧只读同源默认值。
 */
export const ORG_ID = process.env.SC153_E2E_ORG_ID ?? '1603940848519155'
export const WORKSPACE_ID = process.env.SC153_E2E_WORKSPACE_ID ?? '1603940848519156'
/** console 主键与公开 ID 同值（TSID 十进制串；公开非 secret）。 */
export const CONSOLE_PUBLIC_ID = process.env.SC153_E2E_CONSOLE_PUBLIC_ID ?? '7003004002001001'
export const IDENTITY_ID = '1603940848519157'
/** 访客链路（hosted 面合同）用 widget installation。 */
export const WIDGET_PUBLIC_ID = process.env.SC153_E2E_WIDGET_ID ?? '702000000000000101'

/** console allowed_origins 初始值（A06 轮换后临时变为 shop2.test，finally 复原）。 */
export const ALLOWED_ORIGIN = SHOP
export const ROTATED_ORIGIN = SHOP2

/** 合成坐席（scratch 库 DB 直种 + passport/signup 建号；仅本地测试值）。 */
export const SEAT = {
  account: process.env.SC153_E2E_SEAT_ACCOUNT ?? '19900000002',
  password: process.env.SC153_E2E_SEAT_PASSWORD ?? 'Sc153E2e2026',
}

/**
 * Admin 治理面账号（A08 用；经 /api/adm/setup/init 首启 —— 与 P2 同口径由
 * run 环境提供；captcha 1234 为 local 合同测试码）。
 */
export const ADMIN = {
  account: process.env.SC153_E2E_ADMIN_ACCOUNT ?? 'sc153-admin-e2e@imboy.local',
  password: process.env.SC153_E2E_ADMIN_PASSWORD ?? 'Sc153AdmE2e2026',
  captcha: '1234',
}

/** scratch PG（docker 容器 imboy_pg18；库名可按 run 覆盖）。 */
export const PG = {
  container: process.env.SC153_E2E_PG_CONTAINER ?? 'imboy_pg18',
  user: process.env.SC153_E2E_PG_USER ?? 'imboy_user',
  database: process.env.SC153_E2E_PG_DB ?? 'sc153_e2e',
}

/** EXECUTE 阶段门：A0 在 SC-INT PASS + candidate manifest 冻结后置 1。 */
export const EXECUTE_ENABLED = process.env.SC153_E2E_EXECUTE === '1'

/** 宿主 iframe snippet 的精确 sandbox 值（计划 §1.1 冻结合同）。 */
export const IFRAME_SANDBOX_EXACT = 'allow-scripts allow-same-origin allow-downloads'

/** PG oracle：容器内 psql 直查（禁伪造行；只读 SELECT + 测试夹具显式 UPDATE）。 */
export function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', PG.container, 'psql', '-U', PG.user, '-d', PG.database, '-tAc', sql],
    { encoding: 'utf8' },
  ).trim()
}

/**
 * console allowed_origins 一次性夹具（A06 origin 轮换的落库等价物 —— 直接 DB
 * update 是本测试的文档化 oracle；平台 PUT /api/adm 面等价行为由 SC-BE 卡覆盖）。
 * 返回更新前的值（jsonb 文本），供调用方 finally 复原。
 */
export function rotateConsoleOrigins(consoleId: string, newOrigin: string): string {
  const before = psql(
    `select allowed_origins::text from customer_service_seat_console where id = ${consoleId}`,
  )
  psql(
    `update customer_service_seat_console set allowed_origins = '[${JSON.stringify(newOrigin)}]'::jsonb` +
      ` where id = ${consoleId}`,
  )
  return before
}

export function restoreConsoleOrigins(consoleId: string, previousJson: string): void {
  psql(
    `update customer_service_seat_console set allowed_origins = '${previousJson.replace(/'/g, "''")}'::jsonb` +
      ` where id = ${consoleId}`,
  )
}

/**
 * console revoke 一次性夹具（A07 的落库等价物；status='revoked' 与平台
 * revoke 幂等端点同终态）。返回旧 status 供复原。
 */
export function setConsoleStatus(consoleId: string, status: 'active' | 'revoked'): string {
  const before = psql(`select status from customer_service_seat_console where id = ${consoleId}`)
  const revokedAt = status === 'revoked' ? 'now()' : 'null'
  psql(
    `update customer_service_seat_console set status = '${status}', revoked_at = ${revokedAt}` +
      ` where id = ${consoleId}`,
  )
  return before
}

/** 坐席护照登录（真实 passport/login；rsa_encrypt=0 明文本地沙盒口径）。 */
export async function seatPassportLogin(account: string): Promise<string> {
  const res = await fetch(`${BE_MAIN}/api/v1/passport/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'mobile',
      account,
      pwd: SEAT.password,
      rsa_encrypt: '0',
      sys_version: 'sc153-embed',
    }),
  })
  if (res.status !== 200) throw new Error(`seat login failed: HTTP ${res.status}`)
  const body = (await res.json()) as { code: number; payload?: { token?: string } }
  if (body.code !== 0 || typeof body.payload?.token !== 'string' || body.payload.token === '') {
    throw new Error('seat login envelope invalid')
  }
  return body.payload.token
}

/** 坐席回复（真实 HTTP 通道：eb_tenant POST conversation_messages）。 */
export async function agentHttpMessage(
  token: string,
  conversationId: string,
  clientMsgId: string,
  body: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(
    `${BE_MAIN}/api/v1/enterprise/organizations/${ORG_ID}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        workspace_id: WORKSPACE_ID,
        client_msg_id: clientMsgId,
        sender_type: 'business_identity',
        identity_id: IDENTITY_ID,
        body,
      }),
    },
  )
  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* 如实留空 */
  }
  return { status: res.status, json }
}

/** 清理本作用域残留 active 会话（坐席 max_concurrent=1；与 P2 db-proof 同款）。 */
export function closeStaleActiveSessions(): number {
  const out = psql(
    `with cls as (update customer_service_session set status='closed', closed_at=now() at time zone 'utc'` +
      ` where organization_id=${ORG_ID} and workspace_id=${WORKSPACE_ID} and status='active' returning 1)` +
      ` select count(*) from cls`,
  )
  return Number(out.trim() || 0)
}
