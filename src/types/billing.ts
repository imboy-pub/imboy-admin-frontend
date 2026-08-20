/**
 * 财务管理模块类型定义
 *
 * 金额字段单位：分（integer）。后端以 bigint 返回，safeParseBigIntJson 已自动转 string。
 * TSID 字段统一使用 EntityId，不直接写 string 或 number。
 */

import type { EntityId } from './common'

// ─── 钱包 ───────────────────────────────────────────────────────────────────

export interface Wallet {
  /** TSID */
  id: EntityId
  /** 所属用户 ID */
  user_id: EntityId
  /** 余额，单位：分 */
  balance: number
  /** 余额（元，后端额外返回 balance/100.0） */
  balance_yuan?: number
  /** 冻结金额，单位：分 */
  frozen: number
  /** 状态：1=正常，0=冻结 */
  status: number
  created_at: string
  updated_at?: string
}

export interface WalletTransaction {
  /** TSID */
  id: EntityId
  /** 所属钱包 ID */
  wallet_id: EntityId
  /** 所属用户 ID */
  user_id: EntityId
  /** 变动金额，单位：分（正=入账，负=出账，收支以符号为准） */
  amount: number
  /**
   * 钱包流水类型（后端 wallet_transaction.chk_wallet_tx_type 值域）：
   * 1=充值 2=充值退款 3=订单退款 5=转账转出 6=转账转入 7=发红包
   * 8=领红包 9=红包/转账退回 10=提现 11=提现退款 20=agent支付借记
   * 21=agent支付贷记
   */
  type: number
  /** 关联业务单号 */
  biz_no?: string
  /** 备注 */
  remark?: string
  created_at: string
}

/** 提现流水（tx_type=10），管理后台审核用 */
export interface WithdrawalTransaction {
  id: EntityId
  wallet_id: EntityId
  user_id: EntityId
  /** 提现金额（负数，单位：分） */
  amount: number
  balance_after: number
  tx_type: 10
  reference_no: string
  remark?: string
  /** 0=待处理，1=已完成，2=已拒绝 */
  status: 0 | 1 | 2
  created_at: string
}

// ─── 充值订单 ───────────────────────────────────────────────────────────────

export interface RechargeOrder {
  /** TSID */
  id: EntityId
  /** 订单号（字符串形式，防精度丢失） */
  order_no: string
  /** 用户 ID */
  user_id: EntityId
  /** 充值金额，单位：分 */
  amount: number
  /** 支付方式：alipay/wechat/stripe 等 */
  payment_method: string
  /**
   * 状态：
   * 0=待支付 1=已支付 2=已取消 3=已退款 4=已过期
   */
  status: number
  created_at: string
  paid_at?: string
  expired_at?: string
}

// ─── 支付流水 ───────────────────────────────────────────────────────────────

export interface PaymentTransaction {
  /** TSID */
  id: EntityId
  /** 内部交易号 */
  trade_no: string
  /**
   * 业务类型：
   * 1=充值 2=频道 3=账单
   */
  biz_type: number
  /** 支付网关标识：alipay/wechat/stripe 等 */
  gateway: string
  /** 网关侧交易号 */
  gateway_payment_no?: string
  /** 交易金额，单位：分 */
  amount: number
  /**
   * 状态：
   * 0=待付 1=成功 2=失败 3=已退款 4=部分退款
   */
  status: number
  created_at: string
  updated_at?: string
}

// ─── 套餐 ───────────────────────────────────────────────────────────────────

export interface BillingPlan {
  /** TSID */
  id: EntityId
  /** 套餐编码，唯一，如 "free"/"professional"/"enterprise" */
  code: string
  /** 套餐名称 */
  name: string
  /** 价格，单位：分 */
  price: number
  /** 计费周期：month/year */
  billing_period: 'month' | 'year'
  /** 状态：0=下架，1=上架 */
  status: number
  /** 配额配置 JSON（含 max_users/max_nodes 等） */
  quota_config?: Record<string, unknown>
  /** 套餐描述 */
  description?: string
  created_at?: string
  updated_at?: string
}

export interface CreateBillingPlanParams {
  code: string
  name: string
  /** 价格，单位：分 */
  price: number
  billing_period: 'month' | 'year'
  status?: number
  quota_config?: Record<string, unknown>
  description?: string
}

export interface UpdateBillingPlanParams {
  id: EntityId
  name?: string
  price?: number
  billing_period?: 'month' | 'year'
  status?: number
  quota_config?: Record<string, unknown>
  description?: string
}

// ─── 订阅 ───────────────────────────────────────────────────────────────────

export interface BillingSubscription {
  /** TSID */
  id: EntityId
  /** 租户/用户 ID */
  tenant_id: EntityId
  /** 套餐 ID */
  plan_id: EntityId
  /** 套餐 code（后端可能一并返回） */
  plan_code?: string
  /**
   * 状态：
   * 0=试用 1=生效 2=过期 3=取消
   */
  status: number
  current_period_start?: string
  current_period_end?: string
  /** 是否自动续费 */
  auto_renew: boolean
  created_at?: string
  updated_at?: string
}

// ─── 账单 ───────────────────────────────────────────────────────────────────

export interface BillingInvoice {
  /** TSID */
  id: EntityId
  /** 账单号 */
  invoice_no: string
  /** 关联订阅 ID */
  subscription_id: EntityId
  /** 账单金额，单位：分 */
  amount: number
  /**
   * 状态：
   * 0=待付 1=已付 2=逾期
   */
  status: number
  period_start?: string
  period_end?: string
  paid_at?: string
  created_at?: string
}
