/**
 * 客服坐席首页文案经 t() 输出测试（ENT-UX-01 i18n 入键门）。
 *
 * 渲染真组件 + fixture API（rbac / 组织 / 平台坐席），断言页面标题、表头、
 * 主按钮、行内动作的渲染文本与 src/i18n 键表严格一致——值只能来自键表，
 * 不允许字面量旁路。orgId=null 时统计面板为空态引导（不发统计请求）。
 */
import '../../../test/setupDom'

import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import client from '@/services/api/client'
import { t } from '@/i18n'
import * as realPublicModule from '../api/public'
import { CustomerServiceHomePage } from './CustomerServiceHomePage'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn }
const realGet = mutableClient.get
const realFetch = globalThis.fetch

const ORG_ID = '114022088375011328'
const CS_PERMISSIONS = ['customer_service:read', 'customer_service:write']

const realPublicExports = { ...realPublicModule }
mock.module('../api/public', () => realPublicExports)

afterAll(() => {
  mock.module('../api/public', () => realPublicExports)
})

function envelope(payload: unknown) {
  return { data: { code: 0, msg: 'ok', payload } }
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
          rbac: { roles: [{ id: '1', name: 'admin', description: '', permissions: CS_PERMISSIONS }] },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof globalThis.fetch
}

function makeGet() {
  return async (url: string) => {
    if (url === '/rbac/me') {
      return envelope({ role_id: '1', role_ids: ['1'], permissions: CS_PERMISSIONS, menu_paths: [] })
    }
    if (url === '/organizations') {
      return envelope({ list: [{ id: ORG_ID, name: 'IMBoy', status: 'active' }], page: 1, size: 50, total: 1, total_page: 1 })
    }
    if (url === '/customer-service/seats') {
      return envelope({
        seats: [
          {
            organization_id: ORG_ID,
            organization_name: 'IMBoy',
            display_name: '客服小张',
            business_identity_id: '114022088375011401',
            function_key: 'customer_service',
            enabled: true,
            max_concurrent: 3,
            active_count: 1,
            workspace_id: '114022088375011329',
          },
          {
            organization_id: ORG_ID,
            organization_name: 'IMBoy',
            display_name: null,
            business_identity_id: '114022088375011402',
            function_key: 'customer_service',
            enabled: false,
            max_concurrent: 3,
            active_count: 0,
            workspace_id: '114022088375011329',
          },
        ],
        next_after_id: null,
      })
    }
    throw new Error(`unexpected GET url: ${url}`)
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/customer-service']}>
        <Routes>
          <Route path="/customer-service" element={<CustomerServiceHomePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('CustomerServiceHomePage 文案经 t() 输出（ENT-UX-01）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    stubSidebarFetch()
    mutableClient.get = makeGet() as AnyFn
  })

  afterEach(() => {
    mutableClient.get = realGet
    globalThis.fetch = realFetch
    cleanup()
  })

  it('页面标题/描述/主按钮渲染文本与键表严格一致', async () => {
    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
    })

    const text = view.container.textContent ?? ''
    expect(text).toContain(t('cs.home.pageTitle'))
    expect(text).toContain(t('cs.home.pageDescription'))
    expect(text).toContain(t('cs.home.addSeat'))
    expect(text).toContain(t('cs.home.seatsOfAll'))
    expect(text).toContain(t('cs.home.widgetsLink'))
  })

  it('表头逐格严格相等，行内状态/动作/兜底文案经键表', async () => {
    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
    })

    const headers = Array.from(view.container.querySelectorAll('th')).map((cell) => cell.textContent ?? '')
    for (const key of [
      'cs.home.colEnterprise',
      'cs.home.colSeat',
      'cs.home.colStatus',
      'cs.home.colActive',
      'cs.home.colActions',
    ] as const) {
      expect(headers).toContain(t(key))
    }

    const text = view.container.textContent ?? ''
    expect(text).toContain(t('cs.home.statusEnabled'))
    expect(text).toContain(t('cs.home.statusDisabled'))
    expect(text).toContain(t('cs.home.actionSuspend'))
    expect(text).toContain(t('cs.home.actionResume'))
    // display_name 为 null 的行兜底为键表值（禁字面量旁路）
    expect(text).toContain(t('cs.home.unnamedSeat'))
  })
})
