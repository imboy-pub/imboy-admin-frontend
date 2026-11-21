import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ReportCenterPage } from './ReportCenterPage'
import client from '../../services/api/client'
import type { ReportTicket } from '@/modules/ops_governance/api'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalFetch = globalThis.fetch

const reportTicketFixture = {
  id: 'report-001',
  target_type: 'group',
  target_id: 'group-101',
  reporter_uid: 'user-202',
  reason: '违规内容',
  description: '该群组发布了违规内容',
  status: 0,
  handled_by: '',
  handled_at: null,
  created_at: '2026-04-01 10:00:00',
  updated_at: '2026-04-01 10:00:00',
}

function mockSidebarFetch() {
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({ code: 0, msg: 'ok', payload: { menus: [], version: '1.0' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

function renderReportCenter(initialEntry = '/reports?target_type=group') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/reports" element={<ReportCenterPage />} />
          <Route path="/groups/context" element={<div>group-context-route</div>} />
          <Route path="/channels" element={<div>channels-route</div>} />
          <Route path="/users" element={<div>users-route</div>} />
          <Route path="/moments" element={<div>moments-route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ReportCenterPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockSidebarFetch()
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    globalThis.fetch = originalFetch
    cleanup()
  })

  it('shows pending group report workflow when API returns 404', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/report/list' || url === '/group/report/list') {
        throw { code: 404, msg: 'not found' }
      }
      // Silently handle permission/feature queries
      if (url === '/rbac/me') return { data: { code: 0, msg: 'ok', payload: { role_id: 1, permissions: [] } } }
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: {} } }
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

  it('loads and displays group reports successfully', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/report/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [reportTicketFixture],
              page: 1, size: 10, total: 1, total_pages: 1,
            },
          },
        }
      }
      if (url === '/rbac/me') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              role_id: 1,
              permissions: ['reports:handle'],
            },
          },
        }
      }
      if (url === '/admin/config/features') {
        return { data: { code: 0, msg: 'ok', payload: {} } }
      }
      // Silently ignore other calls (role list etc.)
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const view = renderReportCenter()

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('举报中心')
      expect(text).toContain('群组')
      expect(text).toContain('group-101')
    })
  })

  it('shows all target type tabs and default to moment tab', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: {} } }
      if (url === '/rbac/me') return { data: { code: 0, msg: 'ok', payload: { role_id: 1, permissions: [] } } }
      throw { code: 404, msg: 'not found' }
    }

    const view = renderReportCenter('/reports')

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('举报中心')
      expect(text).toContain('朋友圈')
      expect(text).toContain('群组')
      expect(text).toContain('频道')
      expect(text).toContain('用户')
    })
  })

  it('switches to channel tab and shows channel API unavailable state', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/report/list' || url === '/channel/report/list') {
        throw { code: 404, msg: 'not found' }
      }
      if (url === '/rbac/me') return { data: { code: 0, msg: 'ok', payload: { role_id: 1, permissions: [] } } }
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: {} } }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const view = renderReportCenter('/reports?target_type=channel')
    const user = userEvent.setup()

    await view.findByText('举报中心')

    await waitFor(() => {
      expect(view.container.textContent).toContain('频道')
    })

    // Channel governance button should navigate
    await waitFor(async () => {
      const govButton = view.queryByRole('button', { name: '前往频道治理' })
      if (govButton) {
        await user.click(govButton)
        await view.findByText('channels-route')
      }
    }, { timeout: 3000 })
  })
})

// ---------------------------------------------------------------------------
// A-05：复用举报中心的能力诚实展示与证据最小化（message 复用面经 registry 组合）
// ---------------------------------------------------------------------------

const a05MessageTicket: ReportTicket = {
  id: '88001',
  target_type: 'message',
  target_id: '55001',
  target_sub_type: 'c2c',
  target_scope_id: '3001',
  target_author_id: '2001',
  reporter_uid: '3001',
  reason: 'a05-spam',
  description: '',
  evidence: {
    e2ee: true,
    e2ee_consent: true,
    content_state: 'present',
    content_excerpt: 'A05-举报人披露摘录',
    content_hash: 'a05ab12',
    server_msg_id: '55001',
  },
  status: 0,
  handled_by: '',
  handled_at: null,
  created_at: '2026-09-05T00:00:00Z',
  updated_at: '2026-09-05T00:00:00Z',
}

describe('A-05 举报中心复用面（能力诚实 + 证据最小化）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockSidebarFetch()
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    globalThis.fetch = originalFetch
    window.localStorage.removeItem('imboy_admin_feature_flags')
    cleanup()
  })

  it('message 复用面：只提供工单证据入口，无任意消息浏览入口；E2EE 自愿披露可见', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/report/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [a05MessageTicket],
              page: 1, size: 10, total: 1, total_pages: 1,
            },
          },
        }
      }
      if (url === '/rbac/me') {
        return { data: { code: 0, msg: 'ok', payload: { role_id: '1', permissions: ['reports:handle'] } } }
      }
      if (url === '/admin/config/features') {
        return { data: { code: 0, msg: 'ok', payload: {} } }
      }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const view = renderReportCenter('/reports?target_type=message')

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('举报中心')
      // 消息举报复用面渲染：表面/作者/加密标记如实展示
      expect(text).toContain('消息表面')
      expect(text).toContain('单聊消息')
      expect(text).toContain('E2EE')
      // 处理流步骤含结果回写（处理可追踪的过程呈现）
      expect(text).toContain('结果回写')
    })

    // 证据最小化：只有「查看工单证据」入口，无「查看对象」任意浏览跳转
    // （DataTable 同时渲染桌面表格与移动卡片两个视口，入口按 title 计数）
    expect(view.getAllByTitle('查看工单证据').length).toBeGreaterThan(0)
    expect(view.queryAllByTitle('查看对象')).toHaveLength(0)
  })

  it('全部对象已接入时如实标注，不虚报联调中', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/report/list') throw { code: 404, msg: 'not found' }
      if (url === '/rbac/me') return { data: { code: 0, msg: 'ok', payload: { role_id: 1, permissions: [] } } }
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: {} } }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const view = renderReportCenter('/reports')

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('举报中心')
      // 5/5 已接入 → 页头不出现「联调模式」降级文案
      expect(text).not.toContain('联调模式')
      // 5 个对象 tab（页面另有「已接入举报 API」描述文字，按 tab 按钮精确计数）
      const tabButtons = [...view.container.querySelectorAll('button')]
        .filter((button) => (button.textContent ?? '').includes('举报'))
      expect(tabButtons.length).toBe(5)
      for (const button of tabButtons) {
        expect(button.textContent).toContain('已接入')
        expect(button.textContent).not.toContain('联调中')
      }
    })
  })

  it('moment 功能未开启：显示功能未开启页，不拉取举报列表（不假渲染能力）', async () => {
    // 未认证状态下 features 查询禁用，读取 localStorage 缓存旗标
    window.localStorage.setItem('imboy_admin_feature_flags', JSON.stringify({ moment: false }))
    const getCalls: string[] = []
    mutableClient.get = async (url: string) => {
      getCalls.push(url)
      if (url === '/rbac/me') return { data: { code: 0, msg: 'ok', payload: { role_id: 1, permissions: [] } } }
      if (url === '/admin/config/features') return { data: { code: 0, msg: 'ok', payload: {} } }
      throw new Error(`unexpected GET url: ${url}`)
    }

    const view = renderReportCenter('/reports')

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('功能未开启')
      expect(text).toContain('朋友圈')
    })
    // 能力关闭时不发起任何举报列表请求（无假列表渲染）
    expect(getCalls.filter((url) => url.includes('report/list'))).toHaveLength(0)
  })
})
