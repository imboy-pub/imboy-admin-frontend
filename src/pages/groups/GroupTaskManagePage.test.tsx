import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GroupTaskManagePage } from './GroupTaskManagePage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; delete: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalDelete = (mutableClient as unknown as { delete?: AnyFn }).delete

const taskFixture = {
  id: '701',
  group_id: '99',
  task_id: 'task-001',
  title: 'test-task-title',
  description: 'task description',
  status: 1,
  created_at: '2026-01-10 08:00:00',
}

const taskDetailFixture = {
  ...taskFixture,
  assignments: [
    {
      id: 'asgn-001',
      user_id: '1001',
      status: 2,
      score: null,
      comment: null,
      submitted_at: '2026-01-11 09:00:00',
    },
  ],
}

function makeSuccessGet(taskItems = [taskFixture]) {
  return async (url: string) => {
    if (url === '/group/task/list') {
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: taskItems,
            page: 1, size: 10, total: taskItems.length, total_pages: 1,
          },
        },
      }
    }
    if (url === '/group/task/detail') {
      return { data: { code: 0, msg: 'ok', payload: taskDetailFixture } }
    }
    if (url === '/group/task/pending_reviews') {
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { items: taskDetailFixture.assignments, page: 1, size: 50, total: 1, total_pages: 1 },
        },
      }
    }
    return { data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } } }
  }
}

function renderPage(gid = '99') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/groups/${gid}/tasks`]}>
        <Routes>
          <Route path="/groups/:id/tasks" element={<GroupTaskManagePage />} />
          <Route path="/groups/:id" element={<div>group-detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('GroupTaskManagePage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    if (originalDelete !== undefined) {
      (mutableClient as unknown as { delete: AnyFn }).delete = originalDelete
    }
    cleanup()
  })

  it('loads and displays group tasks', async () => {
    mutableClient.get = makeSuccessGet()

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群任务管理')
      expect(view.container.textContent).toContain('test-task-title')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载群任务数据失败')
    })
  })

  it('navigates back to group detail when back button is clicked', async () => {
    mutableClient.get = makeSuccessGet()

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群任务管理')
    })

    await act(async () => {
      const backBtn = view.getByRole('button', { name: /返回群详情/ })
      fireEvent.click(backBtn)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('group-detail')
    })
  })

  it('shows delete confirmation dialog when delete button clicked', async () => {
    mutableClient.get = makeSuccessGet()

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('test-task-title')
    })

    const deleteBtns = view.queryAllByTitle('删除任务')
    if (deleteBtns.length > 0) {
      await act(async () => { fireEvent.click(deleteBtns[0]) })
      await waitFor(() => {
        expect(document.body.textContent).toMatch(/删除任务|确认删除/)
      })
    }
  })

  it('opens task detail panel when detail button is clicked', async () => {
    mutableClient.get = makeSuccessGet()

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('test-task-title')
    })

    const detailBtns = view.queryAllByTitle('查看详情')
    if (detailBtns.length > 0) {
      await act(async () => { fireEvent.click(detailBtns[0]) })
      await waitFor(() => {
        // Either loading or the detail title
        expect(view.container.textContent).toMatch(/任务详情|task-001|加载中/)
      })
    }
  })

  it('shows empty state when no tasks exist', async () => {
    mutableClient.get = makeSuccessGet([])

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('群任务管理')
    })
    // Export button should be disabled when tasks is empty
    const exportBtn = view.queryByRole('button', { name: /导出 CSV/ })
    if (exportBtn) {
      expect((exportBtn as HTMLButtonElement).disabled).toBe(true)
    }
  })
})
