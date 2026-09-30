/**
 * SC-E2E — 紧凑负例 spec E：凭证类负例（REVIEW-2 B-2——坐席/管理/访客
 * 三域凭证滥用场景缺口补位）。
 *
 * 编号说明：N17..N25 续接既有 N 系最大号——minimality N01..N12 与并行
 * 落盘的 negatives-qr-replay（REVIEW-2 B-4）N13..N16；本文件 spec 字母
 * 取 E（A=attachment、B=upload-qr、C=gateway-cookie、D=qr-replay）。
 *
 * ⛔ EXECUTE-GATED：`SC153_E2E_EXECUTE=1` 才执行（journey 同款文件级门；
 * A0 串行执行，套件间禁止并行——README 已登记）。
 *
 * 攻击面与分工（四矩阵；与既有负例 spec 的边界）：
 *   1. 坐席 JWT × Admin 治理面（BE 直连）——negatives-gateway-minimality
 *      N11 只证明 `/api/adm` 经 cs.test 网关静态 404（网关收敛面）；本矩阵
 *      闭合「绕过网关直打 backend」的第二道防线：adm_auth_middleware 必须
 *      把坐席 JWT 当非平台凭证拒绝。
 *   2. Admin 平台 Cookie × 坐席专属端点（BE 直连）——G2/journey A03 已覆盖
 *      网关面 heartbeat；本矩阵打 BE 直连面，并把端点扩展到 seat-contexts
 *      （P01 证明坐席 JWT 可达的同款端点）。
 *   3. 访客 visit token 复用（widget 面，BE 直连；attachment/upload-qr 同款
 *      口径）——跨会话（messages 读/写 + events SSE 补偿读；content 读已归
 *      attachment N4 的 422 not_session_contact，不重复）与跨 installation
 *      （令牌配异 installation_id → digest (org, installation) 维度无命中）。
 *   4. Authorization 头格式破坏（网关面真实拓扑整链，minimality probe 同款
 *      GATEWAY_BASE 直连口径）——垃圾 JWT/空值/错误 scheme 必须收敛 401，
 *      绝不允许 2xx 成功信封。
 *
 * 断言依据（BE 源码 + 2026-09-30 执行期 curl 实测，非猜测）：
 *   - auth_ds:parse_authorization_header/1：`Bearer ` 前缀（大小写敏感）剥除，
 *     非前缀整串当 token；verify_token 无效 → HTTP 401 + envelope code 706
 *     "Invalid token"（MFS3-F01/F02：认证边界落真实 401，code 保留细分）；
 *     无 Authorization 头 → 401 + code 401「未登录，请先登录」。
 *   - `/api/adm` 面 adm_auth_middleware（平台 Cookie 专用凭证面）：坐席 JWT →
 *     401 + code 706 "Need to log in again"（current / organizations /
 *     welcome / user/list / channel/list / customer-service sessions 六端点
 *     实测一致）。
 *   - cs_widget_support:verify_bootstrap_token/2：digest 按 (Org, installation)
 *     命中——源码原话「跨 Org / 跨安装的命中不了行」→ 401
 *     visit_token_invalid（CP-SEC-05 DEC-VISIT-TOKEN=FIX_401_VISIT_TOKEN_INVALID）。
 *   - cs_widget_session_app:session_in_scope/3：会话 contact ≠ 令牌派生
 *     contact → 422 not_session_contact（messages GET/POST 实测一致）；
 *     events SSE 分支 → 404 session_not_found（防枚举口径，实测）。
 *
 * 已知宽松边界（如实登记，非断言失败；后端收紧时须评审同步更新本文件）：
 *   ① 裸 JWT（无 Bearer 前缀）被放行——parse_authorization_header「非前缀
 *     整串当 token」的设计使然（2026-09-30 实测 200/code=0）；N25 以记录性
 *     断言钉住现状。
 *   ② 治理面 cs 端点（seats / shop-keys / visit-tokens / stats / presence，
 *     带 workspace_id）BE 直连对坐席 JWT 放行 200——权限模型=「登录即可」，
 *     面隔离完全依赖网关收敛（N06-N09 已锁网关面）。绕网关直打 BE 即跨过
 *     面隔离；登记为架构观察项（写 403 断言会假红，故不入本文件断言面）。
 */
import { expect, test } from '@playwright/test'
import { adminLogin } from './helpers/admin-ui'
import {
  ADMIN_ORIGIN,
  BE_MAIN,
  CS_ORIGIN,
  EXECUTE_ENABLED,
  ORG_ID,
  SEAT,
  seatPassportLogin,
  SHOP,
  WIDGET_PUBLIC_ID,
  WORKSPACE_ID,
  psql,
} from './helpers/env'

// 与 negatives-gateway-minimality.spec.ts 同款：cs.test 被系统代理 fake-ip
// 劫持时，SC153_E2E_GATEWAY_BASE=https://127.0.0.1:18443 直连同一拓扑
// （cs.test 块为首个 vhost=默认 server），零 BE_MAIN 回退（回退即空洞）。
const GATEWAY_BASE = process.env.SC153_E2E_GATEWAY_BASE ?? CS_ORIGIN

// ⛔ EXECUTE 阶段门（文件级：FIXTURE_ONLY 下本文件全部用例 skip）
test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: A0 sets SC153_E2E_EXECUTE=1 after SC-INT PASS + frozen candidate manifest')

/** 会话内 seat JWT（beforeAll 经 passport/login 真实签发；只进 Authorization 头）。 */
let seatJwt = ''

test.beforeAll(async () => {
  seatJwt = await seatPassportLogin(SEAT.account)
  expect(seatJwt.length).toBeGreaterThan(0)
})

/** 信封形状（elib_response）：{code, msg, payload}。 */
interface Envelope {
  code: number
  msg?: string
  payload?: Record<string, unknown>
}

interface ProbeResult {
  status: number
  envelope: Envelope | null
  text: string
}

/** 解析响应为探针结果（非 JSON 时 envelope=null，天然无成功信封）。 */
async function toProbe(res: Response): Promise<ProbeResult> {
  const text = (await res.text()).slice(0, 500)
  try {
    return { status: res.status, envelope: JSON.parse(text) as Envelope, text }
  } catch {
    return { status: res.status, envelope: null, text }
  }
}

interface ProbeInit {
  method?: 'GET' | 'POST'
  /** Authorization 头原值（含或不含 scheme；undefined = 不发该头）。 */
  authorization?: string
  /** widget 面专用凭证头（x-cs-visit-token）。 */
  tokenHeader?: string
  body?: Record<string, unknown>
}

/** BE 直连探针（attachment/upload-qr 的 BE_MAIN 口径；负例绝不携带 Cookie）。 */
async function probeBe(path: string, init: ProbeInit = {}): Promise<ProbeResult> {
  const res = await fetch(`${BE_MAIN}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(init.authorization !== undefined ? { authorization: init.authorization } : {}),
      ...(init.tokenHeader !== undefined ? { 'x-cs-visit-token': init.tokenHeader } : {}),
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'omit',
  })
  return toProbe(res)
}

/** 网关面探针（minimality 同款 GATEWAY_BASE 直连口径；自签 TLS 依赖
 *  NODE_TLS_REJECT_UNAUTHORIZED=0，README 运行口径）。 */
async function probeGateway(path: string, authorization?: string): Promise<ProbeResult> {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    headers: {
      ...(authorization !== undefined ? { authorization } : {}),
      accept: 'application/json',
    },
    credentials: 'omit',
  })
  return toProbe(res)
}

/** 真实访客令牌（bootstrap 全新 subject 签发一次；attachment spec A 同款链路）。 */
async function newVisitorToken(marker: string): Promise<{ installationId: string; token: string }> {
  const res = await fetch(`${BE_MAIN}/api/v1/cs/widget/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SHOP },
    body: JSON.stringify({ public_widget_id: WIDGET_PUBLIC_ID, subject_id: marker }),
  })
  expect(res.status, 'bootstrap 必须 200（S3 合同：全新 subject 签发一次）').toBe(200)
  const body = (await res.json()) as Envelope
  expect(body.code, 'bootstrap 信封 code=0').toBe(0)
  const installationId = String(body.payload?.installation_id ?? '')
  const token = String(body.payload?.secret ?? '')
  expect(installationId, 'installation_id TSID 串').not.toBe('')
  expect(token, 'secret 仅在签发响应出现一次').not.toBe('')
  return { installationId, token }
}

/** 访客建会话（持 token 面）；返回 session id。 */
async function newVisitorSessionId(installationId: string, token: string): Promise<string> {
  const res = await fetch(`${BE_MAIN}/api/v1/cs/widget/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cs-visit-token': token },
    body: JSON.stringify({ installation_id: installationId }),
  })
  expect(res.status, '访客建会话必须 200').toBe(200)
  const body = (await res.json()) as Envelope
  expect(body.code).toBe(0)
  const sessionId = String(body.payload?.session_id ?? '')
  expect(sessionId).not.toBe('')
  return sessionId
}

// ---------------------------------------------------------------------------
// 矩阵 1：坐席 JWT × Admin 治理面（BE 直连——网关收敛之外的第二道防线）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 负例E：坐席 JWT × Admin 治理面（BE 直连）', () => {
  test('N17 坐席 JWT 打 /api/adm 只读治理端点族 → 401 code 706（绝无成功信封）', async () => {
    for (const path of [
      '/api/adm/current',
      '/api/adm/user/list',
      '/api/adm/channel/list',
      '/api/adm/organizations',
      '/api/adm/welcome',
    ]) {
      const r = await probeBe(path, { authorization: `Bearer ${seatJwt}` })
      expect(r.status, `${path} 状态=${r.status} body=${r.text}`).toBe(401)
      expect(r.envelope?.code, `${path} 平台面细分码 706（adm_auth_middleware 不认坐席 JWT）`).toBe(706)
      expect(r.envelope?.msg, `${path} 拒绝语义`).toBe('Need to log in again')
    }
  })

  test('N18 坐席 JWT 打 /api/adm 治理面 cs 形态端点 → 401 code 706', async () => {
    const r = await probeBe(
      `/api/adm/customer-service/organizations/${ORG_ID}/sessions?workspace_id=${WORKSPACE_ID}`,
      { authorization: `Bearer ${seatJwt}` },
    )
    expect(r.status, `状态=${r.status} body=${r.text}`).toBe(401)
    expect(r.envelope?.code, '平台面细分码 706').toBe(706)
    expect(r.envelope?.msg).toBe('Need to log in again')
  })
})

// ---------------------------------------------------------------------------
// 矩阵 2：Admin 平台 Cookie × 坐席专属端点（BE 直连）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 负例E：Admin 平台 Cookie × 坐席专属端点（BE 直连）', () => {
  test('N19 Admin Cookie 重放 seat-contexts / heartbeat（BE 直连）→ 401/403；绝无成功信封', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
    try {
      const page = await ctx.newPage()
      await adminLogin(page)
      const admCookies = await ctx.cookies(`${ADMIN_ORIGIN}/`)
      expect(admCookies.some((c) => c.name.startsWith('adm_')), 'admin 登录后应有平台 Cookie（前置自检）').toBe(true)
      const cookieHeader = admCookies.map((c) => `${c.name}=${c.value}`).join('; ')

      // 最坏情况重放：显式附 adm Cookie 打坐席专属端点。heartbeat 的网关面
      // 已归 G2/journey A03；本用例闭合 BE 直连面 + seat-contexts 端点
      // （heartbeat 用 GET：G2 同款，鉴权拒绝发生在动作派发前，零写副作用）。
      for (const path of [
        '/api/v1/cs/me/seat-contexts',
        `/api/v1/cs/organizations/${ORG_ID}/seats/me/heartbeat?workspace_id=${WORKSPACE_ID}`,
      ]) {
        const resp = await ctx.request.get(`${BE_MAIN}${path}`, { headers: { cookie: cookieHeader } })
        expect([401, 403], `${path} Admin Cookie 重放必须 401/403，got ${resp.status()}`).toContain(resp.status())
        const text = (await resp.text()).slice(0, 200)
        let body: Envelope | null = null
        try {
          body = JSON.parse(text) as Envelope
        } catch {
          body = null
        }
        expect(body?.code ?? null, `${path} 负例响应绝不携带成功信封（body=${text}）`).not.toBe(0)
      }
    } finally {
      await ctx.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 矩阵 3：访客 visit token 复用（widget 面，BE 直连）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 负例E：访客 visit token 复用（widget 面）', () => {
  test('N20 跨会话复用：A 令牌打 B 会话 messages 读/写 → 422 not_session_contact；events → 404 session_not_found', async () => {
    const marker = `n20-${Date.now()}`
    const alice = await newVisitorToken(`alice-${marker}`)
    const bob = await newVisitorToken(`bob-${marker}`)
    const bobSessionId = await newVisitorSessionId(bob.installationId, bob.token)

    // 对照组（防假绿）：B 自读 200 —— 会话存在且 B 令牌有效，后续拒绝才能
    // 归因于「跨会话」而非「会话不存在/令牌无效」。
    const self = await probeBe(
      `/api/v1/cs/widget/sessions/${bobSessionId}/messages?installation_id=${bob.installationId}`,
      { tokenHeader: bob.token },
    )
    expect(self.status, `B 自读对照必须 200，got ${self.status} body=${self.text}`).toBe(200)
    expect(self.envelope?.code, 'B 自读信封 code=0').toBe(0)

    // 跨会话读（messages GET；content 读已归 attachment N4，不重复）。
    const crossRead = await probeBe(
      `/api/v1/cs/widget/sessions/${bobSessionId}/messages?installation_id=${alice.installationId}`,
      { tokenHeader: alice.token },
    )
    expect(crossRead.status, `跨会话读 状态=${crossRead.status} body=${crossRead.text}`).toBe(422)
    expect(crossRead.envelope?.msg, '会话归属门（session_in_scope）').toBe('not_session_contact')

    // 跨会话写（messages POST；client_msg_id 动作表必填——cs_actions）。
    const clientMsgId = `sc153-n20-${marker}`
    const crossWrite = await probeBe(`/api/v1/cs/widget/sessions/${bobSessionId}/messages`, {
      method: 'POST',
      tokenHeader: alice.token,
      body: {
        installation_id: alice.installationId,
        body: 'sc153 cross-session probe',
        client_msg_id: clientMsgId,
      },
    })
    expect(crossWrite.status, `跨会话写 状态=${crossWrite.status} body=${crossWrite.text}`).toBe(422)
    expect(crossWrite.envelope?.msg).toBe('not_session_contact')

    // DB oracle：跨会话写被拒 → B 会话 conversation 零该 client_msg_id 消息。
    const leaked = psql(
      `select count(*) from enterprise_message em` +
        ` where em.client_msg_id = '${clientMsgId}'` +
        ` and em.conversation_id = (select conversation_id from customer_service_session where id = ${bobSessionId})`,
    )
    expect(Number(leaked), '跨会话写绝不落库').toBe(0)

    // 跨会话 SSE events（补偿读）：404 session_not_found —— 防枚举口径，
    // 不区分「非本 contact 的会话」与「不存在」，泄漏面更小。
    const crossEvents = await probeBe(
      `/api/v1/cs/widget/sessions/${bobSessionId}/events?installation_id=${alice.installationId}`,
      { tokenHeader: alice.token },
    )
    expect(crossEvents.status, `跨会话 events 状态=${crossEvents.status} body=${crossEvents.text}`).toBe(404)
    expect(crossEvents.envelope?.msg, 'SSE 面防枚举语义').toBe('session_not_found')
  })

  test('N21 跨 installation 复用：A 令牌配异 installation_id → 401 visit_token_invalid（digest (org,installation) 维度）', async () => {
    const alice = await newVisitorToken(`n17-${Date.now()}`)
    const aliceSessionId = await newVisitorSessionId(alice.installationId, alice.token)

    // 对照组：同令牌 + 本 installation → 200（令牌本身有效，拒绝才能归因于
    // installation 维度而非令牌无效）。
    const self = await probeBe(
      `/api/v1/cs/widget/sessions/${aliceSessionId}/messages?installation_id=${alice.installationId}`,
      { tokenHeader: alice.token },
    )
    expect(self.status, `本 installation 对照必须 200，got ${self.status} body=${self.text}`).toBe(200)
    expect(self.envelope?.code).toBe(0)

    // 跨 installation：fixture 单 widget（第二安装需 INSERT 新行，超出本套件
    // psql 夹具纪律 README §纪律2「只读直查 + 显式 UPDATE」），故按
    // verify_bootstrap_token 的 (org, installation, digest) 查询合同，以
    // 「异 installation_id 申报」构造与真实第二安装完全相同的无命中分支
    // （cs_widget_support 原话「跨 Org / 跨安装的命中不了行」）。
    const foreignInstallationId = '999000000000000001' // 形状合法 TSID
    const cross = await probeBe(
      `/api/v1/cs/widget/sessions/${aliceSessionId}/messages?installation_id=${foreignInstallationId}`,
      { tokenHeader: alice.token },
    )
    expect(cross.status, `跨 installation 状态=${cross.status} body=${cross.text}`).toBe(401)
    expect(cross.envelope?.msg, 'digest 无命中 = 凭证无效语义（CP-SEC-05）').toBe('visit_token_invalid')

    // 建会话面同维度复核：异 installation_id 建会话 → 同款 401。
    const crossCreate = await probeBe('/api/v1/cs/widget/sessions', {
      method: 'POST',
      tokenHeader: alice.token,
      body: { installation_id: foreignInstallationId },
    })
    expect(crossCreate.status, `异 installation 建会话 状态=${crossCreate.status} body=${crossCreate.text}`).toBe(401)
    expect(crossCreate.envelope?.msg).toBe('visit_token_invalid')
  })

  test('N22 visit token 冒充坐席 Bearer 打坐席面 → 401 code 706（域互斥）', async () => {
    // 对照：合法坐席 JWT 同端点 200（P01 同款；防「端点本身不可达」假绿）。
    const ok = await probeBe('/api/v1/cs/me/seat-contexts', { authorization: `Bearer ${seatJwt}` })
    expect(ok.status, `坐席 JWT 对照必须 200，got ${ok.status} body=${ok.text}`).toBe(200)
    expect(ok.envelope?.code).toBe(0)

    // 访客令牌当 Bearer：widget 凭证对坐席面就是无效 token（706）。
    const alice = await newVisitorToken(`n18-${Date.now()}`)
    const forged = await probeBe('/api/v1/cs/me/seat-contexts', {
      authorization: `Bearer ${alice.token}`,
    })
    expect(forged.status, `状态=${forged.status} body=${forged.text}`).toBe(401)
    expect(forged.envelope?.code, '坐席面 token 校验失败细分码').toBe(706)
    expect(forged.envelope?.msg).toBe('Invalid token')
  })
})

// ---------------------------------------------------------------------------
// 矩阵 4：Authorization 头格式破坏（网关面真实拓扑整链）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 负例E：Authorization 头格式破坏（网关面）', () => {
  test('N23 无 Authorization 头 → 401 code 401 未登录（ERR_TOKEN_MISSING）', async () => {
    const r = await probeGateway('/api/v1/cs/me/seat-contexts')
    expect(r.status, `状态=${r.status} body=${r.text}`).toBe(401)
    expect(r.envelope?.code, '缺头细分码 401').toBe(401)
    expect(r.envelope?.msg).toBe('未登录，请先登录')
  })

  test('N24 格式破坏四形态（Bearer 空值/垃圾串/三段垃圾/小写 bearer+真 JWT）→ 401 code 706 Invalid token', async () => {
    const variants: Array<{ label: string; authorization: string }> = [
      { label: 'Bearer 空值', authorization: 'Bearer ' },
      { label: 'Bearer 垃圾串（非 JWT 形状）', authorization: 'Bearer not-a-jwt-at-all-sc153' },
      { label: 'Bearer 三段垃圾（形状合法值无效）', authorization: 'Bearer aaaabbbbcccc.ddddeeeeffff.gggghhhhiiii' },
      { label: '小写 bearer + 真实坐席 JWT（scheme 大小写敏感）', authorization: `bearer ${seatJwt}` },
    ]
    for (const v of variants) {
      const r = await probeGateway('/api/v1/cs/me/seat-contexts', v.authorization)
      expect(r.status, `${v.label} 状态=${r.status} body=${r.text}`).toBe(401)
      expect(r.envelope?.code, `${v.label} 细分码 706`).toBe(706)
      expect(r.envelope?.msg, `${v.label} 拒绝语义`).toBe('Invalid token')
      expect(r.envelope?.code, `${v.label} 负例响应绝不携带成功信封`).not.toBe(0)
    }
  })

  test('N25 正例对照 + 宽松边界登记：合法 Bearer 200；裸 JWT（无前缀）当前放行（钉住现状供收紧评审）', async () => {
    // 正例控制组（minimality P01 同款职责）：证明拒绝类用例跑在健康拓扑上，
    // 防「网关/后端宕机 → 全 401」假绿。
    const ok = await probeGateway('/api/v1/cs/me/seat-contexts', `Bearer ${seatJwt}`)
    expect(ok.status, `合法 Bearer 对照必须 200，got ${ok.status} body=${ok.text}`).toBe(200)
    expect(ok.envelope?.code).toBe(0)

    // 宽松边界（文件头登记①）：auth_ds:parse_authorization_header 对非
    // `Bearer ` 前缀的值整串当 token —— 裸 JWT 天然通过校验（2026-09-30
    // 实测 200/code=0）。这是记录性断言而非负例：后端若收紧为 401，本用例
    // 失败即提醒同步评审 N23-N24 合同与网关/客户端调用面。
    const raw = await probeGateway('/api/v1/cs/me/seat-contexts', seatJwt)
    expect(raw.status, `裸 JWT 现状=放行（parse_authorization_header 设计），got ${raw.status} body=${raw.text}`).toBe(200)
    expect(raw.envelope?.code).toBe(0)
  })
})
