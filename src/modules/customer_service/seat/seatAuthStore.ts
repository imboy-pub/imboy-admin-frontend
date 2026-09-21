/**
 * SEAT-01：Seat 认证/会话 store（Zustand）+ token vault。
 *
 * A03 安全红线：
 * - access JWT 只存模块内存 vault（闭包变量），**绝不**进
 *   localStorage/sessionStorage/URL/log；Zustand state 只持有非敏感的
 *   会话状态（status/userId/终结原因），且本 store 无 persist 中间件；
 * - clearSession 后 vault 同步清空（expired/cancelled/401 → 回登录）。
 *
 * 与 Admin authStore（persist + Cookie 域）完全独立，零导入关系（A01）。
 */
import { create } from 'zustand'
import type { EntityId, SeatSessionEndReason } from './types'

export type SeatAuthStatus = 'anonymous' | 'authenticated'

/** token 仅内存 vault：setToken 之前必须经过形状 sanity（JWT 三段式）。 */
export class SeatTokenVault {
  private token: string | null = null

  /** JWT 形状 sanity：三段 base64url、无空白。防御性，不做签名校验。 */
  static isJwtShape(value: string): boolean {
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value)
  }

  setToken(token: string): boolean {
    if (!SeatTokenVault.isJwtShape(token)) return false
    this.token = token
    return true
  }

  getToken(): string | null {
    return this.token
  }

  clear(): void {
    this.token = null
  }
}

export type SeatAuthState = {
  status: SeatAuthStatus
  userId: EntityId | null
  /** 最近一次会话终结原因（驱动登录页文案/工作台降级）。 */
  endReason: SeatSessionEndReason | null
  setSession: (_userId: EntityId | null) => void
  clearSession: (_reason: Exclude<SeatSessionEndReason, 'logout'> | 'logout') => void
}

/** 模块级单例 vault：唯一持有 Seat access JWT 的位置（内存）。 */
export const seatTokenVault = new SeatTokenVault()

/**
 * 坐席会话 Zustand store（无 persist：token 与会话状态都不落盘）。
 * 注意：token 本体不进 store state（防 devtools/序列化暴露），只进 vault。
 */
export const useSeatAuthStore = create<SeatAuthState>()((set) => ({
  status: 'anonymous',
  userId: null,
  endReason: null,
  setSession: (userId) => set({ status: 'authenticated', userId, endReason: null }),
  clearSession: (reason) => {
    seatTokenVault.clear()
    set({ status: 'anonymous', userId: null, endReason: reason })
  },
}))

/** 便捷组合：vault 写入 + store 置为 authenticated（QR confirmed 后调用）。 */
export function establishSeatSession(token: string, userId: EntityId | null): boolean {
  if (!seatTokenVault.setToken(token)) return false
  useSeatAuthStore.getState().setSession(userId)
  return true
}
