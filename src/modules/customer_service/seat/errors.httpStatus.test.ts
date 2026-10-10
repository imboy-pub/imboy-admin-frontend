import { describe, expect, it } from 'bun:test'
import { classifySeatError, SeatApiError } from './errors'
import { SeatApiClient } from './seatApiClient'

describe('Seat HTTP authentication status', () => {
  for (const status of [401, 403]) {
    for (const code of [706, 0, 5201]) {
      it(`keeps HTTP ${status} authoritative over envelope ${code}`, () => {
        const error = classifySeatError(status, code, 'rejected')
        expect(error.kind).toBe(status === 401 ? 'unauthorized' : 'forbidden')
        expect(error.status).toBe(status)
        expect(error.code).toBe(code)
      })
    }
  }

  for (const status of [401, 403]) {
    for (const code of [706, 0]) {
      it(`rejects JSON HTTP ${status} even with envelope ${code}`, async () => {
        let calls = 0
        const client = new SeatApiClient({
          getToken: () => null,
          fetchImpl: async () => {
            calls += 1
            return new Response(JSON.stringify({ code, msg: 'rejected', payload: {} }), { status })
          },
        })
        const error = await client.request('/cs/me/seat-contexts').catch((failure: unknown) => failure)
        expect(calls).toBe(1)
        expect(error).toBeInstanceOf(SeatApiError)
        expect((error as SeatApiError).kind).toBe(status === 401 ? 'unauthorized' : 'forbidden')
        expect((error as SeatApiError).code).toBe(code)
      })
    }
  }

  it('preserves QR business errors and HTTP 200 envelope denials', () => {
    expect(classifySeatError(200, 5201, 'expired').kind).toBe('qr_expired')
    expect(classifySeatError(400, 5204, 'not scanned').kind).toBe('qr_not_scanned')
    expect(classifySeatError(200, 403, 'denied').kind).toBe('forbidden')
    expect(classifySeatError(200, 706, 'unknown').kind).toBe('server')
  })
})

describe('Seat rejected authentication without an object envelope', () => {
  for (const status of [401, 403]) {
    for (const payload of [null, []]) {
      it(`classifies HTTP ${status} with JSON ${JSON.stringify(payload)}`, async () => {
        let calls = 0
        const client = new SeatApiClient({ fetchImpl: async () => {
          calls += 1
          return new Response(JSON.stringify(payload), { status })
        } })
        const error = await client.request('/cs/me/seat-contexts').catch((failure: unknown) => failure)
        expect(calls).toBe(1)
        expect(error).toBeInstanceOf(SeatApiError)
        expect((error as SeatApiError).kind).toBe(status === 401 ? 'unauthorized' : 'forbidden')
        expect((error as SeatApiError).status).toBe(status)
      })
    }
  }
})
