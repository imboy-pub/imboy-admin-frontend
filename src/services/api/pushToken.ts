/**
 * 推送 Token 管理 API（`/api/adm/admin/push_token/list`）。
 *
 * ⚠️ 安全边界（FULL-04 追加必修项，A0 2026-09-22 裁定）：
 * 推送 token（FCM token / JPush RegistrationID）是**设备凭据** —— 持有即可向该设备
 * 推任意通知。因此 Admin 取数面固定为「**永不携带明文 token**」：
 *
 *  1. `listPushTokens()` 在**服务层**就剥离响应里的 `token`，只派生一个**不可逆
 *     短指纹**（`md5(token)` 前 8 位 hex + 原长度），供「同一设备是否换过 token」
 *     这类运维判读；指纹**不可用于推送**，也不可反推。
 *  2. 返回类型 `PushTokenView` **没有** `token` 字段 —— 页面在类型层面就拿不到明文
 *     （结构性无 hydration，而不是「约定不要用」）。
 *  3. 后端当前仍在 SELECT 里返回 `token`（`push_token_repo:list_page/2`）→ 已按
 *     `PENDING_A0_WIRING` 交 A0 去掉该列；在前端剥离落地期间，本层是最内层防线，
 *     且 `rawTokenStrippedCount()` 会把「后端仍在回传明文」计数留痕。
 *
 * 基线判定（先查是否「本来有意给运维看」，证据见 checkpoints/FULL-04.md §2.x）：
 * 仓内没有任何能力依赖明文 token —— 唯一消费点是 `PushTokenListPage` 的
 * 「截断展示 + `title` 悬浮完整值」，两者都是**纯展示**；统计与搜索只用
 * `platform` / `user_id` / `device_type`。故剥离无功能损失。
 */
import { md5 } from 'js-md5'
import client from './client'
import { requireApiPayload } from './responseAdapter'
import type { EntityId } from '@/types/common'

/** 页面可见的推送 token 视图：**无明文 token 字段**。 */
export interface PushTokenView {
  user_id: EntityId
  device_id: string
  device_type: string
  platform: string
  /** 不可逆指纹（`md5` 前 8 位 + 原长），仅用于运维比对，**不可用于推送**。 */
  token_fingerprint: string
  created_at: string
  updated_at: string
}

/** 后端当前响应形状（含明文 token）——只在本模块内部出现。 */
interface RawPushToken {
  user_id?: unknown
  device_id?: unknown
  device_type?: unknown
  platform?: unknown
  token?: unknown
  created_at?: unknown
  updated_at?: unknown
}

export interface PushTokenListResponse {
  list: PushTokenView[]
  total: number
  page: number
  size: number
}

/** 明文 token 被剥离的字段计数（证据用：>0 表示后端投影尚未修正）。 */
let strippedTokenCount = 0

export function rawTokenStrippedCount(): number {
  return strippedTokenCount
}

export function resetRawTokenStrippedCount(): void {
  strippedTokenCount = 0
}

function toStr(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * 不可逆短指纹：`md5(token)` 前 8 位 hex + 原长度。
 *
 * - **不可用于推送**（推送需要完整 token）；
 * - 不可由指纹反推 token（md5 单向 + 只暴露 8 位）；
 * - 长度保留使「同一设备换没换 token」在运维上可判读。
 */
export function tokenFingerprint(token: string): string {
  if (token.length === 0) return ''
  return `${md5(token).slice(0, 8)}:${token.length}`
}

/** 单行投影：剥离明文 token，派生指纹。 */
export function toPushTokenView(raw: unknown): PushTokenView | null {
  if (raw === null || typeof raw !== 'object') return null
  const row = raw as RawPushToken
  const token = toStr(row.token)
  if (token.length > 0) strippedTokenCount += 1
  return {
    user_id: toStr(row.user_id) as EntityId,
    device_id: toStr(row.device_id),
    device_type: toStr(row.device_type),
    platform: toStr(row.platform),
    token_fingerprint: tokenFingerprint(token),
    created_at: toStr(row.created_at),
    updated_at: toStr(row.updated_at),
  }
}

export function pushTokenQueryKey(page: number, size: number) {
  return ['push-token', 'list', page, size] as const
}

export async function listPushTokens(page: number, size: number): Promise<PushTokenListResponse> {
  const res = await client.get('/admin/push_token/list', { params: { page, size } })
  const payload = requireApiPayload<{ list?: unknown[]; total?: unknown; page?: unknown; size?: unknown }>(
    res.data,
    'push_token/list'
  )
  const rawList = Array.isArray(payload.list) ? payload.list : []
  const list = rawList
    .map((row) => toPushTokenView(row))
    .filter((row): row is PushTokenView => row !== null)
  return {
    list,
    total: typeof payload.total === 'number' ? payload.total : list.length,
    page: typeof payload.page === 'number' ? payload.page : page,
    size: typeof payload.size === 'number' ? payload.size : size,
  }
}
