/**
 * Unit tests for infrastructure service modules:
 *   systemHealth, storage
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from './client'
import { getSystemHealthStats } from './systemHealth'
import { getStorageStats, getStorageList, formatFileSize } from './storage'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

afterEach(() => {
  mutableClient.get = originalGet
})

// ---------------------------------------------------------------------------
// systemHealth — getSystemHealthStats
// ---------------------------------------------------------------------------
describe('getSystemHealthStats', () => {
  it('maps raw metrics counters to typed SystemHealthStats', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/metrics')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            counters: {
              erlang_process_count: 512,
              erlang_memory_total_bytes: 104857600, // 100 MB
              erlang_memory_processes_bytes: 52428800, // 50 MB
              erlang_memory_ets_bytes: 10485760, // 10 MB
              imboy_online_users: 42,
              ws_connections_current: 38,
              db_pool_free: 8,
              db_pool_in_use: 2,
              msg_sent_today: 3500,
              api_calls_today: 9200,
            },
          },
        },
      }
    }

    const stats = await getSystemHealthStats()
    expect(stats.processCount).toBe(512)
    expect(stats.memoryTotalMB).toBe(100)
    expect(stats.memoryProcessesMB).toBe(50)
    expect(stats.memoryEtsMB).toBe(10)
    expect(stats.onlineUsers).toBe(42)
    expect(stats.wsConnections).toBe(38)
    expect(stats.dbPoolFree).toBe(8)
    expect(stats.dbPoolInUse).toBe(2)
  })

  it('separates system keys from app counters', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: {
          counters: {
            erlang_process_count: 100,
            erlang_memory_total_bytes: 0,
            erlang_memory_processes_bytes: 0,
            erlang_memory_ets_bytes: 0,
            imboy_online_users: 5,
            ws_connections_current: 5,
            db_pool_free: 4,
            db_pool_in_use: 1,
            // App-level counters (not system keys)
            custom_metric_a: 99,
            custom_metric_b: 12,
          },
        },
      },
    })

    const stats = await getSystemHealthStats()
    // App counters present
    expect(stats.appCounters.custom_metric_a).toBe(99)
    expect(stats.appCounters.custom_metric_b).toBe(12)
    // System keys NOT in appCounters
    expect(stats.appCounters.erlang_process_count).toBeUndefined()
    expect(stats.appCounters.imboy_online_users).toBeUndefined()
  })

  it('defaults missing counters to 0', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: { counters: {} }, // all counters absent
      },
    })

    const stats = await getSystemHealthStats()
    expect(stats.processCount).toBe(0)
    expect(stats.onlineUsers).toBe(0)
    expect(stats.dbPoolFree).toBe(0)
    expect(stats.appCounters).toEqual({})
  })

  it('throws when payload is missing', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: undefined },
    })

    await expect(getSystemHealthStats()).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// storage — getStorageStats
// ---------------------------------------------------------------------------
describe('getStorageStats', () => {
  it('returns storage stats from /storage/stats payload', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/storage/stats')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            total_files: 1200,
            total_size: 5368709120, // 5 GB
            image_count: 800,
            video_count: 100,
            document_count: 200,
            other_count: 100,
            today_uploads: 15,
            today_size: 1048576, // 1 MB
          },
        },
      }
    }

    const stats = await getStorageStats()
    expect(stats.total_files).toBe(1200)
    expect(stats.total_size).toBe(5368709120)
    expect(stats.image_count).toBe(800)
    expect(stats.today_uploads).toBe(15)
  })
})

// ---------------------------------------------------------------------------
// storage — getStorageList
// ---------------------------------------------------------------------------
describe('getStorageList', () => {
  it('returns paginated storage items from /storage/index', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/storage/index')
      expect(config?.params?.page).toBe(1)
      expect(config?.params?.size).toBe(20)
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            list: [
              {
                id: 'storage-001',
                md5: 'abc123',
                mime_type: 'image/jpeg',
                path: '/uploads/2026/01/photo.jpg',
                url: 'https://cdn.example.com/photo.jpg',
                size: 204800,
                referer_time: 1700000000,
                status: 1,
                created_at: '2026-01-15 10:00:00',
              },
            ],
            page: 1,
            size: 20,
            total: 1,
          },
        },
      }
    }

    const result = await getStorageList({ page: 1, size: 20 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('storage-001')
    expect(result.items[0].mime_type).toBe('image/jpeg')
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
  })

  it('forwards optional filters (mime_type, keyword)', async () => {
    const capturedParams: Record<string, unknown> = {}
    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      Object.assign(capturedParams, config?.params ?? {})
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { list: [], page: 1, size: 10, total: 0 },
        },
      }
    }

    await getStorageList({ page: 1, size: 10, mime_type: 'video/mp4', keyword: 'cat' })
    expect(capturedParams.mime_type).toBe('video/mp4')
    expect(capturedParams.keyword).toBe('cat')
  })

  it('handles total=0 by returning total_pages=1', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: { list: [], page: 1, size: 10, total: 0 },
      },
    })

    const result = await getStorageList({})
    expect(result.total).toBe(0)
    expect(result.total_pages).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// storage — formatFileSize (pure function)
// ---------------------------------------------------------------------------
describe('formatFileSize', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1 MB')
    expect(formatFileSize(10485760)).toBe('10 MB')
  })

  it('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB')
  })

  it('rounds to 2 decimal places', () => {
    // 1.5 MB = 1572864 bytes
    const result = formatFileSize(1572864)
    expect(result).toBe('1.5 MB')
  })
})
