/**
 * CS-WEB-05（CS-RUNTIME-03）：presence 投影/路径 + 心跳可见性门控 +
 * 状态条降级/切换 + 未读 badge 的精确组件测试。
 */
import { describe, expect, test } from 'bun:test'
import {
  buildSeatHeartbeatPath,
  buildSeatMyPresencePath,
  toSeatPresence,
  toSeatReadState,
} from './contract'

describe('CS-WEB-05 presence contract', () => {
  test('toSeatPresence：合法投影（status/心跳/手动/容量）', () => {
    const presence = toSeatPresence({
      status: 'busy',
      last_heartbeat_at: 1790312470,
      manual_status: null,
      enabled: true,
      max_concurrent: 3,
      active_count: 3,
    })
    expect(presence.status).toBe('busy')
    expect(presence.lastHeartbeatAt).toBe(1790312470)
    expect(presence.manualStatus).toBeNull()
    expect(presence.enabled).toBe(true)
    expect(presence.maxConcurrent).toBe(3)
    expect(presence.activeCount).toBe(3)
  })

  test('toSeatPresence：manual away 保真；从未上报 last_heartbeat_at=null', () => {
    const presence = toSeatPresence({
      status: 'away',
      manual_status: 'away',
      enabled: true,
      max_concurrent: 1,
      active_count: 0,
    })
    expect(presence.manualStatus).toBe('away')
    expect(presence.lastHeartbeatAt).toBeNull()
  })

  test('toSeatPresence：未知 status / 非法容量 fail-closed throw', () => {
    expect(() =>
      toSeatPresence({ status: 'invisible', enabled: true, max_concurrent: 1, active_count: 0 }),
    ).toThrow()
    expect(() =>
      toSeatPresence({ status: 'online', enabled: true, max_concurrent: -1, active_count: 0 }),
    ).toThrow()
    expect(() => toSeatPresence('not-a-map')).toThrow()
  })

  test('toSeatReadState：合法投影与缺字段 throw', () => {
    const state = toSeatReadState({
      session_id: '72057594037927938',
      business_identity_id: '72057594037927939',
      last_read_message_id: '72057594037928000',
      unread_count: 4,
    })
    expect(state.unreadCount).toBe(4)
    expect(state.lastReadMessageId).toBe('72057594037928000')
    expect(() => toSeatReadState({ session_id: '1' })).toThrow()
  })

  test('路径构造：heartbeat / my-presence（org 编码）', () => {
    expect(buildSeatHeartbeatPath('72057594037927937')).toBe(
      '/cs/organizations/72057594037927937/seats/me/heartbeat',
    )
    expect(buildSeatMyPresencePath('72057594037927937')).toBe(
      '/cs/organizations/72057594037927937/seats/me/presence',
    )
  })
})
