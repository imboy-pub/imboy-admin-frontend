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

export type FetchLike = (_input: string, _init?: RequestInit) => Promise<Response>

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

export type UploaderDeps = {
  api: WidgetApiClient
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
  if (next !== item) deps.onItem(next)
  return next
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
    item = await ensureHash(item, input.file, input.deps)
    const presigned = await ensurePresign(item, input.sessionId, input.scope, input.deps)
    item = await ensureConfirmed(presigned.item, presigned.result, input.file, input.sessionId, input.scope, input.deps)
    item = await ensureLinked(item, input.sessionId, input.scope, input.deps)
    return item
  } catch (error) {
    const reason = error instanceof PipelineFailure ? error.message : '附件上传失败'
    return dispatch(item, { type: 'step_failed', key: item.key, reason }, input.deps)
  }
}

async function ensureHash(item: AttachmentItem, file: Blob, deps: UploaderDeps): Promise<AttachmentItem> {
  if (item.objectHash !== null) return item
  const hash = await blobSha256Hex(file)
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
    presign = await deps.api.presignAttachment(sessionId, scope, {
      mime: item.mime,
      sizeBytes: item.sizeBytes,
      objectHash: item.objectHash,
    })
  } catch (error) {
    throw new PipelineFailure(error instanceof Error ? error.message : 'presign 失败')
  }
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
    await deps.api.confirmAttachment(sessionId, scope, presign.uploadRef)
  } catch (error) {
    const status = (error as { status?: number }).status
    // 重复 confirm 409 不伪成功（§3.7）：按失败处理，重试换新 ref。
    const reason = status === 409 ? 'confirm 冲突（409），请重试' : 'confirm 失败'
    throw new PipelineFailure(error instanceof Error && status !== 409 ? error.message : reason)
  }
  return dispatch(item, { type: 'confirm_succeeded', key: item.key }, deps)
}

/** 裸 PUT：https 目标 + 只带 Content-Type；无目标 → fail-closed（不自造端点）。 */
async function barePutOrThrow(presign: PresignResult, file: Blob, deps: UploaderDeps): Promise<void> {
  if (presign.uploadUrl === null) {
    throw new PipelineFailure('上传目标缺失（部署阶段未开放对象 PUT），已停止且未泄露任何存储引用')
  }
  let response: Response
  try {
    response = await deps.fetchImpl(presign.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' },
      credentials: 'omit',
    })
  } catch {
    throw new PipelineFailure('附件字节上传失败（网络）')
  }
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
    const message = await deps.api.sendMessage(sessionId, scope, item.clientMsgId, '', [item.assetId])
    return dispatch(item, { type: 'append_succeeded', key: item.key, messageId: message.id }, deps)
  } catch (error) {
    throw new PipelineFailure(error instanceof Error ? error.message : '附件消息发送失败')
  }
}
