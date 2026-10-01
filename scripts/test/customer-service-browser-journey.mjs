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
  assert.equal(response.status, 200, `${url}: ${JSON.stringify(result)}`)
  assert.equal(result.code, 0)
  return result.payload
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
  const control = (action) => `/api/v1/cs/organizations/${org}/sessions/${session.id}/${action}`
  await api(fixture.seat_a, control('claim'), { workspace_id: ws, expected_version: session.version })
  const messagePath = `/api/v1/enterprise/organizations/${org}/conversations/${session.conversation_id}/messages`
  const reply = (seat, text, key) => api(seat, messagePath, {
    workspace_id: ws, sender_type: 'business_identity', identity_id: seat.identity_id,
    body: text, client_msg_id: key,
  })
  await reply(fixture.seat_a, 'synthetic browser first seat reply', 'browser-seat-a-reply')
  const messages = frame.getByTestId('cs-message-list')
  await expect(messages).toContainText('synthetic browser visitor question')
  await expect(messages).toContainText('synthetic browser first seat reply', { timeout: 25000 })
  await api(fixture.seat_a, control('transfer'), {
    workspace_id: ws, expected_version: 2, to_identity_id: fixture.seat_b.identity_id,
  })
  await reply(fixture.seat_b, 'synthetic browser second seat reply', 'browser-seat-b-reply')
  await expect(messages).toContainText('synthetic browser second seat reply', { timeout: 25000 })
  await page.screenshot({ path: path.join(dir, 'visitor-chat.png') })
  await api(fixture.seat_b, control('close'), { workspace_id: ws, expected_version: 3 })
  await expect(frame.getByTestId('cs-rate-5')).toBeVisible({ timeout: 25000 })
  const rated = page.waitForResponse((response) => response.url().includes('/rating') && response.request().method() === 'POST')
  await frame.getByTestId('cs-rate-5').click()
  assert.equal((await rated).status(), 200)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: path.join(dir, 'visitor-rated.png') })
  await writeFile(path.join(dir, 'browser-result.json'), JSON.stringify({ status: 'PASS', oracle: 'built Widget + real HTTP + isolated PG; seat controls use API', responses }, null, 2))
  console.log('PASS: real visitor text, claim, two seat replies, transfer, close and rating')
} finally {
  await writeFile(path.join(dir, 'browser-responses.json'), JSON.stringify(responses, null, 2))
  if (browser) await browser.close()
  await new Promise((resolve) => host.close(resolve))
  host.closeAllConnections()
}
