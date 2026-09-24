/**
 * CS-WEB-02：坐席附件上传编排（hash → presign → 裸 PUT → confirm）。
 *
 * 协议链与 widget 侧 uploader.ts 同构（BE-PATCH-01 已在 widget 面实证的顺序），
 * 本模块把它冻结为纯函数编排，供 useSeatSend 在发送前调用：
 * 1. Web Crypto SHA-256（64 位小写 hex）→ presign `object_hash`（PUT 后服务端复核）；
 * 2. presign（冻结字段 {conversation_id, mime, size_bytes, object_hash, file_name?}）；
 * 3. 裸 PUT 到 presign 下发的 `upload.url`（只带 Content-Type，无 JWT/Cookie）；
 *    url 缺失（部署未开放对象 PUT）→ fail-closed 终止，绝不自造端点；
 * 4. confirm(upload_ref)：重复 confirm 409 不伪成功——由调用方按失败处理；
 * 5. 返回 {assetId, objectHash}——消息发送（asset_ids）由调用方执行，
 *    同 client_msg_id 幂等；重试时已 confirm 的 assetId 直接复用（不重复上传）。
 *
 * mime/size 合法性完全由服务端裁决（presign 422 语义透传）；前端不设
 * mime/size 白名单（提示性信息不替代服务端校验）。
 */
import type { SeatWorkbenchApi } from './workbenchApi'
import type { EntityId } from '../types'

/** Web Crypto SHA-256 → 64 位小写 hex（presign object_hash 冻结形状）。 */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex: string[] = []
  for (const byte of new Uint8Array(digest)) hex.push(byte.toString(16).padStart(2, '0'))
  return hex.join('')
}

export async function blobSha256Hex(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer())
}

export function isValidSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value)
}

/** 上传目标缺失（部署未开放对象 PUT）：fail-closed，不携带任何存储引用出站。 */
export class SeatUploadTargetMissingError extends Error {
  constructor() {
    super('上传目标缺失（部署未开放对象 PUT），已停止且未泄露任何存储引用')
    this.name = 'SeatUploadTargetMissingError'
  }
}

export type SeatAttachmentUploadInput = {
  api: SeatWorkbenchApi
  orgId: EntityId
  conversationId: EntityId
  workspaceId: EntityId
  file: Blob
  /** 展示文件名（随凭证进 PUT 登记与历史 assets[].file_name 投影；可选）。 */
  fileName?: string | null
  /** 重试复用（首次已算的 hash 不重算）；null/undefined = 现算。 */
  objectHash?: string | null
}

export type SeatAttachmentUploadResult = {
  assetId: EntityId
  objectHash: string
}

/**
 * 运行上传编排到 confirm 终态（消息发送不在内——顺序钉死由测试覆盖）。
 * 任一步失败即抛 SeatApiError / SeatUploadTargetMissingError，不产生半调用。
 */
export async function runSeatAttachmentUpload(
  input: SeatAttachmentUploadInput,
): Promise<SeatAttachmentUploadResult> {
  const objectHash = input.objectHash ?? (await blobSha256Hex(input.file))
  if (!isValidSha256Hex(objectHash)) throw new TypeError('SHA-256 计算结果形状非法')
  const presign = await input.api.requestAssetPresign(input.orgId, input.conversationId, input.workspaceId, {
    mime: input.file.type.length > 0 ? input.file.type : 'application/octet-stream',
    sizeBytes: input.file.size,
    objectHash,
    fileName: input.fileName ?? null,
  })
  if (presign.uploadUrl === null) throw new SeatUploadTargetMissingError()
  await input.api.uploadAssetBytes(presign.uploadUrl, input.file)
  await input.api.confirmAssetUpload(input.orgId, input.workspaceId, presign.uploadRef)
  return { assetId: presign.assetId, objectHash }
}
