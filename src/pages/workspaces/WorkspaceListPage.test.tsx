import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WorkspaceListPage } from './WorkspaceListPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

function WorkspaceDetailProbe() {
  return <div>workspace-detail-probe</div>
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/workspaces']}>
        <Routes>
          <Route path="/workspaces" element={<WorkspaceListPage />} />
          <Route path="/workspaces/:id" element={<WorkspaceDetailProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const workspaceFixture = {
  id: '800001',
  name: 'ops-ws',
  owner_id: '900001',
  owner_nickname: 'alice',
  status: 'active',
  created_at: '2026-01-10 08:00:00',
  project_count: 3,
  group_count: 2,
  channel_count: 1,
  member_count: 5,
}

function makeWorkspaceListResponse(items = [workspaceFixture]) {
  return {
    data: {
      code: 0,
      msg: 'ok',
      payload: {
        items,
        page: 1,
        size: 10,
        total: items.length,
        total_pages: 1,
      },
    },
  }
}

describe('WorkspaceListPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays workspace list with resource counts', async () => {
    const getCalls: Array<{ url: string; params?: Record<string, unknown> }> = []

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: config?.params })
      if (url === '/workspace/list') {
        return makeWorkspaceListResponse()
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(getCalls.some((c) => c.url === '/workspace/list')).toBe(true)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('工作区管理')
      expect(view.container.textContent).toContain('ops-ws')
      expect(view.container.textContent).toContain('800001')
    })
  })

  it('requests list with page size 10 by default', async () => {
    let capturedParams: Record<string, unknown> | undefined

    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      capturedParams = config?.params
      return makeWorkspaceListResponse()
    }

    await act(async () => {
      renderPage()
    })

    await waitFor(() => {
      expect(capturedParams).toBeDefined()
    })
    expect(capturedParams?.size).toBe(10)
    expect(capturedParams?.page).toBe(1)
  })

  it('archives a workspace via confirm dialog with TSID string body', async () => {
    const getUrls: string[] = []
    const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []

    mutableClient.get = async (url: string) => {
      getUrls.push(url)
      if (url === '/workspace/list') return makeWorkspaceListResponse()
      throw new Error(`unexpected GET url: ${url}`)
    }

    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      postCalls.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('ops-ws')
    })

    // 点击归档按钮 → 必须先出现二次确认
    await act(async () => {
      const archiveButtons = view.getAllByTitle('归档工作区')
      fireEvent.click(archiveButtons[archiveButtons.length - 1])
    })

    await waitFor(() => {
      expect(document.body.textContent).toContain('确认归档工作区')
    })

    // 归档前不得发出任何写请求
    expect(postCalls.length).toBe(0)

    await act(async () => {
      const confirmBtn = Array.from(view.baseElement.querySelectorAll('button'))
        .find((btn) => btn.textContent === '归档')
      if (!confirmBtn) throw new Error('归档确认按钮未找到')
      fireEvent.click(confirmBtn)
    })

    await waitFor(() => {
      expect(postCalls.some((c) => c.url === '/workspace/archive')).toBe(true)
    })

    // 归档联动语义提示 + TSID 以 string 下发（禁 Number 回转）
    expect(postCalls.find((c) => c.url === '/workspace/archive')?.body).toMatchObject({
      workspace_id: '800001',
    })
  })
})
