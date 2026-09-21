/**
 * SEAT-01：Seat 会话 store + SeatAuthGuard 单测。
 *
 * 覆盖：
 * - A03：token 仅模块内存（无 persist；localStorage/sessionStorage 无写入）；
 *   vault clear 后不可恢复；store 不持有 token 本体；
 * - A02：expired/cancelled/unauthorized 终结会话回 anonymous（回登录）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { SeatApiError } from './errors'
import { SeatAuthGuard } from './seatAuthGuard'
import {
  establishSeatSession,
  SeatTokenVault,
  seatTokenVault,
  useSeatAuthStore,
} from './seatAuthStore'

beforeEach(() => {
  seatTokenVault.clear()
  useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
})

afterEach(() => {
  seatTokenVault.clear()
  useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
})

describe('SeatTokenVault（A03 token 仅内存）', () => {
  it('只接受 JWT 三段式形状', () => {
    expect(SeatTokenVault.isJwtShape('eyJh.eyJi.c2ln')).toBe(true)
    expect(SeatTokenVault.isJwtShape('not-a-jwt')).toBe(false)
    expect(SeatTokenVault.isJwtShape('')).toBe(false)
    expect(SeatTokenVault.isJwtShape('a.b')).toBe(false)
    expect(SeatTokenVault.isJwtShape('a b.c.d')).toBe(false)
  })

  it('setToken 形状非法时拒绝写入', () => {
    const vault = new SeatTokenVault()
    expect(vault.setToken('garbage')).toBe(false)
    expect(vault.getToken()).toBe(null)
    expect(vault.setToken('h.p1.h2')).toBe(true)
    expect(vault.getToken()).toBe('h.p1.h2')
  })

  it('clear 后 token 不可恢复', () => {
    const vault = new SeatTokenVault()
    vault.setToken('a.b.c')
    vault.clear()
    expect(vault.getToken()).toBe(null)
  })

  it('A03 负例：token 不落 localStorage/sessionStorage', () => {
    if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') return
    establishSeatSession('tok.ens.ig', '1234567890123456789')
    for (const storage of [localStorage, sessionStorage]) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i) ?? ''
        expect(storage.getItem(key)).not.toContain('tok.ens')
      }
    }
    expect(useSeatAuthStore.getState().status).toBe('authenticated')
  })

  it('store state 不携带 token 本体（防 devtools/序列化暴露）', () => {
    establishSeatSession('secret.jwt.sig', '1')
    const state = useSeatAuthStore.getState()
    expect(JSON.stringify(state)).not.toContain('secret.jwt')
  })
})

describe('establishSeatSession / clearSession（A02 会话生命周期）', () => {
  it('confirmed → authenticated；终结原因清空', () => {
    expect(establishSeatSession('a.b.c', '1234567890123456789')).toBe(true)
    const state = useSeatAuthStore.getState()
    expect(state.status).toBe('authenticated')
    expect(state.userId).toBe('1234567890123456789')
    expect(state.endReason).toBe(null)
  })

  it('token 形状非法 → 不建立会话（fail-closed）', () => {
    expect(establishSeatSession('junk', '1')).toBe(false)
    expect(useSeatAuthStore.getState().status).toBe('anonymous')
  })

  it('expired/cancelled/unauthorized 终结 → anonymous 且 vault 清空', () => {
    establishSeatSession('a.b.c', '1')
    for (const reason of ['expired', 'cancelled', 'unauthorized'] as const) {
      useSeatAuthStore.getState().clearSession(reason)
      expect(useSeatAuthStore.getState().status).toBe('anonymous')
      expect(useSeatAuthStore.getState().endReason).toBe(reason)
      expect(seatTokenVault.getToken()).toBe(null)
      if (reason !== 'expired') establishSeatSession('a.b.c', '1')
    }
  })
})

describe('SeatAuthGuard', () => {
  it('无 token 时 requireToken 抛 unauthorized（fail-closed 不发请求）', () => {
    const guard = new SeatAuthGuard()
    expect(() => guard.requireToken()).toThrowError(/seat session is not established/)
    expect(guard.isAuthenticated()).toBe(false)
  })

  it('established 后放行；域复核与 client 门一致', () => {
    establishSeatSession('a.b.c', '1')
    const guard = new SeatAuthGuard()
    expect(guard.requireToken()).toBe('a.b.c')
    expect(guard.isAuthenticated()).toBe(true)
    expect(() => guard.assertSeatDomain('/api/adm/x')).toThrow(/outside seat domain/)
    expect(() => guard.assertSeatDomain('/api/v1/cs/me/seat-contexts')).not.toThrow()
  })

  it('401 → 清会话回登录；403 默认不清（由调用面降级）', () => {
    establishSeatSession('a.b.c', '1')
    const guard = new SeatAuthGuard()
    const err401 = new SeatApiError('unauthorized', '401')
    const err403 = new SeatApiError('forbidden', '403')
    expect(guard.handleSeatApiError(new Error('plain error'))).toBe(false)
    expect(guard.handleSeatApiError(err401)).toBe(true)
    expect(useSeatAuthStore.getState().status).toBe('anonymous')
    establishSeatSession('a.b.c', '1')
    expect(guard.handleSeatApiError(err403)).toBe(false)
    expect(useSeatAuthStore.getState().status).toBe('authenticated')

    const strictGuard = new SeatAuthGuard({ endOn: ['unauthorized', 'forbidden'] })
    expect(strictGuard.handleSeatApiError(err403)).toBe(true)
    expect(useSeatAuthStore.getState().endReason).toBe('forbidden')
  })
})
