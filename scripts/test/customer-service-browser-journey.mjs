import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'

const dir = process.env.IMBOY_GATE_RUN_DIR
assert.match(dir ?? '', /^\/tmp\/imboy-seat-http\.[A-Za-z0-9]+$/)
const fixture = JSON.parse(await readFile(path.join(dir, 'browser-fixture.json'), 'utf8'))
process.env.CSWW_E2E_BACKEND_PORT = String(fixture.port)
process.env.CSWW_E2E_WIDGET_ID = fixture.public_widget_id
const { createStaticHost } = await import('../../tests/e2e/customer-service-real/helpers/static-host.mjs')
const host = createStaticHost()
let browser
const responses = []
const org = fixture.organization_id
const ws = fixture.workspace_id
const base = `http://127.0.0.1:${fixture.port}`
async function api(seat, url, body) {
  const response = await fetch(`${base}${url}`, {
    signal: AbortSignal.timeout(10000),
    method: body ? 'POST' : 'GET',
    headers: { ...seat.headers, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json()
  responses.push({ path: url.split('?')[0], status: response.status, code: result.code })
  assert.equal(response.status, 200, `${url}: code=${result.code}`)
  assert.equal(result.code, 0)
  return result.payload
}
async function openSeat(seat) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const qrStatuses = []
  let polls = 0
  page.on('request', (request) => { if (request.url().includes('/qr_login/status')) polls += 1 })
  page.on('response', (response) => {
    if (response.url().includes('/qr_login/subscribe')) qrStatuses.push(response.status())
  })
  await page.goto(`${process.env.CSWW_E2E_HOST_ORIGIN}/seat/${fixture.public_seat_console_id}`)
  const qr = page.getByTestId('seat-qr-code')
  await expect(qr).toHaveAttribute('data-qr-content', /imboy:\/\/qr_login\?qr_token=/, { timeout: 15000 })
  await page.waitForTimeout(1000)
  const content = await qr.getAttribute('data-qr-content')
  const token = new URL(content).searchParams.get('qr_token')
  assert.ok(token)
  await api(seat, '/api/v1/passport/qr_login/scan', { qr_token: token })
  await api(seat, '/api/v1/passport/qr_login/confirm', { qr_token: token })
  const workspace = page.getByTestId('seat-workspace')
  const retry = page.getByTestId('seat-contexts-error-retry')
  await expect(workspace.or(retry).first()).toBeVisible({ timeout: 20000 })
  if (await retry.count()) await retry.click()
  await expect(workspace).toBeVisible({ timeout: 15000 })
  assert.ok(qrStatuses.includes(200), 'QR subscribe must succeed')
  assert.equal(polls, 0, 'QR login must finish through SSE without polling fallback')
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
  assert.doesNotMatch(stored, /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/)
  return page
}
async function openSession(page, id) {
  await page.getByTestId('seat-tab-active').click()
  const item = page.getByTestId(`seat-session-item-${id}`)
  await expect(item).toBeVisible({ timeout: 20000 })
  await item.click()
  await expect(page.getByTestId('seat-message-list')).toBeVisible({ timeout: 10000 })
}
async function reply(page, text) {
  await page.getByTestId('seat-composer').fill(text)
  await page.getByTestId('seat-send').click()
  await expect(page.getByTestId('seat-send-error')).toHaveCount(0)
}
try {
  await new Promise((resolve, reject) => {
    host.once('error', reject)
    host.listen(Number(process.env.CSWW_E2E_HOST_PORT), '127.0.0.1', resolve)
  })
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--no-proxy-server'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(process.env.CSWW_E2E_HOST_ORIGIN)
  await page.getByTestId('cs-widget-launcher').click()
  const frame = page.frameLocator('iframe[data-testid="cs-widget-iframe"]')
  await expect(frame.getByTestId('cs-consent-accept')).toBeVisible({ timeout: 20000 })
  await frame.getByTestId('cs-consent-accept').click()
  await expect(frame.getByTestId('cs-input')).toBeVisible({ timeout: 10000 })
  await frame.getByTestId('cs-input').fill('synthetic browser visitor question')
  await frame.getByTestId('cs-send').click()
  let session
  await expect.poll(async () => {
    const queue = await api(fixture.seat_a, `/api/v1/cs/organizations/${org}/sessions/queue?workspace_id=${ws}`)
    session = queue.sessions.find((row) => row.status === 'queued')
    return Boolean(session)
  }, { timeout: 10000 }).toBe(true)
  const seatA = await openSeat(fixture.seat_a)
  const seatB = await openSeat(fixture.seat_b)
  await expect(seatA.getByTestId(`seat-claim-${session.id}`)).toBeVisible({ timeout: 20000 })
  await seatA.getByTestId(`seat-claim-${session.id}`).click()
  await openSession(seatA, session.id)
  await reply(seatA, 'synthetic browser first seat reply')
  const messages = frame.getByTestId('cs-message-list')
  await expect(messages).toContainText('synthetic browser visitor question')
  await expect(messages).toContainText('synthetic browser first seat reply', { timeout: 25000 })
  await seatA.getByTestId('seat-transfer-target-select').selectOption(fixture.seat_b.identity_id)
  await seatA.getByTestId('seat-transfer-submit').click()
  await openSession(seatB, session.id)
  await reply(seatB, 'synthetic browser second seat reply')
  await expect(messages).toContainText('synthetic browser second seat reply', { timeout: 25000 })
  await page.screenshot({ path: path.join(dir, 'visitor-chat.png') })
  await seatB.screenshot({ path: path.join(dir, 'seat-workbench.png') })
  await seatB.getByTestId('seat-close-submit').click()
  await expect(frame.getByTestId('cs-rate-5')).toBeVisible({ timeout: 25000 })
  const rated = page.waitForResponse((response) => response.url().includes('/rating') && response.request().method() === 'POST')
  await frame.getByTestId('cs-rate-5').click()
  assert.equal((await rated).status(), 200)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: path.join(dir, 'visitor-rated.png') })
  await writeFile(path.join(dir, 'browser-result.json'), JSON.stringify({ status: 'PASS', oracle: 'built Widget + real HTTP + isolated PG; seat controls use actual built workbench pages after real QR confirm with synthetic mobile credentials', responses }, null, 2))
  console.log('PASS: real visitor and two Seat workbench pages: QR, text, claim, replies, transfer, close, rating')
} finally {
  await writeFile(path.join(dir, 'browser-responses.json'), JSON.stringify(responses, null, 2))
  if (browser) await browser.close()
  await new Promise((resolve) => host.close(resolve))
  host.closeAllConnections()
}
