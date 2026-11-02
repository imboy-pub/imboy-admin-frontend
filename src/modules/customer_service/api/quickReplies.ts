/**
 * 客服快捷回复管理面 API（V3-27 快捷回复子能力）。
 *
 * 合同真源：.task-state/imboy-garage-direct-v1/v3/specs/cs-quick-reply.md
 * 计划契约（Admin 域，挂 /api/adm 前缀）：
 *   GET    /customer-service/quick-replies?organization_id&workspace_id&page&size&search
 *          → payload {list,page,size,total,total_page}
 *   POST   /customer-service/quick-replies
 *          body {organization_id, workspace_id, title, content, sort}
 *          → payload {quick_reply}
 *   PUT    /customer-service/quick-replies/:id（全量提交；id 只在路径）
 *          → payload {quick_reply}
 *   DELETE /customer-service/quick-replies/:id（软删，幂等）
 *          body {organization_id, workspace_id} → payload {ok:true}
 *
 * 纪律：TSID 全程 string；显式租户条件必填（与平台面纪律一致）；权限
 * read=customer_service:read / write=customer_service:write 由路由门+页面双层把关。
 */
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import {
  toQuickReply,
  toQuickReplyPage,
  type QuickReply,
  type QuickReplyPage,
} from './quickRepliesPure'

const QUICK_REPLIES_BASE = '/customer-service/quick-replies'

export const QUICK_REPLY_DEFAULT_PAGE_SIZE = 10

export type QuickReplyListParams = {
  organizationId: EntityId
  workspaceId: EntityId
  page?: number
  size?: number
  search?: string
}

export type QuickReplyWriteInput = {
  organizationId: EntityId
  workspaceId: EntityId
  title: string
  content: string
  sort: number
}

function requireNonEmptyId(value: EntityId, label: string): EntityId {
  const id = typeof value === 'string' ? value.trim() : ''
  if (id.length === 0) throw new Error(`缺少必填 ID：${label}`)
  return id
}

/** GET 分页列表（必须显式租户条件；search 空串不发送）。 */
export async function listQuickReplies(params: QuickReplyListParams): Promise<QuickReplyPage> {
  const search = params.search?.trim() ?? ''
  const response = await client.get<ApiResponse<unknown>>(QUICK_REPLIES_BASE, {
    params: {
      organization_id: requireNonEmptyId(params.organizationId, 'organization_id'),
      workspace_id: requireNonEmptyId(params.workspaceId, 'workspace_id'),
      page: params.page ?? 1,
      size: params.size ?? QUICK_REPLY_DEFAULT_PAGE_SIZE,
      ...(search.length > 0 ? { search } : {}),
    },
  })
  return toQuickReplyPage(requireApiPayload(response.data, 'GET quick replies'))
}

/** POST 创建（id 绝不出现在 body；服务端申报 id 判 400）。 */
export async function createQuickReply(input: QuickReplyWriteInput): Promise<QuickReply> {
  const response = await client.post<ApiResponse<unknown>>(QUICK_REPLIES_BASE, {
    organization_id: requireNonEmptyId(input.organizationId, 'organization_id'),
    workspace_id: requireNonEmptyId(input.workspaceId, 'workspace_id'),
    title: input.title.trim(),
    content: input.content.trim(),
    sort: input.sort,
  })
  const payload = requireApiPayload(response.data, 'POST quick replies')
  const row = toQuickReply((payload as { quick_reply?: unknown } | null)?.quick_reply ?? null)
  if (row === null) throw new Error('创建快捷回复响应形状非法')
  return row
}

/** PUT 全量更新（id 只在路径）。 */
export async function updateQuickReply(
  quickReplyId: EntityId,
  input: QuickReplyWriteInput
): Promise<QuickReply> {
  const response = await client.put<ApiResponse<unknown>>(
    `${QUICK_REPLIES_BASE}/${encodeURIComponent(requireNonEmptyId(quickReplyId, 'quick_reply_id'))}`,
    {
      organization_id: requireNonEmptyId(input.organizationId, 'organization_id'),
      workspace_id: requireNonEmptyId(input.workspaceId, 'workspace_id'),
      title: input.title.trim(),
      content: input.content.trim(),
      sort: input.sort,
    }
  )
  const payload = requireApiPayload(response.data, 'PUT quick replies')
  const row = toQuickReply((payload as { quick_reply?: unknown } | null)?.quick_reply ?? null)
  if (row === null) throw new Error('更新快捷回复响应形状非法')
  return row
}

/** DELETE 软删（幂等；DELETE 带 JSON body，同仓内 admin 写语义）。 */
export async function deleteQuickReply(scope: {
  organizationId: EntityId
  workspaceId: EntityId
  quickReplyId: EntityId
}): Promise<void> {
  await client.delete<ApiResponse<unknown>>(
    `${QUICK_REPLIES_BASE}/${encodeURIComponent(requireNonEmptyId(scope.quickReplyId, 'quick_reply_id'))}`,
    {
      data: {
        organization_id: requireNonEmptyId(scope.organizationId, 'organization_id'),
        workspace_id: requireNonEmptyId(scope.workspaceId, 'workspace_id'),
      },
    }
  )
}
