import { describe, expect, it } from 'bun:test'
import { getApiPayload, requireApiPayload } from './responseAdapter'
import { ApiResponse } from '@/types/api'

describe('getApiPayload', () => {
  it('reads payload as canonical field', () => {
    const raw: ApiResponse<{ id: number }> = {
      code: 0,
      msg: 'ok',
      payload: { id: 1 },
    }

    expect(getApiPayload(raw)).toEqual({ id: 1 })
  })

  it('returns undefined when payload is missing', () => {
    const raw = {
      code: 0,
      msg: 'ok',
      data: { id: 2 },
    } as ApiResponse<{ id: number }>

    expect(getApiPayload(raw)).toBeUndefined()
  })

  it('returns undefined for empty response object', () => {
    expect(getApiPayload(undefined)).toBeUndefined()
  })

  it('normalizes legacy paginated payload with list field', () => {
    const raw = {
      code: 0,
      msg: 'ok',
      payload: {
        page: 1,
        size: 20,
        total: 45,
        list: [{ id: 11 }],
      },
    } as ApiResponse<{
      page: number
      size: number
      total: number
      list: Array<{ id: number }>
      items?: Array<{ id: number }>
      total_pages?: number
    }>

    const payload = getApiPayload(raw)
    expect(payload?.items).toEqual([{ id: 11 }])
    expect(payload?.total_pages).toBe(3)
  })
})

describe('requireApiPayload', () => {
  it('returns payload when present', () => {
    const raw: ApiResponse<{ id: number }> = {
      code: 0,
      msg: 'ok',
      payload: { id: 3 },
    }

    expect(requireApiPayload(raw, '/test')).toEqual({ id: 3 })
  })

  it('throws when payload is missing', () => {
    const raw: ApiResponse<{ id: number }> = {
      code: 0,
      msg: 'ok',
    }

    expect(() => requireApiPayload(raw, '/missing')).toThrow(
      'Missing payload in API response (/missing)'
    )
  })
})
