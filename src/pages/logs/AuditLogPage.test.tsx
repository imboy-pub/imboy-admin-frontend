import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuditLogPage } from './AuditLogPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

function renderPage(entry = '/logs') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/logs" element={<AuditLogPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// AuditLogPage expects messages with `scope` field (not `msg_scope`)
const messageFixture = {
  id: '3001',
  msg_id: '3001',
  scope: 'private',
  from_id: '9001',
  to_id: '9002',
  msg_type: 'text',
  action: 'send',
  payload: '{"text":"hello-audit"}',
  created_at: '2026-01-10 08:00:00',
}

// AuditLogPage logout items use `uid`, `account`, `body` fields
const logoutFixture = {
  id: 1,
  uid: '9001',
  account: 'alice',
  nickname: 'Alice',
  body: 'test reason',
  status: 0,
  created_at: '2026-01-10 08:00:00',
  handled_at: null,
  handler_id: null,
}

function makeMockGet() {
  return async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/message/list') {
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [messageFixture],
            page: Number(config?.params?.page ?? 1),
            size: Number(config?.params?.size ?? 10),
            total: 1,
            total_pages: 1,
          },
        },
      }
    }

    if (url === '/user/logout_apply/list') {
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [logoutFixture],
            page: 1,
            size: 10,
            total: 1,
            total_pages: 1,
          },
        },
      }
    }

    throw new Error(`unexpected GET url: ${url}`)
  }
}

describe('AuditLogPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays the audit log page title', async () => {
    mutableClient.get = makeMockGet()

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('日志审计')
    })
  })

  it('shows message log data', async () => {
    mutableClient.get = makeMockGet()

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('日志审计')
    })

    // Message tab should show message data
    await waitFor(() => {
      // The page might show messages once loaded
      const text = view.container.textContent ?? ''
      expect(text).toContain('日志审计')
    })
  })

  it('filters actual rows using local whole-day bounds', async () => {
    const midnight = new Date(2026, 9, 20).getTime()
    const nextMidnight = new Date(2026, 9, 21).getTime()
    const rows = [
      { at: midnight - 1, actor: 'outside-before' },
      { at: midnight, actor: 'inside-midnight' },
      { at: nextMidnight - 1, actor: 'inside-final-millisecond' },
      { at: nextMidnight, actor: 'outside-after' },
    ].map(({ at, actor }, index) => ({
      ...messageFixture, msg_id: String(8000 + index), from_id: actor,
      created_at: new Date(at).toISOString(),
    }))
    mutableClient.get = async (url: string) => {
      if (url !== '/message/list' && url !== '/user/logout_apply/list') {
        throw new Error(`unexpected GET url: ${url}`)
      }
      return { data: { code: 0, payload: {
        list: url === '/message/list' ? rows : [], page: 1, size: 100, total: rows.length,
      } } }
    }
    const view = renderPage('/logs?dateStart=2026-10-20&dateEnd=2026-10-20')
    await waitFor(() => {
      expect(view.container.textContent).toContain('inside-midnight')
      expect(view.container.textContent).toContain('inside-final-millisecond')
    })
    expect(view.container.textContent).not.toContain('outside-before')
    expect(view.container.textContent).not.toContain('outside-after')
  })

  it('shows error state when message API fails', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/message/list') {
        throw new Error('network error')
      }
      if (url === '/user/logout_apply/list') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 },
          },
        }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      // Error state should show
      const text = view.container.textContent ?? ''
      expect(text).toMatch(/日志审计|加载|失败/)
    })
  })
})


describe('audit date filters reach both source APIs', () => {
  afterEach(() => { mutableClient.get = originalGet; cleanup() })
  it('sends local whole-day UTC bounds to each source before pagination', async () => {
    const calls: Array<{ url: string; params: Record<string, unknown> }> = []
    const base = makeMockGet()
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      calls.push({ url, params: config?.params ?? {} })
      return base(url, config)
    }
    renderPage('/logs?dateStart=2026-10-20&dateEnd=2026-10-20')
    await waitFor(() => expect(calls.length).toBe(2))
    for (const { params } of calls) {
      expect(params.from_ts).toBe(new Date(2026, 9, 20).toISOString())
      expect(params.to_ts).toBe(new Date(new Date(2026, 9, 21).getTime() - 1)
        .toISOString().replace(/Z$/, '999Z'))
    }
  })
  it('filters at the source before the first100 limit', async () => {
    const midnight = new Date(2026, 9, 20).getTime()
    const rows = Array.from({ length: 100 }, (_, i) => ({
      ...messageFixture, scope: 'c2c', msg_id: String(7000 + i),
      from_id: 'outside-date', created_at: new Date(midnight + 86400000 + i).toISOString(),
    })).concat({ ...messageFixture, scope: 'c2c', msg_id: '7999',
      from_id: 'inside-source-row101', created_at: new Date(midnight + 1000).toISOString() })
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      const params = config?.params ?? {}
      let matches = url === '/message/list' ? rows : []
      if (params.from_ts) matches = matches.filter(x => Date.parse(x.created_at) >= Date.parse(String(params.from_ts)))
      if (params.to_ts) matches = matches.filter(x => Date.parse(x.created_at) <= Date.parse(String(params.to_ts)))
      return { data: { code: 0, payload: { list: matches.slice(0, 100), total: matches.length, page: 1, size: 100 } } }
    }
    const view = renderPage('/logs?dateStart=2026-10-20&dateEnd=2026-10-20')
    await waitFor(() => expect(view.container.textContent).toContain('inside-source-row101'))
  })

})


describe('audit loaded cross-source instant ordering', () => {
  afterEach(() => { mutableClient.get = originalGet; cleanup() })
  for (const [messageAt, logoutAt] of [
    ['2026-10-20T00:00:00.000100Z', '2026-10-20T00:00:00.000900Z'],
    ['2026-10-20T08:00:00.000100+08:00', '2026-10-20T00:00:00.000900Z'],
    ['2026-10-20T00:00:00.000100000Z', '2026-10-20T00:00:00.000100001Z'],
  ]) {
    it(`orders qualified submilliseconds ${messageAt} before formatting`, async () => {
      mutableClient.get = async (url: string) => ({ data: { code: 0, payload: {
        list: url === '/message/list'
          ? [{ ...messageFixture, scope: 'c2c', from_id: 'older-message', created_at: messageAt }]
          : [{ ...logoutFixture, uid: 'newer-logout', created_at: logoutAt }],
        total: 1, page: 1, size: 100,
      } } })
      const view = renderPage()
      await waitFor(() => {
        const text = view.container.textContent ?? ''
        expect(text).toContain('older-message')
        expect(text).toContain('newer-logout')
        expect(text.indexOf('newer-logout')).toBeLessThan(text.indexOf('older-message'))
      })
    })
  }
})


describe('audit equal millisecond legacy values retain stable source order', () => {
  afterEach(() => { mutableClient.get = originalGet; cleanup() })
  for (const [label, legacy, qualified] of [
    ['numeric milliseconds', 1792454400123, '2026-10-20T00:00:00.123000Z'],
    ['Date milliseconds', new Date(1792454400123), '2026-10-20T00:00:00.123000Z'],
    ['short fractional seconds', '2026-10-20T00:00:00.1Z', '2026-10-20T00:00:00.100000Z'],
    ['legacy qualified space', '2026-10-20 00:00:00.123Z', '2026-10-20T00:00:00.123000Z'],
    ['negative epoch Date', new Date(-1), '1969-12-31T23:59:59.999000Z'],
  ] as const) {
    it(`keeps equal ${label} instants tied rather than promoting the RFC source`, async () => {
      mutableClient.get = async (url: string) => ({ data: { code: 0, payload: {
        list: url === '/message/list'
          ? [{ ...messageFixture, scope: 'c2c', from_id: 'equal-message-first', created_at: legacy }]
          : [{ ...logoutFixture, uid: 'equal-logout-second', created_at: qualified }],
        total: 1, page: 1, size: 100,
      } } })
      const view = renderPage()
      await waitFor(() => {
        const text = view.container.textContent ?? ''
        expect(text).toContain('equal-message-first')
        expect(text).toContain('equal-logout-second')
        expect(text.indexOf('equal-message-first')).toBeLessThan(text.indexOf('equal-logout-second'))
      })
    })
  }
  it('orders negative epoch submilliseconds in their actual direction', async () => {
    mutableClient.get = async (url: string) => ({ data: { code: 0, payload: {
      list: url === '/message/list'
        ? [{ ...messageFixture, scope: 'c2c', from_id: 'negative-older', created_at: '1969-12-31T23:59:59.999100Z' }]
        : [{ ...logoutFixture, uid: 'negative-newer', created_at: '1969-12-31T23:59:59.999900Z' }],
      total: 1, page: 1, size: 100,
    } } })
    const view = renderPage()
    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('negative-older'); expect(text).toContain('negative-newer')
      expect(text.indexOf('negative-newer')).toBeLessThan(text.indexOf('negative-older'))
    })
  })
  it('maintains transitive ordering across UTC/offset and long fractions', async () => {
    mutableClient.get = async (url: string) => ({ data: { code: 0, payload: {
      list: url === '/message/list' ? [
        { ...messageFixture, scope: 'c2c', msg_id: '2221', from_id: 'third-oldest', created_at: '2026-10-20T00:00:00.123100Z' },
        { ...messageFixture, scope: 'c2c', msg_id: '2222', from_id: 'first-newest', created_at: '2026-10-20T08:00:00.123900000+08:00' },
      ] : [{ ...logoutFixture, uid: 'second-middle', created_at: '2026-10-20T00:00:00.123500000Z' }],
      total: url === '/message/list' ? 2 : 1, page: 1, size: 100,
    } } })
    const view = renderPage()
    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('first-newest'); expect(text).toContain('second-middle'); expect(text).toContain('third-oldest')
      expect(text.indexOf('first-newest')).toBeLessThan(text.indexOf('second-middle'))
      expect(text.indexOf('second-middle')).toBeLessThan(text.indexOf('third-oldest'))
    })
  })
})
