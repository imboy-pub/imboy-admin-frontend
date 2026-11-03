import { assertS3UploadTarget, attachmentDispatchUnknown, resumeUpload, uploadJournal, type DirectUploadGrant, type UploadSession } from '@/lib/attachmentUploadJournal'
/**
 * FE-W01：附件上传流水线（§3.7：hash → presign → 裸 PUT → confirm → 消息 asset_ids）。
 *
 * 合同要点（V3-C04 direct，S3-only）：
 * - Web Crypto SHA-256（64 位小写 hex）→ presign `object_hash`（声明冻结）；
 * - 裸 PUT：精确发送 grant.required_headers 签名头，不带业务凭据，禁止重定向；
 *   presign/renew 无有效 grant → fail-closed 标记 failed（绝不自造端点）；
 * - confirm(object_key, attempt_id) 重新鉴权；CONFIRMED 重放幂等回读；
 * - 只有消息 append（asset_ids）成功 → linked（唯一成功态）；
 * - 重试复用同一 client_msg_id（幂等键）与已算 hash（object_key 复用会话）。
 */
import { isValidSha256Hex, type RequestScope } from './contract'
import {
  initialAttachmentItem,
  reduceAttachment,
  type AttachmentEvent,
  type AttachmentItem,
} from './attachmentMachine'
import { isDefiniteMessageRefusal, WidgetApiClient } from './widgetApi'

type FetchLike = (_input: string, _init?: RequestInit) => Promise<Response>

/** Web Crypto SHA-256 → 64 位小写 hex。 */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex: string[] = []
  for (const byte of new Uint8Array(digest)) hex.push(byte.toString(16).padStart(2, '0'))
  return hex.join('')
}

export async function blobSha256Hex(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer())
}

type UploaderDeps = {
  api: WidgetApiClient
  isCurrent?: () => boolean
  onCredentialRefused?: () => void
  /** 裸 PUT 通道（与 API 客户端同 fetch 注入口，测试替换）。 */
  fetchImpl: FetchLike
  onItem: (_item: AttachmentItem) => void
}

class PipelineFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PipelineFailure'
  }
}

function dispatch(item: AttachmentItem, event: AttachmentEvent, deps: UploaderDeps): AttachmentItem {
  const next = reduceAttachment(item, event)
  if (next !== item && (deps.isCurrent?.() ?? true)) deps.onItem(next)
  return next
}

function reportCredentialRefusal(error: unknown, deps: UploaderDeps): void {
  const status = (error as { status?: number } | null)?.status
  if ((status === 401 || status === 403) && (deps.isCurrent?.() ?? true)) deps.onCredentialRefused?.()
}

function requireCurrent(deps: UploaderDeps): void {
  if (!(deps.isCurrent?.() ?? true)) throw new PipelineFailure('会话已变化，上传结果未确认；请重新接入')
}

/**
 * 运行单附件流水线到终态（linked | failed）。
 * `existing` 非空 = 重试：复用其 clientMsgId / objectHash / assetId（若仍有效）。
 */
export async function runAttachmentPipeline(input: {
  sessionId: string
  scope: RequestScope
  file: Blob
  clientMsgId: string
  deps: UploaderDeps
  existing?: AttachmentItem | null
  durable?: boolean
  principalId?: string
}): Promise<AttachmentItem> {
  let item: AttachmentItem =
    input.existing ??
    initialAttachmentItem({
      key: `local-${input.clientMsgId}`,
      clientMsgId: input.clientMsgId,
      name: input.file instanceof File ? input.file.name : 'attachment',
      mime: input.file.type.length > 0 ? input.file.type : 'application/octet-stream',
      sizeBytes: input.file.size,
    })
  if (item.state === 'failed') {
    item = dispatch(item, { type: 'retry_reset', key: item.key }, input.deps)
  }
  try {
    requireCurrent(input.deps)
    item = await ensureHash(item, input.file, input.deps)
    if (input.durable) {
      if (!input.principalId) throw new PipelineFailure('缺少上传恢复主体，已停止')
      const current = () => input.deps.isCurrent?.() ?? true
      const journal = uploadJournal(['widget', input.principalId ?? '', input.scope.installationId, input.sessionId], current)
      return await journal.run(input.clientMsgId, async () => {
      const row = await resumeUpload({ journal, file: input.file, hash: item.objectHash!, clientMsgId: input.clientMsgId,
        isCurrent: current,
        onCheckpoint: async (checkpoint) => {
          requireCurrent(input.deps)
          if (checkpoint.phase !== 'intent') {
            item = { ...item, assetId: checkpoint.assetId,
              state: checkpoint.phase === 'confirmed' ? 'sending' : 'confirming' }
            input.deps.onItem(item)
          }
        },
        register: (clientUploadId) => input.deps.api.registerAttachment(input.sessionId, input.scope,
          { clientUploadId, mime: item.mime, sizeBytes: item.sizeBytes, objectHash: item.objectHash! }),
        status: (objectKey) => input.deps.api.recoverAttachment(input.sessionId, input.scope, objectKey, 'status'),
        renew: (objectKey) => input.deps.api.recoverAttachment(input.sessionId, input.scope, objectKey, 'renew'),
        put: (grant: DirectUploadGrant) => barePutOrThrow(grant, input.file, input.deps),
        confirm: (objectKey, attemptId) =>
          input.deps.api.confirmAttachment(input.sessionId, input.scope, objectKey, attemptId),
      })
      requireCurrent(input.deps)
      item = { ...item, clientMsgId: row.clientMsgId, assetId: row.assetId, state: 'sending' }
      input.deps.onItem(item)
      if (attachmentDispatchUnknown(row)) {
        let afterId: string | null = null
        for (let page = 0; page < 20; page += 1) {
          requireCurrent(input.deps)
          const messages = await input.deps.api.listMessages(input.sessionId, input.scope, afterId)
          requireCurrent(input.deps)
          let cursor = BigInt(afterId ?? '0')
          for (const message of messages) {
            if (!/^\d+$/.test(message.id) || BigInt(message.id) <= cursor) throw new PipelineFailure('恢复分页游标未前进')
            cursor = BigInt(message.id)
          }
          const found = messages.find((message) => message.clientMsgId === row.clientMsgId
            && message.senderContactId === input.principalId && message.assets.length === 1 && message.assets[0]?.id === row.assetId)
          if (found) {
            item = dispatch(item, { type: 'append_succeeded', key: item.key, messageId: found.id }, input.deps)
            await journal.remove(row.clientMsgId, row.clientUploadId)
            return item
          }
          if (messages.length === 0) break
          const next = messages[messages.length - 1]!.id
          if (!/^\d+$/.test(next) || (afterId !== null && BigInt(next) <= BigInt(afterId))) throw new PipelineFailure('恢复分页游标未前进')
          afterId = next
        }
        throw new PipelineFailure('消息结果仍未知，请继续查询原任务')
      }
      await journal.save({ ...row, dispatchState: 'dispatch_intent' })
      requireCurrent(input.deps)
      item = await ensureLinked(item, input.sessionId, input.scope, input.deps,
        () => journal.acknowledgeRefusal(row.clientMsgId, row.clientUploadId))
      if (item.state === 'linked') await journal.remove(row.clientMsgId, row.clientUploadId)
      return item
      })
    }
    const presigned = await ensurePresign(item, input.sessionId, input.scope, input.deps)
    item = await ensureConfirmed(presigned.item, presigned.result, input.file, input.sessionId, input.scope, input.deps)
    item = await ensureLinked(item, input.sessionId, input.scope, input.deps)
    return item
  } catch (error) {
    reportCredentialRefusal(error, input.deps)
    const reason = error instanceof PipelineFailure ? error.message : '附件上传失败'
    return dispatch(item, { type: 'step_failed', key: item.key, reason }, input.deps)
  }
}

async function ensureHash(item: AttachmentItem, file: Blob, deps: UploaderDeps): Promise<AttachmentItem> {
  if (item.objectHash !== null) return item
  requireCurrent(deps)
  const hash = await blobSha256Hex(file)
  requireCurrent(deps)
  if (!isValidSha256Hex(hash)) throw new PipelineFailure('SHA-256 计算结果形状非法')
  return dispatch(item, { type: 'hash_computed', key: item.key, objectHash: hash }, deps)
}

async function ensurePresign(
  item: AttachmentItem,
  sessionId: string,
  scope: RequestScope,
  deps: UploaderDeps
): Promise<{ item: AttachmentItem; result: UploadSession }> {
  // 重试且会话仍可用：不重复 register（同 object_key 服务端幂等回查）。
  if (item.objectKey !== null) {
    const session = await deps.api
      .recoverAttachment(sessionId, scope, item.objectKey, 'status')
      .catch(() => null)
    if (session !== null && session.sessionState === 'registered') {
      return { item, result: session }
    }
  }
  if (item.objectHash === null) throw new PipelineFailure('缺少对象哈希（内部状态非法）')
  let session: UploadSession
  try {
    requireCurrent(deps)
    session = await deps.api.registerAttachment(sessionId, scope, {
      mime: item.mime,
      sizeBytes: item.sizeBytes,
      objectHash: item.objectHash,
      clientUploadId: crypto.randomUUID(),
    })
  } catch (error) {
    reportCredentialRefusal(error, deps)
    throw new PipelineFailure(error instanceof Error ? error.message : 'presign 失败')
  }
  requireCurrent(deps)
  const next = dispatch(
    item,
    {
      type: 'presign_succeeded',
      key: item.key,
      objectKey: session.objectKey,
    },
    deps
  )
  return { item: next, result: session }
}

async function ensureConfirmed(
  item: AttachmentItem,
  session: UploadSession,
  file: Blob,
  sessionId: string,
  scope: RequestScope,
  deps: UploaderDeps
): Promise<AttachmentItem> {
  if (item.state !== 'confirming') return item
  let grant = session.grant
  let attemptId = session.attemptId
  if (grant === null) {
    // 重试路径无 grant（status 回查）→ renew 换新 attempt + 新 staging descriptor。
    const renewed = await deps.api.recoverAttachment(sessionId, scope, session.objectKey, 'renew')
    if (renewed.stateConfirmed || renewed.sessionState === 'confirmed') {
      return await confirmReplay(item, sessionId, scope, renewed, deps)
    }
    if (renewed.grant === null) throw new PipelineFailure('服务端未返回有效上传目标，已停止')
    grant = renewed.grant
    attemptId = renewed.attemptId
  }
  await barePutOrThrow(grant, file, deps)
  try {
    requireCurrent(deps)
    const confirmed = await deps.api.confirmAttachment(sessionId, scope, session.objectKey, attemptId)
    requireCurrent(deps)
    return dispatch(item, { type: 'confirm_succeeded', key: item.key, assetId: confirmed.assetId }, deps)
  } catch (error) {
    reportCredentialRefusal(error, deps)
    throw new PipelineFailure(error instanceof Error ? error.message : 'confirm 失败')
  }
}

/** CONFIRMED 幂等重放：confirm 回读同一 active 行（响应丢失恢复）。 */
async function confirmReplay(
  item: AttachmentItem,
  sessionId: string,
  scope: RequestScope,
  session: UploadSession,
  deps: UploaderDeps
): Promise<AttachmentItem> {
  requireCurrent(deps)
  const confirmed = await deps.api.confirmAttachment(sessionId, scope, session.objectKey, session.attemptId)
  requireCurrent(deps)
  return dispatch(item, { type: 'confirm_succeeded', key: item.key, assetId: confirmed.assetId }, deps)
}

/** 裸 PUT：https（本地 localhost/127.0.0.1 http）+ 精确签名头；无 grant 即停止。 */
async function barePutOrThrow(grant: DirectUploadGrant, file: Blob, deps: UploaderDeps): Promise<void> {
  assertS3UploadTarget(grant.url)
  let response: Response
  try {
    requireCurrent(deps)
    response = await deps.fetchImpl(grant.url, {
      method: grant.method,
      body: file,
      headers: grant.headers,
      credentials: 'omit',
      redirect: 'error',
    })
  } catch {
    throw new PipelineFailure('附件字节上传失败（网络）')
  }
  requireCurrent(deps)
  if (!response.ok) throw new PipelineFailure(`附件字节上传失败（HTTP ${response.status}）`)
}

async function ensureLinked(
  item: AttachmentItem,
  sessionId: string,
  scope: RequestScope,
  deps: UploaderDeps,
  acknowledgeRefusal?: () => Promise<void>
): Promise<AttachmentItem> {
  if (item.state !== 'sending' || item.assetId === null) return item
  try {
    requireCurrent(deps)
    const message = await deps.api.sendMessage(sessionId, scope, item.clientMsgId, '', [item.assetId])
    requireCurrent(deps)
    return dispatch(item, { type: 'append_succeeded', key: item.key, messageId: message.id }, deps)
  } catch (error) {
    reportCredentialRefusal(error, deps)
    if (isDefiniteMessageRefusal(error)) await acknowledgeRefusal?.()
    throw new PipelineFailure(error instanceof Error ? error.message : '附件消息发送失败')
  }
}
