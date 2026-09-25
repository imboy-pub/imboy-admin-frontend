/**
 * 组织客服摘要面板组件测试（CS-ADM-01 / CS-GOV-02A 四态验收）。
 *
 * 覆盖验收点：
 * - 权限态 fail-closed：无 customer_service:read 时不发请求（get 调用里
 *   绝无 /customer-service/*）、不渲染事实，只说明权限边界；
 * - 数据态：used（enabled 现算）/ 额度（平台域不投影，如实标注）/ enabled
 *   状态 / active sessions 渲染正确；TSID 明细以 string 呈现；
 * - 治理面链接：org/ws 上下文经共享 codec 生成；开通向导入口仅对
 *   customer_service:write 账号渲染（无权限不进 DOM）；
 * - 错误态：409/seat_limit_exceeded 类并发冲突有明确反馈（冲突指引 +
 *   重试）；其他错误不误报冲突；
 * - 空态：组织尚无坐席事实。
 *
 * ⚠️ 反污染：不使用 bun mock.module；权限源经真实 useAdminPermission 的
 * 权威端点 GET /rbac/me 供料，sidebar 模板走全局 fetch stub（与
 * OrganizationDetailPage.test.tsx 同款纪律）。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import React from 'react'
import client from '@/services/api/client'
import { CsSummaryPanel } from './CsSummaryPanel'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn }
const realGet = mutableClient.get
const realFetch = globalThis.fetch

const ORG_ID = '8800487111111111111'
const WS_ID = '8800487222222222222'
const BIG_TSID_A = '1942412345678901234'
const BIG_TSID_B = '1942412345678901299'

function envelope(payload: unknown) {
  return { data: { code: 0, msg: 'ok', payload } }
}

function rbacProfile(permissions: string[]) {
  return envelope({ role_id: '1', role_ids: ['1'], permissions, menu_paths: [] })
}

function seatRow(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: ORG_ID,
    organization_name: 'IMBoy',
    display_name: '客服甲',
    business_identity_id: BIG_TSID_A,
    function_key: 'customer_service',
    enabled: true,
    max_concurrent: 3,
    active_count: 2,
    workspace_id: WS_ID,
    ...overrides,
  }
}

function stubSidebarFetch() {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 0,
        msg: 'ok',
        payload: {
          menus: [],
          version: '1.0',
          rbac: { roles: [{ id: '1', name: 'super_admin', description: '', permissions: [] }] },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof globalThis.fetch
}

const urls: string[] = []

function stubGet(options: {
  permissions: string[]
  seatsResponder?: () => unknown
}) {
  urls.length = 0
  mutableClient.get = ((url: string) => {
    urls.push(String(url))
    if (url === '/rbac/me') return Promise.resolve(rbacProfile(options.permissions))
    if (url === '/customer-service/seats') {
      const responder = options.seatsResponder ?? (() => envelope({ seats: [], next_after_id: null }))
      const result = responder()
      if (result instanceof Promise) return result
      return Promise.resolve(result)
    }
    throw new Error(`unexpected GET url: ${url}`)
  }) as AnyFn
}

beforeEach(() => {
  stubSidebarFetch()
})

afterEach(() => {
  mutableClient.get = realGet
  globalThis.fetch = realFetch
  cleanup()
})

function renderPanel(props: { workspaceId?: string | null; variant?: 'card' | 'inline' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/organizations']}>
        <Routes>
          <Route
            path="/organizations"
            element={<CsSummaryPanel organizationId={ORG_ID} workspaceId={props.workspaceId ?? null} variant={props.variant ?? 'card'} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('CsSummaryPanel — 权限态（fail-closed）', () => {
  it('无 customer_service:read：不发 /customer-service 请求、不渲染事实，只说明权限边界', async () => {
    stubGet({ permissions: ['organizations:read', 'organizations:write'] })
    const view = renderPanel()

    await waitFor(() => {
      expect(view.getByTestId('org-cs-summary-perm')).toBeTruthy()
    })
    expect(view.getByTestId('org-cs-summary-perm').textContent).toContain('customer_service:read')
    expect(view.getByTestId('org-cs-summary-perm').textContent).toContain('fail-closed')

    // 关键验收：一次 /customer-service/* 请求都没有发出
    expect(urls.filter((url) => url.includes('/customer-service'))).toHaveLength(0)
    expect(view.queryByTestId('org-cs-summary-data')).toBeNull()
    expect(view.queryByTestId('org-cs-summary-loading')).toBeNull()
  })
})

describe('CsSummaryPanel — 数据态', () => {
  it('渲染 used（enabled 现算）/ 额度不投影标注 / enabled 状态 / active sessions；TSID 明细 string', async () => {
    stubGet({
      permissions: ['customer_service:read', 'customer_service:write'],
      seatsResponder: () =>
        envelope({
          seats: [
            seatRow({ business_identity_id: BIG_TSID_A, enabled: true, max_concurrent: 3, active_count: 2 }),
            seatRow({ business_identity_id: BIG_TSID_B, display_name: '客服乙', enabled: false, active_count: 0 }),
          ],
          next_after_id: null,
        }),
    })
    const view = renderPanel({ workspaceId: WS_ID })

    await waitFor(() => {
      expect(view.getByTestId('org-cs-summary-data')).toBeTruthy()
    })
    expect(view.getByTestId('org-cs-summary-used').textContent).toContain('1')
    expect(view.getByTestId('org-cs-summary-used').textContent).toContain('2')
    expect(view.getByTestId('org-cs-summary-limit').textContent).toContain('平台域不投影')
    expect(view.getByTestId('org-cs-summary-enabled').textContent).toContain('已启用 1')
    expect(view.getByTestId('org-cs-summary-active-sessions').textContent).toBe('2')
    expect(view.getByTestId('org-cs-summary-max-concurrent').textContent).toBe('3')
    // TSID 明细：19 位大数 string 原样呈现（不丢精度、不 Number()）
    expect(view.getByTestId('org-cs-summary-seat-ids').textContent).toContain(BIG_TSID_A)
    expect(view.getByTestId('org-cs-summary-seat-ids').textContent).toContain('（停用）')

    // 链接：org/ws 经共享 codec 携带；开通向导入口（有 write 权限）在 DOM
    const homeHref = view.getByTestId('org-cs-summary-link-home').getAttribute('href') ?? ''
    const homeUrl = new URL(homeHref, 'http://localhost')
    expect(homeUrl.pathname).toBe('/customer-service')
    expect(homeUrl.searchParams.get('org')).toBe(ORG_ID)
    expect(homeUrl.searchParams.get('ws')).toBe(WS_ID)

    const sessionsHref = view.getByTestId('org-cs-summary-link-sessions').getAttribute('href') ?? ''
    expect(new URL(sessionsHref, 'http://localhost').pathname).toBe('/customer-service/sessions')
    expect(view.getByTestId('org-cs-summary-link-provisioning')).toBeTruthy()

    // 额度证据说明在场（诚实降级依据，不编造数值）
    expect(view.getByTestId('org-cs-summary-limit-evidence').textContent).toContain('/api/v1/cs/organizations')
    // 刷新入口 + 最后读取时间（额度/坐席变化后的明确反馈通道）
    expect(view.getByTestId('org-cs-summary-refresh')).toBeTruthy()
    expect(view.getByTestId('org-cs-summary-updated-at')).toBeTruthy()
  })

  it('无 ws 成立事实时链接如实省略 ws 参数；无 write 权限时开通向导入口不进 DOM', async () => {
    stubGet({
      permissions: ['customer_service:read'],
      seatsResponder: () =>
        envelope({ seats: [seatRow({ enabled: true })], next_after_id: null }),
    })
    const view = renderPanel()

    await waitFor(() => {
      expect(view.getByTestId('org-cs-summary-data')).toBeTruthy()
    })
    const homeUrl = new URL(view.getByTestId('org-cs-summary-link-home').getAttribute('href') ?? '', 'http://localhost')
    expect(homeUrl.searchParams.get('org')).toBe(ORG_ID)
    expect(homeUrl.searchParams.get('ws')).toBeNull()
    // §9-2 合同：无写权限 = 入口不进 DOM（不是 disabled 按钮）
    expect(view.queryByTestId('org-cs-summary-link-provisioning')).toBeNull()
  })
})

describe('CsSummaryPanel — 错误态', () => {
  it('409 / seat_limit_exceeded 类并发冲突：明确冲突反馈（指引 + 重试），不静默', async () => {
    stubGet({
      permissions: ['customer_service:read'],
      seatsResponder: () => Promise.reject({ code: 409, msg: 'seat_limit_exceeded: 并发开通超出组织额度' }),
    })
    const view = renderPanel()

    await waitFor(() => {
      expect(view.getByTestId('org-cs-summary-error')).toBeTruthy()
    })
    expect(view.getByTestId('org-cs-summary-error').textContent).toContain('并发冲突（409/advisory lock 类）')
    expect(view.getByTestId('org-cs-summary-conflict-hint')).toBeTruthy()
    expect(view.getByTestId('org-cs-summary-retry')).toBeTruthy()
    expect(view.queryByTestId('org-cs-summary-data')).toBeNull()
  })

  it('advisory lock 类（非 409 状态码）同样归并发冲突并给出指引', async () => {
    stubGet({
      permissions: ['customer_service:read'],
      seatsResponder: () => Promise.reject({ code: 503, msg: 'could not obtain advisory lock' }),
    })
    const view = renderPanel()

    await waitFor(() => {
      expect(view.getByTestId('org-cs-summary-error')).toBeTruthy()
    })
    expect(view.getByTestId('org-cs-summary-conflict-hint')).toBeTruthy()
  })

  it('其他错误（500）：错误态如实呈现，但不误报并发冲突', async () => {
    stubGet({
      permissions: ['customer_service:read'],
      seatsResponder: () => Promise.reject({ code: 500, msg: '服务端错误' }),
    })
    const view = renderPanel()

    await waitFor(() => {
      expect(view.getByTestId('org-cs-summary-error')).toBeTruthy()
    })
    expect(view.getByTestId('org-cs-summary-error').textContent).toContain('服务端错误')
    expect(view.queryByTestId('org-cs-summary-conflict-hint')).toBeNull()
    expect(view.getByTestId('org-cs-summary-retry')).toBeTruthy()
  })
})

describe('CsSummaryPanel — 空态 / inline 形态', () => {
  it('组织尚无坐席事实：空态文案 + 治理面链接（无 write 权限不渲染开通入口）', async () => {
    stubGet({
      permissions: ['customer_service:read'],
      seatsResponder: () => envelope({ seats: [], next_after_id: null }),
    })
    const view = renderPanel()

    await waitFor(() => {
      expect(view.getByTestId('org-cs-summary-empty')).toBeTruthy()
    })
    expect(view.getByTestId('org-cs-summary-empty').textContent).toContain('尚无客服坐席事实')
    expect(view.getByTestId('org-cs-summary-link-home')).toBeTruthy()
    expect(view.queryByTestId('org-cs-summary-link-provisioning')).toBeNull()
  })

  it('inline 形态（Drawer 内嵌）：根节点无 Card 壳，数据态照常渲染', async () => {
    stubGet({
      permissions: ['customer_service:read'],
      seatsResponder: () => envelope({ seats: [seatRow({ enabled: true })], next_after_id: null }),
    })
    const view = renderPanel({ variant: 'inline' })

    await waitFor(() => {
      expect(view.getByTestId('org-cs-summary-data')).toBeTruthy()
    })
    expect(view.container.querySelector('[data-testid="org-cs-summary"]')).toBeTruthy()
  })
})
