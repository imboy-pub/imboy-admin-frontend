import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CapabilityConfigPage } from './CapabilityConfigPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const policyFixture = {
  effective: {
    capabilities: {
      storage_mode: 'archived',
      e2ee_mode: 'disabled',
      message_search: false,
      message_export: false,
    },
  },
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/capabilities']}>
        <Routes>
          <Route path="/settings/capabilities" element={<CapabilityConfigPage />} />
          <Route path="/settings" element={<div>settings-home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('CapabilityConfigPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays capability config', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/policy') {
        return { data: { code: 0, msg: 'ok', payload: policyFixture } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('能力配置')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载能力配置失败')
    })
  })

  it('displays capability option labels', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/policy') {
        return { data: { code: 0, msg: 'ok', payload: policyFixture } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('能力配置')
      // Should display storage_mode and e2ee_mode options
      expect(view.container.textContent).toContain('存储')
    })
  })
})
