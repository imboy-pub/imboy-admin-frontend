import assert from 'node:assert/strict'
import { readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'

const dir = process.env.IMBOY_GATE_RUN_DIR
assert.match(dir ?? '', /^\/tmp\/imboy-seat-http\.[A-Za-z0-9]+$/)
const fixture = JSON.parse(await readFile(path.join(dir, 'browser-fixture.json'), 'utf8'))
process.env.CSWW_E2E_BACKEND_PORT = String(fixture.port)
process.env.CSWW_E2E_WIDGET_ID = fixture.public_widget_id
const { createStaticHost, createSecureStaticHost } = await import('../../tests/e2e/customer-service-real/helpers/static-host.mjs')
const host = fixture.attachments ? createSecureStaticHost(path.join(dir, 'tls')) : createStaticHost()
let browser
const responses = []
const seatTokens = new WeakMap()
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
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const qrStatuses = []
  let polls = 0
  page.on('request', (request) => {
    if (request.url().includes('/qr_login/status')) polls += 1
    const authorization = request.headers().authorization
    if (authorization?.startsWith('Bearer ')) seatTokens.set(page, authorization)
  })
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
async function controlSeat(action, identity) {
  const command = path.join(dir, 'browser-control.json')
  await writeFile(`${command}.tmp`, JSON.stringify({ action, identity_id: identity }))
  await rename(`${command}.tmp`, command)
  await expect.poll(async () => {
    try {
      const ack = JSON.parse(await readFile(path.join(dir, 'browser-control-done.json'), 'utf8'))
      return ack.action === action && ack.identity_id === identity && ack.enabled === (action === 'resume')
    } catch { return false }
  }, { timeout: 10000 }).toBe(true)
}
try {
  await new Promise((resolve, reject) => {
    host.once('error', reject)
    host.listen(Number(process.env.CSWW_E2E_HOST_PORT), '127.0.0.1', resolve)
  })
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--no-proxy-server'] })
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } })
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
  const claimButton = `seat-claim-${session.id}`
  await expect(seatA.getByTestId(claimButton)).toBeVisible({ timeout: 20000 })
  await expect(seatB.getByTestId(claimButton)).toBeVisible({ timeout: 20000 })
  const claims = [seatA, seatB].map((seatPage) => seatPage.waitForResponse(
    (response) => response.url().endsWith(`/sessions/${session.id}/claim`) && response.request().method() === 'POST'))
  await Promise.all([seatA.getByTestId(claimButton).click(), seatB.getByTestId(claimButton).click()])
  const statuses = await Promise.all(claims.map(async (response) => (await response).status()))
  assert.deepEqual([...statuses].sort(), [200, 409], 'exactly one browser claim must win')
  const first = statuses[0] === 200 ? seatA : seatB
  const second = statuses[0] === 200 ? seatB : seatA
  const secondIdentity = statuses[0] === 200 ? fixture.seat_b.identity_id : fixture.seat_a.identity_id
  responses.push({ action: 'concurrent-browser-claim', statuses })
  await openSession(first, session.id)
  await reply(first, 'synthetic browser first seat reply')
  const messages = frame.getByTestId('cs-message-list')
  await expect(messages).toContainText('synthetic browser visitor question')
  await expect(messages).toContainText('synthetic browser first seat reply', { timeout: 25000 })
  let attachmentContentPath
  if (fixture.attachments) {
    const visitorFile = Buffer.from('synthetic visitor attachment\n')
    const seatFile = Buffer.from('synthetic seat attachment\n')
    await frame.getByTestId('cs-file-input').setInputFiles({ name: 'visitor.txt', mimeType: 'text/plain', buffer: visitorFile })
    const seatDownload = first.getByTestId('seat-attachment-download').first()
    await expect(seatDownload).toBeVisible({ timeout: 25000 })
    const contentRequest = first.waitForResponse((response) => /\/assets\/[0-9]+\/content(?:\?|$)/.test(response.url()))
    const receivedVisitorFile = first.waitForEvent('download')
    receivedVisitorFile.catch(() => undefined)
    await seatDownload.click()
    const content = await contentRequest
    const contentUrl = new URL(content.url())
    attachmentContentPath = contentUrl.pathname + contentUrl.search
    const anonymous = await fetch(`${base}${attachmentContentPath}`, { signal: AbortSignal.timeout(10000) })
    assert.equal(anonymous.status, 401)
    responses.push({ action: 'anonymous-attachment-denied', status: anonymous.status })
    const contentType = content.headers()['content-type'] ?? ''
    if (!content.ok() || contentType.includes('application/json')) {
      await writeFile(path.join(dir, 'attachment-content-error.json'), JSON.stringify({ status: content.status(), body: await content.json() }))
      throw new Error('Seat attachment content was rejected; see attachment-content-error.json')
    }
    const visitorSaved = path.join(dir, 'visitor-attachment-downloaded.bin')
    await (await receivedVisitorFile).saveAs(visitorSaved)
    assert.deepEqual(await readFile(visitorSaved), visitorFile)
    await first.getByTestId('seat-attach-input').setInputFiles({ name: 'seat.txt', mimeType: 'text/plain', buffer: seatFile })
    await first.getByTestId('seat-send').click()
    await expect(frame.getByTestId('cs-asset-download')).toHaveCount(2, { timeout: 25000 })
    const receivedSeatFile = page.waitForEvent('download')
    await frame.getByTestId('cs-asset-download').last().click()
    const seatSaved = path.join(dir, 'seat-attachment-downloaded.bin')
    await (await receivedSeatFile).saveAs(seatSaved)
    assert.deepEqual(await readFile(seatSaved), seatFile)
    responses.push({ action: 'bidirectional-attachment-download', visitorBytes: visitorFile.length, seatBytes: seatFile.length })
    await first.screenshot({ path: path.join(dir, 'seat-attachments.png') })
    await page.screenshot({ path: path.join(dir, 'visitor-attachments.png') })
  }
  let disconnects = 0
  let eventRequests = 0
  first.on('requestfailed', (request) => { if (request.url().includes('/seats/me/events')) disconnects += 1 })
  first.on('request', (request) => { if (request.url().includes('/seats/me/events')) eventRequests += 1 })
  await first.context().setOffline(true)
  // Browser offline mode blocks new requests; explicitly cut owned gateway TCP streams.
  host.closeAllConnections()
  await expect.poll(() => disconnects, { timeout: 10000 }).toBeGreaterThan(0)
  await frame.getByTestId('cs-input').fill('synthetic visitor message during seat outage')
  const sentDuringOutage = page.waitForResponse((response) =>
    response.url().includes('/messages') && response.request().method() === 'POST')
  await frame.getByTestId('cs-send').click()
  assert.equal((await sentDuringOutage).status(), 200)
  const requestsBeforeOnline = eventRequests
  await first.context().setOffline(false)
  await expect.poll(() => eventRequests, { timeout: 15000 }).toBeGreaterThan(requestsBeforeOnline)
  await expect(first.getByTestId('seat-message-list')).toContainText('synthetic visitor message during seat outage', { timeout: 25000 })
  await expect(first.getByTestId('seat-message-list').getByText('synthetic visitor message during seat outage', { exact: true })).toHaveCount(1)
  responses.push({ action: 'automatic-seat-reconnect', disconnects, newEventRequests: eventRequests - requestsBeforeOnline })
  await first.screenshot({ path: path.join(dir, 'seat-reconnected.png') })
  await first.getByTestId('seat-transfer-target-select').selectOption(secondIdentity)
  await first.getByTestId('seat-transfer-submit').click()
  await openSession(second, session.id)
  if (attachmentContentPath) {
    const statuses = []
    for (const seatPage of [first, second]) {
      const response = await fetch(`${base}${attachmentContentPath}`, {
        signal: AbortSignal.timeout(10000), headers: { authorization: seatTokens.get(seatPage) },
      })
      const result = { action: 'attachment-after-transfer', seat: seatPage === first ? 'previous' : 'current', status: response.status }
      if ((response.headers.get('content-type') ?? '').includes('application/json')) result.code = (await response.json()).code
      responses.push(result)
      if (seatPage === second && response.status === 200) {
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from('synthetic visitor attachment\n'))
      }
      statuses.push(response.status)
    }
    assert.deepEqual(statuses, [403, 200], 'attachment permissions must follow the current Seat after transfer')
  }
  await reply(second, 'synthetic browser second seat reply')
  await expect(messages).toContainText('synthetic browser second seat reply', { timeout: 25000 })
  await page.screenshot({ path: path.join(dir, 'visitor-chat.png') })
  await second.screenshot({ path: path.join(dir, 'seat-workbench.png') })
  const oldAuthorization = seatTokens.get(second)
  assert.ok(oldAuthorization, 'capture actual browser Seat credential in memory only')
  await controlSeat('suspend', secondIdentity)
  const denied = await fetch(`${base}/api/v1/enterprise/organizations/${org}/conversations/${session.conversation_id}/messages`, {
    signal: AbortSignal.timeout(10000), method: 'POST',
    headers: { authorization: oldAuthorization, 'content-type': 'application/json' },
    body: JSON.stringify({ workspace_id: ws, identity_id: secondIdentity,
      sender_type: 'business_identity', body: 'synthetic revoked should not commit', client_msg_id: 'browser-revoked-write' }),
  })
  assert.equal(denied.status, 403)
  if (attachmentContentPath) {
    const deniedAsset = await fetch(`${base}${attachmentContentPath}`, {
      signal: AbortSignal.timeout(10000), headers: { authorization: oldAuthorization },
    })
    assert.equal(deniedAsset.status, 403)
    responses.push({ action: 'suspended-seat-attachment-denied', status: deniedAsset.status })
  }
  await expect.poll(async () => {
    const composer = second.getByTestId('seat-composer')
    return await composer.count() > 0 && await composer.isEnabled()
  }, { timeout: 25000 }).toBe(false).catch(async (error) => {
    await writeFile(path.join(dir, 'seat-revocation-failure.txt'), await second.locator('body').innerText())
    throw error
  })
  await expect(second.getByText(/坐席已暂停|坐席已停用|没有.*坐席|权限/).first()).toBeVisible({ timeout: 10000 })
  responses.push({ action: 'seat-revoked', oldBrowserWriteStatus: denied.status, composerEnabled: false })
  await second.screenshot({ path: path.join(dir, 'seat-revoked.png') })
  await controlSeat('resume', secondIdentity)
  const restored = await openSeat(statuses[0] === 200 ? fixture.seat_b : fixture.seat_a)
  await openSession(restored, session.id)
  await restored.getByTestId('seat-close-submit').click()
  await expect(frame.getByTestId('cs-rate-5')).toBeVisible({ timeout: 25000 })
  const rated = page.waitForResponse((response) => response.url().includes('/rating') && response.request().method() === 'POST')
  await frame.getByTestId('cs-rate-5').click()
  assert.equal((await rated).status(), 200)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: path.join(dir, 'visitor-rated.png') })
  await writeFile(path.join(dir, 'browser-result.json'), JSON.stringify({ status: 'PASS', oracle: 'built Widget + real HTTP + isolated PG; seat controls use actual built workbench pages after real QR confirm with synthetic mobile credentials', responses }, null, 2))
  console.log('PASS: real visitor and two Seat workbench pages: QR, concurrent claim, offline recovery, revocation, fresh login, close, rating')
} finally {
  await writeFile(path.join(dir, 'browser-responses.json'), JSON.stringify(responses, null, 2))
  if (browser) await browser.close()
  await new Promise((resolve) => host.close(resolve))
  host.closeAllConnections()
}
