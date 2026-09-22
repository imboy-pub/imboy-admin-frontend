/**
 * EADM-03 W2 接线测试 —— 企业业务页接入共享 OrganizationWorkspacePicker。
 *
 * 覆盖（对应 EADM-03 完成标准）：
 * ① 选择新组织后工作区列表按新 organizationId 级联刷新（并清掉旧 ws）；
 * ② org / ws 写入 URL，且从 URL 恢复（刷新 / 分享后上下文不丢失）；
 * ③ 主流程无裸 TSID 输入框（排障区只读、无表单控件）。
 *
 * 替身说明（unit 层替身，非真实后端）：
 * - axios client 走内存 responder，模拟 /rbac/me、/organizations、
 *   /organizations/:id/workspaces 与企业业务读端点；
 * - sidebar 配置走全局 fetch stub（权限判定实际由 /rbac/me 的 permissions 决定）；
 * - 路由用 MemoryRouter，URL 断言经 useLocation 探针读取。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import client from '@/services/api/client'
import { EnterpriseBusinessPage } from './EnterpriseBusinessPage'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalFetch = globalThis.fetch

type GetCall = { url: string; params?: Record<string, unknown> }

const ORG_A = 'org_1'
const ORG_B = 'org_2'
const WS_A1 = 'ws_1a'
const WS_A2 = 'ws_1b'
const WS_B1 = 'ws_2a'

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

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/enterprise-business"
            element={
              <>
                <EnterpriseBusinessPage />
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
    if (/^\/enterprise-business\/organizations\/[^/]+\/identities$/.test(url)) return envelope([])
    throw new Error(`unexpected GET url: ${url}`)
  }
})

afterEach(() => {
  mutableClient.get = originalGet
  globalThis.fetch = originalFetch
  cleanup()
})

describe('EnterpriseBusinessPage — org/ws 上下文接线', () => {
  it('从 URL 的 org/ws 恢复选择，并按其拉取工作区（刷新/分享不丢上下文）', async () => {
    const { getByLabelText } = renderPage(
      `/enterprise-business?org=${ORG_A}&ws=${WS_A1}`
    )

    await waitFor(() => {
      expect(getByLabelText('选择组织与工作区').textContent).toContain('甲公司')
    })
    await waitFor(() => {
      expect(getByLabelText('选择组织与工作区').textContent).toContain('默认工作区')
    })
    expect(callsTo(`/organizations/${ORG_A}/workspaces`).length).toBeGreaterThan(0)
  })

  it('选择新组织后工作区列表级联刷新到新 org，并清掉旧 ws', async () => {
    const { getByLabelText, getByTestId, getByText } = renderPage(
      `/enterprise-business?org=${ORG_A}&ws=${WS_A1}`
    )
    await waitFor(() => {
      expect(callsTo(`/organizations/${ORG_A}/workspaces`).length).toBeGreaterThan(0)
    })
    await waitPickerReady(getByLabelText)

    fireEvent.click(getByLabelText('选择组织与工作区'))
    fireEvent.click(getByText('乙公司'))

    // 级联：工作区列表按新 organizationId 重新拉取
    await waitFor(() => {
      expect(callsTo(`/organizations/${ORG_B}/workspaces`).length).toBeGreaterThan(0)
    })
    // 旧 ws 已清除（工作区隶属于组织，跨组织必须置空）
    await waitFor(() => {
      const search = getByTestId('location-search').textContent ?? ''
      expect(search).toContain(`org=${ORG_B}`)
    })
    expect(getByTestId('location-search').textContent).not.toContain('ws=')
  })

  it('选择工作区后把 org/ws 写入 URL，且保留其他查询参数', async () => {
    const { getByLabelText, getByTestId, getByText } = renderPage(
      `/enterprise-business?org=${ORG_A}&size=20`
    )
    await waitFor(() => {
      expect(callsTo(`/organizations/${ORG_A}/workspaces`).length).toBeGreaterThan(0)
    })
    await waitPickerReady(getByLabelText)

    fireEvent.click(getByLabelText('选择组织与工作区'))
    fireEvent.click(getByText('支持工作区'))

    await waitFor(() => {
      const search = getByTestId('location-search').textContent ?? ''
      expect(search).toContain(`org=${ORG_A}`)
      expect(search).toContain(`ws=${WS_A2}`)
    })
    expect(getByTestId('location-search').textContent).toContain('size=20')
  })

  it('主流程无裸 TSID 输入框：唯一入口是共享选择器，排障区只读', async () => {
    const { container, getByLabelText, getByTestId } = renderPage(
      `/enterprise-business?org=${ORG_A}&ws=${WS_A1}`
    )
    await waitFor(() => {
      expect(getByLabelText('选择组织与工作区')).toBeTruthy()
    })

    // 旧的裸 TSID 输入框已移除
    expect(container.querySelector('#eb-org-id')).toBeNull()
    expect(container.querySelector('#eb-ws-id')).toBeNull()
    expect(container.querySelector('input[placeholder*="TSID"]')).toBeNull()
    // 主流程不暴露任何可手填 TSID 的文本输入
    expect(container.querySelectorAll('input')).toHaveLength(0)

    // 高级排障区存在但只读（无任何表单控件，仅展示可复制的 ID）
    const troubleshooting = getByTestId('eb-scope-troubleshooting')
    expect(troubleshooting.textContent).toContain(`org: ${ORG_A}`)
    expect(troubleshooting.textContent).toContain(`ws: ${WS_A1}`)
    expect(troubleshooting.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })
})
