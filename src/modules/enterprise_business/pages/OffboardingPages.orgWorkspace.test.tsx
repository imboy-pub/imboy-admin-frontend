/**
 * EADM-03 W2 接线测试 —— 离岗交接列表页 / 详情页的 org/ws 上下文接线。
 *
 * 覆盖（对应 EADM-03 完成标准）：
 * ① 选择新组织后工作区列表按新 organizationId 级联刷新（并清掉旧 ws）；
 * ② org / ws 写入 URL，且从 URL 恢复（刷新 / 分享后上下文不丢失，
 *    含列表 → 详情的上下文透传）；
 * ③ 主流程无裸 TSID 输入框（排障区只读、无表单控件）。
 *
 * 替身说明（unit 层替身，非真实后端）：
 * - axios client 走内存 responder，模拟 /rbac/me、/organizations、
 *   /organizations/:id/workspaces 与离岗读端点；
 * - sidebar 配置走全局 fetch stub（权限判定实际由 /rbac/me 的 permissions 决定）；
 * - 路由用 MemoryRouter，URL 断言经 useLocation 探针读取。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import client from '@/services/api/client'
import { OffboardingCaseDetailPage } from './OffboardingCaseDetailPage'
import { OffboardingCasesPage } from './OffboardingCasesPage'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalFetch = globalThis.fetch

type GetCall = { url: string; params?: Record<string, unknown> }

const ORG_A = 'org_1'
const ORG_B = 'org_2'
const WS_A1 = 'ws_1a'
const WS_A2 = 'ws_1b'
const WS_B1 = 'ws_2a'
const CASE_ID = 'case_1'

const ORG_ROWS = [
  { id: ORG_A, name: '甲公司', owner_id: 'u1', status: 'active' },
  { id: ORG_B, name: '乙公司', owner_id: 'u2', status: 'active' },
]

const WS_ROWS: Record<string, Array<{ id: string; name: string }>> = {
  [ORG_A]: [
    { id: WS_A1, name: '默认工作区' },
    { id: WS_A2, name: '支持工作区' },
  ],
  [ORG_B]: [{ id: WS_B1, name: '乙默认工作区' }],
}

const CASE_ROW = {
  id: CASE_ID,
  organization_id: ORG_A,
  workspace_id: WS_A1,
  leaver_user_id: 'u9',
  successor_user_id: 'u10',
  status: 'failed',
  reason: '离职交接',
  item_total: 2,
  item_success: 1,
  item_failed: 1,
  version: 3,
  created_at: '2026-01-02 03:04:05',
  updated_at: '2026-01-02 04:05:06',
}

function envelope(payload: unknown) {
  return { data: { code: 0, msg: 'ok', payload } }
}

function pageEnvelope(list: unknown[]) {
  return envelope({ list, page: 1, size: 200, total: list.length, total_page: 1 })
}

/** sidebar 配置 stub：权限判定实际由 /rbac/me 授权，这里只为让兜底查询快速落地。 */
function stubSidebarFetch() {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 0,
        msg: 'ok',
        payload: {
          menus: [],
          version: '1.0',
          rbac: {
            roles: [
              {
                id: '1',
                name: 'super_admin',
                description: '',
                permissions: ['enterprise_business:read'],
              },
            ],
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof globalThis.fetch
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-search">{location.search}</div>
}

function renderRoutes(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/enterprise-business/offboarding"
            element={
              <>
                <OffboardingCasesPage />
                <LocationProbe />
              </>
            }
          />
          <Route
            path="/enterprise-business/offboarding/:caseId"
            element={
              <>
                <OffboardingCaseDetailPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

let getCalls: GetCall[] = []

function callsTo(url: string) {
  return getCalls.filter((call) => call.url === url)
}

/** 选择器在选项/权限就绪前处于 disabled + 「加载中…」，等它可交互再点击。 */
async function waitPickerReady(getByLabelText: (_text: string) => HTMLElement) {
  await waitFor(() => {
    const trigger = getByLabelText('选择组织与工作区') as HTMLButtonElement
    expect(trigger.disabled).toBe(false)
    expect(trigger.textContent).not.toContain('加载中')
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  getCalls = []
  stubSidebarFetch()
  mutableClient.post = async () => envelope({})
  mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
    getCalls.push({ url, params: config?.params })
    if (url === '/rbac/me') {
      return envelope({
        role_id: '1',
        role_name: 'super_admin',
        permissions: ['enterprise_business:read'],
        menu_paths: [],
      })
    }
    if (url === '/organizations') return pageEnvelope(ORG_ROWS)
    const wsMatch = /^\/organizations\/([^/]+)\/workspaces$/.exec(url)
    if (wsMatch) return pageEnvelope(WS_ROWS[wsMatch[1]] ?? [])
    if (/^\/enterprise-business\/organizations\/[^/]+\/offboarding\/cases$/.test(url)) {
      return envelope({ cases: [CASE_ROW], next_after_id: null })
    }
    if (/^\/enterprise-business\/organizations\/[^/]+\/offboarding\/cases\/[^/]+$/.test(url)) {
      return envelope({ ...CASE_ROW, items: [] })
    }
    throw new Error(`unexpected GET url: ${url}`)
  }
})

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  globalThis.fetch = originalFetch
  cleanup()
})

describe('OffboardingCasesPage — org/ws 上下文接线', () => {
  it('从 URL 的 org/ws 恢复选择，并按该 org/ws 拉取离岗列表（刷新/分享不丢上下文）', async () => {
    const { getByLabelText } = renderRoutes(
      `/enterprise-business/offboarding?org=${ORG_A}&ws=${WS_A1}`
    )

    await waitFor(() => {
      expect(getByLabelText('选择组织与工作区').textContent).toContain('甲公司')
    })
    await waitFor(() => {
      expect(getByLabelText('选择组织与工作区').textContent).toContain('默认工作区')
    })

    const listCall = callsTo(`/enterprise-business/organizations/${ORG_A}/offboarding/cases`)[0]
    expect(listCall).toBeTruthy()
    // workspace_id 来自 URL 的 ws（不得被当作组织 ID 误传）
    expect(listCall.params?.['workspace_id']).toBe(WS_A1)
    expect(callsTo(`/organizations/${ORG_A}/workspaces`).length).toBeGreaterThan(0)
  })

  it('选择新组织后工作区列表级联刷新到新 org，并清掉旧 ws', async () => {
    const { getByLabelText, getByTestId, getByText } = renderRoutes(
      `/enterprise-business/offboarding?org=${ORG_A}&ws=${WS_A1}`
    )
    await waitPickerReady(getByLabelText)

    fireEvent.click(getByLabelText('选择组织与工作区'))
    fireEvent.click(getByText('乙公司'))

    await waitFor(() => {
      expect(callsTo(`/organizations/${ORG_B}/workspaces`).length).toBeGreaterThan(0)
    })
    await waitFor(() => {
      expect(getByTestId('location-search').textContent).toContain(`org=${ORG_B}`)
    })
    expect(getByTestId('location-search').textContent).not.toContain('ws=')
  })

  it('选择工作区后把 org/ws 写入 URL，且保留 status 等其他查询参数', async () => {
    const { getByLabelText, getByTestId, getByText } = renderRoutes(
      `/enterprise-business/offboarding?org=${ORG_A}&status=failed`
    )
    await waitPickerReady(getByLabelText)

    fireEvent.click(getByLabelText('选择组织与工作区'))
    fireEvent.click(getByText('支持工作区'))

    await waitFor(() => {
      const search = getByTestId('location-search').textContent ?? ''
      expect(search).toContain(`org=${ORG_A}`)
      expect(search).toContain(`ws=${WS_A2}`)
    })
    expect(getByTestId('location-search').textContent).toContain('status=failed')
  })

  it('主流程无裸 TSID 输入框：唯一入口是共享选择器，排障区只读', async () => {
    const { container, getByLabelText, getByTestId } = renderRoutes(
      `/enterprise-business/offboarding?org=${ORG_A}&ws=${WS_A1}`
    )
    await waitFor(() => {
      expect(getByLabelText('选择组织与工作区')).toBeTruthy()
    })

    // 旧的裸 TSID 输入框已移除
    expect(container.querySelector('#eb-off-org')).toBeNull()
    expect(container.querySelector('#eb-off-ws')).toBeNull()
    expect(container.querySelector('input[placeholder*="TSID"]')).toBeNull()

    // 高级排障区存在但只读（无任何表单控件，仅展示可复制的 ID）
    const troubleshooting = getByTestId('eb-off-scope-troubleshooting')
    expect(troubleshooting.textContent).toContain(`org: ${ORG_A}`)
    expect(troubleshooting.textContent).toContain(`ws: ${WS_A1}`)
    expect(troubleshooting.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })
})

describe('OffboardingCaseDetailPage — org/ws 上下文接线', () => {
  it('从 URL 的 org/ws 恢复上下文并按该 org/ws 拉取详情，返回链接透传上下文', async () => {
    const { getByTestId, queryByText } = renderRoutes(
      `/enterprise-business/offboarding/${CASE_ID}?org=${ORG_A}&ws=${WS_A1}`
    )

    await waitFor(() => {
      const detailCall = callsTo(
        `/enterprise-business/organizations/${ORG_A}/offboarding/cases/${CASE_ID}`
      )[0]
      expect(detailCall).toBeTruthy()
      expect(detailCall.params?.['workspace_id']).toBe(WS_A1)
    })
    // 不再误报「缺少租户参数」（旧实现读 org_id / workspace_id，刷新即丢）
    expect(queryByText('缺少租户参数')).toBeNull()
    await waitFor(() => {
      expect(getByTestId('location-search').textContent).toContain(`org=${ORG_A}`)
    })

    const back = getByTestId('eb-offboarding-back')
    expect(back.getAttribute('href')).toContain(`org=${ORG_A}`)
    expect(back.getAttribute('href')).toContain(`ws=${WS_A1}`)
  })

  it('缺少/非法 org/ws 时安全降级为空态，不发起详情请求', async () => {
    const { getByText } = renderRoutes(
      `/enterprise-business/offboarding/${CASE_ID}?org=%20&ws=${WS_A1}`
    )

    await waitFor(() => {
      expect(getByText('缺少租户参数')).toBeTruthy()
    })
    expect(
      callsTo(`/enterprise-business/organizations/${ORG_A}/offboarding/cases/${CASE_ID}`)
    ).toHaveLength(0)
  })
})
