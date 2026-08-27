import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ProductExperiencePage } from './ProductExperiencePage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn; patch: AnyFn; delete: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalPut = mutableClient.put
const originalPatch = mutableClient.patch

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/product-experience']}>
        <ProductExperiencePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const configFixture = {
  effective_product_experience: 'workspace',
  config_version: 'abc123def456abc1',
  configured_value: 'workspace',
  configured_raw: 'workspace',
  source: 'install_env',
  level: 'install',
}

describe('ProductExperiencePage（T11 只读页）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    mutableClient.put = originalPut
    mutableClient.patch = originalPatch
    cleanup()
  })

  it('displays effective value and config version (read-only)', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/product-experience') {
        return { data: { code: 0, msg: 'ok', payload: configFixture } }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('当前有效体验')
    })

    // effective 值、config_version、受控变更指引可见
    expect(view.container.textContent).toContain('workspace')
    const versionEl = view.getByTestId('config-version')
    expect(versionEl.textContent).toContain('abc123def456abc1')
    expect(view.container.textContent).toContain('本页面只读，无运行时切换按钮')

    // 零写接口零写按钮：页面没有任何写请求方法被调用
    let writeCalled = false
    mutableClient.post = async () => {
      writeCalled = true
      throw new Error('page must not POST')
    }
    mutableClient.put = async () => {
      writeCalled = true
      throw new Error('page must not PUT')
    }
    mutableClient.patch = async () => {
      writeCalled = true
      throw new Error('page must not PATCH')
    }
    await act(async () => {})
    expect(writeCalled).toBe(false)

    // 页面无提交/切换按钮
    const buttons = Array.from(view.baseElement.querySelectorAll('button'))
    const writableButtons = buttons.filter((b) =>
      ['保存', '应用', '切换', '提交', '启用'].includes((b.textContent || '').trim())
    )
    expect(writableButtons.length).toBe(0)
  })

  it('surfaces fail-safe downgrade when configured raw value is invalid', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/product-experience') {
        return {
          data: {
            code: 0,
            msg: 'ok',
            payload: {
              ...configFixture,
              effective_product_experience: 'chat',
              configured_value: 'chat',
              configured_raw: 'workspce-typo',
            },
          },
        }
      }
      throw new Error(`unexpected GET url: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('workspce-typo')
    })
    expect(view.container.textContent).toContain('fail-safe')
  })
})
