import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserDetailPage } from './UserDetailPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const userDetailFixture = {
  id: '9001',
  account: 'user-alice',
  nickname: 'Alice',
  avatar: '',
  gender: 1,
  status: 1,
  region: 'CN',
  sign: 'hello',
  experience: 100,
  login_count: 5,
  last_login_ip: '127.0.0.1',
  last_login_at: '2026-01-10 08:00:00',
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-10 00:00:00',
}

function renderPage(uid = '9001') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/users/${uid}`]}>
        <Routes>
          <Route path="/users/:id" element={<UserDetailPage />} />
          <Route path="/users" element={<div>users-list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('UserDetailPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays user detail', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/user/detail') return { data: { code: 0, msg: 'ok', payload: userDetailFixture } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('Alice')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载用户详情失败')
    })
  })

  it('displays user fields from fixture data', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/user/detail') return { data: { code: 0, msg: 'ok', payload: userDetailFixture } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('Alice')
      expect(view.container.textContent).toContain('user-alice')
      expect(view.getByText('CN')).toBeDefined()
      expect(view.queryByText('地区标识')).toBeNull()
    })
  })

  it('shows the legacy region and structured identity in separate fields', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: {
          ...userDetailFixture,
          region: '中国 北京',
          regionSelection: {
            countryCode: 'CN',
            datasetId: 'china-administrative-divisions',
            pathIds: ['cc:CN', 'cn:110000'],
            dataRevision: 's-1234567890123456',
          },
          regionSelectionStatus: 'resolved',
        },
      },
    })

    const view = renderPage()
    expect(await view.findByText('中国 北京')).toBeDefined()
    expect(view.getByText('cc:CN / cn:110000')).toBeDefined()
    expect(view.getByText('数据版本 s-1234567890123456')).toBeDefined()
    expect(view.getByText('已解析')).toBeDefined()
  })

  it('shows the legacy edit and unresolved status after the backend clears the selection', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: {
          ...userDetailFixture,
          region: '旧端修改',
          regionSelection: null,
          regionSelectionStatus: 'unresolved',
        },
      },
    })

    const view = renderPage()
    expect(await view.findByText('旧端修改')).toBeDefined()
    expect(view.getByText('未解析')).toBeDefined()
    expect(view.queryByText('地区标识')).toBeNull()
  })
})
