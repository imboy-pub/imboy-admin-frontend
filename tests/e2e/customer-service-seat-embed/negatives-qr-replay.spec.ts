/**
 * SC-E2E — 紧凑负例 spec D：QR 登录 token 重放（REVIEW-2 B-4，N13..N16）。
 *
 * ⛔ EXECUTE-GATED：`SC153_E2E_EXECUTE=1` 才执行（journey 同款文件级门；
 * A0 串行执行，套件间禁止并行——README 已登记）。
 *
 * token 一次性消费点取证结论（任务要求：先确认哪一步是一次性消费点，
 * 重放打在正确的端点上；取证 = r5-backend/src/api/qr_login_handler.erl）：
 *   - login_token 的**唯一一次性消费点** = GET /api/v1/passport/qr_login/status
 *     的 confirmed 分支（qr_login_handler.erl:135-150）：返回
 *     payload{status,token,uid} 的同时 delete_session/1（:141）销毁整个会话；
 *     此后同 session_token 的任何读都落 :129 的 404「会话不存在或已过期」。
 *   - SSE subscribe（qr_login_sse_handler.erl）只是广播 confirmed+token，
 *     **不消费**单次读（不删会话）——页面（qrLoginSession.ts）走 SSE 主路时
 *     单次读保留；走 2s 轮询 fallback 时由页面自己的 confirmed 轮询消费。
 *     N14 对两种终态都如实容忍（code=0 本调用取走 / code=404 页面已取走），
 *     消费之后的所有重放则确定性 404/5201。
 *   - confirm（:266-378）只置 status=confirmed + 生成 login_token，响应只回
 *     {status:confirmed} **不含 token**（:357-360）；qr_token 是独立随机值 +
 *     60s 缓存反查（:426-438），QR 内容不可反解出 session_token。
 *   - qr_token 重放按会话状态分流：confirmed 存活（未消费）→ 5203
 *     「二维码已确认，请刷新」（:189-194 scan / :309-314 confirm，纯 error
 *     返回零状态迁移）；会话已删（已消费/TTL 过期）→ 5201
 *     「二维码已过期，请刷新」（:185 / :283）。
 *
 * 断言依据（BE 源码 + 2026-09-30 执行期实证，非猜测；scratch 栈
 * BE=127.0.0.1:9801 + 网关 IP 直连 https://127.0.0.1:18443）：
 *   - 首次 status（confirmed 会话）              → HTTP 200 + code=0  + payload{status,token,uid}
 *   - 重放 status（已消费）                      → HTTP 200 + code=404 + msg=会话不存在或已过期
 *   - 重放 confirm/scan（会话存活，未消费）      → HTTP 200 + code=5203 + msg=二维码已确认，请刷新
 *   - 重放 confirm/scan（会话已删）              → HTTP 200 + code=5201 + msg=二维码已过期，请刷新
 *   - 篡改 qr_token（改一位）scan/confirm        → HTTP 200 + code=5200 + msg=无效的二维码
 *   - 篡改/未知 session_token 的 status          → HTTP 200 + code=404 + msg=会话不存在或已过期（防枚举）
 *   - 免 Bearer 的 scan/confirm                  → **真实 HTTP 401** + code=401 + msg=未登录，请先登录
 *
 * REVIEW-2 B-4 预期修正说明（按实证为准）：原预期「重放→401/400、篡改→401」
 * 被执行期证伪——QR 面业务错误经 elib_response:error/3 落 **envelope code**
 * （HTTP 恒 200；elib_response.erl error/3 → reply_json(Code,...)），真实
 * HTTP 401 只出现在免 Bearer 请求被 auth middleware 拒之门外的路径
 * （auth_middleware_api_v1.erl：scan/confirm 不在 Web QR 白名单
 * IsWebQrLoginPath，走 verify_sign 鉴权链）。「绝不 2xx」在本栈的正确口径 =
 * 信封绝不 code=0、payload 绝不回 token（N15 的免 Bearer 面除外——那是
 * 唯一真实 HTTP 401 的落点）。
 *
 * 探测面：重放/篡改探针全部走**网关面**（GATEWAY_BASE IP 直连，cs.test 块
 * 为 18443 声明序首个 vhost=default server；harness nginx 对
 * /api/v1/passport/qr_login/ 整段前缀放行）——与 negatives-gateway-cookie
 * （spec C）同款口径，零 BE_MAIN 回退（回退即空洞）。坐席 Bearer 经
 * helpers/env.seatPassportLogin 真实签发（密码环境注入，不硬编码）；浏览器
 * 正路复用 helpers/qr-embed（openSeatEmbed + qrLoginSeatInFrame）。
 */
import { expect, test as base } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { CS_ORIGIN, EXECUTE_ENABLED, SEAT, seatPassportLogin } from './helpers/env'
import { openSeatEmbed, qrLoginSeatInFrame } from './helpers/qr-embed'

// 与 negatives-gateway-cookie.spec.ts 同款：cs.test 被系统代理 fake-ip 劫持时，
// SC153_E2E_GATEWAY_BASE=https://127.0.0.1:18443 直连同一拓扑（cs.test 块为
// 首个 vhost=默认 server），零 BE_MAIN 回退。
const GATEWAY_BASE = process.env.SC153_E2E_GATEWAY_BASE ?? CS_ORIGIN

/** 网关面 API 夹具：request context 直连网关（自签 TLS 经 ignoreHTTPSErrors 放行）。 */
const test = base.extend<{ gateway: APIRequestContext }>({
  gateway: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: GATEWAY_BASE,
      ignoreHTTPSErrors: true,
    })
    // Playwright fixture callback parameter, not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(ctx)
    await ctx.dispose()
  },
})

// ⛔ EXECUTE 阶段门（文件级：FIXTURE_ONLY 下本文件全部用例 skip）
test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: A0 sets SC153_E2E_EXECUTE=1 after SC-INT PASS + frozen candidate manifest')

/** 信封形状（elib_response）：{code, msg, payload}。 */
interface Envelope {
  code: number
  msg?: string
  payload?: Record<string, unknown>
}

const RUN_UNIQ = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

/** 坐席护照 JWT（beforeAll 真实签发；只进 Authorization 头，绝不落日志/诊断）。 */
let seatJwt = ''

test.beforeAll(async () => {
  seatJwt = await seatPassportLogin(SEAT.account)
  expect(seatJwt.length, '坐席护照 JWT 必须真实签发').toBeGreaterThan(0)
})

/** GET status（session_token 面：login_token 唯一一次性读端点）。 */
async function statusOf(
  gateway: APIRequestContext,
  sessionToken: string,
): Promise<{ http: number; body: Envelope }> {
  const resp = await gateway.get(
    `/api/v1/passport/qr_login/status?session_token=${encodeURIComponent(sessionToken)}`,
  )
  return { http: resp.status(), body: (await resp.json()) as Envelope }
}

/** POST scan/confirm（qr_token 面，手机端合同形状：Bearer + {qr_token}）。 */
async function qrAction(
  gateway: APIRequestContext,
  action: 'scan' | 'confirm',
  qrToken: string,
  bearer: string,
): Promise<{ http: number; body: Envelope }> {
  const resp = await gateway.post(`/api/v1/passport/qr_login/${action}`, {
    headers: { authorization: `Bearer ${bearer}` },
    data: { qr_token: qrToken },
  })
  return { http: resp.status(), body: (await resp.json()) as Envelope }
}

// ---------------------------------------------------------------------------
// 矩阵 1：正路控制组 + 浏览器真实消费后的重放
// ---------------------------------------------------------------------------
test.describe('SC-E2E 负例D：QR 登录 token 重放（REVIEW-2 B-4）', () => {
  // ---------------------------------------------------------------- N13
  test('N13 正路控制组：真实 QR 登录一次成功（复用 qr-embed helper），证明链路活着', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const { page } = await openSeatEmbed(browser) // 默认合法宿主 SHOP
    try {
      // 真实链路全通：宿主页 → /seat/<id> frame → create/subscribe（SSE）→
      // scan/confirm → login_token 送达页面 → 工作台挂载（helper 内部已断言
      // seat-workspace 可见）。防「网关/backend 挂了 → 重放负例全 404/5200
      // 假绿」：负例矩阵必须先有一条活的正路。
      await qrLoginSeatInFrame(page, SEAT.account)
    } finally {
      await page.context().close()
    }
  })

  // ---------------------------------------------------------------- N14
  test('N14 浏览器真实消费后重放：status 重放 404；qr_token 重放 5201/5200（信封绝不 code=0、绝不回 token）', async ({
    browser,
    gateway,
  }) => {
    test.setTimeout(240_000)
    const { page } = await openSeatEmbed(browser)
    try {
      // 观察真实 create 响应（零拦截，只挂监听）：换码风暴下取**最后一次**
      // create 的 (qr_token, session_token) —— 登录收敛（工作台挂载）后不再
      // 有新 create，最后一次即被 confirm 的会话（qr-embed helper 从最新
      // QR 属性取码）。监听在 openSeatEmbed 返回后的同一微任务内挂上，
      // frame 的首次 create 不可能漏掉（frame 加载需独立网络往返）。
      const createPairs: Array<Promise<{ qrToken: string; sessionToken: string } | null>> = []
      page.on('response', (res) => {
        if (!res.url().includes('/passport/qr_login/create')) return
        createPairs.push(
          res
            .json()
            .then((raw) => {
              const body = raw as Envelope
              return {
                qrToken: String(body.payload?.qr_token ?? ''),
                sessionToken: String(body.payload?.session_token ?? ''),
              }
            })
            .catch(() => null),
        )
      })

      // 页面真实拿到 login_token（SSE 主路或轮询 fallback，helper 全程真栈）。
      await qrLoginSeatInFrame(page, SEAT.account)

      const pairs = (await Promise.all(createPairs)).filter(
        (p): p is { qrToken: string; sessionToken: string } =>
          p !== null && p.qrToken !== '' && p.sessionToken !== '',
      )
      expect(pairs.length, '登录期间必须观察到真实 qr_login/create 响应').toBeGreaterThan(0)
      const target = pairs[pairs.length - 1]!

      // —— 步骤1：单次读终态（两种合法，见文件头消费点取证）——
      // 页面走 SSE 主路 → 单次读未花费，本次 code=0 由本调用取走；
      // 页面走轮询 fallback → 页面的 confirmed 轮询已取走并删会话 → 404。
      // 无论哪种，本步骤之后单次读必然已花费。
      const first = await statusOf(gateway, target.sessionToken)
      expect(first.http, 'QR 面业务错误恒 HTTP 200（elib_response 只落 envelope code）').toBe(200)
      expect(
        [0, 404],
        `status 首读终态必须是 0（本调用消费）或 404（页面已消费），got code=${first.body.code} msg=${first.body.msg ?? ''}`,
      ).toContain(first.body.code)
      if (first.body.code === 0) {
        // 识别自检：必须是已确认会话；waiting/scanned = 换码错位（识别失败），
        // 如实红而非拿错会话继续断言。
        expect(String(first.body.payload?.status ?? ''), '识别的必须是 confirmed 会话（否则换码错位）').toBe('confirmed')
        expect(String(first.body.payload?.token ?? ''), 'SSE 主路：本调用即唯一合法取走，必须带回 token').not.toBe('')
        // token 值绝不进日志/诊断（A09 泄漏门口径）。
      } else {
        expect(first.body.msg ?? '', '404 分支的拒绝语义').toContain('会话不存在或已过期')
      }

      // —— 步骤2：REPLAY status（同一 session_token 第二次读）——
      const replay = await statusOf(gateway, target.sessionToken)
      expect(replay.http, '防枚举合同：HTTP 面恒 200').toBe(200)
      expect(replay.body.code, `单次读已花费：重放必须 envelope 404，got code=${replay.body.code}`).toBe(404)
      expect(replay.body.msg ?? '').toContain('会话不存在或已过期')
      expect(replay.body.payload?.token ?? null, '重放绝不回 token').toBe(null)

      // —— 步骤3：REPLAY confirm/scan（同一 qr_token，消费后会话已删）——
      // 会话删除 → get_session undefined → 5201（qr_login_handler.erl:185/:283）。
      // >60s 换码风暴下 qr_token→session 映射同过期则落 5200（parse 失败，
      // :181/:279）——同为 fail-closed 拒绝，按实证容差收录。
      for (const action of ['confirm', 'scan'] as const) {
        const r = await qrAction(gateway, action, target.qrToken, seatJwt)
        expect(r.http, `${action} 重放：HTTP 面恒 200`).toBe(200)
        expect(
          [5201, 5200],
          `消费后 ${action} 重放必须 5201（会话已删；映射同过期则 5200），got code=${r.body.code} msg=${r.body.msg ?? ''}`,
        ).toContain(r.body.code)
        expect(r.body.payload?.token ?? null, `${action} 重放绝不回 token`).toBe(null)
      }
    } finally {
      await page.context().close()
    }
  })

  // ---------------------------------------------------------------- N15
  test('N15 伪造/篡改 token（改一位字符）：qr_token→5200、session_token→404；免 Bearer→真实 HTTP 401', async ({
    gateway,
  }) => {
    test.setTimeout(60_000)
    // 真实签发一对 token（与浏览器页面同一 create 端点，经网关）。
    const create = await gateway.post('/api/v1/passport/qr_login/create', {
      data: {
        device_id: `sc153-qr-replay-n15-${RUN_UNIQ}`,
        device_name: 'negatives-qr-replay',
        platform: 'web',
      },
    })
    expect(create.status(), 'create 经网关必须 200').toBe(200)
    const createBody = (await create.json()) as Envelope
    expect(createBody.code).toBe(0)
    const qrToken = String(createBody.payload?.qr_token ?? '')
    const sessionToken = String(createBody.payload?.session_token ?? '')
    expect(qrToken, 'qr_token 必须真实签发').not.toBe('')
    expect(sessionToken, 'session_token 必须真实签发').not.toBe('')

    // 篡改 = 改一位字符（首位替换为不同字符）。qr_token 为 base64 随机值，
    // 改一位即脱离 60s 缓存映射 → parse_qr_token fail → 5200「无效的二维码」。
    const flip = (s: string): string => (s[0] === 'B' ? `C${s.slice(1)}` : `B${s.slice(1)}`)
    const tamperedQr = flip(qrToken)
    const tamperedSession = flip(sessionToken)
    expect(tamperedQr).not.toBe(qrToken)
    expect(tamperedSession).not.toBe(sessionToken)

    for (const action of ['scan', 'confirm'] as const) {
      const r = await qrAction(gateway, action, tamperedQr, seatJwt)
      expect(r.http, `${action} 篡改是业务错误：HTTP 200 + envelope 5200`).toBe(200)
      expect(r.body.code, `${action} 篡改 qr_token 必须 5200（缓存反查无命中）`).toBe(5200)
      expect(r.body.msg ?? '').toContain('无效的二维码')
      expect(r.body.payload?.token ?? null, `${action} 篡改绝不回 token`).toBe(null)
    }

    // 篡改 session_token 的 status → 404（与未知 token 同应答，防枚举：
    // HTTP 面不区分未知与已消费——qr_login_handler.erl:129 单一分支）。
    const tamperedStatus = await statusOf(gateway, tamperedSession)
    expect(tamperedStatus.http).toBe(200)
    expect(tamperedStatus.body.code, '篡改 session_token 必须 404').toBe(404)
    expect(tamperedStatus.body.msg ?? '').toContain('会话不存在或已过期')
    expect(tamperedStatus.body.payload?.token ?? null).toBe(null)

    // 免 Bearer 的 confirm（携带**真实** qr_token）→ middleware 鉴权门
    // 真实 HTTP 401（auth_middleware_api_v1：scan/confirm 不在 Web QR 白名单，
    // 走 verify_sign）——本文件唯一真实 HTTP 级 401 面，B-4 预期
    // 「401 收敛」的正确落点：无凭证的攻击者连 handler 都到不了。
    const anon = await gateway.post('/api/v1/passport/qr_login/confirm', {
      data: { qr_token: qrToken },
    })
    expect(anon.status(), `免 Bearer 必须被鉴权门真实 401，got HTTP ${anon.status()}`).toBe(401)
    const anonBody = (await anon.json()) as Envelope
    expect(anonBody.code).toBe(401)
    expect(anonBody.msg ?? '').toContain('未登录')
  })

  // ---------------------------------------------------------------- N16
  test('N16 受控链全生命周期重放矩阵：未消费重放 5203 → 单次读取走 → status 404 / qr_token 5201', async ({
    gateway,
  }) => {
    test.setTimeout(60_000)
    // 受控 API 链（同 qr-embed scanAndConfirm 的合同形状，全经网关，秒级完成
    // 无 TTL 边界）：create → scan → confirm，此刻**不做任何 status 读**
    // （单次读保留），覆盖浏览器流无法确定性触达的「confirmed 存活」窗口——
    // 即「拍下二维码的第二台手机」攻击面。
    const create = await gateway.post('/api/v1/passport/qr_login/create', {
      data: {
        device_id: `sc153-qr-replay-n16-${RUN_UNIQ}`,
        device_name: 'negatives-qr-replay',
        platform: 'web',
      },
    })
    expect(create.status()).toBe(200)
    const createBody = (await create.json()) as Envelope
    expect(createBody.code).toBe(0)
    const qrToken = String(createBody.payload?.qr_token ?? '')
    const sessionToken = String(createBody.payload?.session_token ?? '')
    expect(qrToken).not.toBe('')
    expect(sessionToken).not.toBe('')

    const scan = await qrAction(gateway, 'scan', qrToken, seatJwt)
    expect(scan.body.code, 'scan 正路必须 code=0').toBe(0)
    const confirm = await qrAction(gateway, 'confirm', qrToken, seatJwt)
    expect(confirm.body.code, 'confirm 正路必须 code=0').toBe(0)
    // confirm 响应只回 {status:confirmed}，绝不回 token（:357-360）——
    // token 只经 status 单次读 / SSE 广播出，confirm 响应不是泄漏面。
    expect(String(confirm.body.payload?.status ?? ''), 'confirm 响应状态必须是 confirmed').toBe('confirmed')
    expect(confirm.body.payload?.token ?? null, 'confirm 响应绝不回 token').toBe(null)

    // —— 未消费窗口重放（会话存活、status=confirmed、单次读未花费）——
    // 同一 qr_token 再 confirm/scan → 5203「二维码已确认，请刷新」
    // （:189-194/:309-314），纯 error 返回、零状态迁移（下方单次读仍可用
    // 即为其不破坏状态机的直接证明）。
    for (const action of ['confirm', 'scan'] as const) {
      const r = await qrAction(gateway, action, qrToken, seatJwt)
      expect(r.http).toBe(200)
      expect(r.body.code, `未消费重放 ${action} 必须 5203（已确认）`).toBe(5203)
      expect(r.body.msg ?? '').toContain('二维码已确认')
      expect(r.body.payload?.token ?? null, `未消费重放 ${action} 绝不回 token`).toBe(null)
    }

    // —— 单次读此刻仍可用（重放未破坏状态机）：首次 status 取走 token ——
    const first = await statusOf(gateway, sessionToken)
    expect(first.http).toBe(200)
    expect(first.body.code, '受控链：首次 status 必须取到 token（单次读未被重放消耗）').toBe(0)
    expect(String(first.body.payload?.token ?? ''), 'login_token 只此一次').not.toBe('')
    expect(String(first.body.payload?.status ?? '')).toBe('confirmed')

    // —— 消费后重放矩阵（确定性）——
    const replayStatus = await statusOf(gateway, sessionToken)
    expect(replayStatus.http).toBe(200)
    expect(replayStatus.body.code, 'status 重放必须 404（取走即删）').toBe(404)
    expect(replayStatus.body.msg ?? '').toContain('会话不存在或已过期')
    expect(replayStatus.body.payload?.token ?? null).toBe(null)

    for (const action of ['confirm', 'scan'] as const) {
      const r = await qrAction(gateway, action, qrToken, seatJwt)
      expect(r.http).toBe(200)
      expect(r.body.code, `消费后重放 ${action} 必须 5201（会话已删）`).toBe(5201)
      expect(r.body.msg ?? '').toContain('二维码已过期')
      expect(r.body.payload?.token ?? null, `消费后重放 ${action} 绝不回 token`).toBe(null)
    }
  })
})
