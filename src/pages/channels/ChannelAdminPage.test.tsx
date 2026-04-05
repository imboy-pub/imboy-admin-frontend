import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ChannelAdminPage } from './ChannelAdminPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  put: AnyFn
  delete: AnyFn
}

type AdminApiCall = {
  page: number
  size: number
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPut = mutableClient.put
const originalDelete = mutableClient.delete

function renderChannelAdminPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/channels/8/admins']}>
        <Routes>
          <Route path="/channels/:id/admins" element={<ChannelAdminPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function hasRoleOptions(select: HTMLSelectElement): boolean {
  return Array.from(select.options).some((option) => option.value === '3')
}

describe('ChannelAdminPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.put = originalPut
    mutableClient.delete = originalDelete
    cleanup()
  })

  it('covers load, role update, remove and pagination interactions', async () => {
    const getCalls: AdminApiCall[] = []
    const putCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    const deleteCalls: string[] = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/channel/detail/8/admins') {
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
                user_id: 3001,
                role: 1,
                created_at: '2026-02-22 10:00:00',
                user: {
                  id: 3001,
                  nickname: 'admin-user',
                },
              },
            ],
            page,
            size,
            total: 18,
            total_pages: Math.ceil(18 / size),
          },
        },
      }
    }

    mutableClient.put = async (url: string, body: Record<string, unknown>) => {
      putCalls.push({ url, body })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    mutableClient.delete = async (url: string) => {
      deleteCalls.push(url)
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {},
        },
      }
    }

    let view: ReturnType<typeof renderChannelAdminPage>
    await act(async () => {
      view = renderChannelAdminPage()
    })

    await waitFor(() => {
      expect(getCalls.length).toBeGreaterThan(0)
    })

    expect(getCalls[0]).toEqual({ page: 1, size: 10 })
    await waitFor(() => {
      expect(view.container.textContent).toContain('频道管理员治理')
      expect(view.container.textContent).toContain('admin-user')
    })

    const selects = view.getAllByRole('combobox') as HTMLSelectElement[]
    const roleSelect = selects.find((select) => hasRoleOptions(select))
    if (!roleSelect) {
      throw new Error('role select not found')
    }

    await act(async () => {
      fireEvent.change(roleSelect, { target: { value: '2' } })
    })

    await waitFor(() => {
      expect(putCalls.length).toBe(1)
    })

    expect(putCalls[0]).toEqual({
      url: '/channel/detail/8/admin/3001/role',
      body: { role: 2 },
    })

    await act(async () => {
      const removeButtons = view.getAllByTitle('移除管理员')
      fireEvent.click(removeButtons[removeButtons.length - 1])
    })

    await waitFor(() => {
      expect(document.body.textContent).toContain('确认移除管理员')
    })

    await act(async () => {
      const removeButton = Array.from(view.baseElement.querySelectorAll('button'))
        .find(btn => btn.textContent === '移除')
      if (!removeButton) {
        throw new Error('移除按钮未找到')
      }
      fireEvent.click(removeButton)
    })

    await waitFor(() => {
      expect(deleteCalls.length).toBe(1)
    })

    expect(deleteCalls[0]).toBe('/channel/detail/8/admin/3001')

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '下一页' }))
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 2 && call.size === 10)).toBe(true)
    })

    const allSelects = view.getAllByRole('combobox') as HTMLSelectElement[]
    const pageSizeSelect = allSelects.find((select) => !hasRoleOptions(select))
    if (!pageSizeSelect) {
      throw new Error('page-size select not found')
    }

    await act(async () => {
      fireEvent.change(pageSizeSelect, { target: { value: '50' } })
    })

    await waitFor(() => {
      expect(getCalls.some((call) => call.page === 1 && call.size === 50)).toBe(true)
    })
  })
})
