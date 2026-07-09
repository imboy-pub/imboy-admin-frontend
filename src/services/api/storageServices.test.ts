/**
 * Unit tests for storage.ts service:
 *   formatFileSize — pure size formatter
 *   getStorageStats, getStorageList — API wrappers
 */
import { describe, expect, it, afterEach } from 'bun:test'
import client from './client'
import { formatFileSize, getStorageStats, getStorageList } from './storage'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }
const mutableClient = client as unknown as MutableClient
const origGet = mutableClient.get

afterEach(() => {
  mutableClient.get = origGet
})

// ---------------------------------------------------------------------------
// formatFileSize — pure function
// ---------------------------------------------------------------------------

describe('formatFileSize', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })

  it('formats bytes correctly', () => {
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('formats kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(2048)).toBe('2 KB')
  })

  it('formats megabytes correctly', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB')
  })

  it('formats gigabytes correctly', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
  })

  it('formats partial units with 2 decimal places', () => {
    // 1.5 KB = 1536 bytes
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })
})

// ---------------------------------------------------------------------------
// getStorageStats
// ---------------------------------------------------------------------------

describe('getStorageStats', () => {
  it('resolves with payload on success', async () => {
    const stats = {
      total_files: 100,
      total_size: 1024000,
      image_count: 50,
      video_count: 10,
      document_count: 20,
      other_count: 20,
      today_uploads: 5,
      today_size: 2048,
    }
    mutableClient.get = async () => ({ data: { code: 0, msg: 'ok', payload: stats } })
    const result = await getStorageStats()
    expect(result.total_files).toBe(100)
    expect(result.image_count).toBe(50)
  })

  it('throws on API error (no payload)', async () => {
    mutableClient.get = async () => ({ data: { code: 1, msg: 'error' } })
    await expect(getStorageStats()).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// getStorageList
// ---------------------------------------------------------------------------

describe('getStorageList', () => {
  it('returns paginated items with correct shape', async () => {
    const items = [{ id: '1', file_hash256: 'abc', mime_type: 'image/png', path: '/p', url: '/u', size: 100, referer_time: 0, status: 1, created_at: '2024-01-01' }]
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { list: items, page: 1, size: 10, total: 1 } },
    })
    const result = await getStorageList({ page: 1, size: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
  })

  it('defaults total_pages to 1 when total is 0', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { list: [], page: 1, size: 10, total: 0 } },
    })
    const result = await getStorageList({})
    expect(result.total_pages).toBe(1)
  })

  it('calculates total_pages correctly', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { list: [], page: 1, size: 10, total: 25 } },
    })
    const result = await getStorageList({ page: 1, size: 10 })
    expect(result.total_pages).toBe(3)
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => ({ data: { code: 1, msg: 'fail' } })
    await expect(getStorageList({})).rejects.toThrow()
  })
})
