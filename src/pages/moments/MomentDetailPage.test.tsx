import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MomentDetailPage } from './MomentDetailPage'
import client from '../../services/api/client'

type AnyFn = (...args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  post: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

function renderMomentDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/moments/9001']}>
        <Routes>
          <Route path="/moments/:id" element={<MomentDetailPage />} />
          <Route path="/moments" element={<div>moments-route</div>} />
          <Route path="/moments/reports" element={<div>moment-reports-route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('MomentDetailPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('covers detail load and delete interaction', async () => {
    const getCalls: string[] = []
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []

    mutableClient.get = async (url: string) => {
      getCalls.push(url)
      if (url !== '/moment/detail/9001') {
        throw new Error(`unexpected GET url: ${url}`)
      }

      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            id: 9001,
            author_uid: 3001,
            content: 'moment-content',
            media: [],
            visibility: 0,
            allow_comment: true,
            stats: {
              like_count: 10,
              comment_count: 3,
            },
            status: 1,
            created_at: '2026-02-28 10:00:00',
            updated_at: '2026-02-28 10:00:00',
            acl: {
              allow_uids: [1001],
              deny_uids: [],
            },
            reports: [
              {
                id: 701,
                post_id: 9001,
                reporter_uid: 2001,
                reason: 'spam',
                description: 'ad links',
                status: 0,
                created_at: '2026-02-28 10:00:00',
              },
            ],
          },
        },
      }
    }

    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      postCalls.push({ url, body })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    const view = renderMomentDetailPage()

    await waitFor(() => {
      expect(getCalls).toEqual(['/moment/detail/9001'])
    })

    await view.findByText('动态详情 #9001')
    await view.findByText('moment-content')
    await view.findByText(/^原因:\s*spam$/)

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '删除动态' }))
    })

    await view.findByText('确认删除动态')

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '删除' }))
    })

    await waitFor(() => {
      expect(postCalls.length).toBe(1)
    })

    expect(postCalls[0]).toEqual({
      url: '/moment/delete',
      body: {
        moment_id: '9001',
        reason: 'admin_delete_from_detail',
      },
    })

    await view.findByText('moments-route')
  })

  it('supports navigate to reports from detail page', async () => {
    mutableClient.get = async (url: string) => {
      if (url !== '/moment/detail/9001') {
        throw new Error(`unexpected GET url: ${url}`)
      }
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            id: 9001,
            author_uid: 3001,
            content: 'moment-content',
            media: [],
            visibility: 0,
            allow_comment: true,
            stats: { like_count: 1, comment_count: 0 },
            status: 1,
            created_at: '2026-02-28 10:00:00',
            updated_at: '2026-02-28 10:00:00',
            reports: [],
          },
        },
      }
    }

    mutableClient.post = async () => {
      throw new Error('post should not be called in navigate test')
    }

    const view = renderMomentDetailPage()

    await view.findByText('动态详情 #9001')

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '举报处理' }))
    })

    await view.findByText('moment-reports-route')
  })
})
