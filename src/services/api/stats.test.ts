/**
 * Unit tests for stats service functions
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import {
  getOverviewStatsPayload,
  getUserStatsPayload,
  getMessageStatsPayload,
  getGroupStatsPayload,
  getRankingStatsPayload,
} from './stats'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

afterEach(() => {
  mutableClient.get = originalGet
})

describe('getOverviewStatsPayload', () => {
  it('calls /stats/overview and returns payload', async () => {
    const payload = {
      total_users: 1000,
      today_users: 50,
      total_groups: 200,
      today_groups: 10,
      online_users: 30,
      online_devices: 45,
      today_messages: 500,
      today_c2c: 300,
      today_c2g: 200,
    }
    mutableClient.get = async (url: unknown) => {
      expect(url).toBe('/stats/overview')
      return { data: { code: 0, msg: 'ok', payload } }
    }
    const result = await getOverviewStatsPayload()
    expect(result.total_users).toBe(1000)
    expect(result.today_messages).toBe(500)
    expect(result.online_devices).toBe(45)
  })

  it('throws when payload is missing', async () => {
    mutableClient.get = async () => ({
      data: { code: 1, msg: 'server error' },
    })
    await expect(getOverviewStatsPayload()).rejects.toThrow()
  })
})

describe('getUserStatsPayload', () => {
  it('calls /stats/user with default days=7', async () => {
    const payload = {
      daily_new: [{ date: '2026-04-01', count: 10 }],
      active_users: 200,
      banned_users: 3,
      deleted_users: 1,
    }
    mutableClient.get = async (url: unknown, config: unknown) => {
      expect(url).toBe('/stats/user')
      expect((config as { params: { days: number } }).params.days).toBe(7)
      return { data: { code: 0, msg: 'ok', payload } }
    }
    const result = await getUserStatsPayload()
    expect(result.active_users).toBe(200)
    expect(result.daily_new).toHaveLength(1)
  })

  it('passes custom days parameter', async () => {
    mutableClient.get = async (_url: unknown, config: unknown) => {
      expect((config as { params: { days: number } }).params.days).toBe(30)
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { daily_new: [], active_users: 0, banned_users: 0, deleted_users: 0 },
        },
      }
    }
    await getUserStatsPayload(30)
  })

  it('throws when payload is missing', async () => {
    mutableClient.get = async () => ({
      data: { code: 1, msg: 'error' },
    })
    await expect(getUserStatsPayload()).rejects.toThrow()
  })
})

describe('getMessageStatsPayload', () => {
  it('calls /stats/message with default days=7', async () => {
    const payload = {
      daily_c2c: [{ date: '2026-04-01', count: 50 }],
      daily_c2g: [{ date: '2026-04-01', count: 20 }],
    }
    mutableClient.get = async (url: unknown, config: unknown) => {
      expect(url).toBe('/stats/message')
      expect((config as { params: { days: number } }).params.days).toBe(7)
      return { data: { code: 0, msg: 'ok', payload } }
    }
    const result = await getMessageStatsPayload()
    expect(result.daily_c2c).toHaveLength(1)
    expect(result.daily_c2g[0].count).toBe(20)
  })

  it('passes custom days parameter', async () => {
    mutableClient.get = async (_url: unknown, config: unknown) => {
      expect((config as { params: { days: number } }).params.days).toBe(14)
      return { data: { code: 0, msg: 'ok', payload: { daily_c2c: [], daily_c2g: [] } } }
    }
    await getMessageStatsPayload(14)
  })
})

describe('getGroupStatsPayload', () => {
  it('calls /stats/group with default days=7', async () => {
    const payload = {
      daily_new: [{ date: '2026-04-01', count: 5 }],
      public_groups: 80,
      private_groups: 120,
    }
    mutableClient.get = async (url: unknown, config: unknown) => {
      expect(url).toBe('/stats/group')
      expect((config as { params: { days: number } }).params.days).toBe(7)
      return { data: { code: 0, msg: 'ok', payload } }
    }
    const result = await getGroupStatsPayload()
    expect(result.public_groups).toBe(80)
    expect(result.private_groups).toBe(120)
  })

  it('passes custom days parameter', async () => {
    mutableClient.get = async (_url: unknown, config: unknown) => {
      expect((config as { params: { days: number } }).params.days).toBe(60)
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { daily_new: [], public_groups: 0, private_groups: 0 },
        },
      }
    }
    await getGroupStatsPayload(60)
  })
})

describe('getRankingStatsPayload', () => {
  it('calls /stats/ranking with defaults type=user metric=message limit=10', async () => {
    const payload = {
      list: [{ id: '1', nickname: 'Alice', metric: 99 }],
    }
    mutableClient.get = async (url: unknown, config: unknown) => {
      expect(url).toBe('/stats/ranking')
      const params = (config as { params: { type: string; metric: string; limit: number } }).params
      expect(params.type).toBe('user')
      expect(params.metric).toBe('message')
      expect(params.limit).toBe(10)
      return { data: { code: 0, msg: 'ok', payload } }
    }
    const result = await getRankingStatsPayload()
    expect(result.list).toHaveLength(1)
    expect(result.list[0].nickname).toBe('Alice')
  })

  it('passes custom type, metric, limit', async () => {
    mutableClient.get = async (_url: unknown, config: unknown) => {
      const params = (config as { params: { type: string; metric: string; limit: number } }).params
      expect(params.type).toBe('group')
      expect(params.metric).toBe('member')
      expect(params.limit).toBe(5)
      return { data: { code: 0, msg: 'ok', payload: { list: [] } } }
    }
    const result = await getRankingStatsPayload('group', 'member', 5)
    expect(result.list).toEqual([])
  })

  it('throws when payload is missing', async () => {
    mutableClient.get = async () => ({
      data: { code: 2, msg: 'forbidden' },
    })
    await expect(getRankingStatsPayload()).rejects.toThrow()
  })
})
