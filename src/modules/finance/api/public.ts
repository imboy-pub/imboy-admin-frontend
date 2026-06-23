/**
 * 财务管理 API service
 *
 * 已对接后端 /api/adm/finance/* 运营端点（管理员鉴权 finance:read / finance:write）。
 * baseURL = /adm（client.ts 已设置），故此处路径以 /finance 开头，拼为 /api/adm/finance/*。
 * 后端实现见 imboy/src/api/adm/adm_finance_handler.erl 与 imboy_router.erl 的 /api/adm/finance 段。
 * 金额字段为整数「分」，页面层用 src/lib/money.ts 的 fenToYuan 显示；TSID 字段为 EntityId(string)。
 */

import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import type {
  Wallet,
  WalletTransaction,
  WithdrawalTransaction,
  RechargeOrder,
  PaymentTransaction,
  BillingPlan,
  BillingSubscription,
  BillingInvoice,
  CreateBillingPlanParams,
  UpdateBillingPlanParams,
} from '@/types/billing'

// ─── 路径常量 ─────────────────────────────────────────────────────────────
// 对应后端 /api/adm/finance/* 运营端点（baseURL=/adm 已在 client.ts 设置）。

const FINANCE_BASE = '/finance'
const BILLING_BASE = '/finance/billing'

// ─── 钱包管理 ─────────────────────────────────────────────────────────────

export interface WalletListParams {
  page?: number
  size?: number
  user_id?: EntityId
  status?: number
}

/**
 * @deprecated Prefer `getWalletListPayload`.
 */
export async function getWalletList(
  params: WalletListParams
): Promise<ApiResponse<PaginatedResponse<Wallet>>> {
  const response = await client.get(`${FINANCE_BASE}/wallets`, { params })
  return response.data
}

export async function getWalletListPayload(
  params: WalletListParams
): Promise<PaginatedResponse<Wallet>> {
  return requireApiPayload(await getWalletList(params), `${FINANCE_BASE}/wallets`)
}

export interface WalletTransactionListParams {
  page?: number
  size?: number
  wallet_id?: EntityId
  user_id?: EntityId
  type?: number
}

/**
 * @deprecated Prefer `getWalletTransactionListPayload`.
 */
export async function getWalletTransactionList(
  params: WalletTransactionListParams
): Promise<ApiResponse<PaginatedResponse<WalletTransaction>>> {
  if (!params.user_id) throw new Error('user_id is required for wallet transactions')
  const { user_id, ...query } = params
  const response = await client.get(
    `${FINANCE_BASE}/wallet/${user_id}/transactions`,
    { params: query }
  )
  return response.data
}

export async function getWalletTransactionListPayload(
  params: WalletTransactionListParams
): Promise<PaginatedResponse<WalletTransaction>> {
  return requireApiPayload(
    await getWalletTransactionList(params),
    `${FINANCE_BASE}/wallet/${params.user_id}/transactions`
  )
}

// ─── 充值订单 ─────────────────────────────────────────────────────────────

export interface RechargeOrderListParams {
  page?: number
  size?: number
  user_id?: EntityId
  status?: number
  payment_method?: string
  order_no?: string
}

/**
 * @deprecated Prefer `getRechargeOrderListPayload`.
 */
export async function getRechargeOrderList(
  params: RechargeOrderListParams
): Promise<ApiResponse<PaginatedResponse<RechargeOrder>>> {
  const response = await client.get(`${FINANCE_BASE}/recharge-orders`, { params })
  return response.data
}

export async function getRechargeOrderListPayload(
  params: RechargeOrderListParams
): Promise<PaginatedResponse<RechargeOrder>> {
  return requireApiPayload(
    await getRechargeOrderList(params),
    `${FINANCE_BASE}/recharge-orders`
  )
}

// ─── 支付流水 ─────────────────────────────────────────────────────────────

export interface PaymentTransactionListParams {
  page?: number
  size?: number
  gateway?: string
  biz_type?: number
  status?: number
  trade_no?: string
}

/**
 * @deprecated Prefer `getPaymentTransactionListPayload`.
 */
export async function getPaymentTransactionList(
  params: PaymentTransactionListParams
): Promise<ApiResponse<PaginatedResponse<PaymentTransaction>>> {
  const response = await client.get(`${FINANCE_BASE}/payment-transactions`, { params })
  return response.data
}

export async function getPaymentTransactionListPayload(
  params: PaymentTransactionListParams
): Promise<PaginatedResponse<PaymentTransaction>> {
  return requireApiPayload(
    await getPaymentTransactionList(params),
    `${FINANCE_BASE}/payment-transactions`
  )
}

// ─── 套餐管理 ─────────────────────────────────────────────────────────────

export interface BillingPlanListParams {
  page?: number
  size?: number
  status?: number
  billing_period?: string
}

/**
 * @deprecated Prefer `getBillingPlanListPayload`.
 */
export async function getBillingPlanList(
  params: BillingPlanListParams
): Promise<ApiResponse<PaginatedResponse<BillingPlan>>> {
  const response = await client.get(`${BILLING_BASE}/plans`, { params })
  return response.data
}

export async function getBillingPlanListPayload(
  params: BillingPlanListParams
): Promise<PaginatedResponse<BillingPlan>> {
  return requireApiPayload(
    await getBillingPlanList(params),
    `${BILLING_BASE}/plans`
  )
}

export async function createBillingPlan(
  params: CreateBillingPlanParams
): Promise<ApiResponse<BillingPlan>> {
  const response = await client.post(`${BILLING_BASE}/plan`, params)
  return response.data
}

export async function updateBillingPlan(
  params: UpdateBillingPlanParams
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post(`${BILLING_BASE}/plan/update`, params)
  return response.data
}

// ─── 订阅管理 ─────────────────────────────────────────────────────────────

export interface BillingSubscriptionListParams {
  page?: number
  size?: number
  tenant_id?: EntityId
  plan_id?: EntityId
  status?: number
}

/**
 * @deprecated Prefer `getBillingSubscriptionListPayload`.
 */
export async function getBillingSubscriptionList(
  params: BillingSubscriptionListParams
): Promise<ApiResponse<PaginatedResponse<BillingSubscription>>> {
  const response = await client.get(`${BILLING_BASE}/subscriptions`, { params })
  return response.data
}

export async function getBillingSubscriptionListPayload(
  params: BillingSubscriptionListParams
): Promise<PaginatedResponse<BillingSubscription>> {
  return requireApiPayload(
    await getBillingSubscriptionList(params),
    `${BILLING_BASE}/subscriptions`
  )
}

// ─── 账单管理 ─────────────────────────────────────────────────────────────

export interface BillingInvoiceListParams {
  page?: number
  size?: number
  subscription_id?: EntityId
  status?: number
  invoice_no?: string
}

/**
 * @deprecated Prefer `getBillingInvoiceListPayload`.
 */
export async function getBillingInvoiceList(
  params: BillingInvoiceListParams
): Promise<ApiResponse<PaginatedResponse<BillingInvoice>>> {
  const response = await client.get(`${BILLING_BASE}/invoices`, { params })
  return response.data
}

export async function getBillingInvoiceListPayload(
  params: BillingInvoiceListParams
): Promise<PaginatedResponse<BillingInvoice>> {
  return requireApiPayload(
    await getBillingInvoiceList(params),
    `${BILLING_BASE}/invoices`
  )
}

// ─── 提现审核 ─────────────────────────────────────────────────────────────

export interface WithdrawalListParams {
  page?: number
  size?: number
  user_id?: EntityId
  status?: number
}

export async function getWithdrawals(
  params: WithdrawalListParams
): Promise<PaginatedResponse<WithdrawalTransaction>> {
  const response = await client.get(`${FINANCE_BASE}/withdrawals`, { params })
  return requireApiPayload(response.data, `${FINANCE_BASE}/withdrawals`)
}

export async function completeWithdrawal(id: EntityId): Promise<void> {
  const response = await client.post(`${FINANCE_BASE}/withdrawals/complete`, { id })
  requireApiPayload(response.data, `${FINANCE_BASE}/withdrawals/complete`)
}

export async function rejectWithdrawal(id: EntityId): Promise<void> {
  const response = await client.post(`${FINANCE_BASE}/withdrawals/reject`, { id })
  requireApiPayload(response.data, `${FINANCE_BASE}/withdrawals/reject`)
}

export const DEFAULT_FINANCE_PAGE_SIZE = DEFAULT_PAGE_SIZE
