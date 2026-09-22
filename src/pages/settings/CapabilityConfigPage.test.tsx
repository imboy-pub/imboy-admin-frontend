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

// GET /admin/config/policy 返回扁平的 effective 策略（getPolicyEffective 负责包一层）。
// 这里刻意用 disabled+archived（企业预设的历史组合）验证"非标准组合"提示路径。
const policyFixture = {
  profile: 'enterprise',
  capabilities: {
    storage_mode: 'archived',
    e2ee_mode: 'disabled',
    message_search: false,
    message_export: false,
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
      // 加密档位单选组：档位名与"非标准组合"提示（fixture 是 disabled+archived 历史组合）
      expect(view.container.textContent).toContain('加密档位')
      expect(view.container.textContent).toContain('关闭（明文交付）')
      expect(view.container.textContent).toContain('强制（纯端到端）')
      expect(view.container.textContent).toContain('非标准组合')
    })
  })

  it('选择档位后保存：PUT 同时携带 e2ee_mode 与 storage_mode', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/policy') {
        return { data: { code: 0, msg: 'ok', payload: policyFixture } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }
    let capturedBody: { capabilities?: { e2ee_mode?: string; storage_mode?: string } } | null = null
    mutableClient.put = async (_url: string, body: unknown) => {
      capturedBody = body as typeof capturedBody
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    // 点「强制（纯端到端）」档位卡片
    await waitFor(() => {
      expect(view.container.textContent).toContain('加密档位')
    })
    const tierButton = Array.from(view.container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('强制（纯端到端）'),
    )
    expect(tierButton).toBeTruthy()
    await act(async () => { tierButton!.click() })

    const saveButton = Array.from(view.container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('保存配置'),
    )
    expect(saveButton).toBeTruthy()
    await act(async () => { saveButton!.click() })

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
    })
    // 档位选择同时套用两个字段（ENCRYPTION_TIERS 映射：required = required + secure_e2ee）
    expect(capturedBody!.capabilities?.e2ee_mode).toBe('required')
    expect(capturedBody!.capabilities?.storage_mode).toBe('secure_e2ee')
  })
})
