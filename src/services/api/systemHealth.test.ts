/**
 * Unit tests for systemHealth.ts service:
 *   getSystemHealthStats — maps raw metrics counters to typed SystemHealthStats
 */
import { describe, expect, it, afterEach } from 'bun:test'
import client from './client'
import { getSystemHealthStats } from './systemHealth'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }
const mutableClient = client as unknown as MutableClient
const origGet = mutableClient.get

afterEach(() => {
  mutableClient.get = origGet
})

const MB = 1024 * 1024

function makeMetrics(counters: Record<string, number>) {
  return { data: { code: 0, msg: 'ok', payload: { counters } } }
}

describe('getSystemHealthStats', () => {
  it('maps known system counters to typed fields', async () => {
    mutableClient.get = async () =>
      makeMetrics({
        erlang_process_count: 500,
        erlang_memory_total_bytes: 100 * MB,
        erlang_memory_processes_bytes: 40 * MB,
        erlang_memory_ets_bytes: 10 * MB,
        imboy_online_users: 1200,
        ws_connections_current: 300,
        db_pool_free: 8,
        db_pool_in_use: 2,
      })
    const result = await getSystemHealthStats()
    expect(result.processCount).toBe(500)
    expect(result.memoryTotalMB).toBe(100)
    expect(result.memoryProcessesMB).toBe(40)
    expect(result.memoryEtsMB).toBe(10)
    expect(result.onlineUsers).toBe(1200)
    expect(result.wsConnections).toBe(300)
    expect(result.dbPoolFree).toBe(8)
    expect(result.dbPoolInUse).toBe(2)
  })

  it('defaults to 0 for missing system counters', async () => {
    mutableClient.get = async () => makeMetrics({})
    const result = await getSystemHealthStats()
    expect(result.processCount).toBe(0)
    expect(result.onlineUsers).toBe(0)
    expect(result.dbPoolFree).toBe(0)
  })

  it('separates app counters from system counters', async () => {
    mutableClient.get = async () =>
      makeMetrics({
        erlang_process_count: 100,
        user_registrations_total: 500,
        message_send_total: 1000,
      })
    const result = await getSystemHealthStats()
    expect(result.appCounters['user_registrations_total']).toBe(500)
    expect(result.appCounters['message_send_total']).toBe(1000)
    expect(result.appCounters['erlang_process_count']).toBeUndefined()
  })

  it('excludes non-numeric values from appCounters', async () => {
    mutableClient.get = async () =>
      makeMetrics({
        // only numeric values should appear in appCounters
        some_count: 42,
      })
    const result = await getSystemHealthStats()
    expect(result.appCounters['some_count']).toBe(42)
  })

  it('returns empty appCounters when all counters are system keys', async () => {
    mutableClient.get = async () =>
      makeMetrics({
        erlang_process_count: 10,
        erlang_memory_total_bytes: 1024,
        imboy_online_users: 5,
        ws_connections_current: 2,
        db_pool_free: 3,
        db_pool_in_use: 1,
      })
    const result = await getSystemHealthStats()
    expect(Object.keys(result.appCounters)).toHaveLength(0)
  })

  it('throws when API returns error', async () => {
    mutableClient.get = async () => ({ data: { code: 1, msg: 'metrics error' } })
    await expect(getSystemHealthStats()).rejects.toThrow()
  })
})
