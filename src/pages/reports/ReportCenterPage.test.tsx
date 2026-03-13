import '../../test/setupDom'

import { afterEach, describe, it } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ReportCenterPage } from './ReportCenterPage'
import client from '../../services/api/client'

type AnyFn = (...args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

function renderReportCenter(initialEntry = '/reports?target_type=group') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/reports" element={<ReportCenterPage />} />
          <Route path="/groups/context" element={<div>group-context-route</div>} />
          <Route path="/channels" element={<div>channels-route</div>} />
          <Route path="/users" element={<div>users-route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ReportCenterPage flow', () => {
  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('shows pending group report workflow and can navigate to governance page', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/report/list' || url === '/group/report/list') {
        throw { code: 404, msg: 'not found' }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    const view = renderReportCenter()
    const user = userEvent.setup()

    await view.findByText('举报中心')
    await view.findByText('群组举报 API 暂未接入')
    await view.findByRole('button', { name: '前往群上下文入口' })

    await user.click(view.getByRole('button', { name: '前往群上下文入口' }))
    await view.findByText('group-context-route')
  })
})
