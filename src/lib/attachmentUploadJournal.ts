import type { EntityId } from '@/types/common'

export type UploadPhase = 'intent' | 'registered' | 'uploaded' | 'confirmed'
export type UploadCheckpoint = {
  clientUploadId: string
  clientMsgId: string
  assetId: EntityId | null
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
  const journal = {
    async run<T>(id: string, operation: () => Promise<T>): Promise<T> {
      return browserTaskLock(`${taskKey(id)}:operation`, async () => { guard(); return operation() })
    },
    load(id: string): UploadCheckpoint | null {
      guard()
      const raw = storage.getItem(taskKey(id))
      if (raw === null) return null
      const value: unknown = JSON.parse(raw)
      if (typeof value !== 'object' || value === null) throw new Error('上传恢复记录损坏')
      const row = value as UploadCheckpoint
      if (!/^[0-9a-f-]{36}$/i.test(row.clientUploadId) || !/^[0-9a-f]{64}$/.test(row.objectHash)
        || !['intent', 'registered', 'uploaded', 'confirmed'].includes(row.phase)
        || row.clientMsgId !== id || typeof row.mime !== 'string'
        || !Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0
        || (row.assetId !== null && !/^\d+$/.test(row.assetId))) throw new Error('上传恢复记录损坏')
      return row
    },
    list(): UploadCheckpoint[] {
      guard()
      const rows: UploadCheckpoint[] = []
      for (let i = 0; i < storage.length; i += 1) {
        const name = storage.key(i)
        if (name?.startsWith(`${key}:`)) {
          const row = journal.load(decodeURIComponent(name.slice(key.length + 1)))
          if (row !== null) rows.push(row)
        }
      }
      return rows
    },
    async save(row: UploadCheckpoint): Promise<void> {
      await lock(taskKey(row.clientMsgId), () => {
      guard()
      const previous = journal.load(row.clientMsgId)
      if (previous && (previous.clientUploadId !== row.clientUploadId || previous.objectHash !== row.objectHash
        || previous.sizeBytes !== row.sizeBytes || previous.mime !== row.mime
        || (previous.assetId !== null && previous.assetId !== row.assetId))) throw new Error('上传任务身份冲突')
      const phases: UploadPhase[] = ['intent', 'registered', 'uploaded', 'confirmed']
      if (previous && phases.indexOf(previous.phase) > phases.indexOf(row.phase)) throw new Error('上传任务已由其他页面推进')
      const { clientUploadId, clientMsgId, assetId, phase, objectHash, sizeBytes, mime } = row
      storage.setItem(taskKey(row.clientMsgId), JSON.stringify({ clientUploadId, clientMsgId, assetId, phase, objectHash, sizeBytes, mime, updatedAt: Date.now() }))
      guard()
      })
    },
    async remove(clientMsgId: string, clientUploadId: string): Promise<void> {
      await lock(taskKey(clientMsgId), () => {
        guard()
        const previous = journal.load(clientMsgId)
        if (previous !== null && previous.clientUploadId !== clientUploadId) throw new Error('上传任务身份冲突，未删除')
        storage.removeItem(taskKey(clientMsgId))
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
    phase: 'intent', objectHash: input.hash, sizeBytes: input.file.size,
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
