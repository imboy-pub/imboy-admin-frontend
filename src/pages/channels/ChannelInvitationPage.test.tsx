import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ChannelInvitationPage } from './ChannelInvitationPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
}

type InvitationApiCall = {
  page: number
  size: number
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

function renderChannelInvitationPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/channels/8/invitations']}>
        <Routes>
          <Route path="/channels/:id/invitations" element={<ChannelInvitationPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ChannelInvitationPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('covers load and pagination interactions', async () => {
    const getCalls: InvitationApiCall[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/channel/detail/8/invitations') {
        throw new Error(`unexpected GET url: ${url}`)
      }

      const page = Number(config?.params?.page ?? 1)
      const size = Number(config?.params?.size ?? 10)
      getCalls.push({ page, size })

      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [
              {
                id: page,
                channel_id: 8,
                inviter_uid: 4001,
                invitee_uid: 4002,
                invitation_code: 'ABC123',
                status: 0,
                message: 'join us',
                expires_at: '2026-02-28 10:00:00',
                accepted_at: null,
                created_at: '2026-02-22 10:00:00',
                updated_at: '2026-02-22 10:00:00',
                inviter_user: {
                  id: 4001,
                  nickname: 'inviter-user',
                },
                invitee_user: {
                  id: 4002,
                  nickname: 'invitee-user',
                },
              },
            ],
            page,
            size,
            total: 31,
            total_pages: Math.ceil(31 / size),
          },
        },
      }
    }

    const view = renderChannelInvitationPage()

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({ page: 1, size: 10 })
    await view.findByText('频道邀请治理')
    await view.findByText('inviter-user')

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '下一页' }))
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 2 && call.size === 10)).toBe(true)
    })

    await act(async () => {
      fireEvent.change(view.getByRole('combobox'), {
        target: { value: '50' },
      })
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 1 && call.size === 50)).toBe(true)
    })
  })
})
