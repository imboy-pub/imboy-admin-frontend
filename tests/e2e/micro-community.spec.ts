import { readFile, lstat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { test, expect, type BrowserContext, type Page, type Response, type TestInfo } from '@playwright/test'
import { safeParseBigIntJson } from '../../src/lib/safeParseBigIntJson'
import type { EntityId } from '../../src/types/common'

interface OwnedFixture {
  port: number
  admin_cookie: string
  readonly_cookie: string
  channel_id: EntityId
  conflict_channel_id: EntityId
  group_id: EntityId
  message_id: EntityId
}
interface Envelope { code: number; payload?: unknown }
interface SafeResponse { method: string; path: string; status: number }
interface Session { owner: BrowserContext; readonly: BrowserContext; pages: Page[] }

// The runner owns the synthetic DB lease and stop file. Signed production
// sessions exercise authenticated UI; this suite does not claim UI login.
// Traces/HAR would disclose the private session cookie and must stay disabled.
test.use({ trace: 'off', video: 'off', screenshot: 'off' })

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing owned micro-community resource: ${name}`)
  return value
}

function localFrontend(): string {
  const url = new URL(requiredEnvironment('MC_ADMIN_BROWSER_URL'))
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
    !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MC_ADMIN_BROWSER_URL must be an explicit owned 127.0.0.1 HTTP origin')
  }
  return url.origin
}

async function loadOwnedFixture(): Promise<OwnedFixture> {
  const path = requiredEnvironment('MC_ADMIN_BROWSER_CONTEXT_FILE')
  const [file, parent] = await Promise.all([lstat(path), lstat(dirname(path))])
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0 ||
    !parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0) {
    throw new Error('Owned fixture must be a private regular file in a private directory')
  }
  let data: unknown
  try {
    data = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error('Unable to parse the private owned fixture')
  }
  if (!data || typeof data !== 'object') throw new Error('Invalid owned fixture structure')
  const record = data as Record<string, unknown>
  const ids = ['channel_id', 'conflict_channel_id', 'group_id', 'message_id']
  const validIds = ids.every(key => typeof record[key] === 'string' && /^[1-9]\d*$/.test(record[key] as string))
  if (!validIds || typeof record.port !== 'number' || !Number.isInteger(record.port) ||
    record.port < 1 || record.port > 65535 || record.database !== 'imboy_test_group' ||
    record.authentication_scope !== 'production signed session; UI login not tested' ||
    typeof record.admin_cookie !== 'string' || typeof record.readonly_cookie !== 'string') {
    throw new Error('Missing or invalid owned synthetic production-session fixture')
  }
  return record as unknown as OwnedFixture
}

async function installCookie(context: BrowserContext, header: string): Promise<void> {
  const cookies = header.split(';').map(part => {
    const pair = part.trim()
    const separator = pair.indexOf('=')
    const name = pair.slice(0, separator)
    const value = pair.slice(separator + 1)
    if (separator <= 0 || !/^[A-Za-z0-9_-]+$/.test(name) || !value || /[\r\n]/.test(value)) {
      throw new Error('Invalid private production session cookie format')
    }
    return { name, value, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' as const }
  })
  try {
    await context.addCookies(cookies)
  } catch {
    throw new Error('Unable to install the private production session cookie')
  }
}

function observeResponses(context: BrowserContext, records: SafeResponse[]): void {
  context.on('response', response => {
    const url = new URL(response.url())
    records.push({ method: response.request().method(), path: url.pathname, status: response.status() })
  })
}

function envelope(text: string): Envelope {
  const data = safeParseBigIntJson(text)
  if (!data || typeof data !== 'object' || typeof (data as Envelope).code !== 'number') {
    throw new Error('Production response is missing its business-code envelope')
  }
  return data as Envelope
}

async function assertResponse(response: Response, code: number): Promise<Envelope> {
  expect(response.status(), 'production HTTP transport').toBe(200)
  const result = envelope(await response.text())
  expect(result.code, 'production business code').toBe(code)
  return result
}

function waitForMutation(page: Page, path: string): Promise<Response> {
  return page.waitForResponse(response => new URL(response.url()).pathname === path &&
    response.request().method() === 'PUT')
}

async function browserRequest(page: Page, path: string, body?: unknown): Promise<Envelope> {
  const result = await page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'PUT', credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, text: await response.text() }
  }, { path, body })
  expect(result.status, 'authenticated browser HTTP transport').toBe(200)
  return envelope(result.text)
}

function discussionPath(channel: EntityId): string {
  return `/api/adm/channel/${channel}/discussion`
}

async function assertBinding(page: Page, channel: EntityId, group: EntityId | null): Promise<void> {
  const result = await browserRequest(page, discussionPath(channel))
  expect(result.code).toBe(0)
  expect((result.payload as { discussion_group_id: EntityId | null }).discussion_group_id).toBe(group)
}

async function prepareCandidate(page: Page, origin: string, channel: EntityId, group: EntityId): Promise<void> {
  await page.goto(`${origin}/channels/${channel}`)
  await expect(page.getByText('当前讨论群：未绑定', { exact: true })).toBeVisible()
  const select = page.getByLabel('选择讨论群', { exact: true })
  await expect(select).toBeEnabled()
  await expect(select.locator(`option[value="${group}"]`)).toHaveCount(1)
  await select.selectOption(group)
}

async function saveDiscussion(page: Page, channel: EntityId, code: number): Promise<void> {
  await page.getByRole('button', { name: '保存讨论群', exact: true }).click()
  const response = waitForMutation(page, discussionPath(channel))
  await page.getByRole('button', { name: '确认保存', exact: true }).click()
  await assertResponse(await response, code)
}

async function bindingAndConflict(owner: Page, conflict: Page, origin: string, fixture: OwnedFixture): Promise<void> {
  // C2 selects first, then saves its stale live candidate after C1 binds.
  await prepareCandidate(conflict, origin, fixture.conflict_channel_id, fixture.group_id)
  await prepareCandidate(owner, origin, fixture.channel_id, fixture.group_id)
  await saveDiscussion(owner, fixture.channel_id, 0)
  await expect(owner.getByText(`当前讨论群：${fixture.group_id}`, { exact: true })).toBeVisible()
  await owner.reload()
  await expect(owner.getByText(`当前讨论群：${fixture.group_id}`, { exact: true })).toBeVisible()
  await assertBinding(owner, fixture.channel_id, fixture.group_id)
  await saveDiscussion(conflict, fixture.conflict_channel_id, 409)
  await expect(conflict.getByRole('alert')).toBeVisible()
  await expect(conflict.getByRole('alert')).not.toHaveText('')
  await expect(conflict.getByText('当前讨论群：未绑定', { exact: true })).toBeVisible()
  await conflict.reload()
  await expect(conflict.getByText('当前讨论群：未绑定', { exact: true })).toBeVisible()
  await assertBinding(owner, fixture.conflict_channel_id, null)
}

function messageRow(page: Page, message: EntityId) {
  return page.getByRole('row').filter({ has: page.getByLabel(`选择消息 ${message}`, { exact: true }) })
}

async function assertMessageReadback(page: Page, fixture: OwnedFixture, essence: boolean): Promise<void> {
  const result = await browserRequest(page, `/api/adm/channel/${fixture.channel_id}/messages?page=1&size=10`)
  expect(result.code).toBe(0)
  const list = (result.payload as { list: { id: EntityId; is_essence: boolean; is_pinned: boolean }[] }).list
  const message = list.find(item => item.id === fixture.message_id)
  expect(message, 'synthetic message is present in the live GET list').toBeDefined()
  expect(message?.is_essence).toBe(essence)
  expect(message?.is_pinned, 'essence changes preserve independent pin state').toBe(true)
}

async function toggleEssence(page: Page, fixture: OwnedFixture, essence: boolean): Promise<void> {
  const row = messageRow(page, fixture.message_id)
  await expect(row.getByTitle('取消置顶', { exact: true })).toBeVisible()
  const response = waitForMutation(page, `/api/adm/channel/${fixture.channel_id}/message/${fixture.message_id}/essence`)
  await row.getByRole('button', { name: essence ? '设为精华' : '取消精华', exact: true }).click()
  await assertResponse(await response, 0)
  await expect(row.getByRole('button', { name: essence ? '取消精华' : '设为精华', exact: true })).toBeVisible()
  await assertMessageReadback(page, fixture, essence)
  await page.reload()
  await expect(messageRow(page, fixture.message_id).getByRole('button', {
    name: essence ? '取消精华' : '设为精华', exact: true,
  })).toBeVisible()
  await expect(messageRow(page, fixture.message_id).getByTitle('取消置顶', { exact: true })).toBeVisible()
}

async function essenceRoundTrip(page: Page, origin: string, fixture: OwnedFixture): Promise<void> {
  await page.goto(`${origin}/channels/${fixture.channel_id}/messages`)
  await expect(page.getByText('频道消息治理', { exact: true })).toBeVisible()
  await assertMessageReadback(page, fixture, false)
  await toggleEssence(page, fixture, true)
  await toggleEssence(page, fixture, false)
}

async function readonlyDenial(page: Page, owner: Page, origin: string, fixture: OwnedFixture): Promise<void> {
  await page.goto(`${origin}/channels/${fixture.channel_id}`)
  await expect(page.getByRole('heading', { name: '403', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '无权限访问', exact: true })).toBeVisible()
  const discussion = await browserRequest(page, discussionPath(fixture.channel_id), { discussion_group_id: null })
  expect(discussion.code, 'readonly direct discussion write is denied by the server').toBe(403)
  const essence = await browserRequest(page,
    `/api/adm/channel/${fixture.channel_id}/message/${fixture.message_id}/essence`, { is_essence: true })
  expect(essence.code, 'readonly direct essence write is denied by the server').toBe(403)
  await assertBinding(owner, fixture.channel_id, fixture.group_id)
  await assertBinding(owner, fixture.conflict_channel_id, null)
  await assertMessageReadback(owner, fixture, false)
}

async function captureFailure(pages: Page[], info: TestInfo): Promise<void> {
  for (const [index, page] of pages.entries()) {
    if (!page.isClosed()) await info.attach(`owned-synthetic-page-${index}`, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })
  }
}

async function closeSessions(session: Session | undefined): Promise<void> {
  if (!session) return
  const results = await Promise.allSettled([session.owner.close(), session.readonly.close()])
  if (results.some(result => result.status === 'rejected')) throw new Error('Owned browser-context cleanup failed')
}

test('owned live backend: binding conflict, essence round trip and readonly enforcement', async ({ browser }, info) => {
  const origin = localFrontend()
  const fixture = await loadOwnedFixture()
  const responses: SafeResponse[] = []
  let session: Session | undefined
  const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    const readonly = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    session = { owner, readonly, pages: [] }
    await installCookie(owner, fixture.admin_cookie)
    await installCookie(readonly, fixture.readonly_cookie)
    observeResponses(owner, responses)
    observeResponses(readonly, responses)
    const pages = await Promise.all([owner.newPage(), owner.newPage(), readonly.newPage()])
    session.pages = pages
    await test.step('live binding succeeds; stale conflicting candidate returns business 409',
      () => bindingAndConflict(pages[0], pages[1], origin, fixture))
    await test.step('live essence set and cancel read back independently from pin',
      () => essenceRoundTrip(pages[0], origin, fixture))
    await test.step('readonly role shows 403 and both direct writes return business 403',
      () => readonlyDenial(pages[2], pages[0], origin, fixture))
  } catch (error) {
    await captureFailure(session?.pages ?? [], info)
    throw error
  } finally {
    try {
      await info.attach('safe-live-response-statuses', {
        body: JSON.stringify({ authentication: 'production signed session; UI login not tested', responses }),
        contentType: 'application/json',
      })
    } finally {
      if (session) await closeSessions(session)
      else await owner.close()
    }
  }
})
