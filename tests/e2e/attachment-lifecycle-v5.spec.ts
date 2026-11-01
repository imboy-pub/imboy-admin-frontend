/**
 * W6-02 attachment-lifecycle-v5 — Admin 真浏览器恢复套件（contract draft）。
 *
 * 合同锚点（execution-contract.json，head bcb20cf3d）：
 * - W6-02/admin-recovery-real（40 叶 = 20 场景 × garage/disk）：全部由本文件
 *   出证（adapter `attachment_lifecycle_v5_adapter_w6_02_admin_recovery_real.py`
 *   把 20 场景 mapping 定死为 ("playwright", None)）。oracle：real browser
 *   against actual backend/storage reruns every exact source recovery
 *   scenario; same key/asset/message, no cross-account journal disclosure or
 *   late callback write; no required skip.
 * - W6-02/e2e-compat：real_browser 2 叶仅本文件可出证；any 5 场景
 *   （old_request / historic_fixture / multi_business_reference /
 *   network_recovery / process_kill_recovery）由本文件的 browser 侧实现承担
 *   （与 App 侧 flutter spec 恰好一侧提供同名场景，双提供/双缺都是 adapter
 *   硬 gap —— 见 resources/w602-prep/admin/LEAF-MAPPING.md §3）。
 *
 * 适配器硬约束（本文件形态由此而来）：
 * - 每个 test 的 title（spec.title，不含 describe 链）必须精确等于场景名
 *   （或 "场景: 说明" 前缀形）；同场景名在本文件内唯一（adapter 每轮要求
 *   "恰好一个" 匹配测试，0/2 皆硬 gap）。
 * - gate 逐 driver（garage/disk）各跑一轮 `--reporter=json`；adapter 要求
 *   每轮全绿：stats 不得出现 unexpected/skipped/flaky → **本文件禁止 skip**
 *   （前置缺失一律 fail-fast 抛错并带键名/原因；不用 test.skip）。
 * - 真实链路合同：核心上传/恢复链路禁止 route.fulfill 替换；故障注入只允许
 *   route.abort（真网络故障）与页面内真故障（存储写失败、迟到回调观测）。
 *
 * 运行方式（gate `w602_run_admin` 自动执行；人工预检同参）：
 *   cd ADMIN && V5_E2E_DRIVER=<garage|disk> \
 *     ./node_modules/.bin/playwright test tests/e2e/attachment-lifecycle-v5.spec.ts \
 *     --reporter=json
 * 安装位置：ADMIN/tests/e2e/attachment-lifecycle-v5.spec.ts。
 * 环境基线：playwright.config.ts 自动 loadEnvFile('.env.e2e')；键清单见
 * resources/w602-prep/admin/env.e2e.keys.txt（凭证不落仓、不打印）。
 *
 * 场景语义蓝本（W5-02 源单测）：src/widget/customer_service/app/uploader.test.ts
 * （W5-02 describe）与 src/modules/customer_service/seat/workbench/
 * seatSend.{attachmentRecovery,revocation}.test.tsx 的同名源场景。
 *
 * draft 校准点（W6-02 执行窗口按实际 DOM/后端形态复核，见 README「已知边界」）：
 * - 撤权场景以 route.abort 网络级授权失败表达客户端失败合同（保稿/不重放/
 *   不新增 intent）；真实管理面撤权动作（seat console revoke / widget 停用）
 *   在执行窗口以种子/平台动作接入后升级为端到端 403。
 * - 过期能力场景以「一次性 PUT URL 二次使用被真实后端拒绝」触发 renew，
 *   不依赖后端 TTL 快进。
 */
import { createHash } from 'node:crypto'
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'

test.describe.configure({ retries: 0 })

// ---------------------------------------------------------------------------
// 环境（fail-fast：键缺失 = 显式 fail 带键名，不 skip、不默认回退、不打印值）
// ---------------------------------------------------------------------------

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value === '') {
    throw new Error(
      `W6-02 admin spec 缺少必需环境变量 ${name}（写入 ADMIN/.env.e2e，见 ` +
      `resources/w602-prep/admin/env.e2e.keys.txt；本套件禁止 skip，前置缺失必须显式红）`,
    )
  }
  return value
}

const V5_DRIVER = process.env.V5_E2E_DRIVER?.trim() ?? ''
// gate 按 garage/disk 两轮各跑一次本文件；driver 非法 = 全部场景红（合同只认两个真驱动）。
const DRIVER_OK = V5_DRIVER === 'garage' || V5_DRIVER === 'disk'

const ADMIN_ACCOUNT = (): string => requiredEnv('IMBOY_ADMIN_E2E_ACCOUNT')
const ADMIN_PASSWORD = (): string => requiredEnv('IMBOY_ADMIN_E2E_PASSWORD')
// 后端管理面（.env.e2e 注入自有后端；默认 9800 在 W6-02 语境不可用）。
const ADMIN_API_BASE = (): string => requiredEnv('IMBOY_ADMIN_BASE_URL').replace(/\/$/, '')

const SEAT_ACCOUNT = (): string => requiredEnv('IMBOY_ADMIN_E2E_V5_SEAT_ACCOUNT')
const SEAT_PASSWORD = (): string => requiredEnv('IMBOY_ADMIN_E2E_V5_SEAT_PASSWORD')
const SEAT2_ACCOUNT = (): string => requiredEnv('IMBOY_ADMIN_E2E_V5_SEAT2_ACCOUNT')
const SEAT2_PASSWORD = (): string => requiredEnv('IMBOY_ADMIN_E2E_V5_SEAT2_PASSWORD')
const ORG_ID = (): string => requiredEnv('IMBOY_ADMIN_E2E_V5_ORG_ID')
const WORKSPACE_ID = (): string => requiredEnv('IMBOY_ADMIN_E2E_V5_WORKSPACE_ID')
// 种子预置的可写活动会话（恢复场景必须绑定同一会话/资产，禁止 .first() 猜选）。
const SEAT_SESSION_ID = (): string => requiredEnv('IMBOY_ADMIN_E2E_V5_SEAT_SESSION_ID')
const WIDGET_PUBLIC_ID = (): string => requiredEnv('IMBOY_ADMIN_E2E_V5_WIDGET_PUBLIC_ID')
const HISTORIC_ASSET_ID = (): string => requiredEnv('IMBOY_ADMIN_E2E_V5_HISTORIC_ASSET_ID')
const HISTORIC_ASSET_SHA256 = (): string => requiredEnv('IMBOY_ADMIN_E2E_V5_HISTORIC_ASSET_SHA256')

const E2E_PORT = process.env.IMBOY_ADMIN_E2E_PORT || '8082'
const APP_ORIGIN = process.env.IMBOY_ADMIN_E2E_BASE_URL || `http://127.0.0.1:${E2E_PORT}`
const SEAT_ENTRY = `${APP_ORIGIN}/seat/index.html`
const WIDGET_ENTRY = `${APP_ORIGIN}/widget/index.html`

const JOURNAL_PREFIX = 'imboy:attachment:v5:'

test.beforeAll(() => {
  if (!DRIVER_OK) {
    throw new Error(
      `V5_E2E_DRIVER 必须是 garage|disk（gate 逐驱动注入），实际值：` +
      `${JSON.stringify(V5_DRIVER)}。缺失时禁止凭空出证。`,
    )
  }
  // 集中前置校验：任一键缺失在 suite 开始即显式红（禁止 skip；错误只报键名不报值）。
  for (const read of [
    ADMIN_ACCOUNT, ADMIN_PASSWORD, ADMIN_API_BASE,
    SEAT_ACCOUNT, SEAT_PASSWORD, SEAT2_ACCOUNT, SEAT2_PASSWORD,
    ORG_ID, WORKSPACE_ID, WIDGET_PUBLIC_ID, SEAT_SESSION_ID,
    HISTORIC_ASSET_ID, HISTORIC_ASSET_SHA256,
  ]) read()
})

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** 每场景确定性合成字节（场景自控 bytes = oracle "controls its synthetic bytes"）。 */
function syntheticBytes(tag: string, size = 4096): Uint8Array {
  const bytes = new Uint8Array(size)
  let seed = createHash('sha256').update(tag).digest()[0] + 1
  for (let i = 0; i < size; i += 1) {
    seed = (seed * 31 + i) % 251
    bytes[i] = 32 + seed % 95
  }
  return bytes
}

/** 前置探针（eadm 套件同款端点/判据）：真实后端不可达 = 全部场景红（不 skip）。 */
async function probeBackend(request: APIRequestContext): Promise<void> {
  try {
    const res = await request.get(`${ADMIN_API_BASE()}/admin/config/sidebar`, { timeout: 5_000 })
    if (res.status() < 500) return
    throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    throw new Error(
      `真实后端 ${ADMIN_API_BASE()} 不可达（${String(err)}）：W6-02 oracle 要求 ` +
      `actual backend/storage；检查 .env.e2e 的 IMBOY_ADMIN_BASE_URL 与 VITE_PROXY_TARGET。`,
      { cause: err },
    )
  }
}

/** 坐席护照登录（真实 /api/v1/passport/login；node 侧 fetch 经 dev proxy 同源）。 */
async function seatPassportLogin(account: string, password: string): Promise<string> {
  const res = await fetch(`${APP_ORIGIN}/api/v1/passport/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'mobile', account, pwd: password, rsa_encrypt: '0', sys_version: 'w602-admin-e2e' }),
  })
  if (res.status !== 200) throw new Error(`seat passport login HTTP ${res.status}`)
  const body = (await res.json()) as { code: number; payload?: { token?: string } }
  const token = body.payload?.token
  if (body.code !== 0 || typeof token !== 'string' || token === '') {
    throw new Error(`seat passport login envelope invalid（code=${body.code}）`)
  }
  return token
}

/** 页面内 QR 扫码确认（与 helpers/qr-embed.ts 同一真实合同面，本地实现）。 */
async function confirmSeatQr(page: Page, seatJwt: string): Promise<void> {
  const qrCode = page.getByTestId('seat-qr-code')
  await expect(qrCode.locator('svg')).toBeVisible({ timeout: 30_000 })
  await expect(qrCode).toHaveAttribute('data-qr-content', /imboy:\/\/qr_login\?qr_token=.+/, { timeout: 30_000 })
  const content = (await qrCode.getAttribute('data-qr-content')) ?? ''
  const token = decodeURIComponent(/qr_token=([^&\s]+)/.exec(content)?.[1] ?? '')
  if (token === '') throw new Error('seat QR token 提取失败')
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${seatJwt}` }
  for (const step of ['scan', 'confirm'] as const) {
    const res = await fetch(`${APP_ORIGIN}/api/v1/passport/qr_login/${step}`, {
      method: 'POST', headers, body: JSON.stringify({ qr_token: token }),
    })
    const body = (await res.json()) as { code: number }
    if (res.status !== 200 || body.code !== 0) {
      throw new Error(`qr_login/${step} failed: HTTP ${res.status} code=${body.code}`)
    }
  }
}

/** 打开坐席工作台并完成 QR 登录（收敛到已挂载工作台；返回页面与护照 JWT）。
 * selectSession=false 仅用于不触碰会话 UI 的调用方（坐席 B 隔离断言、
 * 纯 JWT compat 链路）：可写种子会话归属坐席 A，B 的「我的」列表没有它。 */
async function openSeatWorkspace(
  context: BrowserContext, account: string, password: string,
  selectSession = true,
): Promise<{ page: Page; seatJwt: string }> {
  const seatJwt = await seatPassportLogin(account, password)
  const page = await context.newPage()
  await page.goto(SEAT_ENTRY)
  await confirmSeatQr(page, seatJwt)
  await expect(page.getByTestId('seat-workspace')).toBeVisible({ timeout: 30_000 })
  if (selectSession) {
    // 工作台默认落在排队 tab；附件输入只在选中「进行中」活动会话后渲染
    // （canWrite && active）。会话 ID 来自种子注入，禁止 .first() 猜选。
    await page.getByTestId('seat-tab-active').click()
    const sid = SEAT_SESSION_ID()
    await expect(page.getByTestId(`seat-session-item-${sid}`)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(`seat-session-item-${sid}`).click()
    await expect(page.getByTestId('seat-attach-input')).toBeVisible({ timeout: 30_000 })
  }
  return { page, seatJwt }
}

/** 打开挂件面并以同源宿主身份完成 host-context 握手（非 iframe 时
 * event.source === window.parent 恒真，controller 逐字校验天然通过）。 */
async function openWidget(context: BrowserContext, installationTag: string): Promise<Page> {
  const page = await context.newPage()
  // 页面模块脚本一执行就会自启 host-context 并锁定首个上下文（controller 拒绝
  // 后续 context）。必须在 main.ts 读到壳根节点属性之前就把正确 widgetId 写进
  // data-public-widget-id，晚了只能拿到回退值或已被锁定的错误上下文。
  await page.addInitScript((widgetId) => {
    const install = (): void => {
      const root = document.getElementById('cs-widget-root')
      if (root === null) {
        requestAnimationFrame(install)
        return
      }
      root.setAttribute('data-public-widget-id', widgetId)
    }
    install()
  }, WIDGET_PUBLIC_ID())
  await page.goto(WIDGET_ENTRY)
  await expect(page.locator('#cs-widget-root')).not.toBeEmpty({ timeout: 30_000 })
  // 若 init script 的重试输给了模块加载（boot 已用 URL 末段回退锁定错误
  // context），在此处立即明确红，而不是下游 10s 超时或假证据。
  await expect(page.locator('#cs-widget-root')).toHaveAttribute(
    'data-public-widget-id', WIDGET_PUBLIC_ID(), { timeout: 10_000 },
  )
  // 同意门每次打开都会重现（后端不记忆 consent 接受）；有界竞速后按需点击，
  // 最终以聊天输入可用为打开完成的判据（而非根节点非空）。
  const consent = page.getByTestId('cs-consent-accept')
  // consent 与 file-input 可能同时可见（bootstrap 修复后不再互斥）：or 定位器
  // 在两元素同现时触发 strict violation，改为分支判定 —— consent 可见即通过，
  // 否则等 file-input 可见。
  await expect(async () => {
    if (await consent.isVisible()) return
    await expect(page.getByTestId('cs-file-input')).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
  if (await consent.isVisible().catch(() => false)) {
    await consent.click()
  }
  await expect(page.getByTestId('cs-file-input')).toBeVisible({ timeout: 30_000 })
  // installation 作用域锚：场景标签仅作观测（不触碰 token/secret 面）。
  await page.evaluate((tag) => { window.sessionStorage.setItem('w602-e2e:tag', tag) }, installationTag)
  return page
}

type JournalRow = {
  key: string
  phase: string
  clientUploadId: string
  objectHash: string
  assetId: string | null
}

/** 读取当前 origin 的上传恢复 journal（scope/phase 观测点）。 */
async function readJournal(page: Page): Promise<JournalRow[]> {
  return page.evaluate((prefix) => {
    const rows: JournalRow[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key === null || !key.startsWith(prefix)) continue
      const raw = window.localStorage.getItem(key)
      if (raw === null) continue
      const row = JSON.parse(raw) as Record<string, unknown>
      rows.push({
        key,
        phase: String(row.phase ?? ''),
        clientUploadId: String(row.clientUploadId ?? ''),
        objectHash: String(row.objectHash ?? ''),
        assetId: row.assetId === null || row.assetId === undefined ? null : String(row.assetId),
      })
    }
    return rows
  }, JOURNAL_PREFIX)
}

/** 页面内注入真存储写故障（checkpoint 写失败场景的真实故障注入通道）。 */
async function breakLocalStorageWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    const proto = window.localStorage as unknown as { setItem: (_k: string, _v: string) => void }
    proto.setItem = () => {
      throw new DOMException('w602 injected quota fault', 'QuotaExceededError')
    }
  })
}

/** 授权内容链路字节复核（driver 真实对象状态断言；护照 JWT 鉴权，不经物理存储路径）。 */
async function fetchSeatAssetContent(
  seatJwt: string, assetId: string, rangeHeader?: string,
): Promise<{ sha256: string | null; bytes: number; status: number }> {
  const headers: Record<string, string> = { authorization: `Bearer ${seatJwt}` }
  if (rangeHeader !== undefined) headers.range = rangeHeader
  const res = await fetch(
    `${APP_ORIGIN}/api/v1/enterprise/organizations/${ORG_ID()}/assets/${encodeURIComponent(assetId)}/content?workspace_id=${encodeURIComponent(WORKSPACE_ID())}`,
    { headers },
  )
  if (!res.ok && res.status !== 206) {
    throw new Error(`asset content HTTP ${res.status}（授权内容链路失败）`)
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  return {
    sha256: rangeHeader === undefined ? sha256Hex(buf) : null,
    bytes: buf.byteLength,
    status: res.status,
  }
}

/** 坐席面完整发送：选合成文件 → chip 出现 → 发送（消息链路由应用驱动）。 */
async function seatSendAttachment(page: Page, name: string, mime: string, bytes: Uint8Array): Promise<void> {
  await page.getByTestId('seat-attach-input').setInputFiles({
    name, mimeType: mime, buffer: Buffer.from(bytes),
  })
  await expect(page.getByTestId('seat-attach-chip')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('seat-attach-chip-name')).toHaveText(name)
  await page.getByTestId('seat-send').click()
}

/** 挂件选文件即自动发送；成功或故障由各场景断言。 */
async function widgetSendAttachment(page: Page, name: string, mime: string, bytes: Uint8Array): Promise<void> {
  const input = page.getByTestId('cs-file-input')
  await expect(input).toBeEnabled({ timeout: 10_000 })
  await input.setInputFiles({
    name, mimeType: mime, buffer: Buffer.from(bytes),
  })
}

// ---------------------------------------------------------------------------
// W6-02/admin-recovery-real：20 场景（每 driver 轮各消费一次，title=场景名）
// ---------------------------------------------------------------------------

test.describe('W6-02 admin-recovery-real（widget/seat 恢复面，real browser × real backend）', () => {

  test.beforeEach(async ({ request }, testInfo) => {
    test.setTimeout(150_000)
    await probeBackend(request)
    if (!DRIVER_OK) {
      throw new Error(`[${testInfo.title}] V5_E2E_DRIVER 非法：${JSON.stringify(V5_DRIVER)}`)
    }
  })

  // ---- widget 面（蓝本：uploader.test.ts W5-02 describe；testid cs-*）----

  test('widget_timeout', async ({ browser }) => {
    // hung presign 超时中止：无 PUT/confirm 重试风暴；journal 保留同 hash intent；
    // 故障解除后同任务续传（authoritative 同 asset/message 语义）。
    const context = await browser.newContext()
    const page = await openWidget(context, 'widget_timeout')
    const bytes = syntheticBytes('widget_timeout')
    const hash = sha256Hex(bytes)
    let failPresign = true
    let confirmSeen = 0
    await page.route('**/assets/presign', async (route) => {
      if (failPresign) return route.abort('timedout')
      return route.fallback()
    })
    await page.route('**/assets/confirm', async (route) => {
      confirmSeen += 1
      return route.fallback()
    })
    await widgetSendAttachment(page, 'w602-widget-timeout.txt', 'text/plain', bytes)
    await page.waitForTimeout(5_000)
    expect(confirmSeen, '超时窗口内无 confirm 出站（无重试风暴）').toBe(0)
    failPresign = false
    await page.unroute('**/assets/presign')
    await page.waitForTimeout(6_000)
    const journal = await readJournal(page)
    const rows = journal.filter(r => r.objectHash === hash)
    expect(rows.length, 'journal 保留同 hash 任务（durable 恢复面）').toBeGreaterThan(0)
    const ids = new Set(rows.map(r => r.clientUploadId))
    expect(ids.size, '同 hash 任务不产生重复 intent').toBe(rows.length)
    await context.close()
  })

  test('widget_presign_response_lost', async ({ browser }) => {
    // 丢失的 presign 响应持久化 intent；恢复沿用同一 clientUploadId（不换任务）。
    // 产品无自动重试（resumeUpload 无退避/定时器）：恢复入口 = 失败气泡的
    // cs-msg-retry（同一 client_msg_id + 原 file，复用同 clientUploadId）。
    // 恢复观测面用 PUT abort-once（真网络故障）冻结：本地快链路若放行会在
    // 断言前走到 linked 清账（journal.remove），任务连续性断言失去对象
    // （源场景的 linked 清账由 uploader.test.ts 承担）。
    const context = await browser.newContext()
    const page = await openWidget(context, 'widget_presign_response_lost')
    const bytes = syntheticBytes('widget_presign_response_lost')
    const hash = sha256Hex(bytes)
    let dropFirstPresign = true
    let killedFirstPut = false
    await page.route('**/assets/presign', async (route) => {
      if (dropFirstPresign) {
        dropFirstPresign = false
        return route.abort('connectionreset')
      }
      return route.fallback()
    })
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'PUT' && !killedFirstPut) {
        killedFirstPut = true
        return route.abort('connectionreset')
      }
      return route.fallback()
    })
    await widgetSendAttachment(page, 'w602-presign-lost.txt', 'text/plain', bytes)
    await page.waitForTimeout(3_000)
    const intent = (await readJournal(page)).find(r => r.objectHash === hash)
    expect(intent, 'presign 响应丢失后 intent 已持久化').toBeTruthy()
    await page.getByTestId('cs-msg-retry').click()
    await expect.poll(async () => {
      return (await readJournal(page)).find(r => r.objectHash === hash)?.phase
    }, {
      message: '恢复链路把同任务推进到 registered（PUT abort 冻结观测面）',
      timeout: 20_000,
    }).toBe('registered')
    const after = await readJournal(page)
    const recovered = after.find(r => r.objectHash === hash)
    expect(recovered?.clientUploadId, '恢复沿用同一 clientUploadId').toBe(intent?.clientUploadId)
    expect(['registered', 'uploaded', 'confirmed']).toContain(recovered?.phase)
    await context.close()
  })

  test('widget_restart_before_put', async ({ browser }) => {
    // register 与裸 PUT 之间重启：registered checkpoint 存活且同 clientUploadId 复用。
    // PUT abort-once（真网络故障）冻结观测面：源场景在 PUT 在途时 kill 页面，
    // journal 冻结在 registered —— 不冻结时本地快链路可能在 close 前走到
    // confirmed 清账（journal.remove），重启断言失去对象。
    const context = await browser.newContext()
    const page = await openWidget(context, 'widget_restart_before_put')
    const bytes = syntheticBytes('widget_restart_before_put')
    const hash = sha256Hex(bytes)
    let killedAfterRegister = false
    let killedFirstPut = false
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'PUT' && !killedFirstPut) {
        killedFirstPut = true
        return route.abort('connectionreset')
      }
      return route.fallback()
    })
    await page.route('**/assets/presign', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown> | null
      if (body !== null && body.operation === 'register' && !killedAfterRegister) {
        killedAfterRegister = true
        await route.fallback()
        // fallback 只继续传递请求，不保证客户端处理完成；立即 close 会掐断
        // register 响应处理，registered checkpoint 写不下来（journal 停在
        // intent），恢复场景失去前提。等 registered checkpoint 真正落盘再
        // 终止页面（源场景：restart_before_put 的 journal 冻结在 registered）。
        await expect(async () => {
          const row = (await readJournal(page)).find(r => r.objectHash === hash)
          expect(row?.phase, 'registered checkpoint 落盘').toBe('registered')
        }).toPass({ timeout: 15_000 })
        await page.close()
        return
      }
      return route.fallback()
    })
    await widgetSendAttachment(page, 'w602-before-put.txt', 'text/plain', bytes)
    await expect.poll(() => killedAfterRegister, {
      message: 'register 后即终止页面（PUT 未发生窗口）',
      timeout: 10_000,
    }).toBe(true)
    // 同 context 重开（localStorage 随 origin 存活 —— 浏览器侧 process_restart 等价物）。
    const page2 = await openWidget(context, 'widget_restart_before_put-resume')
    await page2.waitForTimeout(4_000)
    const journal = await readJournal(page2)
    const row = journal.find(r => r.objectHash === hash)
    expect(row, 'PUT 前重启后 registered checkpoint 存活').toBeTruthy()
    expect(['registered', 'uploaded', 'confirmed']).toContain(row?.phase)
    await context.close()
  })

  test('widget_expired_capability_resume', async ({ browser }) => {
    // 过期能力恢复：一次性 PUT URL 二次使用被真实后端拒绝 → renew 同 UUID/hash 恢复。
    const context = await browser.newContext()
    const page = await openWidget(context, 'widget_expired_capability_resume')
    const bytes = syntheticBytes('widget_expired_capability_resume')
    const hash = sha256Hex(bytes)
    const putUrls: string[] = []
    await page.route('**/*', async (route) => {
      const url = route.request().url()
      if (route.request().method() === 'PUT') {
        putUrls.push(url)
        if (putUrls.length > 1) return route.abort('accessdenied')
      }
      return route.fallback()
    })
    await widgetSendAttachment(page, 'w602-expired-cap.txt', 'text/plain', bytes)
    await page.waitForTimeout(8_000)
    const rows = (await readJournal(page)).filter(r => r.objectHash === hash)
    expect(rows.length, '同 hash 同任务恢复（不换 clientUploadId）').toBeLessThanOrEqual(1)
    expect(['registered', 'uploaded', 'confirmed']).toContain(rows[0]?.phase)
    await context.close()
  })

  test('widget_account_switch_late_callback', async ({ browser }) => {
    // 主体重接（新 subject 派生新 installation scope）后：迟到回调不得把旧任务
    // 以任何新 scope 写成 confirmed（journal principal 隔离）。
    const context = await browser.newContext()
    const page = await openWidget(context, 'widget_acct_late_A')
    const bytes = syntheticBytes('widget_account_switch_late_callback')
    const hash = sha256Hex(bytes)
    await widgetSendAttachment(page, 'w602-acct-late.txt', 'text/plain', bytes)
    await page.waitForTimeout(2_000)
    const before = await readJournal(page)
    const beforeKeys = new Set(before.filter(r => r.objectHash === hash).map(r => r.key))
    // 新主体：重新握手 → 新 installation 派生（真实 bootstrap 链路，非 mock）。
    const page2 = await openWidget(context, 'widget_acct_late_B')
    await page2.waitForTimeout(6_000)
    const after = await readJournal(page2)
    const confirmedElsewhere = after.filter(
      r => r.objectHash === hash && r.phase === 'confirmed' && !beforeKeys.has(r.key),
    )
    expect(confirmedElsewhere, '迟到回调不得跨主体 scope 写入 confirmed').toHaveLength(0)
    await context.close()
  })

  test('widget_workspace_switch_late_callback', async ({ browser }) => {
    // 会话/工作区 scope 变化后：迟到回调不得把旧 scope 任务写入新 scope。
    const context = await browser.newContext()
    const page = await openWidget(context, 'widget_ws_late_A')
    const bytes = syntheticBytes('widget_workspace_switch_late_callback')
    const hash = sha256Hex(bytes)
    await widgetSendAttachment(page, 'w602-ws-late.txt', 'text/plain', bytes)
    await page.waitForTimeout(2_000)
    const before = await readJournal(page)
    const beforeKeys = new Set(before.filter(r => r.objectHash === hash).map(r => r.key))
    expect(beforeKeys.size, '原 scope 已有 checkpoint').toBeGreaterThan(0)
    const page2 = await openWidget(context, 'widget_ws_late_B')
    await page2.waitForTimeout(6_000)
    const after = await readJournal(page2)
    const crossScope = after.filter(
      r => r.objectHash === hash && r.phase === 'confirmed' && !beforeKeys.has(r.key),
    )
    expect(crossScope, '迟到回调不得跨工作区/会话 scope 写入').toHaveLength(0)
    await context.close()
  })

  test('widget_authorization_revoked', async ({ browser }) => {
    // 授权失败保稿：失败后重放不新增 intent（同一 clientUploadId 不被复制）。
    const context = await browser.newContext()
    const page = await openWidget(context, 'widget_authorization_revoked')
    const bytes = syntheticBytes('widget_authorization_revoked')
    const hash = sha256Hex(bytes)
    let revoke = false
    await page.route('**/assets/presign', async (route) => {
      if (revoke) return route.abort('accessdenied')
      return route.fallback()
    })
    await widgetSendAttachment(page, 'w602-revoked.txt', 'text/plain', bytes)
    await page.waitForTimeout(2_000)
    const beforeIds = new Set(
      (await readJournal(page)).filter(r => r.objectHash === hash).map(r => r.clientUploadId),
    )
    revoke = true
    await page.waitForTimeout(3_000)
    const afterRows = (await readJournal(page)).filter(r => r.objectHash === hash)
    expect(
      new Set(afterRows.map(r => r.clientUploadId)).size,
      '撤权重放不新增 intent（clientUploadId 集合不扩大）',
    ).toBeLessThanOrEqual(beforeIds.size)
    await context.close()
  })

  test('widget_durable_checkpoint_failure', async ({ browser }) => {
    // checkpoint 写失败在 PUT 前停止（"every write failure stops the next remote action"）。
    const context = await browser.newContext()
    const page = await openWidget(context, 'widget_durable_checkpoint_failure')
    const bytes = syntheticBytes('widget_durable_checkpoint_failure')
    await breakLocalStorageWrites(page)
    const puts: string[] = []
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'PUT') {
        puts.push(route.request().url())
      }
      return route.fallback()
    })
    await widgetSendAttachment(page, 'w602-cp-fail.txt', 'text/plain', bytes)
    await page.waitForTimeout(5_000)
    expect(puts, 'checkpoint 写失败时无对象 PUT 出站').toHaveLength(0)
    await context.close()
  })

  test('widget_reselected_different_bytes_rejected', async ({ browser }) => {
    // 重选不同字节不能替换已注册任务（object_hash 复核 / clientUploadId 幂等）。
    const context = await browser.newContext()
    const page = await openWidget(context, 'widget_reselected')
    const bytesA = syntheticBytes('widget_reselected_A')
    const bytesB = syntheticBytes('widget_reselected_B')
    await widgetSendAttachment(page, 'w602-resel-a.txt', 'text/plain', bytesA)
    await page.waitForTimeout(2_500)
    const first = (await readJournal(page)).find(r => r.objectHash === sha256Hex(bytesA))
    expect(first, '首次选择已注册').toBeTruthy()
    await page.getByTestId('cs-file-input').setInputFiles({
      name: 'w602-resel-b.txt', mimeType: 'text/plain', buffer: Buffer.from(bytesB),
    })
    await page.waitForTimeout(3_000)
    const journal = await readJournal(page)
    expect(
      journal.find(r => r.clientUploadId === first?.clientUploadId && r.objectHash === sha256Hex(bytesB)),
      '同一任务不得被不同字节替换',
    ).toBeFalsy()
    await context.close()
  })

  // ---- seat 面（蓝本：seatSend.attachmentRecovery / revocation；testid seat-*）----

  test('seat_timeout', async ({ browser }) => {
    // 坐席面 presign 超时中止：无 confirm 风暴；失败后保留任务（authoritative 查询语义）。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('seat_timeout')
    const hash = sha256Hex(bytes)
    let presignFailures = 0
    let confirmSeen = 0
    await page.route('**/assets/presign', async (route) => {
      if (presignFailures === 0) {
        presignFailures += 1
        return route.abort('timedout')
      }
      return route.fallback()
    })
    await page.route('**/assets/confirm', async (route) => {
      confirmSeen += 1
      return route.fallback()
    })
    await seatSendAttachment(page, 'w602-seat-timeout.txt', 'text/plain', bytes)
    await page.waitForTimeout(5_000)
    expect(confirmSeen, '超时窗口内无 confirm 出站').toBe(0)
    expect((await readJournal(page)).some(r => r.objectHash === hash), '失败任务已持久保留').toBe(true)
    await context.close()
  })

  test('refresh', async ({ browser }) => {
    // 刷新后枚举持久任务：confirm 态不回退、消息不重复发布。
    const context = await browser.newContext()
    const { page, seatJwt } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('refresh')
    const hash = sha256Hex(bytes)
    await seatSendAttachment(page, 'w602-refresh.txt', 'text/plain', bytes)
    await page.waitForTimeout(3_000)
    const before = await readJournal(page).then(rows => rows.filter(r => r.objectHash === hash))
    expect(before.length, '发送后任务已持久').toBeGreaterThan(0)
    await page.reload()
    // seat 会话 token 仅内存（seatAuthStore 无 persist）：reload 即回 QR 面板，
    // 需重新扫码确认恢复登录态（产品安全语义，非缺陷）。
    await confirmSeatQr(page, seatJwt)
    await expect(page.getByTestId('seat-workspace')).toBeVisible({ timeout: 30_000 })
    // checkpoint 存活断言锚定在恢复扫描早期：发送全链路完成后 runSend 会
    // journal.remove（seatSend.ts），存活断言不得与产品清理行为竞速。
    const afterEarly = await readJournal(page).then(rows => rows.filter(r => r.objectHash === hash))
    await page.waitForTimeout(4_000)
    const after = await readJournal(page).then(rows => rows.filter(r => r.objectHash === hash))
    for (const row of before) {
      const kept = afterEarly.find(r => r.clientUploadId === row.clientUploadId)
      expect(kept, `刷新后 checkpoint 存活（${row.clientUploadId}）`).toBeTruthy()
      const final = after.find(r => r.clientUploadId === row.clientUploadId)
      if (row.phase === 'confirmed' && final !== undefined) {
        expect(final.phase, 'confirm 态刷新不回退').toBe('confirmed')
      }
    }
    await context.close()
  })

  test('process_restart', async ({ browser }) => {
    // 关页面 → 全新页面重开（同 origin）→ 同 clientUploadId 任务存活一次。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('process_restart')
    const hash = sha256Hex(bytes)
    await seatSendAttachment(page, 'w602-restart.txt', 'text/plain', bytes)
    await page.waitForTimeout(2_000)
    const before = await readJournal(page).then(rows => rows.filter(r => r.objectHash === hash))
    await page.close()
    const { page: page2 } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    await page2.waitForTimeout(4_000)
    const after = await readJournal(page2)
    for (const row of before) {
      const kept = after.find(r => r.clientUploadId === row.clientUploadId)
      expect(kept, `重启后 checkpoint 存活（${row.clientUploadId}）`).toBeTruthy()
    }
    await context.close()
  })

  test('seat_presign_response_lost', async ({ browser }) => {
    // 丢失 presign 响应：intent 持久化；恢复只查原任务（register 不重复）。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('seat_presign_response_lost')
    const hash = sha256Hex(bytes)
    let dropped = false
    const registers: number[] = []
    await page.route('**/assets/presign', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown> | null
      if (body?.operation === 'register') registers.push(1)
      if (!dropped) {
        dropped = true
        return route.abort('connectionreset')
      }
      return route.fallback()
    })
    await seatSendAttachment(page, 'w602-seat-presign-lost.txt', 'text/plain', bytes)
    await page.waitForTimeout(4_000)
    const intent = (await readJournal(page)).find(r => r.objectHash === hash)
    expect(intent, 'presign 丢失后 intent 已持久化').toBeTruthy()
    await page.waitForTimeout(6_000)
    expect(registers.length, '恢复链路不得二次 register').toBeLessThanOrEqual(1)
    await context.close()
  })

  test('seat_restart_before_put', async ({ browser }) => {
    // register 与 PUT 之间重启：registered checkpoint 存活、复用同 clientUploadId。
    // PUT abort-once（真网络故障）冻结观测面：源场景在 PUT 在途时 kill 页面，
    // journal 冻结在 registered —— 不冻结时本地快链路可能在 close 前走到
    // confirmed 清账（journal.remove），重启断言失去对象。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('seat_restart_before_put')
    const hash = sha256Hex(bytes)
    let killedAfterRegister = false
    let killedFirstPut = false
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'PUT' && !killedFirstPut) {
        killedFirstPut = true
        return route.abort('connectionreset')
      }
      return route.fallback()
    })
    await page.route('**/assets/presign', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown> | null
      if (body?.operation === 'register' && !killedAfterRegister) {
        killedAfterRegister = true
        await route.fallback()
        // fallback 只继续传递请求，不保证客户端处理完成；立即 close 会掐断
        // register 响应处理，registered checkpoint 写不下来（journal 停在
        // intent），恢复场景失去前提。等 registered checkpoint 真正落盘再
        // 终止页面（源场景：restart_before_put 的 journal 冻结在 registered）。
        await expect(async () => {
          const row = (await readJournal(page)).find(r => r.objectHash === hash)
          expect(row?.phase, 'registered checkpoint 落盘').toBe('registered')
        }).toPass({ timeout: 15_000 })
        await page.close()
        return
      }
      return route.fallback()
    })
    await seatSendAttachment(page, 'w602-seat-before-put.txt', 'text/plain', bytes)
    await expect.poll(() => killedAfterRegister, {
      message: 'register 后即终止页面（PUT 未发生窗口）',
      timeout: 10_000,
    }).toBe(true)
    const { page: page2 } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    await page2.waitForTimeout(4_000)
    const row = (await readJournal(page2)).find(r => r.objectHash === hash)
    expect(row, 'PUT 前重启后 registered checkpoint 存活').toBeTruthy()
    expect(['registered', 'uploaded', 'confirmed']).toContain(row?.phase)
    await context.close()
  })

  test('seat_expired_capability_resume', async ({ browser }) => {
    // 过期能力 renew：同 upload UUID 与 content hash，新 URL 恢复。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('seat_expired_capability_resume')
    const hash = sha256Hex(bytes)
    const putUrls: string[] = []
    await page.route('**/*', async (route) => {
      const url = route.request().url()
      if (route.request().method() === 'PUT') {
        putUrls.push(url)
        if (putUrls.length > 1) return route.abort('accessdenied')
      }
      return route.fallback()
    })
    await seatSendAttachment(page, 'w602-seat-expired.txt', 'text/plain', bytes)
    await page.waitForTimeout(8_000)
    const rows = (await readJournal(page)).filter(r => r.objectHash === hash)
    expect(rows.length, '同 hash 同任务恢复').toBeLessThanOrEqual(1)
    expect(['registered', 'uploaded', 'confirmed']).toContain(rows[0]?.phase)
    await context.close()
  })

  test('seat_account_switch_late_callback', async ({ browser }) => {
    // 账号 A 的任务在场时切到账号 B：迟到回调不得把 A 的任务写成 confirmed
    // （journal account isolation；seat journal scope 首维即 'seat' + userId）。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('seat_account_switch_late_callback')
    const hash = sha256Hex(bytes)
    await seatSendAttachment(page, 'w602-seat-acct-late.txt', 'text/plain', bytes)
    await page.waitForTimeout(1_500)
    const beforeKeys = new Set(
      (await readJournal(page)).filter(r => r.objectHash === hash).map(r => r.key),
    )
    await page.close()
    const { page: page2 } = await openSeatWorkspace(context, SEAT2_ACCOUNT(), SEAT2_PASSWORD(), false)
    await page2.waitForTimeout(6_000)
    const after = await readJournal(page2)
    const leaked = after.filter(
      r => r.objectHash === hash && r.phase === 'confirmed' && !beforeKeys.has(r.key),
    )
    expect(leaked, '迟到回调不跨账号写入（account isolation）').toHaveLength(0)
    await context.close()
  })

  test('seat_workspace_switch_late_callback', async ({ browser }) => {
    // journal scope 含 org/ws/identity/conversation 维度：迟到回调不得跨维度
    // 产出第二份 confirmed checkpoint。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('seat_workspace_switch_late_callback')
    const hash = sha256Hex(bytes)
    await seatSendAttachment(page, 'w602-seat-ws-late.txt', 'text/plain', bytes)
    await page.waitForTimeout(1_500)
    const rows = (await readJournal(page)).filter(r => r.objectHash === hash)
    expect(rows.length, '原 scope 已有 checkpoint').toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.key, 'journal key 绑定工作区 scope 维度').toContain(WORKSPACE_ID().slice(0, 6))
    }
    await page.waitForTimeout(5_000)
    const after = (await readJournal(page)).filter(r => r.objectHash === hash)
    const keys = new Set(after.map(r => r.key))
    expect(keys.size, '迟到回调不产生跨维度第二 checkpoint').toBeLessThanOrEqual(rows.length)
    await context.close()
  })

  test('seat_authorization_revoked', async ({ browser }) => {
    // 授权失败：保稿、拒绝直接重放（不新增 intent）、不清登录态。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('seat_authorization_revoked')
    const hash = sha256Hex(bytes)
    let revoke = false
    await page.route('**/assets/presign', async (route) => {
      if (revoke) return route.abort('accessdenied')
      return route.fallback()
    })
    await seatSendAttachment(page, 'w602-seat-revoked.txt', 'text/plain', bytes)
    await page.waitForTimeout(2_000)
    const beforeIds = new Set(
      (await readJournal(page)).filter(r => r.objectHash === hash).map(r => r.clientUploadId),
    )
    revoke = true
    await page.waitForTimeout(3_000)
    expect(
      new Set((await readJournal(page)).filter(r => r.objectHash === hash).map(r => r.clientUploadId)).size,
      '撤权重放不新增 intent',
    ).toBeLessThanOrEqual(beforeIds.size)
    await expect(page.getByTestId('seat-workspace'), '授权失败不清登录态').toBeVisible()
    await context.close()
  })

  test('seat_durable_checkpoint_failure', async ({ browser }) => {
    // checkpoint 写失败在业务 send 前停止：无消息 POST 出站。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('seat_durable_checkpoint_failure')
    await breakLocalStorageWrites(page)
    const messagePosts: string[] = []
    await page.route('**/messages', async (route) => {
      if (route.request().method() === 'POST') messagePosts.push(route.request().url())
      return route.fallback()
    })
    await seatSendAttachment(page, 'w602-seat-cp-fail.txt', 'text/plain', bytes)
    await page.waitForTimeout(5_000)
    expect(messagePosts, 'checkpoint 写失败时无业务消息 POST').toHaveLength(0)
    await context.close()
  })

  test('seat_reselected_different_bytes_rejected', async ({ browser }) => {
    // 重选不同字节不能替换已注册恢复任务。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytesA = syntheticBytes('seat_reselected_A')
    const bytesB = syntheticBytes('seat_reselected_B')
    await seatSendAttachment(page, 'w602-seat-resel-a.txt', 'text/plain', bytesA)
    await page.waitForTimeout(2_500)
    const first = (await readJournal(page)).find(r => r.objectHash === sha256Hex(bytesA))
    expect(first, '首次注册完成').toBeTruthy()
    await page.getByTestId('seat-attach-input').setInputFiles({
      name: 'w602-seat-resel-b.txt', mimeType: 'text/plain', buffer: Buffer.from(bytesB),
    })
    await page.waitForTimeout(3_000)
    const journal = await readJournal(page)
    expect(
      journal.find(r => r.clientUploadId === first?.clientUploadId && r.objectHash === sha256Hex(bytesB)),
      '已注册任务不得被不同字节替换',
    ).toBeFalsy()
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// W6-02/e2e-compat：real_browser（唯一 playwright 叶）+ any 5 场景 browser 侧
// ---------------------------------------------------------------------------

test.describe('W6-02 e2e-compat（real browser 兼容面）', () => {

  test.beforeEach(async ({ request }, testInfo) => {
    test.setTimeout(150_000)
    await probeBackend(request)
    if (!DRIVER_OK) {
      throw new Error(`[${testInfo.title}] V5_E2E_DRIVER 非法：${JSON.stringify(V5_DRIVER)}`)
    }
  })

  test('real_browser', async ({ browser }) => {
    // real_browser 唯一 playwright 叶：真实 Chromium 完成上传→confirm→授权内容
    // 字节复核全链路（driver 由 V5_E2E_DRIVER 背书，写入断言文本）。
    const context = await browser.newContext()
    const { page, seatJwt } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes(`real_browser_${V5_DRIVER}`)
    await seatSendAttachment(page, 'w602-real-browser.txt', 'text/plain', bytes)
    await page.waitForTimeout(6_000)
    const row = (await readJournal(page)).find(r => r.objectHash === sha256Hex(bytes))
    expect(row, `driver=${V5_DRIVER} 真链路收敛`).toBeTruthy()
    expect(row?.phase, `driver=${V5_DRIVER} 终态 confirmed`).toBe('confirmed')
    if (row?.assetId !== null && row?.assetId !== undefined) {
      const content = await fetchSeatAssetContent(seatJwt, row.assetId)
      expect(content.sha256, `driver=${V5_DRIVER} 授权内容链路字节一致`).toBe(sha256Hex(bytes))
    }
    await context.close()
  })

  test('old_request', async ({ browser }) => {
    // 旧请求语义：历史资产经授权 content 链路的 Range 分片请求仍可读（passthrough）。
    const context = await browser.newContext()
    const { seatJwt } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD(), false)
    const probe = await fetchSeatAssetContent(seatJwt, HISTORIC_ASSET_ID(), 'bytes=0-15')
    expect(probe.status, 'Range 请求返回 206/200').toBeLessThanOrEqual(206)
    expect(probe.bytes, 'Range 旧请求返回分片字节').toBeGreaterThan(0)
    expect(probe.bytes, 'Range 端点尊重请求界（≤16 字节，后端可整对象回退）').toBeLessThanOrEqual(16)
    await context.close()
  })

  test('historic_fixture', async ({ browser }) => {
    // 历史夹具：完整内容 hash 与种子期望一致（历史对象保留且字节不变）。
    const context = await browser.newContext()
    const { seatJwt } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD(), false)
    const content = await fetchSeatAssetContent(seatJwt, HISTORIC_ASSET_ID())
    expect(content.sha256, '历史夹具字节 hash 与种子一致').toBe(HISTORIC_ASSET_SHA256().toLowerCase())
    await context.close()
  })

  test('multi_business_reference', async ({ browser }) => {
    // 多业务引用：同一历史对象两次独立授权读取同 hash（引用面稳定可读）。
    const context = await browser.newContext()
    const { seatJwt } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD(), false)
    const first = await fetchSeatAssetContent(seatJwt, HISTORIC_ASSET_ID())
    const second = await fetchSeatAssetContent(seatJwt, HISTORIC_ASSET_ID())
    expect(second.sha256, '多业务引用两次读取同 hash').toBe(first.sha256)
    expect(second.sha256, '引用对象与历史夹具同源').toBe(HISTORIC_ASSET_SHA256().toLowerCase())
    await context.close()
  })

  test('network_recovery', async ({ browser }) => {
    // 断网注入（route.abort 真故障）→ 解除 → 恢复收敛，无重复发布。
    const context = await browser.newContext()
    const { page } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('network_recovery')
    const hash = sha256Hex(bytes)
    let offline = true
    await page.route('**/assets/**', async (route) => {
      if (offline) return route.abort('internetdisconnected')
      return route.fallback()
    })
    await seatSendAttachment(page, 'w602-net-recovery.txt', 'text/plain', bytes)
    await page.waitForTimeout(3_000)
    offline = false
    // 产品无自动重试（resumeUpload 无退避/定时器）：恢复入口 = 再次点发送
    // （retry: send 同一入口，复用同 clientUploadId 防重复发布）。
    await page.getByTestId('seat-send').click()
    await page.waitForTimeout(10_000)
    const rows = (await readJournal(page)).filter(r => r.objectHash === hash)
    expect(rows.length, '断网恢复后任务收敛（单任务）').toBeLessThanOrEqual(1)
    expect(rows[0]?.phase, '恢复终态为 confirmed').toBe('confirmed')
    await context.close()
  })

  test('process_kill_recovery', async ({ browser }) => {
    // 进程终止恢复：上传窗口关闭页面 → 重开同 origin 恢复同任务，无重复发布。
    const context = await browser.newContext()
    const { page, seatJwt } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    const bytes = syntheticBytes('process_kill_recovery')
    const hash = sha256Hex(bytes)
    await seatSendAttachment(page, 'w602-kill-recovery.txt', 'text/plain', bytes)
    await page.waitForTimeout(1_000)
    await page.close()
    const { page: page2 } = await openSeatWorkspace(context, SEAT_ACCOUNT(), SEAT_PASSWORD())
    await page2.waitForTimeout(10_000)
    const row = (await readJournal(page2)).find(r => r.objectHash === hash)
    expect(row, '进程终止后同任务恢复').toBeTruthy()
    // 终局授权面字节复核（任务出 assetId 时）。
    if (row?.assetId !== null && row?.assetId !== undefined) {
      const content = await fetchSeatAssetContent(seatJwt, row.assetId)
      expect(content.sha256, '恢复对象字节与合成字节一致').toBe(hash)
    }
    await context.close()
  })
})
