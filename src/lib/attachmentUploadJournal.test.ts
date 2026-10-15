import '@/test/attachmentJournalFixture'
import { describe, expect, it } from 'bun:test'
import { parseUploadSession, resumeUpload, uploadJournal, type UploadSession } from './attachmentUploadJournal'

Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://admin.example' } })

function fixture() {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) }, get length() { return data.size }, key: (index: number) => [...data.keys()][index] ?? null } as Storage
  let current = true
  const journal = uploadJournal(['seat', 'user-a', 'ws-a', 'conversation'], () => current, storage)
  const file = new Blob(['abc'], { type: 'text/plain' })
  const hash = 'a'.repeat(64)
  const events: string[] = []
  const session: UploadSession = { assetId: '8100000000000000001', state: 'registered', uploadRef: 'secret-ref', uploadUrl: 'https://store.example/secret' }
  const input = { journal, file, hash, clientMsgId: 'stable-message', isCurrent: () => current,
    register: async (id: string) => { events.push(`register:${id}`); return session },
    status: async () => { events.push('status'); return session },
    renew: async () => { events.push('renew'); return session },
    put: async () => { events.push('put') }, confirm: async () => { events.push('confirm') } }
  return { data, storage, journal, input, events, session, revoke: () => { current = false } }
}

describe('durable attachment journal', () => {
  it('checkpoints precede every next remote step and never persist credentials', async () => {
    const f = fixture()
    const row = await resumeUpload({ ...f.input, onCheckpoint: async (value) => { f.events.push(value.phase) } })
    expect(f.events.map((v) => v.startsWith('register:') ? 'register' : v)).toEqual([
      'intent', 'register', 'registered', 'put', 'uploaded', 'confirm', 'confirmed',
    ])
    expect(row.phase).toBe('confirmed')
    expect([...f.data.values()].join('')).not.toContain('secret')
  })
  it('lost register response recovers same UUID through status and renew, never new registration', async () => {
    const f = fixture()
    await expect(resumeUpload({ ...f.input, register: async () => { throw new Error('response lost') } })).rejects.toThrow()
    const id = f.journal.load('stable-message')!.clientUploadId
    const row = await resumeUpload(f.input)
    expect(row.clientUploadId).toBe(id)
    expect(f.events).toEqual(['status', 'renew', 'put', 'confirm'])
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
  it('confirmed status wins over local registered phase', async () => {
    const f = fixture()
    await expect(resumeUpload({ ...f.input, put: async () => { throw new Error('stopped') } })).rejects.toThrow()
    f.events.length = 0
    await resumeUpload({ ...f.input, status: async () => ({ ...f.session, state: 'confirmed' }) })
    expect(f.events).toEqual([])
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
  it('renew missing same-asset upload target fails closed', async () => {
    const f = fixture()
    await expect(resumeUpload({ ...f.input, put: async () => { throw new Error('restart') } })).rejects.toThrow()
    f.events.length = 0
    await expect(resumeUpload({ ...f.input, renew: async () => ({ ...f.session, uploadUrl: null }) })).rejects.toThrow('目标')
    expect(f.events).toEqual(['status'])
  })
  it('unknown state is never assumed confirmed and unsafe targets are discarded', () => {
    expect(() => parseUploadSession({ asset_id: '12', session_state: 'unknown' })).toThrow()
    expect(parseUploadSession({ asset_id: '12', session_state: 'registered', upload: { url: 'http://evil.example' } }).uploadUrl).toBeNull()
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
