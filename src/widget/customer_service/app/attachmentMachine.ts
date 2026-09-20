/**
 * FE-W01：附件上传状态机（§3.7 冻结合同的 UI 映射，纯函数、不可变）。
 *
 * UI 状态映射（计划 FE-W01-A04）：pending → confirming → sending → linked | failed。
 * - pending：文件已选定，hash/presign 进行中；
 * - confirming：presign 已签发 upload_ref，裸 PUT + confirm CAS 进行中；
 * - sending：confirm 成功（asset active/unbound），消息 asset_ids 绑定进行中；
 * - linked：消息已创建且 asset 绑定成功——**只有 linked 才显示成功**；
 * - failed：任一步失败（不伪成功；重试复用同一 client_msg_id 幂等键）。
 *
 * 不变量：
 * - 非法跃迁一律忽略（fail-closed，不猜测）；
 * - client_msg_id 在 retry_reset 后保持不变（幂等键复用）；
 * - 上传 ref / 对象 key / presigned URL 绝不进入展示字段。
 */

export type AttachmentUiState = 'pending' | 'confirming' | 'sending' | 'linked' | 'failed'

export type AttachmentItem = {
  /** 本地列表键（= 消息 key，稳定跨重试）。 */
  key: string
  /** 幂等键：跨重试不变（§3.7 同一 client_msg_id 幂等）。 */
  clientMsgId: string
  name: string
  mime: string
  sizeBytes: number
  /** 64 位小写 hex SHA-256（Web Crypto 计算；缓存跨重试）。 */
  objectHash: string | null
  assetId: string | null
  uploadRef: string | null
  /** presign 返回的裸 PUT 目标（https）；合同当前形状可能没有 URL。 */
  uploadUrl: string | null
  messageId: string | null
  state: AttachmentUiState
  failureReason: string | null
}

export type AttachmentEvent =
  | { type: 'hash_computed'; key: string; objectHash: string }
  | { type: 'presign_succeeded'; key: string; assetId: string; uploadRef: string; uploadUrl: string | null }
  | { type: 'confirm_succeeded'; key: string }
  | { type: 'append_succeeded'; key: string; messageId: string }
  | { type: 'step_failed'; key: string; reason: string }
  | { type: 'retry_reset'; key: string }

/** 初始条目（pending 起点；objectHash 由 hash_computed 填充）。 */
export function initialAttachmentItem(input: {
  key: string
  clientMsgId: string
  name: string
  mime: string
  sizeBytes: number
}): AttachmentItem {
  return {
    key: input.key,
    clientMsgId: input.clientMsgId,
    name: input.name,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    objectHash: null,
    assetId: null,
    uploadRef: null,
    uploadUrl: null,
    messageId: null,
    state: 'pending',
    failureReason: null,
  }
}

/** linked/failed 为终态；linked 是唯一成功态。 */
export function isTerminalAttachmentState(state: AttachmentUiState): boolean {
  return state === 'linked' || state === 'failed'
}

function withItem(item: AttachmentItem, patch: Partial<AttachmentItem>): AttachmentItem {
  return { ...item, ...patch }
}

/** 纯归约：非法跃迁原样返回（fail-closed）。 */
export function reduceAttachment(item: AttachmentItem, event: AttachmentEvent): AttachmentItem {
  if (event.key !== item.key) return item
  switch (event.type) {
    case 'hash_computed':
      if (item.state !== 'pending' || item.objectHash !== null) return item
      return withItem(item, { objectHash: event.objectHash })
    case 'presign_succeeded':
      if (item.state !== 'pending') return item
      return withItem(item, {
        state: 'confirming',
        assetId: event.assetId,
        uploadRef: event.uploadRef,
        uploadUrl: event.uploadUrl,
      })
    case 'confirm_succeeded':
      if (item.state !== 'confirming') return item
      return withItem(item, { state: 'sending' })
    case 'append_succeeded':
      if (item.state !== 'sending') return item
      return withItem(item, { state: 'linked', messageId: event.messageId, failureReason: null })
    case 'step_failed':
      if (isTerminalAttachmentState(item.state)) return item
      return withItem(item, { state: 'failed', failureReason: event.reason })
    case 'retry_reset':
      // 重试：回到 pending 重跑流水线；幂等键（clientMsgId）与已算 hash 复用。
      if (item.state !== 'failed') return item
      return withItem(item, { state: 'pending', failureReason: null })
    default:
      return item
  }
}
