import { installAttachmentLocksShim } from '@/test/attachmentJournalFixture'
installAttachmentLocksShim()
import { afterAll, describe, expect, it } from 'bun:test'
import { parseUploadSession, resumeUpload, uploadJournal, type DirectUploadGrant, type UploadSession } from './attachmentUploadJournal'

// journal key 的读取顺序是 globalThis.location?.origin 优先；bun 单进程连跑全部
// 测试文件，此处 define 的假 location 若不恢复会泄漏给后续 JSDOM 环境的测试文件
// （如 seatSend.attachmentRecovery），破坏其 location.href 依赖。
const ORIGINAL_LOCATION_DESCRIPTOR = Object.getOwnPropertyDescriptor(globalThis, 'location')
Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://admin.example' } })
afterAll(() => {
  if (ORIGINAL_LOCATION_DESCRIPTOR) {
    Object.defineProperty(globalThis, 'location', ORIGINAL_LOCATION_DESCRIPTOR)
  } else {
    delete (globalThis as { location?: unknown }).location
  }
})

const CHECKSUM = 'A'.repeat(43) + '='
const OBJECT_KEY = 'eb/1/2/20260101/aabbccdd.txt'

function wireGrant(url: string, extra: Record<string, string> = {}): Record<string, unknown> {
  return {
    transport: 's3_put', method: 'PUT', url,
    required_headers: [
      { key: 'Content-Type', value: 'text/plain' },
      { key: 'x-amz-checksum-sha256', value: CHECKSUM },
      ...Object.entries(extra).map(([key, value]) => ({ key, value })),
    ],
    expires_in: 900,
  }
}

function grantFixture(url = 'https://store.example/secret'): DirectUploadGrant {
  return { kind: 's3_put', method: 'PUT', url, headers: { 'Content-Type': 'text/plain', 'x-amz-checksum-sha256': CHECKSUM }, expiresIn: 900 }
}

function fixture() {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) }, get length() { return data.size }, key: (index: number) => [...data.keys()][index] ?? null } as Storage
  let current = true
  const journal = uploadJournal(['seat', 'user-a', 'ws-a', 'conversation'], () => current, storage)
  const file = new Blob(['abc'], { type: 'text/plain' })
  const hash = 'a'.repeat(64)
  const events: string[] = []
  const session: UploadSession = { objectKey: OBJECT_KEY, sessionState: 'registered', directState: 'GRANTED',
    attemptId: 1, grant: grantFixture(), sessionDeadline: null, stateConfirmed: false }
  const input = { journal, file, hash, clientMsgId: 'stable-message', isCurrent: () => current,
    register: async (id: string) => { events.push(`register:${id}`); return session },
    status: async () => { events.push('status'); return session },
    renew: async () => { events.push('renew'); return session },
    put: async () => { events.push('put') },
    confirm: async () => { events.push('confirm'); return { assetId: '8100000000000000001' } } }
  return { data, storage, journal, input, events, session, revoke: () => { current = false } }
}

describe('durable attachment journal', () => {
  for (const [label, upload] of [
    ['method 非 PUT', { transport: 's3_put', method: 'POST', url: 'https://store.example/put', required_headers: [{ key: 'x-amz-checksum-sha256', value: CHECKSUM }] }],
    ['缺 checksum 签名头', { transport: 's3_put', method: 'PUT', url: 'https://store.example/put', required_headers: [{ key: 'Content-Type', value: 'text/plain' }] }],
    ['注入 Authorization', wireGrant('https://store.example/put', { Authorization: 'secret' })],
    ['注入 Cookie', wireGrant('https://store.example/put', { Cookie: 'secret' })],
    ['transport 非 s3_put', { transport: 'api_byte', method: 'PUT', url: 'https://store.example/put', required_headers: [{ key: 'x-amz-checksum-sha256', value: CHECKSUM }] }],
    ['目标非 https', wireGrant('http://evil.example/put')],
  ] as const) {
    it(`会话解析拒绝非法上传目标：${label}`, () => {
      expect(() => parseUploadSession({ object_key: OBJECT_KEY, session_state: 'registered', upload })).toThrow()
    })
  }

  it('renew 换新 grant 成对传给 PUT，不复用 status 目标', async () => {
    const f = fixture()
    // 先建立已落 objectKey 的 registered 行（PUT 中断），再恢复 → renew 换新 attempt。
    await expect(resumeUpload({ ...f.input, put: async () => { throw new Error('restart') } })).rejects.toThrow()
    const renewed: UploadSession = { ...f.session, grant: grantFixture('https://store.example/renewed'), attemptId: 2 }
    const puts: DirectUploadGrant[] = []
    f.events.length = 0
    await resumeUpload({ ...f.input,
      status: async () => { f.events.push('status'); return f.session },
      renew: async () => { f.events.push('renew'); return renewed },
      put: async (grant) => { f.events.push('put'); puts.push(grant) },
      confirm: async () => { f.events.push('confirm'); return { assetId: '8100000000000000001' } } })
    expect(puts).toEqual([grantFixture('https://store.example/renewed')])
    expect(f.events).toEqual(['status', 'renew', 'put', 'confirm'])
  })
  it('checkpoints precede every next remote step and never persist credentials', async () => {
    const f = fixture()
    const row = await resumeUpload({ ...f.input, onCheckpoint: async (value) => { f.events.push(value.phase) } })
    expect(f.events.map((v) => v.startsWith('register:') ? 'register' : v)).toEqual([
      'intent', 'register', 'intent', 'registered', 'put', 'uploaded', 'confirm', 'confirmed',
    ])
    expect(row.phase).toBe('confirmed')
    expect(row.objectKey).toBe(OBJECT_KEY)
    expect([...f.data.values()].join('')).not.toContain('secret')
  })
  it('register 响应丢失（object_key 未知）→ 同 UUID 重新登记新会话', async () => {
    const f = fixture()
    await expect(resumeUpload({ ...f.input, register: async () => { throw new Error('response lost') } })).rejects.toThrow()
    const id = f.journal.load('stable-message')!.clientUploadId
    f.events.length = 0
    const row = await resumeUpload(f.input)
    expect(row.clientUploadId).toBe(id)
    // direct 协议无 by-cid 回查：重新 register（新 objectKey），旧 RESERVED 行由 deadline GC 兜底。
    expect(f.events.map((v) => (v.startsWith('register:') ? 'register' : v))).toEqual(['register', 'put', 'confirm'])
    expect(row.objectKey).toBe(OBJECT_KEY)
  })
  it('storage denial stops before register', async () => {
    const f = fixture()
    f.storage.setItem = () => { throw new Error('quota') }
    await expect(resumeUpload(f.input)).rejects.toThrow('quota')
    expect(f.events).toEqual([])
  })
  it('checkpoint failure after PUT prevents confirm', async () => {
    const f = fixture()
    await expect(resumeUpload({ ...f.input, onCheckpoint: async (row) => {
      if (row.phase === 'uploaded') throw new Error('checkpoint denied')
    } })).rejects.toThrow('checkpoint denied')
    expect(f.events).not.toContain('confirm')
  })
  it('restart after uploaded bytes confirms without repeating PUT', async () => {
    const f = fixture()
    await expect(resumeUpload({ ...f.input, confirm: async () => { throw new Error('lost ACK') } })).rejects.toThrow()
    f.events.length = 0
    await resumeUpload(f.input)
    expect(f.events).toEqual(['status', 'confirm'])
  })
  it('confirmed status wins over local registered phase（幂等重放回读 assetId）', async () => {
    const f = fixture()
    await expect(resumeUpload({ ...f.input, put: async () => { throw new Error('stopped') } })).rejects.toThrow()
    f.events.length = 0
    await resumeUpload({ ...f.input, status: async () => { f.events.push('status'); return { ...f.session, sessionState: 'confirmed' } } })
    expect(f.events).toEqual(['status', 'confirm'])
    expect(f.journal.load('stable-message')!.phase).toBe('confirmed')
  })
  it('late account callback cannot mutate journal or start PUT', async () => {
    const f = fixture()
    await expect(resumeUpload({ ...f.input, register: async () => { f.revoke(); return f.session } })).rejects.toThrow()
    expect(f.events).toEqual([])
    expect(JSON.parse([...f.data.values()][0]!).phase).toBe('intent')
  })
  it('different reselected bytes fail before any remote action', async () => {
    const f = fixture()
    await expect(resumeUpload({ ...f.input, register: async () => { throw new Error('lost') } })).rejects.toThrow()
    await expect(resumeUpload({ ...f.input, hash: 'b'.repeat(64) })).rejects.toThrow('不同')
    expect(f.events).toEqual([])
  })
  it('other principal and workspace cannot hydrate old journal', async () => {
    const f = fixture()
    await resumeUpload(f.input)
    expect(uploadJournal(['seat', 'user-b', 'ws-a', 'conversation'], () => true, f.storage).load('stable-message')).toBeNull()
    expect(uploadJournal(['seat', 'user-a', 'ws-b', 'conversation'], () => true, f.storage).load('stable-message')).toBeNull()
  })
  it('renew 未返回有效上传目标 fail-closed', async () => {
    const f = fixture()
    await expect(resumeUpload({ ...f.input, put: async () => { throw new Error('restart') } })).rejects.toThrow()
    f.events.length = 0
    await expect(resumeUpload({ ...f.input, renew: async () => { f.events.push('renew'); return { ...f.session, grant: null } } })).rejects.toThrow('目标')
    expect(f.events).toEqual(['status', 'renew'])
  })
  it('未知会话状态绝不当作 confirmed；定位键非法即拒绝', () => {
    expect(() => parseUploadSession({ object_key: OBJECT_KEY, session_state: 'unknown' })).toThrow()
    expect(() => parseUploadSession({ object_key: '', session_state: 'registered' })).toThrow()
    expect(() => parseUploadSession({ object_key: '../escape', session_state: 'registered' })).toThrow()
  })
  it('presign 视图 GRANTED 归一为 registered；renew CONFIRMED 幂等投影 state_confirmed', () => {
    const presign = parseUploadSession({ object_key: OBJECT_KEY, session_state: 'GRANTED', attempt_id: 1, upload: wireGrant('https://store.example/put') })
    expect(presign.sessionState).toBe('registered')
    expect(presign.grant?.url).toBe('https://store.example/put')
    const confirmed = parseUploadSession({ object_key: OBJECT_KEY, session_state: 'registered', direct_state: 'CONFIRMED', state_confirmed: true })
    expect(confirmed.stateConfirmed).toBe(true)
    expect(confirmed.grant).toBeNull()
  })
  it('same bytes in a new task allocate distinct IDs rather than inheriting the old message', async () => {
    const f = fixture()
    const first = await resumeUpload(f.input)
    const second = await resumeUpload({ ...f.input, clientMsgId: 'new-message' })
    expect(second.clientMsgId).toBe('new-message')
    expect(second.clientUploadId).not.toBe(first.clientUploadId)
    expect(f.journal.list()).toHaveLength(2)
  })
  it('late removal names the exact task and cannot delete another task', async () => {
    const f = fixture()
    const first = await resumeUpload(f.input)
    const second = await resumeUpload({ ...f.input, clientMsgId: 'new-message' })
    await f.journal.remove(first.clientMsgId, first.clientUploadId)
    expect(f.journal.load(second.clientMsgId)?.clientUploadId).toBe(second.clientUploadId)
    await expect(f.journal.remove(second.clientMsgId, first.clientUploadId)).rejects.toThrow('身份冲突')
    expect(f.journal.load(second.clientMsgId)?.clientUploadId).toBe(second.clientUploadId)
  })
  it('stale checkpoint cannot overwrite the same task with another upload UUID', async () => {
    const f = fixture()
    const row = await resumeUpload(f.input)
    await expect(f.journal.save({ ...row, clientUploadId: crypto.randomUUID() })).rejects.toThrow('身份冲突')
    expect(f.journal.load(row.clientMsgId)?.clientUploadId).toBe(row.clientUploadId)
  })
  it('objectKey 一旦落定不可变更（跨会话漂移拒绝）', async () => {
    const f = fixture()
    const row = await resumeUpload(f.input)
    await expect(f.journal.save({ ...row, objectKey: 'eb/9/9/20300101/other.txt' })).rejects.toThrow('身份冲突')
    expect(f.journal.load(row.clientMsgId)?.objectKey).toBe(OBJECT_KEY)
  })

  it('unavailable browser task lock blocks before register', async () => {
    const f = fixture()
    const journal = uploadJournal(['seat', 'user-a', 'ws-a', 'conversation'], () => true, f.storage,
      async () => { throw new Error('another page owns task lock') })
    await expect(resumeUpload({ ...f.input, journal })).rejects.toThrow('task lock')
    expect(f.events).toEqual([])
  })

  it('whole remote operation excludes a second owner until the first operation settles', async () => {
    const f = fixture()
    let release!: () => void
    const waiting = new Promise<void>((resolve) => { release = resolve })
    let remoteActions = 0
    const first = f.journal.run('stable-message', async () => {
      remoteActions += 1
      await waiting
      remoteActions += 1
    })
    await Promise.resolve()
    const other = uploadJournal(['seat', 'user-a', 'ws-a', 'conversation'], () => true, f.storage)
    await expect(other.run('stable-message', async () => { remoteActions += 100 })).rejects.toThrow('另一个页面')
    expect(remoteActions).toBe(1)
    release()
    await first
    expect(remoteActions).toBe(2)
    await other.run('stable-message', async () => { remoteActions += 1 })
    expect(remoteActions).toBe(3)
  })

})

it('dispatch intent survives restart and stale ready checkpoint cannot roll it back', async () => {
  const f = fixture()
  const row = await resumeUpload(f.input)
  expect(row.dispatchState).toBe('ready')
  await f.journal.save({ ...row, dispatchState: 'dispatch_intent' })
  await expect(f.journal.save(row)).rejects.toThrow('不可回退')
  expect(f.journal.load(row.clientMsgId)?.dispatchState).toBe('dispatch_intent')
  expect([...f.data.values()].join('')).not.toContain('secret')
})

describe('atomic confirmed message retarget', () => {
  async function ready() {
    const f = fixture()
    const row = await resumeUpload(f.input)
    return { ...f, row: { ...row, journalId: row.clientMsgId } }
  }
  it('keeps one physical record and rejects stale writes after restart', async () => {
    const f = await ready()
    const keys = [...f.data.keys()]
    const next = await f.journal.retarget(f.row.journalId, f.row.clientMsgId, f.row.clientUploadId, 'edited-message')
    expect([...f.data.keys()]).toEqual(keys)
    expect(f.journal.list().map((row) => row.clientMsgId)).toEqual(['edited-message'])
    expect(f.journal.load(f.row.clientMsgId)).toBeNull()
    expect(next.clientUploadId).toBe(f.row.clientUploadId)
    await expect(f.journal.save(f.row)).rejects.toThrow('消息任务已切换')
    await expect(f.journal.run(f.row.clientMsgId, async () => { throw new Error('must not run') })).rejects.toThrow('旧页面')
    await f.journal.remove(f.row.clientMsgId, f.row.clientUploadId)
    expect(f.journal.load('edited-message')).not.toBeNull()
  })
  it('failed atomic write preserves the sole original ready task', async () => {
    const f = await ready()
    f.storage.setItem = () => { throw new Error('quota') }
    await expect(f.journal.retarget(f.row.journalId, f.row.clientMsgId, f.row.clientUploadId, 'edited-message')).rejects.toThrow('quota')
    expect(f.journal.list().map((row) => row.clientMsgId)).toEqual([f.row.clientMsgId])
    expect(f.journal.load(f.row.clientMsgId)?.dispatchState).toBe('ready')
  })
  it('unknown, conflicting target and wrong upload UUID cannot retarget', async () => {
    const f = await ready()
    await expect(f.journal.retarget(f.row.journalId, f.row.clientMsgId, crypto.randomUUID(), 'next')).rejects.toThrow()
    await f.journal.save({ ...f.row, clientMsgId: 'other', journalId: 'other', clientUploadId: crypto.randomUUID() })
    await expect(f.journal.retarget(f.row.journalId, f.row.clientMsgId, f.row.clientUploadId, 'other')).rejects.toThrow()
    await f.journal.save({ ...f.row, dispatchState: 'dispatch_intent' })
    await expect(f.journal.retarget(f.row.journalId, f.row.clientMsgId, f.row.clientUploadId, 'next')).rejects.toThrow()
  })
})
