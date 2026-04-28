import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FeatureConfigPage } from './FeatureConfigPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const policyFixture = {
  effective: {
    features: {
      core: true,
      channel: true,
      moment: false,
      group_vote: true,
    },
  },
  meta: {
    features: {
      all: ['core', 'channel', 'moment', 'group_vote'],
      plugin_managed: [],
      standalone: ['core', 'channel', 'moment', 'group_vote'],
      dependencies: {},
    },
  },
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/features']}>
        <Routes>
          <Route path="/settings/features" element={<FeatureConfigPage />} />
          <Route path="/settings" element={<div>settings-home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('FeatureConfigPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays feature config', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/policy') {
        return { data: { code: 0, msg: 'ok', payload: policyFixture } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('功能开关')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载功能配置失败')
    })
  })

  it('displays feature names from fixture data', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/policy') {
        return { data: { code: 0, msg: 'ok', payload: policyFixture } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('功能开关')
      // Feature labels from FEATURE_DEFINITIONS
      expect(view.container.textContent).toContain('核心功能')
      expect(view.container.textContent).toContain('频道')
    })
  })
})
