/**
 * P1-E2E-01（A6-E2E）：真实后端与种子的环境常量。
 *
 * 后端节点 9802 与种子由 run 环境提供（csww-p1-e2e-api-chain-recipe 配方）；
 * 这里只固化事实值，不构造任何替身。坐席账号是合成坐席（DB 直种）。
 */

export const BACKEND_BASE = process.env.CSWW_E2E_BACKEND ?? 'http://127.0.0.1:9802'

/** 宿主站点（本测试的静态+反代服务；与 installation allowed_origins 对齐）。 */
export const HOST_ORIGIN = process.env.CSWW_E2E_HOST_ORIGIN ?? 'http://localhost:8901'

export const ORG_ID = '1603940848519155'
export const WORKSPACE_ID = '1776025844701027'
export const INSTALLATION_ID = '5837897154422619'
export const PUBLIC_WIDGET_ID = 'csww-e2e-widget-77729338'

/** 跨 installation 负例用的另一组织/安装（同库种子）。 */
export const OTHER_ORG_ID = '1593173991415380'
export const OTHER_INSTALLATION_ID = '9460771712205608'
export const OTHER_PUBLIC_WIDGET_ID = 'csww-chain-1760383326'

/** 合成坐席（A=org owner，具备治理面权限；B 为转接目标）。 */
export const SEAT_A = { account: '19900000001', identityId: '1812620870393267' }
export const SEAT_B = { account: '19900000002', identityId: '8304657945488544' }
export const SEAT_PASSWORD = 'CswwE2e2026'

/** csww run 的 scratch PG（docker 容器 imboy_pg18，库按 RUN_ID 命名）。 */
export const PG = {
  container: 'imboy_pg18',
  user: 'imboy_user',
  database: process.env.CSWW_E2E_PG_DB ?? 'csww_20260920T051447Z',
}

/** 坐席登录：passport/login（rsa_encrypt:"0" 明文沙盒口径）。 */
export async function seatLogin(account: string): Promise<{ token: string; uid: string }> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/passport/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'mobile', account, pwd: SEAT_PASSWORD, rsa_encrypt: '0' }),
  })
  if (res.status !== 200) throw new Error(`seat login failed for ${account}: HTTP ${res.status}`)
  const envelope = (await res.json()) as { code: number; payload?: { token?: string; uid?: number | string } }
  const token = envelope.payload?.token
  if (envelope.code !== 0 || typeof token !== 'string' || token.length === 0) {
    throw new Error(`seat login envelope invalid for ${account}`)
  }
  const uid = envelope.payload?.uid === undefined ? '' : String(envelope.payload.uid)
  return { token, uid }
}

/** 信封解包（后端统一 {code,msg,payload}）。 */
export async function envelope<T = unknown>(res: Response): Promise<T> {
  const body = (await res.json()) as { code: number; payload?: T }
  if (body.code !== 0 || body.payload === undefined) {
    throw new Error(`envelope code=${body.code} msg=${JSON.stringify(body).slice(0, 200)}`)
  }
  return body.payload
}
