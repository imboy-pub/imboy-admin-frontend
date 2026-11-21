import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import {
  LogoutApplicationListPage,
  executionStatusText,
  requestStatusText,
} from './LogoutApplicationListPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const applicationFixture = {
  uid: '9001',
  account: 'user-alice',
  nickname: 'Alice',
  user_status: 2,
  app_vsn: '1.0.0',
  did: 'device-001',
  dtype: 'ios',
  ip: '127.0.0.1',
  created_at: '2026-01-10 08:00:00',
  body: 'reason for logout',
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/logout-applications']}>
        <Routes>
          <Route path="/logout-applications" element={<LogoutApplicationListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LogoutApplicationListPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays logout applications', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/user/logout_apply/list') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: {
              items: [applicationFixture],
              page: 1, size: 10, total: 1, total_pages: 1,
            },
          },
        }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('注销申请')
      expect(view.container.textContent).toContain('user-alice')
    })
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载注销申请数据失败')
    })
  })

  it('shows empty state when no logout applications', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/user/logout_apply/list') {
        return { data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 10, total: 0, total_pages: 0 } } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无数据')
    })
  })
})

// ---------------------------------------------------------------------------
// A-05：只展示后端已实现状态（申请/批准/执行中/完成/例外可区分，批准≠擦除）
// 与 注销 vs 企业保留记录结果可解释。
// 行 fixture 镜像 adm_logout_apply_handler normalize_list_row 真实合同：
// list 行带 user_status + request_status/execution_status（后端 list 键经
// responseAdapter 归一为 items，本组用例直接使用后端原生 list 键）。
// ---------------------------------------------------------------------------

type A05Row = {
  uid: string
  account: string
  nickname: string
  user_status: number
  app_vsn: string
  did: string
  dtype: string
  ip: string
  created_at: string
  body: string
  request_status?: string
  execution_status?: string
  execution_finished_at?: string
  request_approved_at?: string
}

function makeA05Row(overrides: Partial<A05Row> = {}): A05Row {
  return {
    uid: '9101',
    account: 'user-a05',
    nickname: 'A05-用户',
    user_status: 2,
    app_vsn: '1.0.0',
    did: 'did-a05-0001',
    dtype: 'ios',
    ip: '127.0.0.1',
    created_at: '2026-01-10 08:00:00',
    body: '{"reason":"a05"}',
    ...overrides,
  }
}

const a05PostCalls: Array<{ url: string; body: unknown }> = []
const originalA05Fetch = globalThis.fetch

function mockSidebarFetchA05() {
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({ code: 0, msg: 'ok', payload: { menus: [], version: '1.0' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }) as typeof globalThis.fetch
}

/** 有审批权限的 /rbac/me（角色 '1' + logout_applications:approve）。 */
const RBAC_CAN_APPROVE = { role_id: '1', permissions: ['logout_applications:approve'] }
/** 无审批权限（角色 '3'，权限集为空）。 */
const RBAC_CANNOT_APPROVE = { role_id: '3', permissions: [] as string[] }

function mockA05Gets(rows: A05Row[], rbac: { role_id: string; permissions: string[] }) {
  mutableClient.get = async (url: string) => {
    if (url === '/user/logout_apply/list') {
      return {
        data: {
          code: 0, msg: 'ok',
          payload: { list: rows, total: rows.length, page: 1, size: 10 },
        },
      }
    }
    if (url === '/rbac/me') {
      return { data: { code: 0, msg: 'ok', payload: rbac } }
    }
    throw new Error(`unexpected GET: ${url}`)
  }
}

describe('A-05 注销状态展示（request/execution 可查状态，批准≠擦除）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    a05PostCalls.length = 0
    mockSidebarFetchA05()
    mutableClient.post = async (url: string, body: unknown) => {
      a05PostCalls.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: { uid: '9101', status: 'approved' } } }
    }
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    globalThis.fetch = originalA05Fetch
    cleanup()
  })

  it('批准≠擦除：账号已注销但删除任务在宽限期待执行，无任何完成/擦除表述', async () => {
    mockA05Gets([
      makeA05Row({
        uid: '9101',
        user_status: -1,
        request_status: 'approved',
        execution_status: 'pending',
        request_approved_at: '2026-02-01T10:00:00Z',
      }),
    ], RBAC_CAN_APPROVE)

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      // 账号旗标与数据删除进度分开呈现
      expect(text).toContain('已注销')
      expect(text).toContain('已批准')
      expect(text).toContain('待执行（宽限期）')
    })
    // 批准即宣称擦除 = 禁止：该行未完成执行不得出现完成表述
    // （页面级说明文字含「已完成前不代表数据已擦除」免责声明，负例按行收窄）
    const row = [...view.container.querySelectorAll('tr')]
      .find((tr) => (tr.textContent ?? '').includes('9101'))
    expect(row).toBeDefined()
    const rowText = row?.textContent ?? ''
    expect(rowText).toContain('待执行（宽限期）')
    expect(rowText).not.toContain('已执行完成')
    expect(rowText).not.toContain('完成于')
    expect(rowText).not.toContain('执行失败')
    expect(view.container.textContent ?? '').not.toContain('已执行完成')
  })

  it('注销进度区分申请/批准/执行中/完成/例外（后端已实现状态全集）', async () => {
    mockA05Gets([
      makeA05Row({ uid: '9101', user_status: 2, request_status: 'requested', execution_status: 'not_started' }),
      makeA05Row({ uid: '9102', user_status: -1, request_status: 'approved', execution_status: 'running' }),
      makeA05Row({
        uid: '9103',
        user_status: -1,
        request_status: 'approved',
        execution_status: 'completed',
        execution_finished_at: '2026-04-02T10:00:00Z',
      }),
      makeA05Row({ uid: '9104', user_status: -1, request_status: 'approved', execution_status: 'failed' }),
      makeA05Row({ uid: '9105', user_status: 1, request_status: 'cancelled', execution_status: 'not_started' }),
    ], RBAC_CAN_APPROVE)

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('已申请')
      expect(text).toContain('未开始')
      expect(text).toContain('执行中')
      expect(text).toContain('已执行完成')
      expect(text).toContain('完成于')
      expect(text).toContain('执行失败（例外）')
      expect(text).toContain('已取消')
      expect(text).toContain('已驳回')
    })
  })

  it('状态映射未知/缺失值原样或降级显示，不伪造状态', () => {
    // 纯函数级：后端新增枚举未跟进时原样透传（可审计），缺失显示 '-'
    expect(requestStatusText(undefined)).toBe('-')
    expect(executionStatusText(undefined)).toBe('-')
    expect(requestStatusText('future_request_state')).toBe('future_request_state')
    expect(executionStatusText('future_exec_state')).toBe('future_exec_state')
    expect(requestStatusText('unknown')).toBe('无正式申请记录')
  })

  it('存量旗标行（无正式申请/任务状态字段）不伪造进度', async () => {
    mockA05Gets([makeA05Row({ uid: '9106', user_status: 2 })], RBAC_CAN_APPROVE)

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('注销中')
      expect(text).toContain('-')
      // 不出现的后端态不允许被 UI 伪造
      expect(text).not.toContain('已执行完成')
      expect(text).not.toContain('执行中')
    })
  })

  it('审批弹窗解释注销与企业保留记录的不同结果；取消不发起请求', async () => {
    mockA05Gets([
      makeA05Row({ uid: '9101', user_status: 2, request_status: 'requested', execution_status: 'not_started' }),
    ], RBAC_CAN_APPROVE)

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    const approveButton = await waitFor(() => {
      const button = [...view.container.querySelectorAll('button')]
        .find((item) => item.textContent?.trim() === '通过')
      expect(button).toBeDefined()
      return button as HTMLButtonElement
    })
    fireEvent.click(approveButton)

    await waitFor(() => {
      const bodyText = document.body.textContent ?? ''
      expect(bodyText).toContain('确认审批通过')
      // A-05:LOCAL:03：两类结果都可解释
      expect(bodyText).toContain('宽限期')
      expect(bodyText).toContain('后台删除任务')
      expect(bodyText).toContain('企业持有')
      expect(bodyText).toContain('保留例外记录')
      // 免责声明在场 = 弹窗不把审批当作擦除完成
      expect(bodyText).toContain('不代表数据已擦除')
      // 弹窗不得出现完成态表述（免责声明文字除外）
      expect(bodyText).not.toContain('已执行完成')
    })

    const cancelButton = [...document.body.querySelectorAll('button')]
      .find((item) => item.textContent?.trim() === '取消')
    expect(cancelButton).toBeDefined()
    fireEvent.click(cancelButton as HTMLButtonElement)
    await waitFor(() => {
      expect(a05PostCalls).toHaveLength(0)
    })
  })

  it('确认通过调用真实审批端点，uid 字符串不变形', async () => {
    mockA05Gets([
      makeA05Row({ uid: '9123456789012345601', user_status: 2, request_status: 'requested' }),
    ], RBAC_CAN_APPROVE)

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    const approveButton = await waitFor(() => {
      const button = [...view.container.querySelectorAll('button')]
        .find((item) => item.textContent?.trim() === '通过')
      expect(button).toBeDefined()
      return button as HTMLButtonElement
    })
    fireEvent.click(approveButton)

    const confirmButton = await waitFor(() => {
      const button = [...document.body.querySelectorAll('button')]
        .find((item) => item.textContent?.trim() === '确认通过')
      expect(button).toBeDefined()
      return button as HTMLButtonElement
    })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(a05PostCalls).toHaveLength(1)
    })
    expect(a05PostCalls[0]?.url).toBe('/user/logout_apply/approve')
    expect(a05PostCalls[0]?.body).toEqual({ uid: '9123456789012345601' })
    // EntityId 精度哨兵：19 位 TSID 走字符串通道
    expect(String(Number('9123456789012345601'))).not.toBe('9123456789012345601')
  })

  it('无审批权限：操作列只读且零审批请求（操作权限复核）', async () => {
    mockA05Gets([
      makeA05Row({ uid: '9101', user_status: 2, request_status: 'requested' }),
    ], RBAC_CANNOT_APPROVE)

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('无权限')
    })
    const rowButtons = [...view.container.querySelectorAll('button')]
      .filter((item) => item.textContent?.trim() === '通过' || item.textContent?.trim() === '驳回')
    expect(rowButtons).toHaveLength(0)
    expect(a05PostCalls).toHaveLength(0)
  })
})
