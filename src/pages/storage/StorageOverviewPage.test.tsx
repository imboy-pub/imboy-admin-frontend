import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StorageOverviewPage } from './StorageOverviewPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

const statsFixture = {
  total_files: 500,
  total_size: 10485760,
  image_count: 200,
  video_count: 50,
  document_count: 100,
  other_count: 150,
  today_uploads: 10,
  today_size: 204800,
}

const listFixture = {
  list: [
    {
      id: 'file-001',
      md5: 'abc123',
      mime_type: 'image/png',
      path: '/uploads/2026/01/sample-image.png',
      url: 'https://cdn.example.com/sample-image.png',
      size: 102400,
      referer_time: 0,
      status: 1,
      created_at: '2026-01-10 10:00:00',
    },
  ],
  total: 1,
  page: 1,
  size: 10,
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/storage']}>
        <Routes>
          <Route path="/storage" element={<StorageOverviewPage />} />
          <Route path="/settings" element={<div>settings-page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('StorageOverviewPage flow', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('loads and displays storage stats with data', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/storage/stats') return { data: { code: 0, msg: 'ok', payload: statsFixture } }
      if (url === '/storage/index') return { data: { code: 0, msg: 'ok', payload: listFixture } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('存储管理')
      expect(text).toContain('总文件数')
      expect(text).toContain('500')
      expect(text).toContain('图片')
      expect(text).toContain('200')
      expect(text).toContain('视频')
      expect(text).toContain('50')
      expect(text).toContain('文件类型分布')
    })
  })

  it('shows empty file type distribution when no files exist', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/storage/stats') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: { ...statsFixture, total_files: 0 },
          },
        }
      }
      if (url === '/storage/index') return { data: { code: 0, msg: 'ok', payload: { list: [], total: 0, page: 1, size: 10 } } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无文件数据')
    })
  })

  it('still renders page shell when stats API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      // Page header always renders; graceful degradation when API fails
      expect(view.container.textContent).toContain('存储管理')
    })
  })
})
