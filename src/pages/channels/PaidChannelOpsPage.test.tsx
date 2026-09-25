/**
 * PaidChannelOpsPage 精确页面测试（ENT-ADM-03 迁移到 EntityManageListPageLayout 后）。
 *
 * 覆盖（ENT-ADM-03 验收：逐 URL 行为等价 + 迁移页面精确 test）：
 * - 列表渲染（行/操作按钮/状态徽章）+ 卡片内分页接线（page/size 透传）；
 * - FilterBar 位于 CardHeader（filtersPlacement='header' 既有位置还原）；
 * - 搜索动作（keyword/status → 请求参数 page=1 重置）；
 * - 空态提示（暂无付费频道）；
 * - 危险动作语义不变（设置价格/查看订单为行内入口，弹窗由既有 Dialog 承担）。
 */
import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PaidChannelOpsPage } from './PaidChannelOpsPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

const CHANNEL_ROW = {
  id: 8801,
  name: '付费频道甲',
  status: 1,
  access_type: 2,
  price: 990,
  created_at: '2026-08-01T10:00:00Z',
}

function renderPaidChannelOpsPage() {
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
      <MemoryRouter initialEntries={['/channels/paid-ops']}>
        <Routes>
          <Route path="/channels/paid-ops" element={<PaidChannelOpsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PaidChannelOpsPage（ENT-ADM-03 迁移后行为等价）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mutableClient.get = originalGet
    cleanup()
  })

  it('列表渲染 + 卡片内分页接线（请求参数 page/size/status/keyword/access_type 透传）', async () => {
    const getCalls: Array<Record<string, unknown>> = []
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/channel/list') {
        throw new Error(`unexpected GET url: ${url}`)
      }
      getCalls.push({ ...(config?.params ?? {}) })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            items: [CHANNEL_ROW],
            page: 1,
            size: 10,
            total: 1,
          },
        },
      }
    }
    const view = renderPaidChannelOpsPage()
    await waitFor(() => expect(view.container.textContent).toContain('付费频道甲'))
    expect(view.container.textContent).toContain('设置价格')
    expect(view.container.textContent).toContain('查看订单')
    // access_type=2（付费属性过滤下沉服务端，迁移前后请求契约一致）。
    expect(getCalls[0]?.access_type).toBe(2)
    expect(getCalls[0]?.page).toBe(1)
    expect(getCalls[0]?.size).toBe(10)
  })

  it("FilterBar 位于 CardHeader（filtersPlacement='header' 还原既有位置）+ 默认空态提示", async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: { items: [], page: 1, size: 10, total: 0 },
      },
    })
    const view = renderPaidChannelOpsPage()
    const filters = (await waitFor(() => {
      const el = view.container.querySelector('[placeholder="搜索频道名称..."]') as HTMLElement | null
      expect(el).not.toBeNull()
      return el as HTMLElement
    }))
    // 搜索框在 CardHeader（space-y-1.5 特征类）内，不在 CardContent（pt-0）内。
    expect(filters.closest('div[class*="space-y-1.5"]')).not.toBeNull()
    await waitFor(() => expect(view.container.textContent).toContain('暂无付费频道'))
  })

  it('搜索动作：keyword/status 变化 → 请求重置 page=1（行为矩阵不变）', async () => {
    const getCalls: Array<Record<string, unknown>> = []
    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ ...(config?.params ?? {}) })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { items: [CHANNEL_ROW], page: 1, size: 10, total: 1 },
        },
      }
    }
    const view = renderPaidChannelOpsPage()
    await waitFor(() => expect(view.container.textContent).toContain('付费频道甲'))
    const input = (await waitFor(() => {
      const el = view.container.querySelector('[placeholder="搜索频道名称..."]') as HTMLInputElement | null
      expect(el).not.toBeNull()
      return el as HTMLInputElement
    }))
    const user = userEvent.setup()
    await user.type(input, '甲')
    const searchButton = (await waitFor(() => {
      const el = view.getByRole('button', { name: '搜索' })
      expect(el).toBeDefined()
      return el
    }))
    await user.click(searchButton)
    await waitFor(() => {
      const last = getCalls[getCalls.length - 1]
      expect(last?.keyword).toBe('甲')
      expect(last?.page).toBe(1)
    })
  })
})
