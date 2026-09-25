/**
 * 组织客服摘要 API（CS-ADM-01）——只调 `/api/adm/customer-service/*`。
 *
 * 端点（契约真源 imboy_router.erl customer_service_platform_routes）：
 *   GET /api/adm/customer-service/seats?organization_id=<org>&after_id&limit
 *     （cs_platform_handler p_platform_seats；customer_service:read 门；
 *      键集分页 {seats, next_after_id}；含已停用坐席——运营面语义）
 *
 * 纪律：
 * - 本文件绝不调用 `/api/v1`（Admin Cookie 页面不得隐式换取 Seat JWT /
 *   Human JWT——CS-BE-06 的 seat-limit 治理端点在租户面，额度事实因此
 *   不在本摘要的数据面内，见 csSummaryPure 的诚实降级依据）；
 * - TSID 全程 string（EntityId）：organization_id / after_id 均以 string
 *   直传查询串，19 位大数不丢精度；
 * - 键集分页循环读取有安全页数上限，触达即 truncated=true（不静默丢行）。
 */
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import { aggregateOrgCsSummary, type OrgCsSummary } from './csSummaryPure'

const CS_SEATS_ENDPOINT = '/customer-service/seats'

/** 服务端 limit 上限（admin 键集分页钳制 1..200）。 */
export const SEAT_PAGE_LIMIT = 200

/** 安全页数上限：最多读 10 页，触达即诚实截断。 */
export const SEAT_PAGE_MAX = 10

function toIdOrNull(value: unknown): EntityId | null {
  const id = typeof value === 'string' ? value.trim() : ''
  return id.length > 0 ? id : null
}

/**
 * 读取组织级客服摘要：对 /customer-service/seats 按 organization_id 过滤
 * 做键集分页循环，聚合出 used/enabled/active sessions 等事实。
 *
 * organization_id 必填（空 ID 直接抛错，fail-closed）；
 * limit 固定 200（服务端钳制上限），分页由 after_id 游标推进。
 */
export async function getOrgCsSummary(organizationId: EntityId): Promise<OrgCsSummary> {
  const orgId = typeof organizationId === 'string' ? organizationId.trim() : ''
  if (orgId.length === 0) {
    throw new Error('缺少必填 ID：organization_id（客服摘要按组织取数）')
  }

  const rows: unknown[] = []
  let afterId: EntityId | null = null
  let truncated = false

  for (let page = 0; page < SEAT_PAGE_MAX; page += 1) {
    const response = await client.get<ApiResponse<unknown>>(CS_SEATS_ENDPOINT, {
      params: {
        organization_id: orgId,
        limit: SEAT_PAGE_LIMIT,
        ...(afterId !== null ? { after_id: afterId } : {}),
      },
    })
    const payload = requireApiPayload(response.data, 'GET org cs summary seats')
    const body = (payload ?? {}) as Record<string, unknown>
    const seats = Array.isArray(body.seats) ? body.seats : []
    rows.push(...seats)
    afterId = toIdOrNull(body.next_after_id)
    if (afterId === null) {
      truncated = false
      break
    }
    if (page === SEAT_PAGE_MAX - 1) {
      // 已读满安全上限仍有下一页：停止并如实标记截断。
      truncated = true
    }
  }

  return aggregateOrgCsSummary(orgId, rows, truncated)
}
