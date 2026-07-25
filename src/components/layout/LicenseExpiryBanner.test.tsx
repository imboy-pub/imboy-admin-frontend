import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { LicenseExpiryBanner } from './LicenseExpiryBanner'
import { QuotaWarningBanner } from './QuotaWarningBanner'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

const envelope = (payload: unknown) => ({ data: { code: 0, msg: 'ok', payload } })

// AdminLayout 中两个横幅相邻挂载且共用 ['license-status']，测试按同样方式渲染
function renderBanners() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LicenseExpiryBanner />
      <QuotaWarningBanner />
    </QueryClientProvider>
  )
}

describe('license banners error state', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('renders one gray "unknown" banner instead of nothing when the license query fails', async () => {
    mutableClient.get = async () => {
      throw new Error('network down')
    }

    let view: ReturnType<typeof renderBanners>
    await act(async () => {
      view = renderBanners()
    })

    await waitFor(() => {
      expect(view!.getAllByText(/授权状态未知/)).toHaveLength(1)
    })
    // 不是静默 null，也不制造虚假紧迫感（灰色 muted，非 destructive/黄色）
    const banner = view!.getByText(/授权状态未知/).closest('div')!
    expect(banner.className).toContain('bg-muted')
    expect(banner.className).not.toContain('destructive')
    expect(banner.className).not.toContain('yellow')
  })

  it('stays silent when the license is healthy and within quota', async () => {
    mutableClient.get = async () =>
      envelope({
        edition: 'pro',
        valid: true,
        status: 'active',
        max_users: 1000,
        max_nodes: 4,
        current_users: 10,
        current_nodes: 1,
        licensee: 'imboy',
        expires_at: Math.floor(Date.now() / 1000) + 365 * 86400,
      })

    let view: ReturnType<typeof renderBanners>
    await act(async () => {
      view = renderBanners()
    })

    await waitFor(() => {
      expect(view!.queryByText(/授权状态未知/)).toBeNull()
    })
    expect(view!.container.textContent).toBe('')
  })
})
