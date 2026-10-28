import type { EntityId } from '@/types/common'

type UploadPhase = 'intent' | 'registered' | 'uploaded' | 'confirmed'
export type UploadCheckpoint = {
  journalId?: string
  clientUploadId: string
  clientMsgId: string
  assetId: EntityId | null
  dispatchState?: 'ready' | 'dispatch_intent'
  phase: UploadPhase
  objectHash: string
  sizeBytes: number
  mime: string
  updatedAt: number
}
export type UploadSession = {
  assetId: EntityId
  state: string
  uploadRef: string | null
  uploadUrl: string | null
}

/** No capability or plaintext is persisted; every write failure stops the next remote action. */
async function browserTaskLock<T>(name: string, operation: () => Promise<T> | T): Promise<T> {
  if (!globalThis.navigator?.locks) throw new Error('浏览器不支持安全上传任务锁，已停止')
  return navigator.locks.request(name, { ifAvailable: true }, (lock) => {
    if (lock === null) throw new Error('上传任务正由另一个页面处理')
    return operation()
  })
}

async function browserStorageLock(name: string, mutate: () => void): Promise<void> {
  await browserTaskLock(name, mutate)
}

export function uploadJournal(scope: readonly string[], isCurrent: () => boolean, storage: Storage = localStorage,
  lock: (_name: string, _mutate: () => void) => Promise<void> = browserStorageLock) {
  const key = `imboy:attachment:v5:${JSON.stringify([(globalThis.location?.origin ?? globalThis.window?.location.origin), ...scope])}`
  const guard = () => { if (!isCurrent()) throw new Error('上传身份或会话已变化') }
  const taskKey = (id: string) => `${key}:${encodeURIComponent(id)}`
  const read = (id: string): UploadCheckpoint | null => {
    guard()
    const raw = storage.getItem(taskKey(id))
    if (raw === null) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) throw new Error('上传恢复记录损坏')
    const row = value as UploadCheckpoint
    if (!/^[0-9a-f-]{36}$/i.test(row.clientUploadId) || !/^[0-9a-f]{64}$/.test(row.objectHash)
      || !['intent', 'registered', 'uploaded', 'confirmed'].includes(row.phase)
      || (row.dispatchState !== undefined && !['ready', 'dispatch_intent'].includes(row.dispatchState))
      || typeof row.clientMsgId !== 'string' || row.clientMsgId.length === 0 || (row.journalId !== undefined && row.journalId !== id) || typeof row.mime !== 'string'
      || !Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0
      || (row.assetId !== null && !/^\d+$/.test(row.assetId))) throw new Error('上传恢复记录损坏')
    return { ...row, journalId: id,
      dispatchState: row.dispatchState === undefined && row.phase !== 'confirmed' ? 'ready' : row.dispatchState }
  }
  const all = (): UploadCheckpoint[] => {
    guard()
    const rows: UploadCheckpoint[] = []
    for (let i = 0; i < storage.length; i += 1) {
      const name = storage.key(i)
      if (name?.startsWith(`${key}:`)) {
        const row = read(decodeURIComponent(name.slice(key.length + 1)))
        if (row) rows.push(row)
      }
    }
    if (new Set(rows.map((row) => row.clientMsgId)).size !== rows.length) throw new Error('消息恢复身份重复')
    return rows
  }
  const find = (id: string) => all().find((row) => row.clientMsgId === id) ?? null
  const write = (row: UploadCheckpoint) => {
    const { journalId, clientUploadId, clientMsgId, assetId, phase, dispatchState, objectHash, sizeBytes, mime } = row
    storage.setItem(taskKey(journalId ?? clientMsgId), JSON.stringify({ journalId: journalId ?? clientMsgId,
      clientUploadId, clientMsgId, assetId, phase, dispatchState, objectHash, sizeBytes, mime, updatedAt: Date.now() }))
    guard()
  }
  const journal = {
    async run<T>(id: string, operation: () => Promise<T>): Promise<T> {
      const original = find(id)
      const stableId = original?.journalId ?? id
      return browserTaskLock(`${taskKey(stableId)}:operation`, async () => {
        guard()
        const current = read(stableId)
        if (current && current.clientMsgId !== id) throw new Error('消息任务已切换，旧页面已停止')
        return operation()
      })
    },
    load: find,
    list: all,
    async save(row: UploadCheckpoint): Promise<void> {
      await lock(`${key}:storage`, () => {
        guard()
        const id = row.journalId ?? row.clientMsgId
        const previous = read(id)
        const owner = find(row.clientMsgId)
        if ((previous && previous.clientMsgId !== row.clientMsgId) || (owner && owner.journalId !== id)) throw new Error('消息任务已切换')
        if (previous && (previous.clientUploadId !== row.clientUploadId || previous.objectHash !== row.objectHash
          || previous.sizeBytes !== row.sizeBytes || previous.mime !== row.mime
          || (previous.assetId !== null && previous.assetId !== row.assetId))) throw new Error('上传任务身份冲突')
        const phases: UploadPhase[] = ['intent', 'registered', 'uploaded', 'confirmed']
        if (previous && phases.indexOf(previous.phase) > phases.indexOf(row.phase)) throw new Error('上传任务已由其他页面推进')
        if (previous?.dispatchState === 'dispatch_intent' && row.dispatchState !== 'dispatch_intent') throw new Error('消息发送意图不可回退')
        write({ ...row, journalId: id })
      })
    },
    async retarget(journalId: string, expectedMsgId: string, clientUploadId: string, nextMsgId: string): Promise<UploadCheckpoint> {
      let result: UploadCheckpoint | undefined
      await lock(`${key}:storage`, () => {
        guard()
        const row = read(journalId)
        if (!row || row.clientMsgId !== expectedMsgId || row.clientUploadId !== clientUploadId
          || row.phase !== 'confirmed' || row.dispatchState !== 'ready' || !nextMsgId || find(nextMsgId)) throw new Error('消息任务切换冲突')
        result = { ...row, clientMsgId: nextMsgId }
        write(result)
      })
      return result!
    },
    /** Only a definitive server refusal proves no message was committed. */
    async acknowledgeRefusal(clientMsgId: string, clientUploadId: string): Promise<void> {
      await lock(`${key}:storage`, () => {
        guard()
        const row = find(clientMsgId)
        if (!row || row.clientUploadId !== clientUploadId || row.dispatchState !== 'dispatch_intent') throw new Error('消息拒绝检查点冲突')
        write({ ...row, dispatchState: 'ready' })
      })
    },
    async remove(clientMsgId: string, clientUploadId: string): Promise<void> {
      await lock(`${key}:storage`, () => {
        guard()
        const previous = find(clientMsgId)
        if (previous && previous.clientUploadId !== clientUploadId) throw new Error('上传任务身份冲突，未删除')
        if (previous) storage.removeItem(taskKey(previous.journalId!))
      })
    },
  }
  return journal
}

export function parseUploadSession(value: unknown): UploadSession {
  if (typeof value !== 'object' || value === null) throw new Error('上传会话响应非法')
  const row = value as Record<string, unknown>
  const assetId = String(row.asset_id ?? '')
  const state = typeof row.session_state === 'string' ? row.session_state : ''
  if (!/^\d+$/.test(assetId) || !['registered', 'confirmed', 'rejected', 'expired', 'delete_intent', 'deleted'].includes(state)) {
    throw new Error('上传会话状态未知，已停止恢复')
  }
  const upload = row.upload as { url?: unknown } | undefined
  const candidate = upload?.url
  let uploadUrl: string | null = null
  if (typeof candidate === 'string') {
    const url = new URL(candidate, (globalThis.location?.origin ?? globalThis.window?.location.origin))
    if ((url.protocol === 'https:' || (url.origin === globalThis.window?.location.origin && ['localhost', '127.0.0.1'].includes(url.hostname)))
      && url.username === '' && url.password === '') uploadUrl = candidate
  }
  return { assetId, state, uploadRef: typeof row.upload_ref === 'string' ? row.upload_ref : null, uploadUrl }
}

export async function resumeUpload(input: {
  journal: ReturnType<typeof uploadJournal>
  file: Blob
  hash: string
  clientMsgId: string
  isCurrent: () => boolean
  register: (_id: string) => Promise<UploadSession>
  status: (_id: string) => Promise<UploadSession>
  renew: (_id: string) => Promise<UploadSession>
  put: (_url: string) => Promise<void>
  confirm: (_asset: EntityId, _ref: string | null) => Promise<void>
  onCheckpoint?: (_row: UploadCheckpoint) => Promise<void>
}): Promise<UploadCheckpoint> {
  const guard = () => { if (!input.isCurrent()) throw new Error('上传身份或会话已变化') }
  guard()
  let row = input.journal.load(input.clientMsgId)
  const existing = row !== null
  if (row && (row.objectHash !== input.hash || row.sizeBytes !== input.file.size || row.mime !== (input.file.type || 'application/octet-stream'))) {
    throw new Error('重新选择的文件与原上传不同，请恢复原文件或明确取消旧任务')
  }
  row ??= { clientUploadId: crypto.randomUUID(), clientMsgId: input.clientMsgId, assetId: null,
    phase: 'intent', dispatchState: 'ready', objectHash: input.hash, sizeBytes: input.file.size,
    mime: input.file.type || 'application/octet-stream', updatedAt: Date.now() }
  const checkpoint = async (patch: Partial<UploadCheckpoint>) => {
    guard()
    row = { ...row!, ...patch }
    await input.journal.save(row)
    guard()
    await input.onCheckpoint?.(row)
    guard()
  }
  await checkpoint({})
  let session: UploadSession
  if (existing) {
    try { session = await input.status(row.clientUploadId) }
    catch (error) {
      if ((error as { status?: number }).status !== 404 || row.phase !== 'intent') throw error
      guard()
      session = await input.register(row.clientUploadId)
    }
  } else session = await input.register(row.clientUploadId)
  guard()
  if (row.assetId !== null && row.assetId !== session.assetId) throw new Error('服务端恢复身份改变，已停止')
  if (session.state === 'confirmed') {
    await checkpoint({ assetId: session.assetId, phase: 'confirmed' })
    return row
  }
  if (session.state !== 'registered') throw new Error(`上传已终止：${session.state}`)
  await checkpoint({ assetId: session.assetId, phase: row.phase === 'uploaded' ? 'uploaded' : 'registered' })
  if (row.phase !== 'uploaded') {
    if (existing) { session = await input.renew(row.clientUploadId); guard() }
    if (session.state !== 'registered' || session.assetId !== row.assetId || session.uploadUrl === null) {
      throw new Error('服务端未返回同资产有效上传目标，已停止')
    }
    await input.put(session.uploadUrl)
    await checkpoint({ phase: 'uploaded' })
  }
  guard()
  await input.confirm(session.assetId, session.uploadRef)
  await checkpoint({ phase: 'confirmed' })
  return row
}

/** Legacy confirmed rows may already have sent; only an explicit ready checkpoint permits first dispatch. */
export function attachmentDispatchUnknown(row: UploadCheckpoint): boolean {
  return row.dispatchState === 'dispatch_intent' || (row.phase === 'confirmed' && row.dispatchState !== 'ready')
}
