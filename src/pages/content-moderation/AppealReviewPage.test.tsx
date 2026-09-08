import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AppealReviewPage } from './AppealReviewPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  post: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const PENDING_APPEAL = {
  id: '801',
  action_id: '501',
  case_id: '9',
  appellant_uid: '77',
  reason: '处罚过重，希望解除禁言',
  status: 'pending',
  reviewer_id: '0',
  review_reason: '',
  reviewed_at: null,
  created_at: '2026-09-08T10:00:00Z',
}

function mockGet(list: Record<string, unknown>[]) {
  mutableClient.get = ((_url: string) =>
    Promise.resolve({
      data: { code: 0, msg: 'ok', payload: { list, page: 1 } },
    })) as AnyFn
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/moderation/appeals']}>
        <AppealReviewPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AppealReviewPage', () => {
  beforeEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
  })
  afterEach(() => {
    cleanup()
    mutableClient.get = originalGet
    mutableClient.post = originalPost
  })

  it('renders pending appeal rows with appeal reason', async () => {
    mockGet([PENDING_APPEAL])

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('处罚过重，希望解除禁言')
      expect(view.container.textContent).toContain('待复审')
    })
  })

  it('posts review verdict on confirm (accept -> reversal)', async () => {
    const posted: { url: string; body: Record<string, unknown> }[] = []
    mockGet([PENDING_APPEAL])
    mutableClient.post = ((url: string, body: Record<string, unknown>) => {
      posted.push({ url, body })
      return Promise.resolve({ data: { code: 0, data: { appeal: {} } } })
    }) as AnyFn

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('翻案')
    })

    await act(async () => {
      fireEvent.click(view.getAllByRole('button', { name: '翻案' })[0])
    })
    await waitFor(() => {
      expect(view.container.textContent).toContain('确认翻案')
    })
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '确认翻案' }))
    })

    await waitFor(() => {
      expect(posted.length).toBe(1)
    })
    expect(posted[0].url).toContain('/appeal/review')
    expect(posted[0].body.verdict).toBe('accept')
    expect(String(posted[0].body.id)).toBe('801')
  })

  it('keeps terminal appeals without action buttons', async () => {
    mockGet([{ ...PENDING_APPEAL, status: 'rejected' }])

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('已维持')
    })
    expect(view.queryByText('翻案')).toBeNull()
  })
})
