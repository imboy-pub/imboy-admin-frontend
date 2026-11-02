/**
 * V3-27 快捷回复子能力：Seat 域合同层（wire 形状 ↔ 强类型投影 + 路径构造器）。
 *
 * 合同真源：.task-state/imboy-garage-direct-v1/v3/specs/cs-quick-reply.md
 * - GET /api/v1/seat/cs/organizations/:org_id/quick-replies?workspace_id=
 *   （只读、全量、按 sort ASC, title ASC；Seat JWT 域，与 sessions 面同
 *   assignment 可见性——服务端只信 token 派生事实，跨 workspace 403）
 *   响应 payload {list:[quick_reply 行]}（snake_case 线缆；TSID integer 经
 *   parseSeatJson 精度保护收敛为 string）
 * - Seat 面板消费白名单：id/title/content/sort（其余键投影丢弃）。
 */
import { isRecord, nonEmptyString, toEntityId } from '../tsid'
import type { EntityId } from '../types'

/** Seat 面快捷回复投影（camelCase，同 SeatMessage 风格；合同 §7）。 */
export type SeatQuickReply = {
  id: EntityId
  title: string
  content: string
  sort: number
}

/** 相对 SEAT_API_BASE 的路径（落 /cs/ 前缀 → 完整 /api/v1/seat/cs/...，域门放行）。 */
export function buildSeatQuickRepliesPath(orgId: EntityId): string {
  return `/cs/organizations/${encodeURIComponent(orgId)}/quick-replies`
}

/**
 * payload {list:[...]} → SeatQuickReply[]（合同 §7 白名单投影）。
 * 形状非法（payload 非对象/list 非数组）返回空列表 fail-closed——面板呈现
 * 空态而不是崩溃；单行缺必需键跳过（同 toTransferTargetList 口径）。
 */
export function toSeatQuickReplyList(payload: unknown): SeatQuickReply[] {
  if (!isRecord(payload) || !Array.isArray(payload.list)) return []
  const out: SeatQuickReply[] = []
  for (const row of payload.list) {
    if (!isRecord(row)) continue
    const id = toEntityId(row.id)
    if (id === null || !nonEmptyString(row.title) || !nonEmptyString(row.content)) continue
    const sort = typeof row.sort === 'number' && Number.isSafeInteger(row.sort) ? row.sort : 0
    out.push({ id, title: row.title, content: row.content, sort })
  }
  // 服务端已按 sort ASC, title ASC 排序；此处幂等重排一次，抗合同漂移。
  out.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title))
  return out
}

/** 标题搜索过滤（前端包含匹配，case-insensitive；空搜索原样返回）。 */
export function filterSeatQuickReplies(list: SeatQuickReply[], search: string): SeatQuickReply[] {
  const needle = search.trim().toLowerCase()
  if (needle.length === 0) return list
  return list.filter((row) => row.title.toLowerCase().includes(needle))
}

/**
 * 插入语义（合同 §8）：点击条目把 content 插入输入框（不直接发送）。
 * 草稿为空/纯空白 → 直接填入；已有内容 → 换行追加在末尾。
 */
export function insertQuickReplyContent(currentBody: string, content: string): string {
  const piece = content.trim()
  if (piece.length === 0) return currentBody
  if (currentBody.trim().length === 0) return piece
  return `${currentBody.replace(/\s+$/, '')}\n${piece}`
}
