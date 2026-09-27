/**
 * CP-ASSET-02（hosted Widget 真实 E2E 入仓）— 环境常量与 oracle 工具。
 *
 * 从历史 run cs-hosted-widget-20260920T150315Z（CSD-E2E-03 round3）提取后脱敏
 * 并适配当前合同（hosted-widget-contract v1.1 + /w/ 面 frame 资产
 * /widget-assets/cs-widget.v2.js）。全部为本地 scratch 合成值，零生产凭据/PII。
 *
 * 四域 loopback 拓扑（详见 README.md）：
 *   shop.test:18443  第三方宿主页（合法 origin）
 *   cs.test:18443    Widget 网关（TLS → backend /w/ + /api/v1/cs/widget/* + 静态产物）
 *   shop2.test:18443 evil 宿主（负例 origin）
 *   api.test:18443   Backend 主 API 面（坐席通道直连 BE_MAIN）
 */

import { execFileSync } from 'node:child_process'

export const CS_BROWSER = 'https://cs.test:18443'
export const CS = 'https://127.0.0.1:18443'
export const SHOP = 'https://shop.test:18443'
export const SHOP2 = 'https://shop2.test:18443'

/** 坐席侧主 API 面（直连 backend，不经 widget 网关）。 */
export const BE_MAIN = process.env.CP12_E2E_BACKEND ?? 'http://127.0.0.1:9805'

/** scratch 种子固定 TSID（tenancy fixture；见 fixtures/seed-installations.sql）。 */
export const ORG = '700200000000000001'
export const WORKSPACE_ID = '700300000000000001'
export const INST_A = '700400000000000001'
export const INST_B = '700400000000000002' // revoked（kill switch 负例）
export const WID_A = '702000000000000001'
export const WID_B = '702000000000000002' // revoked
export const ORIGIN = 'https://shop.test:18443'
export const IDENTITY_ID = '700500000000000001'

/** 合成坐席（scratch 库 DB 直种 + passport/signup 建号；仅本地测试值）。 */
export const SEAT = {
  account: process.env.CP12_E2E_SEAT_ACCOUNT ?? '19900000001',
  password: process.env.CP12_E2E_SEAT_PASSWORD ?? 'Cp12E2e2026',
}

/** scratch PG（docker 容器 imboy_pg18；库名可按 run 覆盖）。 */
export const PG = {
  container: process.env.CP12_E2E_PG_CONTAINER ?? 'imboy_pg18',
  user: process.env.CP12_E2E_PG_USER ?? 'imboy_user',
  database: process.env.CP12_E2E_PG_DB ?? 'imboy_cp12_e2e02',
}

/** PG oracle：容器内 psql 直查（禁伪造行；只读 SELECT）。 */
export function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', PG.container, 'psql', '-U', PG.user, '-d', PG.database, '-tAc', sql],
    { encoding: 'utf8' },
  ).trim()
}

/** 坐席登录（真实 passport/login；rsa_encrypt=0 明文本地沙盒口径）。 */
export async function seatLogin(): Promise<string> {
  const res = await fetch(`${BE_MAIN}/api/v1/passport/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'mobile',
      account: SEAT.account,
      pwd: SEAT.password,
      rsa_encrypt: '0',
      sys_version: 'cp12-asset02',
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
    `${BE_MAIN}/api/v1/enterprise/organizations/${ORG}/conversations/${conversationId}/messages`,
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

/** 坐席关会话（真实 HTTP 通道：cs_tenant POST sessions/:id/close，CAS）。 */
export async function agentHttpClose(
  token: string,
  sessionId: string,
  expectedVersion: number,
): Promise<{ status: number; json: any }> {
  const res = await fetch(
    `${BE_MAIN}/api/v1/cs/organizations/${ORG}/sessions/${sessionId}/close`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        expected_version: expectedVersion,
        workspace_id: WORKSPACE_ID,
        reason: 'cp12-asset02-hosted-e2e',
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
