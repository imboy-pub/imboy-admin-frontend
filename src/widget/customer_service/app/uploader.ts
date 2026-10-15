import { resumeUpload, uploadJournal } from '@/lib/attachmentUploadJournal'
/**
 * FE-W01：附件上传流水线（§3.7：hash → presign → 裸 PUT → confirm → 消息 asset_ids）。
 *
 * 合同要点：
 * - Web Crypto SHA-256（64 位小写 hex）→ presign `object_hash`（PUT 后服务端复核）；
 * - 裸 PUT：只带 Content-Type，不带 visit token / Cookie（credentials: 'omit'）；
 *   presign 响应无 PUT 目标（合同形状 opaque_token_no_url_no_object_key）→
 *   fail-closed 标记 failed（绝不自造端点、绝不落对象 key）；
 * - confirm 重新鉴权：409（重复 confirm）不伪成功 → failed；
 * - 只有消息 append（asset_ids）成功 → linked（唯一成功态）；
 * - 重试复用同一 client_msg_id（幂等键）与已算 hash。
 */
import { isValidSha256Hex, type PresignResult, type RequestScope } from './contract'
import {
  initialAttachmentItem,
  reduceAttachment,
  type AttachmentEvent,
  type AttachmentItem,
} from './attachmentMachine'
import { WidgetApiClient } from './widgetApi'

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
      const previous = journal.load(input.clientMsgId)
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
        status: (id) => input.deps.api.recoverAttachment(input.sessionId, input.scope, id, 'status'),
        renew: (id) => input.deps.api.recoverAttachment(input.sessionId, input.scope, id, 'renew'),
        put: (url) => barePutOrThrow({ assetId: '', uploadRef: '', uploadUrl: url }, input.file, input.deps),
        confirm: (id, ref) => input.deps.api.confirmRecoveredAttachment(input.sessionId, input.scope, id, ref),
      })
      requireCurrent(input.deps)
      item = { ...item, clientMsgId: row.clientMsgId, assetId: row.assetId, state: 'sending' }
      input.deps.onItem(item)
      if (previous?.phase === 'confirmed') {
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
      item = await ensureLinked(item, input.sessionId, input.scope, input.deps)
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
): Promise<{ item: AttachmentItem; result: PresignResult }> {
  // 重试且 ref 仍可用：不重复 presign（同一 hash + scope 服务端幂等）。
  if (item.assetId !== null && item.uploadRef !== null) {
    return { item, result: { assetId: item.assetId, uploadRef: item.uploadRef, uploadUrl: item.uploadUrl } }
  }
  if (item.objectHash === null) throw new PipelineFailure('缺少对象哈希（内部状态非法）')
  let presign: PresignResult
  try {
    requireCurrent(deps)
    presign = await deps.api.presignAttachment(sessionId, scope, {
      mime: item.mime,
      sizeBytes: item.sizeBytes,
      objectHash: item.objectHash,
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
      assetId: presign.assetId,
      uploadRef: presign.uploadRef,
      uploadUrl: presign.uploadUrl,
    },
    deps
  )
  return { item: next, result: presign }
}

async function ensureConfirmed(
  item: AttachmentItem,
  presign: PresignResult,
  file: Blob,
  sessionId: string,
  scope: RequestScope,
  deps: UploaderDeps
): Promise<AttachmentItem> {
  if (item.state !== 'confirming') return item
  await barePutOrThrow(presign, file, deps)
  try {
    requireCurrent(deps)
    await deps.api.confirmAttachment(sessionId, scope, presign.uploadRef)
  } catch (error) {
    reportCredentialRefusal(error, deps)
    const status = (error as { status?: number }).status
    // 重复 confirm 409 不伪成功（§3.7）：按失败处理，重试换新 ref。
    const reason = status === 409 ? 'confirm 冲突（409），请重试' : 'confirm 失败'
    throw new PipelineFailure(error instanceof Error && status !== 409 ? error.message : reason)
  }
  requireCurrent(deps)
  return dispatch(item, { type: 'confirm_succeeded', key: item.key }, deps)
}

/** 裸 PUT：https 目标 + 只带 Content-Type；无目标 → fail-closed（不自造端点）。 */
async function barePutOrThrow(presign: PresignResult, file: Blob, deps: UploaderDeps): Promise<void> {
  if (presign.uploadUrl === null) {
    throw new PipelineFailure('上传目标缺失（部署阶段未开放对象 PUT），已停止且未泄露任何存储引用')
  }
  let response: Response
  try {
    requireCurrent(deps)
    response = await deps.fetchImpl(presign.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' },
      credentials: 'omit',
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
  deps: UploaderDeps
): Promise<AttachmentItem> {
  if (item.state !== 'sending' || item.assetId === null) return item
  try {
    requireCurrent(deps)
    const message = await deps.api.sendMessage(sessionId, scope, item.clientMsgId, '', [item.assetId])
    requireCurrent(deps)
    return dispatch(item, { type: 'append_succeeded', key: item.key, messageId: message.id }, deps)
  } catch (error) {
    reportCredentialRefusal(error, deps)
    throw new PipelineFailure(error instanceof Error ? error.message : '附件消息发送失败')
  }
}
