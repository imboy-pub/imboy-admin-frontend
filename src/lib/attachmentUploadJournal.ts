import type { EntityId } from '@/types/common'

type UploadPhase = 'intent' | 'registered' | 'uploaded' | 'confirmed'

export type UploadCheckpoint = {
  journalId?: string
  clientUploadId: string
  clientMsgId: string
  assetId: EntityId | null
  /** C04 direct：服务端会话定位键（eb/<org>/<ws>/<ymd>/<hex><ext>）；
   * status/renew/confirm 全部以它寻址（client_upload_id 只是登记幂等键）。 */
  objectKey: string | null
  dispatchState?: 'ready' | 'dispatch_intent'
  phase: UploadPhase
  objectHash: string
  sizeBytes: number
  mime: string
  updatedAt: number
}

export type UploadSession = {
  objectKey: string
  sessionState: 'registered' | 'confirmed' | 'rejected'
  directState: string | null
  attemptId: number | null
  /** presign/renew 下发的上传目标；status 只读回查无 upload 块 → null。 */
  grant: DirectUploadGrant | null
  sessionDeadline: number | null
  /** renew 幂等终态（CONFIRMED 重放无新 attempt）。 */
  stateConfirmed: boolean
}

/** C04 direct 上传目标（presign/renew grant 权威投影；S3-only 硬合同——
 * api_byte/同源鉴权正文通道已退役，前端不再构造任何非 s3_put 目标）。 */
export type DirectUploadGrant = {
  kind: 's3_put'
  method: 'PUT'
  url: string
  headers: Record<string, string>
  expiresIn: number | null
}

/** 旧导出名兼容别名（seatApiClient 历史引用）。 */
export type SeatUploadSessionDescriptor = DirectUploadGrant

/** wire upload 块 / grant → DirectUploadGrant（fail-closed：形状非法即 throw）。 */
export function parseUploadDescriptor(raw: unknown): DirectUploadGrant {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new TypeError('上传 descriptor 非法')
  const row = raw as Record<string, unknown>
  if (row.transport !== undefined && row.transport !== 's3_put') throw new TypeError('上传目标传输类型非法（S3-only）')
  if (row.kind !== undefined && row.kind !== 's3_put') throw new TypeError('上传 descriptor kind 未知')
  if (row.method !== 'PUT') throw new TypeError('上传 descriptor method 必须为 PUT')
  if (typeof row.url !== 'string' || row.url.length === 0) throw new TypeError('上传 descriptor 缺少 url')
  assertS3UploadTarget(row.url)
  const headers = parseS3Headers(row.required_headers ?? row.headers)
  const expiresIn =
    typeof row.expires_in === 'number' && Number.isSafeInteger(row.expires_in) && row.expires_in > 0
      ? row.expires_in
      : null
  return { kind: 's3_put', method: 'PUT', url: row.url, headers, expiresIn }
}

/** S3 签名头白名单校验：接受 wire [{key,value}] 数组或已投影 Record。 */
function parseS3Headers(raw: unknown): Record<string, string> {
  const pairs: [string, string][] = []
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) throw new TypeError('S3 descriptor 包含非法签名头')
      const e = entry as Record<string, unknown>
      if (typeof e.key !== 'string' || typeof e.value !== 'string') throw new TypeError('S3 descriptor 包含非法签名头')
      pairs.push([e.key, e.value])
    }
  } else if (typeof raw === 'object' && raw !== null) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v !== 'string') throw new TypeError('S3 descriptor 包含非法签名头')
      pairs.push([k, v])
    }
  } else {
    throw new TypeError('S3 descriptor 缺少签名 headers')
  }
  const headers: Record<string, string> = {}
  const names = new Set<string>()
  for (const [name, value] of pairs) {
    const normalized = name.toLowerCase()
    if (!['content-type', 'x-amz-checksum-sha256'].includes(normalized) || names.has(normalized)
      || typeof value !== 'string' || !value.trim() || /\p{Cc}/u.test(value)) {
      throw new TypeError('S3 descriptor 包含非法或重复 header')
    }
    if (normalized === 'x-amz-checksum-sha256'
      && (!/^[A-Za-z0-9+/]{43}=$/.test(value) || btoa(atob(value)) !== value)) {
      throw new TypeError('S3 checksum 必须为 32 字节 Base64')
    }
    names.add(normalized)
    headers[name] = value
  }
  if (!names.has('x-amz-checksum-sha256')) throw new TypeError('S3 descriptor 缺少 checksum 签名头')
  return headers
}

/** C04 direct 会话响应 → UploadSession（presign/status/renew 统一投影）。
 * fail-closed：定位键/状态/传输类型形状非法即 throw（不猜、不回退）。 */
export function parseUploadSession(value: unknown): UploadSession {
  if (typeof value !== 'object' || value === null) throw new Error('上传会话响应非法')
  const row = value as Record<string, unknown>
  const objectKey = typeof row.object_key === 'string' ? row.object_key : ''
  if (objectKey.length === 0 || objectKey.length > 512 || objectKey.includes('..')) {
    throw new Error('上传会话定位键非法，已停止恢复')
  }
  // presign 视图 state 为 direct 原值（GRANTED），status/renew 视图为
  // 归一小写（registered/confirmed/rejected）——统一归一并收紧。
  const rawState = row.session_state
  const sessionState = rawState === 'GRANTED' ? 'registered' : rawState
  if (sessionState !== 'registered' && sessionState !== 'confirmed' && sessionState !== 'rejected') {
    throw new Error('上传会话状态未知，已停止恢复')
  }
  const directState = typeof row.direct_state === 'string' ? row.direct_state : null
  const attemptId =
    typeof row.attempt_id === 'number' && Number.isSafeInteger(row.attempt_id) && row.attempt_id >= 1
      ? row.attempt_id
      : null
  const sessionDeadline =
    typeof row.session_deadline === 'number' && Number.isSafeInteger(row.session_deadline)
      ? row.session_deadline
      : null
  const stateConfirmed = row.state_confirmed === true
  const upload = typeof row.upload === 'object' && row.upload !== null
    ? (row.upload as Record<string, unknown>)
    : null
  const grant = upload === null ? null : parseUploadDescriptor(upload)
  return { objectKey, sessionState, directState, attemptId, grant, sessionDeadline, stateConfirmed }
}

/** S3 PUT 目标门：https（本地 REAL_LOCAL 允许 localhost/127.0.0.1 的 http）、
 * 无内嵌凭证、无 hash 片段、无反斜杠——其余一律拒绝（不发请求）。 */
export function assertS3UploadTarget(url: string): void {
  const target = new URL(url)
  const isLocalHttp = target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname)
  if ((target.protocol !== 'https:' && !isLocalHttp) || target.username || target.password || target.hash
    || url.trim() !== url || url.includes('\\')) throw new TypeError('S3 上传目标非法')
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
      || (row.assetId !== null && !/^\d+$/.test(row.assetId))
      || (row.objectKey !== undefined && row.objectKey !== null
        && (typeof row.objectKey !== 'string' || row.objectKey.length === 0))) throw new Error('上传恢复记录损坏')
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
    const { journalId, clientUploadId, clientMsgId, assetId, objectKey, phase, dispatchState, objectHash, sizeBytes, mime } = row
    storage.setItem(taskKey(journalId ?? clientMsgId), JSON.stringify({ journalId: journalId ?? clientMsgId,
      clientUploadId, clientMsgId, assetId, objectKey: objectKey ?? null, phase, dispatchState, objectHash, sizeBytes, mime, updatedAt: Date.now() }))
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
          || (previous.assetId !== null && previous.assetId !== row.assetId)
          || (previous.objectKey !== null && row.objectKey !== previous.objectKey))) throw new Error('上传任务身份冲突')
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

/** C04 direct 恢复编排：journal 身份仍是 clientMsgId/clientUploadId，但服务端
 * 会话以 objectKey 寻址（status/renew/confirm），assetId 只能从 confirm 响应
 * 取得（direct 会话无预分配资产 id；CONFIRMED 后响应丢失 → confirm 幂等重放
 * 回读同一 active 行）。旧格式（upload_ref 形状）未确认记录 fail-closed 拒绝恢复。 */
export async function resumeUpload(input: {
  journal: ReturnType<typeof uploadJournal>
  file: Blob
  hash: string
  clientMsgId: string
  isCurrent: () => boolean
  register: (_clientUploadId: string) => Promise<UploadSession>
  status: (_objectKey: string) => Promise<UploadSession>
  renew: (_objectKey: string) => Promise<UploadSession>
  put: (_grant: DirectUploadGrant) => Promise<void>
  confirm: (_objectKey: string, _attemptId: number | null) => Promise<{ assetId: EntityId }>
  onCheckpoint?: (_row: UploadCheckpoint) => Promise<void>
}): Promise<UploadCheckpoint> {
  const guard = () => { if (!input.isCurrent()) throw new Error('上传身份或会话已变化') }
  guard()
  let row = input.journal.load(input.clientMsgId)
  const existing = row !== null
  if (row && (row.objectHash !== input.hash || row.sizeBytes !== input.file.size || row.mime !== (input.file.type || 'application/octet-stream'))) {
    throw new Error('重新选择的文件与原上传不同，请恢复原文件或明确取消旧任务')
  }
  if (row && row.phase !== 'confirmed' && row.objectKey === undefined) {
    // 旧格式（V5 upload_ref 形状）记录无 objectKey 键：服务端会话已按 direct
    // 协议重建——fail-closed 拒绝恢复（不重传，字节可能已上传过）。
    // 注意 objectKey === null 是本协议正常中间态（register 响应丢失 → intent）。
    throw new Error('旧格式上传记录无法恢复（服务端会话已按 direct 协议重建），请取消后重新发送')
  }
  row ??= { clientUploadId: crypto.randomUUID(), clientMsgId: input.clientMsgId, assetId: null,
    objectKey: null, phase: 'intent', dispatchState: 'ready', objectHash: input.hash, sizeBytes: input.file.size,
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
  let reRegistered = false
  if (existing) {
    if (!row.objectKey) {
      // objectKey 缺失（null=direct 行会话键未落定/undefined=V5 断代行）：
      //   * confirmed → 资产身份已在本地 checkpoint（此前 confirm 成功）——
      //     零网络续用（不重传/不重放/不重发）；
      //   * intent → register 响应丢失，同 clientUploadId 重新登记（新会话，
      //     旧 RESERVED 行由 deadline GC 兜底；新会话自带 grant，无需 renew）；
      //   * 其余（registered/uploaded 无键）→ 无法寻址，fail-closed 拒绝恢复。
      if (row.phase === 'confirmed') {
        await checkpoint({ phase: 'confirmed' })
        return row
      }
      if (row.objectKey === null && row.phase === 'intent') {
        reRegistered = true
        session = await input.register(row.clientUploadId)
      } else {
        throw new Error('旧格式上传记录无法恢复（服务端会话已按 direct 协议重建），请取消后重新发送')
      }
    } else {
      try { session = await input.status(row.objectKey) }
      catch (error) {
        if ((error as { status?: number }).status !== 404 || row.phase !== 'intent') throw error
        guard()
        session = await input.register(row.clientUploadId)
      }
    }
  } else session = await input.register(row.clientUploadId)
  guard()
  if (row.objectKey === null || row.objectKey === undefined) {
    await checkpoint({ objectKey: session.objectKey })
  } else if (row.objectKey !== session.objectKey) {
    throw new Error('服务端会话定位键改变，已停止')
  }
  // CONFIRMED 幂等重放：响应丢失恢复时从 confirm 回读同一 active 行取 assetId。
  // journal 行已持有 assetId（此前 confirm 成功）→ 无需重放，直接续用。
  if (session.sessionState === 'confirmed' || session.stateConfirmed) {
    if (row.assetId !== null) {
      await checkpoint({ phase: 'confirmed' })
      return row
    }
    const confirmed = await input.confirm(session.objectKey, session.attemptId)
    await checkpoint({ assetId: confirmed.assetId, phase: 'confirmed' })
    return row
  }
  if (session.sessionState !== 'registered') throw new Error(`上传已终止：${session.sessionState}`)
  await checkpoint({ phase: row.phase === 'uploaded' ? 'uploaded' : 'registered' })
  if (row.phase !== 'uploaded') {
    if (existing && !reRegistered) {
      // 恢复 = 服务端新 attempt（旧 attempt 目标不重用；expected sha 复用冻结声明）。
      session = await input.renew(row.objectKey!)
      guard()
      if (session.stateConfirmed || session.sessionState === 'confirmed') {
        const confirmed = await input.confirm(session.objectKey, session.attemptId)
        await checkpoint({ assetId: confirmed.assetId, phase: 'confirmed' })
        return row
      }
      if (session.sessionState !== 'registered') throw new Error(`上传已终止：${session.sessionState}`)
    }
    if (session.grant === null) throw new Error('服务端未返回有效上传目标，已停止')
    await input.put(session.grant)
    await checkpoint({ phase: 'uploaded' })
  }
  guard()
  const confirmed = await input.confirm(row.objectKey!, session.attemptId)
  await checkpoint({ assetId: confirmed.assetId, phase: 'confirmed' })
  return row
}

/** Legacy confirmed rows may already have sent; only an explicit ready checkpoint permits first dispatch.
 * confirmed 且 dispatchState 非 ready（dispatch_intent 或旧记录缺失）= 消息结果未知，
 * 不可安全重发——调用方只能查询真源（V5-CX03 语义）。 */
export function attachmentDispatchUnknown(row: UploadCheckpoint): boolean {
  return row.phase === 'confirmed' && row.dispatchState !== 'ready'
}
