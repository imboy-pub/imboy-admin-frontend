import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * PLAN §7.6 浏览器/iframe 时区合同专项（TZ-E2E）。
 *
 * 证据边界（如实声明）：
 * - 本 spec = 「mock wire + 实际构建产物（dist-widget）验证」：API 响应由
 *   page.route 按冻结合同形状桩出，但 iframe 内运行的是本候选真实构建的
 *   widget 应用（loader/app HTML/JS 均读自 dist-widget，非手写 DOM）。
 * - 「真实栈（真实后端/PG/nginx + seat embed 双 context）」由
 *   tests/e2e/customer-service-seat-embed/journey.spec.ts A04 承担
 *   （EXECUTE-GATED），两者不混为同一证据。
 *
 * 覆盖（对照 7.6 逐条，差距分析见 AD_W3_report.md）：
 * - TZ-01：上海 context 与洛杉矶 context **同时读取同一合成消息**（wire =
 *   接口实际数字秒形状），断言各自 iframe DOM 的 time 文本与 datetime 瞬间真值；
 * - TZ-02：同一消息列表（跨日瞬间对）在两个 context 的日历日期段按各自
 *   zone 断言（上海 {09/16, 09/17} vs 洛杉矶 {09/15, 09/16}）——widget 产品
 *   无「今天/昨天」分组标签，日期分组证据 = full 格式的日期段；seat iframe
 *   的日期分组标签（seat-message-date）由真实栈 A04 扩展断言承担（待办）；
 * - TZ-03：纽约 2026-11-01 DST 重复小时——同一列表里两个不同瞬间
 *   （05:30Z=NY 01:30 EDT / 06:30Z=NY 01:30 EST）在 NY context 显示**相同的
 *   墙上时间**（重复小时的不可区分性），在上海 context 可区分且各正确。
 *
 * expected 全部为**显式写死的目标 zone 期望串**（独立用 node Intl 预计算），
 * 绝不在断言里复用被测 formatter 自算自比。
 */

// tests/e2e/timezone-contract.spec.ts → 仓库根在两级之上
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIST_WIDGET = path.join(REPO_ROOT, 'dist-widget')
const LOADER_JS = path.join(DIST_WIDGET, 'loader.js')
const APP_HTML = path.join(DIST_WIDGET, 'widget', 'index.html')
const APP_JS = path.join(DIST_WIDGET, 'assets', 'cs-widget.js')

function requireArtifacts(): { loaderJs: string; appHtml: string; appJs: string } {
  // 与 widget-cs.spec.ts 同款：S6 不可变发布合同下 assets/ 是内容 hash 文件名，
  // 经 manifest.json 解析实际文件。
  let appJsPath = APP_JS
  const manifestPath = path.join(DIST_WIDGET, 'manifest.json')
  if (!existsSync(appJsPath) && existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        files?: Array<{ path?: string }>
      }
      appJsPath = path.join(
        DIST_WIDGET,
        manifest.files?.find((f) => f.path?.startsWith('assets/cs-widget-') && f.path.endsWith('.js'))?.path ?? ''
      )
    } catch {
      // manifest 损坏时回落原路径，由下方 skip 兜底
    }
  }
  const ready = existsSync(LOADER_JS) && existsSync(APP_HTML) && existsSync(appJsPath)
  test.skip(!ready, '缺少 dist-widget 产物：请先运行 bun run build:widget（mock+构建产物证据缺失，不计通过）')
  return {
    loaderJs: existsSync(LOADER_JS) ? readFileSync(LOADER_JS, 'utf8') : '',
    appHtml: existsSync(APP_HTML) ? readFileSync(APP_HTML, 'utf8') : '',
    appJs: existsSync(appJsPath) ? readFileSync(appJsPath, 'utf8') : '',
  }
}

const PUBLIC_WIDGET_ID = '72057594037928003'
const SESSION_ID = '72057594037927936'
const INSTALLATION_ID = '72057594037928001'
const CONTACT_ID = '72057594037928002'

/**
 * 合成瞬间（wire = 接口实际数字秒形状；widget contract created_at 合同 = Unix 秒）：
 * - T1 = 1789600000           = 2026-09-16T23:06:40Z（与 apiInstant.test.ts T1 锚点同瞬间）
 * - T0 = 1789538400           = 2026-09-16T06:00:00Z
 * - DST_EDT = 1793511000      = 2026-11-01T05:30:00Z（NY 01:30 EDT，UTC-4）
 * - DST_EST = 1793514600      = 2026-11-01T06:30:00Z（NY 01:30 EST，UTC-5）
 * - DST_LATE = 1793550600     = 2026-11-01T16:30:00Z（NY 11:30 EST / 上海 11/02 00:30 → 日期不同）
 * 期望串（node Intl 独立预计算，zh-CN full 格式 YYYY/MM/DD HH:mm）：
 * - T1：上海 2026/09/17 07:06；洛杉矶 2026/09/16 16:06（PDT UTC-7）
 * - T0：上海 2026/09/16 14:00；洛杉矶 2026/09/15 23:00
 * - DST_EDT：纽约 2026/11/01 01:30；上海 2026/11/01 13:30
 * - DST_EST：纽约 2026/11/01 01:30（同一墙上时间 = 重复小时）；上海 2026/11/01 14:30
 * - DST_LATE：纽约 2026/11/01 11:30；上海 2026/11/02 00:30
 */
const T1_SEC = 1789600000
const T0_SEC = 1789538400
const DST_EDT_SEC = 1793511000
const DST_EST_SEC = 1793514600
const DST_LATE_SEC = 1793550600
const T1_ISO = '2026-09-16T23:06:40.000Z'

const BOOTSTRAP_PAYLOAD = {
  installation_id: INSTALLATION_ID,
  public_widget_id: PUBLIC_WIDGET_ID,
  display_name: 'E2E 时区商城客服',
  consent_version: 'v1',
  branding: { display_name: 'E2E 时区商城客服', primary_color: '#2563eb', welcome_text: '您好' },
  contact_id: CONTACT_ID,
  secret: 'e2e-visit-token-stub',
  reused: false,
}

const SESSION_PAYLOAD = {
  session_id: SESSION_ID,
  conversation_id: '72057594037927937',
  contact_id: CONTACT_ID,
  workspace_id: '72057594037927938',
  installation_id: INSTALLATION_ID,
  status: 'queued',
}

function envelope(payload: unknown): string {
  return JSON.stringify({ code: 0, msg: 'success', payload })
}

/** 合成历史行：wire 合同 = Unix 秒整数（cs widget message_fields 投影）。 */
function syntheticRow(id: string, createdAtSec: number, marker: string): Record<string, unknown> {
  return {
    id,
    sender_type: 'contact',
    sender_contact_id: CONTACT_ID,
    client_msg_id: null,
    body: `tz-synthetic ${marker} ${createdAtSec}`,
    version: 1,
    created_at: createdAtSec,
  }
}

function hostFixtureHtml(): string {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8"><title>E2E 时区宿主页</title></head>',
    '<body>',
    '  <h1>时区合同宿主页（合成数据）</h1>',
    `  <script async src="/loader.js" data-widget-id="${PUBLIC_WIDGET_ID}"></script>`,
    '</body>',
    '</html>',
  ].join('\n')
}

/** SSE：message 帧（只携带游标）→ 触发权威历史拉取（refreshHistory → GET messages）。 */
function sseBodyWithMessageHint(): string {
  return [
    'retry: 5000',
    'event: state',
    `data: {"resource":"cs.session","session_id":"${SESSION_ID}","status":"active"}`,
    '',
    'id: 901',
    'event: message',
    `data: {"id":"900000000000000901","conversation_id":"72057594037927937","created_at":${T1_SEC}}`,
    '',
    '',
  ].join('\n')
}

type WireRow = { id: string; createdAtSec: number; marker: string }

/** 按冻结合同形状桩出宿主页/静态产物/Widget API；messages GET 返回合成行。 */
async function stubTimezoneRoutes(
  page: Page,
  artifacts: { loaderJs: string; appHtml: string; appJs: string },
  rows: WireRow[]
): Promise<void> {
  await page.route('**/cs-tz-fixture.html', (route) => {
    void route.fulfill({ contentType: 'text/html; charset=utf-8', body: hostFixtureHtml() })
  })
  await page.route('**/loader.js', (route) =>
    route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: artifacts.loaderJs })
  )
  await page.route(`**/w/${PUBLIC_WIDGET_ID}`, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: artifacts.appHtml })
  )
  await page.route('**/assets/cs-widget*.js', (route) =>
    route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: artifacts.appJs })
  )
  await page.route('**/api/v1/cs/widget/bootstrap', (route) => {
    void route.fulfill({ contentType: 'application/json', body: envelope(BOOTSTRAP_PAYLOAD) })
  })
  await page.route('**/api/v1/cs/widget/sessions*', (route) => {
    if (route.request().method() === 'POST') {
      void route.fulfill({ contentType: 'application/json', body: envelope(SESSION_PAYLOAD) })
      return
    }
    void route.fulfill({
      contentType: 'application/json',
      body: envelope([{ id: SESSION_ID, status: 'active', version: 2 }]),
    })
  })
  await page.route('**/api/v1/cs/widget/sessions/*/messages*', (route) => {
    if (route.request().method() === 'POST') {
      void route.fulfill({
        contentType: 'application/json',
        body: envelope(syntheticRow(rows[0]!.id, rows[0]!.createdAtSec, rows[0]!.marker)),
      })
      return
    }
    void route.fulfill({
      contentType: 'application/json',
      body: envelope(rows.map((row) => syntheticRow(row.id, row.createdAtSec, row.marker))),
    })
  })
  await page.route('**/api/v1/cs/widget/sessions/*/events*', (route) => {
    void route.fulfill({ contentType: 'text/event-stream', body: sseBodyWithMessageHint() })
  })
}

/** 打开 widget（真实点击链路：launcher → consent → 会话建立 → SSE 触发历史拉取）。 */
async function openWidgetUntilMessages(page: Page, expectedCount: number): Promise<void> {
  await page.goto('/cs-tz-fixture.html')
  await page.locator('[data-testid="cs-widget-launcher"]').click()
  const frame = page.locator('[data-testid="cs-widget-iframe"]').contentFrame()
  await frame.getByTestId('cs-consent-accept').click({ timeout: 15_000 })
  await expect(frame.getByTestId('cs-message-list')).toBeVisible({ timeout: 20_000 })
  await expect(frame.locator('.cs-msg-meta time')).toHaveCount(expectedCount, { timeout: 20_000 })
}

/** 读取 iframe 内全部 time 元素的 {datetime, text}（DOM 事实，不复用被测 formatter）。 */
async function readRenderedTimes(page: Page): Promise<Array<{ datetime: string; text: string }>> {
  const frame = page.locator('[data-testid="cs-widget-iframe"]').contentFrame()
  return frame.locator('.cs-msg-meta time').evaluateAll((nodes) =>
    nodes.map((node) => ({
      datetime: (node as HTMLElement).getAttribute('datetime') ?? '',
      text: (node.textContent ?? '').trim(),
    }))
  )
}

/** 消息列表按 id 升序渲染；返回按 DOM 顺序的 time 列表。 */
async function openContextAndRead(
  browser: Browser,
  timezoneId: string,
  artifacts: { loaderJs: string; appHtml: string; appJs: string },
  rows: WireRow[]
): Promise<Array<{ datetime: string; text: string }>> {
  const context = await browser.newContext({ timezoneId })
  try {
    const page = await context.newPage()
    await stubTimezoneRoutes(page, artifacts, rows)
    await openWidgetUntilMessages(page, rows.length)
    return await readRenderedTimes(page)
  } finally {
    await context.close()
  }
}

test.describe('TZ 时区合同（mock wire + 实际 dist-widget 构建产物）', () => {
  test('TZ-01：上海与洛杉矶 context 同时读取同一合成消息，各自 zone 期望串 + 同一瞬间真值', async ({ browser }) => {
    const artifacts = requireArtifacts()
    const rows = [{ id: '900000000000000101', createdAtSec: T1_SEC, marker: 'T1' }]
    // 两个 context 并行打开同一 mock 消息页（同一合成事件、两个 reader）。
    const [shanghai, losAngeles] = await Promise.all([
      openContextAndRead(browser, 'Asia/Shanghai', artifacts, rows),
      openContextAndRead(browser, 'America/Los_Angeles', artifacts, rows),
    ])

    // wire → DOM：expected 显式写目标 zone 格式（独立预计算，非被测 formatter 自算）。
    expect(shanghai, '上海 context 渲染结果').toEqual([{ datetime: T1_ISO, text: '2026/09/17 07:06' }])
    expect(losAngeles, '洛杉矶 context 渲染结果').toEqual([{ datetime: T1_ISO, text: '2026/09/16 16:06' }])
    // 同一瞬间的 datetime 属性（真值）不随查看者 zone 漂移。
    expect(shanghai[0]!.datetime).toBe(losAngeles[0]!.datetime)
  })

  test('TZ-02：同一跨日消息列表的日历日期段按各自 zone 分组（上海 {09/16,09/17} vs 洛杉矶 {09/15,09/16}）', async ({ browser }) => {
    const artifacts = requireArtifacts()
    // T0 早于 T1：上海 = 09/16 14:00 与 09/17 07:06（跨日）；洛杉矶 = 09/15 23:00 与 09/16 16:06（各自跨日且整体偏一天）。
    const rows = [
      { id: '900000000000000201', createdAtSec: T0_SEC, marker: 'T0' },
      { id: '900000000000000202', createdAtSec: T1_SEC, marker: 'T1' },
    ]
    const [shanghai, losAngeles] = await Promise.all([
      openContextAndRead(browser, 'Asia/Shanghai', artifacts, rows),
      openContextAndRead(browser, 'America/Los_Angeles', artifacts, rows),
    ])

    expect(shanghai).toEqual([
      { datetime: '2026-09-16T06:00:00.000Z', text: '2026/09/16 14:00' },
      { datetime: T1_ISO, text: '2026/09/17 07:06' },
    ])
    expect(losAngeles).toEqual([
      { datetime: '2026-09-16T06:00:00.000Z', text: '2026/09/15 23:00' },
      { datetime: T1_ISO, text: '2026/09/16 16:06' },
    ])
    // 日期分组事实：同一列表在两个 zone 的「日历日集合」不同且各自连续正确
    //（widget 产品无「今天/昨天」分组标签；日期段 = full 格式的日历日部分）。
    const daysOf = (rows_: Array<{ text: string }>) => Array.from(new Set(rows_.map((row) => row.text.slice(0, 10))))
    expect(daysOf(shanghai)).toEqual(['2026/09/16', '2026/09/17'])
    expect(daysOf(losAngeles)).toEqual(['2026/09/15', '2026/09/16'])
  })

  test('TZ-03：纽约 2026-11-01 DST 重复小时——两个瞬间在 NY 显示同一墙上时间，上海可区分且正确', async ({ browser }) => {
    const artifacts = requireArtifacts()
    // 05:30Z（NY 01:30 EDT，UTC-4）与 06:30Z（NY 01:30 EST，UTC-5）：
    // NY 本地墙上时间相同（fall-back 重复小时）；16:30Z 覆盖「同一瞬间
    // NY 与上海日期不同且正确」（NY 11/01 11:30 EST vs 上海 11/02 00:30）。
    const rows = [
      { id: '900000000000000301', createdAtSec: DST_EDT_SEC, marker: 'DST_EDT' },
      { id: '900000000000000302', createdAtSec: DST_EST_SEC, marker: 'DST_EST' },
      { id: '900000000000000303', createdAtSec: DST_LATE_SEC, marker: 'DST_LATE' },
    ]
    const [newYork, shanghai] = await Promise.all([
      openContextAndRead(browser, 'America/New_York', artifacts, rows),
      openContextAndRead(browser, 'Asia/Shanghai', artifacts, rows),
    ])

    // NY：前两个不同瞬间渲染出相同的墙上时间串 = 重复小时的定义性行为；
    // 瞬间真值（datetime）保持可区分。第三行验证 DST 后固定 EST 偏移。
    expect(newYork).toEqual([
      { datetime: '2026-11-01T05:30:00.000Z', text: '2026/11/01 01:30' },
      { datetime: '2026-11-01T06:30:00.000Z', text: '2026/11/01 01:30' },
      { datetime: '2026-11-01T16:30:00.000Z', text: '2026/11/01 11:30' },
    ])
    // 上海：无 DST，两瞬间相差整一小时可区分；16:30Z 行在上海已跨入 11/02
    //（同一瞬间 NY 与上海日期不同且各自正确）。
    expect(shanghai).toEqual([
      { datetime: '2026-11-01T05:30:00.000Z', text: '2026/11/01 13:30' },
      { datetime: '2026-11-01T06:30:00.000Z', text: '2026/11/01 14:30' },
      { datetime: '2026-11-01T16:30:00.000Z', text: '2026/11/02 00:30' },
    ])
    // 日期分组事实：同一列表 NY 全部落在 11/01，上海跨 {11/01, 11/02}。
    const daysOf = (rows_: Array<{ text: string }>) => Array.from(new Set(rows_.map((row) => row.text.slice(0, 10))))
    expect(daysOf(newYork)).toEqual(['2026/11/01'])
    expect(daysOf(shanghai)).toEqual(['2026/11/01', '2026/11/02'])
  })
})
