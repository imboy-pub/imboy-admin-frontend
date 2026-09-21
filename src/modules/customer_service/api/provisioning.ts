/**
 * 客服开通向导（ADM-01）Admin provisioning API client——只调 `/api/adm` 平台面。
 *
 * 契约真源：api-surface-freeze.json `admin_provisioning`（frozen）+ 任务卡 ADM-01：
 *   POST /api/adm/customer-service/organizations/:org_id/provisioning
 *     （customer_service:write 保护；事务化创建/修复 identity/assignment/enabled seat；
 *      actor/target/before/after 不可抵赖审计由后端写审计日志并在响应投影）
 *
 * 纪律：
 * - 本文件绝不调用 `/api/v1`（Admin Cookie 页面不得隐式换取 tenant owner JWT）；
 * - Organization/Workspace 由向导用选择器取自既有 admin 数据面
 *   （/organizations、/organizations/:id/workspaces、/organizations/:id/members），
 *   本模块不新建第二套组织/工作区模型；
 * - TSID 全程 string（EntityId）。
 *
 * ⚠️ DEPENDENT_BACKEND_BS01B：端到端联调依赖 BE-S01b 后端交付；本 client 的
 * 请求形状按上述冻结合同编写，响应投影容错两种形状（见 provisioningPure），
 * 真实后端联调由 P1-E2E-01 覆盖。
 */
import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import { toCsProvisioningResult, type CsProvisioningResult } from './provisioningPure'

const CS_ORGS_BASE = '/customer-service/organizations'

function requireNonEmptyId(value: EntityId, label: string): EntityId {
  const id = typeof value === 'string' ? value.trim() : ''
  if (id.length === 0) {
    throw new Error(`缺少必填 ID：${label}`)
  }
  return id
}

export type ProvisionCustomerServiceSeatInput = {
  organizationId: EntityId
  workspaceId: EntityId
  /** 目标开通为客服坐席的「成员」user_id（该 org 的 active Human member）。 */
  userId: EntityId
  /** 成员昵称或账号（后端 display_name 必填）。 */
  displayName: string
  /** 并发上限；前端默认 3，合法域 1..20；必须以 number 发送（非 string）。 */
  maxConcurrent: number
}

const MAX_CONCURRENT_MIN = 1
const MAX_CONCURRENT_MAX = 20

/**
 * POST 事务化开通：identity + assignment + enabled seat 一次提交；
 * 幂等重放由后端保证（重复提交返回 identity_created=false 而非报错）。
 *
 * 冻结合同（C3）：body 仅含 workspace_id（TSID string）/ user_id（TSID string）/
 * display_name（binary）/ max_concurrent（int 1..20）；**禁止**发送
 * business_identity_id（漂移根因，后端以 user_id 派生 identity）。
 */
export async function provisionCustomerServiceSeat(
  input: ProvisionCustomerServiceSeatInput
): Promise<CsProvisioningResult> {
  const organizationId = requireNonEmptyId(input.organizationId, 'organization_id')
  const workspaceId = requireNonEmptyId(input.workspaceId, 'workspace_id')
  const userId = requireNonEmptyId(input.userId, 'user_id')
  const displayName = input.displayName.trim()
  if (displayName.length === 0) {
    throw new Error('缺少必填 display_name（成员昵称/账号）')
  }
  const maxConcurrent = input.maxConcurrent
  if (
    !Number.isInteger(maxConcurrent) ||
    maxConcurrent < MAX_CONCURRENT_MIN ||
    maxConcurrent > MAX_CONCURRENT_MAX
  ) {
    throw new Error(
      `max_concurrent 非法：必须在 ${MAX_CONCURRENT_MIN}..${MAX_CONCURRENT_MAX} 整数域`
    )
  }
  const response = await client.post<ApiResponse<unknown>>(
    `${CS_ORGS_BASE}/${encodeURIComponent(organizationId)}/provisioning`,
    {
      workspace_id: workspaceId,
      user_id: userId,
      display_name: displayName,
      max_concurrent: maxConcurrent,
    }
  )
  const payload = requireApiPayload(response.data, 'POST cs provisioning')
  const result = toCsProvisioningResult(payload)
  if (result === null) {
    throw new Error('provisioning 响应形状非法（缺少 organization/workspace/business_identity 事实）')
  }
  return result
}
