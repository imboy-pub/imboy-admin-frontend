/**
 * 客服快捷回复管理面纯函数（V3-27 快捷回复子能力）。
 *
 * 合同真源：.task-state/imboy-garage-direct-v1/v3/specs/cs-quick-reply.md
 * （字段命名与本文件类型完全一致；backend 车道按该合同实现）。
 *
 * 纪律：
 * - TSID 全程 string（EntityId），绝不 Number() 回转（>2^53 丢精度）；
 * - 行投影白名单键 + 形状校验，缺必需键整行 fail-closed 丢弃；
 * - title/content 长度门（64/2000）双端一致：前端预拒 + 服务端 422 兜底。
 */
import type { EntityId } from '@/types/common'

/** 快捷回复行投影（线缆 snake_case；合同 §7）。 */
export type QuickReply = {
  id: EntityId
  tenant_id: EntityId
  workspace_id: EntityId
  title: string
  content: string
  sort: number
  created_by: EntityId
  created_at: string | null
  updated_at: string | null
}

/** GET 列表 payload 投影（admin 分页口径 {list,page,size,total,total_page}）。 */
export type QuickReplyPage = {
  list: QuickReply[]
  page: number
  size: number
  total: number
  total_page: number
}

export const QUICK_REPLY_TITLE_MAX = 64
export const QUICK_REPLY_CONTENT_MAX = 2000

/** TSID 十进制串形状校验（同 widgetInstallationsPure 口径）。 */
export function isValidQuickReplyScopeId(value: string): boolean {
  return /^[0-9]{1,20}$/.test(value) && Number(value) > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optTime(value: unknown): string | null {
  // 后端全 API 惯例：epoch 秒 number；规范化为 string，null/undefined 落 null。
  return value == null ? null : String(value)
}

/** 行投影：白名单 + 必需键形状校验；缺 id/workspace_id/title/content → null（fail-closed）。 */
export function toQuickReply(raw: unknown): QuickReply | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const tenantId = str(raw.tenant_id)
  const workspaceId = str(raw.workspace_id)
  const createdBy = str(raw.created_by)
  const title = str(raw.title)
  const content = str(raw.content)
  if (
    id.length === 0 ||
    tenantId.length === 0 ||
    workspaceId.length === 0 ||
    createdBy.length === 0 ||
    title.length === 0 ||
    content.length === 0
  ) {
    return null
  }
  const sort = typeof raw.sort === 'number' && Number.isSafeInteger(raw.sort) ? raw.sort : 0
  return {
    id,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    title,
    content,
    sort,
    created_by: createdBy,
    created_at: optTime(raw.created_at),
    updated_at: optTime(raw.updated_at),
  }
}

/** 列表 payload 投影：形状非法的行整体丢弃，分页元数据缺省 fail-closed 归一。 */
export function toQuickReplyPage(raw: unknown): QuickReplyPage {
  const empty: QuickReplyPage = { list: [], page: 1, size: 10, total: 0, total_page: 1 }
  if (!isRecord(raw) || !Array.isArray(raw.list)) return empty
  const page = typeof raw.page === 'number' && raw.page >= 1 ? Math.floor(raw.page) : 1
  const size = typeof raw.size === 'number' && raw.size >= 1 ? Math.floor(raw.size) : 10
  const total = typeof raw.total === 'number' && raw.total >= 0 ? Math.floor(raw.total) : 0
  const totalPages =
    typeof raw.total_page === 'number' && raw.total_page >= 1
      ? Math.floor(raw.total_page)
      : Math.max(1, Math.ceil(total / size))
  return {
    list: raw.list.map(toQuickReply).filter((item): item is QuickReply => item !== null),
    page,
    size,
    total,
    total_page: totalPages,
  }
}

export type QuickReplyFormInput = {
  title: string
  content: string
  sort: number
}

export type QuickReplyFormErrors = {
  title: string | null
  content: string | null
  sort: string | null
}

/**
 * 表单校验（双端一致的客户端预拒；服务端 422 兜底）：
 * - title trim 后 1–64 字符；
 * - content trim 后 1–2000 字符；
 * - sort 安全整数（允许负值，展示层按升序渲染）。
 */
export function validateQuickReplyInput(input: QuickReplyFormInput): QuickReplyFormErrors {
  const title = input.title.trim()
  const content = input.content.trim()
  return {
    title:
      title.length === 0
        ? '标题不能为空'
        : title.length > QUICK_REPLY_TITLE_MAX
          ? `标题不能超过 ${QUICK_REPLY_TITLE_MAX} 字符`
          : null,
    content:
      content.length === 0
        ? '内容不能为空'
        : content.length > QUICK_REPLY_CONTENT_MAX
          ? `内容不能超过 ${QUICK_REPLY_CONTENT_MAX} 字符`
          : null,
    sort: Number.isSafeInteger(input.sort) ? null : '排序必须为整数',
  }
}

export function hasQuickReplyFormErrors(errors: QuickReplyFormErrors): boolean {
  return errors.title !== null || errors.content !== null || errors.sort !== null
}
