/**
 * SEAT-01：SeatAuthGuard——坐席域访问守卫。
 *
 * 职责（计划卡：独立 JWT client + SeatAuthGuard，不复用 Admin API client/store）：
 * - requireToken：无 JWT 时抛 unauthorized（fail-closed，SEAT-02/03 调用面）；
 * - assertSeatDomain：任何调用面在发请求前复核路径落位 Seat 域（A01 双保险）；
 * - notifyUnauthorized / notifyForbidden：401/403 统一清会话回登录或降级
 *   （A02/A04 fail-closed），调用方无需各自处理清理逻辑。
 */
import { assertSeatApiPath } from './seatApiClient'
import { seatTokenVault, useSeatAuthStore } from './seatAuthStore'
import { SeatApiError } from './errors'
import type { SeatSessionEndReason } from './types'

export class SeatAuthGuard {
  /** 401（以及可选的 403）时统一终结会话的原因。 */
  private readonly endOn: ReadonlyArray<SeatSessionEndReason>

  constructor(options: { endOn?: ReadonlyArray<SeatSessionEndReason> } = {}) {
    this.endOn = options.endOn ?? ['unauthorized']
  }

  /** 返回内存中的 Bearer JWT；缺失时抛 unauthorized（不发请求）。 */
  requireToken(): string {
    const token = seatTokenVault.getToken()
    if (token === null) {
      throw new SeatApiError('unauthorized', 'seat session is not established')
    }
    return token
  }

  /** A01：调用面路径域复核（与 SeatApiClient 内部门独立、可单独使用）。 */
  assertSeatDomain(path: string): void {
    assertSeatApiPath(path)
  }

  /** 按构造配置把错误类别映射为会话终结；返回是否终结了会话。 */
  handleSeatApiError(error: unknown): boolean {
    if (!(error instanceof SeatApiError)) return false
    if (error.kind === 'unauthorized' && this.endOn.includes('unauthorized')) {
      useSeatAuthStore.getState().clearSession('unauthorized')
      return true
    }
    if (error.kind === 'forbidden' && this.endOn.includes('forbidden')) {
      useSeatAuthStore.getState().clearSession('forbidden')
      return true
    }
    return false
  }

  /** 当前是否已建立会话（含 vault 与 store 一致性复核）。 */
  isAuthenticated(): boolean {
    return seatTokenVault.getToken() !== null && useSeatAuthStore.getState().status === 'authenticated'
  }
}
