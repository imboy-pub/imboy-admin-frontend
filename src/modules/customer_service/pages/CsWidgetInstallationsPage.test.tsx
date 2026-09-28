/**
 * SC-FE「客服工作台接入」块组件级单元测试（CsWidgetInstallationsPage）。
 *
 * ⚠️ 测试替身说明（unit 层替身，非真实后端，仿 CsProvisioningWizardPage.test.tsx）：
 * - axios client 用手写 mock（内存 responder）模拟 /organizations、
 *   /organizations/:id/workspaces、/customer-service/widget-installations、
 *   /customer-service/seat-consoles*；
 * - RBAC 权限源（@/services/api/rbac、@/services/api/adminConfig）用 bun
 *   mock.module 替换，afterAll 恢复真实模块避免污染其他测试文件；
 * - iframe 片段真源 = seatConsolesPure.buildSeatEmbedCode（widgetConfig 唯一
 *   origin），本文件不复制第二份形状定义，冻结串与 API 层测试同源断言。
 *
 * 覆盖验收点：
 * A01 块位置（范围选择器与网站接入表之间）+ 工作区切换换 query key；
 * A02 四态（loading/empty/active/error）+ read/write 权限门；
 * A03 唯一 iframe + fail-closed；A04 片段字段 + 零敏感串；
 * A05 PUT 保 id/片段、停用文案诚实；A07 文案逐字；409 可见；
 * A09 Widget 表回归不受影响。
 */
import '../../../test/setupDom'

import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CsWidgetInstallationsPage } from './CsWidgetInstallationsPage'
import { useAuthStore } from '@/stores/authStore'
import client from '@/services/api/client'
import * as realRbacModule from '@/services/api/rbac'
import * as realAdminConfigModule from '@/services/api/adminConfig'
import { buildSeatEmbedCode } from '../api/seatConsolesPure'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn }

const mutableClient = client as unknown as MutableClient
const realRbacExports = { ...realRbacModule }
const realAdminConfigExports = { ...realAdminConfigModule }

const ORG_ID = '1234567890123456789'
const WS_ID = '9876543210987654321'
const WS2_ID = '246813572468135724'
const CONSOLE_ID = '555555555555555555'
const PUBLIC_ID = '730123456789012345678'
const INSTALLATION_NAME = '商城在线客服'

const ORG_ROW = {
  id: ORG_ID,
  name: 'Example 商城',
  owner_id: '555555555555555555',
  status: 'active',
  created_at: 1758000000,
  updated_at: 1758000000,
}
const WS_ROW = {
  id: WS_ID,
  name: '默认工作区',
  owner_id: '555555555555555555',
  organization_id: ORG_ID,
  status: 'active',
  created_at: 1758000000,
  updated_at: 1758000000,
}
const WS2_ROW = { ...WS_ROW, id: WS2_ID, name: '第二工作区' }
const INSTALLATION_ROW = {
  id: '999999999999999999',
  organization_id: ORG_ID,
  workspace_id: WS_ID,
  display_name: INSTALLATION_NAME,
  public_widget_id: 'wgt_pub_demo1',
  allowed_origins: ['https://shop.example.com'],
  branding: { display_name: null, primary_color: null },
  consent_version: 'v1',
  status: 'active',
  created_at: 1758000000,
}

function consoleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSOLE_ID,
    organization_id: ORG_ID,
    workspace_id: WS_ID,
    public_seat_console_id: PUBLIC_ID,
    allowed_origins: ['https://admin.example.com'],
    status: 'active',
    version: 3,
    created_at: 1789638174,
    updated_at: 1789638200,
    ...overrides,
  }
}

type GetCall = { url: string; params: unknown }
type WriteCall = { method: 'POST' | 'PUT'; url: string; body: unknown }

let getCalls: GetCall[] = []
let writeCalls: WriteCall[] = []
let seatConsoleList: unknown[] = []
let seatGetError: Error | null = null
let seatGetHang = false
let seatCreateError: Error | null = null

function orgPagePayload(list: unknown[]) {
  return { list, page: 1, size: 50, total: list.length, total_page: 1 }
}

function defaultGetResponder(url: string): unknown {
  if (url === '/organizations') return orgPagePayload([ORG_ROW])
  if (url === `/organizations/${ORG_ID}/workspaces`) return orgPagePayload([WS_ROW])
  // widget 列表投影形状 = {installations:[...]}（toWidgetInstallationList 口径）
  if (url === '/customer-service/widget-installations') return { installations: [INSTALLATION_ROW] }
  if (url === '/customer-service/seat-consoles') return orgPagePayload(seatConsoleList)
  throw new Error(`unexpected GET url: ${url}`)
}

// RBAC 权限源替身：permissions 由用例覆盖
let rbacPermissions: string[] = ['customer_service:read', 'customer_service:write']

mock.module('@/services/api/rbac', () => ({
  getMyRbacProfilePayload: () => Promise.resolve({ permissions: [...rbacPermissions], role_ids: [1] }),
}))
mock.module('@/services/api/adminConfig', () => ({
  fetchSidebarMenuConfig: () =>
    Promise.resolve({
      rbac: {
        roles: [
          {
            id: 1,
            name: 'super_admin',
            description: '',
            permissions: ['customer_service:read', 'customer_service:write'],
          },
        ],
      },
    }),
}))

afterAll(() => {
  mock.module('@/services/api/rbac', () => realRbacExports)
  mock.module('@/services/api/adminConfig', () => realAdminConfigExports)
})

function setUrl(wsId: string | null): void {
  const search = wsId === null ? '' : `?org=${ORG_ID}&ws=${wsId}`
  window.history.replaceState(null, '', `/customer-service/widget-installations${search}`)
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[window.location.pathname + window.location.search]}>
        <CsWidgetInstallationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** 真等待：query resolve + React 渲染落盘（此 jsdom 环境 waitFor 轮询不刷新）。 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120))
}

/** 确定性等待：轮询直到谓词成立（deadline < bun 单用例 5000ms 超时）。 */
async function settleUntil(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 4000
  for (;;) {
    await settle()
    if (predicate()) return
    if (Date.now() > deadline) throw new Error(`settleUntil 超时: ${label}`)
  }
}

beforeEach(() => {
  spyOn(console, 'warn').mockImplementation(() => {})
  spyOn(console, 'error').mockImplementation(() => {})
  setUrl(WS_ID)
  getCalls = []
  writeCalls = []
  seatConsoleList = []
  seatGetError = null
  seatGetHang = false
  seatCreateError = null
  rbacPermissions = ['customer_service:read', 'customer_service:write']
  mutableClient.get = (url: unknown, config: unknown) => {
    const record = { url: String(url), params: (config as { params?: unknown })?.params }
    getCalls.push(record)
    if (record.url === '/customer-service/seat-consoles') {
      if (seatGetHang) return new Promise(() => {})
      if (seatGetError !== null) return Promise.reject(seatGetError)
    }
    const payload = defaultGetResponder(String(url))
    return { data: { code: 0, msg: 'success', payload } }
  }
  mutableClient.post = (url: unknown, body: unknown) => {
    writeCalls.push({ method: 'POST', url: String(url), body })
    if (seatCreateError !== null) return Promise.reject(seatCreateError)
    const isRevoke = String(url).endsWith('/revoke')
    if (isRevoke) {
      // 停用成功后列表重取应返回 revoked 行（真实后端语义）
      seatConsoleList = [consoleRow({ status: 'revoked' })]
    }
    const payload = isRevoke
      ? { seat_console: consoleRow({ status: 'revoked' }) }
      : { seat_console: consoleRow() }
    return { data: { code: 0, msg: 'success', payload } }
  }
  mutableClient.put = (url: unknown, body: unknown) => {
    writeCalls.push({ method: 'PUT', url: String(url), body })
    return { data: { code: 0, msg: 'success', payload: { seat_console: consoleRow() } } }
  }
  useAuthStore.setState({
    admin: {
      id: '106791271148029952',
      account: 'e2e_admin',
      nickname: 'e2e_admin',
      avatar: '',
      role_id: [1],
      status: 1,
      created_at: 0,
      last_login_at: 0,
      last_login_ip: '',
      login_count: 0,
    },
    isAuthenticated: true,
  })
})

/** 等待 active console 视图出现（列表返回非空 active 行后）。 */
async function renderToActive() {
  seatConsoleList = [consoleRow()]
  const view = renderPage()
  await settleUntil(
    () => view.container.querySelector('[data-testid="sc-seat-active"]') !== null,
    'active console 视图'
  )
  return view
}

describe('CsWidgetInstallationsPage — SC-FE 客服工作台接入块', () => {
  it('A01/A07/A09：块位于范围选择器与网站接入表之间；文案逐字；widget 表回归不变', async () => {
    const view = renderPage()
    await waitFor(() => view.getByTestId('sc-seat-card'))
    // A07：描述文案逐字
    expect(view.getByTestId('sc-seat-card').textContent).toContain(
      '一工作区一个接入代码，坐席各自扫码登录'
    )
    // 等 widget 表行渲染完成后再比较 DOM 顺序（此环境 waitFor 轮询不可靠，用 settleUntil）
    await settleUntil(
      () => (view.container.textContent ?? '').includes(INSTALLATION_NAME),
      'widget 表行渲染'
    )
    // A01：DOM 顺序 = 租户范围卡 < 客服工作台接入卡 < widget 接入表
    const pageText = view.container.textContent ?? ''
    const scopeIdx = pageText.indexOf('租户范围（必填）')
    const seatIdx = pageText.indexOf('客服工作台接入')
    const tableIdx = pageText.indexOf(INSTALLATION_NAME)
    expect(scopeIdx).toBeGreaterThan(-1)
    expect(seatIdx).toBeGreaterThan(scopeIdx)
    expect(tableIdx).toBeGreaterThan(seatIdx)
    // A09 回归：widget 表结构原样渲染（表头与行数据齐全；表格渲染可视化+辅助双份，用 getAll）
    expect(view.container.querySelector('table')).not.toBeNull()
    expect(view.getAllByText(INSTALLATION_NAME).length).toBeGreaterThan(0)
    expect(view.getAllByText('wgt_pub_demo1').length).toBeGreaterThan(0)
    // A09：本用例只有读取，无任何 seat 写请求打到 widget 端点
    expect(writeCalls).toHaveLength(0)
  })

  it('A01：工作区切换 → seat 查询以新 workspace_id 重新发起（query key 换绑）', async () => {
    const first = renderPage()
    await settleUntil(
      () => getCalls.some((c) => c.url === '/customer-service/seat-consoles'),
      '首次 seat GET'
    )
    first.unmount()
    cleanup()

    const before = getCalls.length
    setUrl(WS2_ID)
    // 同组织、第二工作区：workspaces 接口按需返回两行
    mutableClient.get = (url: unknown, config: unknown) => {
      const record = { url: String(url), params: (config as { params?: unknown })?.params }
      getCalls.push(record)
      const payload =
        record.url === `/organizations/${ORG_ID}/workspaces`
          ? orgPagePayload([WS_ROW, WS2_ROW])
          : defaultGetResponder(String(url))
      return { data: { code: 0, msg: 'success', payload } }
    }
    const second = renderPage()
    await settleUntil(() => getCalls.length > before, '二次挂载任意请求')
    await settleUntil(
      () =>
        getCalls.some(
          (c) =>
            c.url === '/customer-service/seat-consoles' &&
            (c.params as Record<string, unknown>)?.workspace_id === WS2_ID
        ),
      '新 workspace_id 的 seat GET'
    )
    const seatCalls = getCalls.filter((c) => c.url === '/customer-service/seat-consoles')
    expect(seatCalls).toHaveLength(2)
    expect((seatCalls[0]?.params as Record<string, unknown>)?.workspace_id).toBe(WS_ID)
    expect((seatCalls[1]?.params as Record<string, unknown>)?.workspace_id).toBe(WS2_ID)
    second.unmount()
    cleanup()
    setUrl(WS_ID)
  })

  it('A02：未选工作区 → 引导空态，且不发起 seat 请求', async () => {
    setUrl(null)
    const view = renderPage()
    await waitFor(() => {
      // 只断言 seat 块自身（widget 段落同文案并列出现）
      expect(view.getByTestId('sc-seat-card').textContent).toContain('请先填写组织与工作区')
    })
    expect(getCalls.some((c) => c.url === '/customer-service/seat-consoles')).toBe(false)
    view.unmount()
    cleanup()
    setUrl(WS_ID)
  })

  it('A02：缺 read 权限 → 无权访问，且不发起 seat 请求', async () => {
    rbacPermissions = ['customer_service:write']
    const view = renderPage()
    await waitFor(() => {
      const card = view.getByTestId('sc-seat-card')
      expect(card.textContent).toContain('无权访问')
    })
    expect(getCalls.some((c) => c.url === '/customer-service/seat-consoles')).toBe(false)
  })

  it('A02：加载中 → loading 态可见', async () => {
    seatGetHang = true
    const view = renderPage()
    await waitFor(() => view.getByText('加载客服工作台接入…'))
  })

  it('A02：列表为空 → 空态 + 创建接入（write 门控）', async () => {
    const view = renderPage()
    await waitFor(() => view.getByTestId('sc-seat-empty'))
    const createButton = view.getByText('创建接入') as HTMLButtonElement
    expect(createButton.disabled).toBe(false)
    view.unmount()
    cleanup()

    rbacPermissions = ['customer_service:read']
    const readonly = renderPage()
    await waitFor(() => readonly.getByTestId('sc-seat-empty'))
    const gatedButton = readonly.getByText('创建接入') as HTMLButtonElement
    expect(gatedButton.disabled).toBe(true)
    expect(gatedButton.title).toContain('customer_service:write')
  })

  it('A02：查询失败 → error 态可重试', async () => {
    seatGetError = new Error('seat down')
    const view = renderPage()
    await waitFor(() => view.getByText(/加载客服工作台接入失败/))
    expect(view.getByText(/seat down/)).toBeTruthy()
    expect(view.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('A03/A04：active 视图展示公开标识；复制 iframe 代码后片段与冻结形状逐字相等', async () => {
    const view = await renderToActive()
    expect(view.getByTestId('sc-seat-public-id').textContent).toBe(PUBLIC_ID)

    const copyButton = view.getByRole('button', { name: '复制 iframe 代码' })
    fireEvent.click(copyButton)
    const textarea = view.getByTestId('sc-seat-embed-code') as HTMLTextAreaElement
    // 冻结形状逐字相等（真源 = buildSeatEmbedCode，本断言不复制形状定义）
    expect(textarea.value).toBe(buildSeatEmbedCode(PUBLIC_ID))
    expect(textarea.value).toBe(
      '<iframe\n' +
        `  src="https://cs.imboy.pub/seat/${PUBLIC_ID}"\n` +
        '  title="IMBoy 客服工作台"\n' +
        '  sandbox="allow-scripts allow-same-origin allow-downloads"\n' +
        '  referrerpolicy="no-referrer"\n' +
        '  style="width:100%;height:100vh;border:0"\n' +
        '></iframe>'
    )
    // A04：零敏感串
    expect(textarea.value).not.toContain('<script')
    expect(textarea.value).not.toContain('loader')
    expect(textarea.value).not.toMatch(/token|secret|api_key|signature/i)
    expect(textarea.value).not.toContain(ORG_ID)
    expect(textarea.value).not.toContain(WS_ID)
    expect(textarea.value).not.toContain('/api/')
  })

  it('A03：非法 public_seat_console_id → fail-closed 拒绝出码（错误可见、复制禁用）', async () => {
    seatConsoleList = [consoleRow({ public_seat_console_id: 'not-a-tsid' })]
    const view = renderPage()
    await waitFor(() => view.getByTestId('sc-seat-active'))
    expect(view.getByText(/public_seat_console_id 形状非法/)).toBeTruthy()
    const copyButton = view.getByRole('button', { name: '复制 iframe 代码' }) as HTMLButtonElement
    expect(copyButton.disabled).toBe(true)
    expect(view.container.querySelector('[data-testid="sc-seat-embed-code"]')).toBeNull()
  })

  it('A05：保存 → PUT /seat-consoles/:id（id 只在路径、body 三键）；片段与公开标识不变', async () => {
    const user = userEvent.setup()
    const view = await renderToActive()
    const origins = view.getByTestId('sc-seat-origins') as HTMLTextAreaElement
    // 注：本 jsdom+React19 组合下 fireEvent.change 不触发 onChange（实测），
    // 文本输入一律走 userEvent（CsProvisioningWizardPage.test.tsx 同款纪律）。
    await user.clear(origins)
    await user.type(origins, 'https://ops.example.com')
    await user.click(view.getByRole('button', { name: '保存' }))

    await settleUntil(() => writeCalls.length > 0, 'PUT 发出')
    expect(writeCalls).toHaveLength(1)
    expect(writeCalls[0]?.method).toBe('PUT')
    expect(writeCalls[0]?.url).toBe(`/customer-service/seat-consoles/${CONSOLE_ID}`)
    const body = writeCalls[0]?.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['allowed_origins', 'organization_id', 'workspace_id'])
    expect(body.allowed_origins).toEqual(['https://ops.example.com'])
    // 公开标识与 iframe 代码不受 origins 编辑影响
    expect(view.getByTestId('sc-seat-public-id').textContent).toBe(PUBLIC_ID)
    fireEvent.click(view.getByRole('button', { name: '复制 iframe 代码' }))
    const textarea = view.getByTestId('sc-seat-embed-code') as HTMLTextAreaElement
    expect(textarea.value).toBe(buildSeatEmbedCode(PUBLIC_ID))
  })

  it('A05：停用接入 → 确认弹窗文案逐字（不谎称中断会话）→ POST /:id/revoke', async () => {
    const view = await renderToActive()
    fireEvent.click(view.getByRole('button', { name: '停用接入' }))

    // 确认弹窗文案逐字（合同原文，绝不声称“终止已登录会话”）
    const description = view.getByText(
      '停用后新加载将返回 404；已扫码登录的坐席会话不受影响，如需立即停用请到坐席管理操作'
    )
    expect(description).toBeTruthy()

    fireEvent.click(view.getByRole('button', { name: '停用', exact: true }))
    await settleUntil(() => writeCalls.length > 0, 'revoke POST 发出')
    expect(writeCalls[0]?.method).toBe('POST')
    expect(writeCalls[0]?.url).toBe(`/customer-service/seat-consoles/${CONSOLE_ID}/revoke`)
    const body = writeCalls[0]?.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['organization_id', 'workspace_id'])
    // 停用成功后失效查询重取：列表返回 revoked 行 → 回到空态
    await settleUntil(
      () => view.getByTestId('sc-seat-empty') !== null,
      '停用后回到空态'
    )
  })

  it('409：同工作区已有生效接入 → 可见冲突提示', async () => {
    const user = userEvent.setup()
    seatCreateError = Object.assign(new Error('conflict'), { response: { status: 409 } })
    const view = renderPage()
    await waitFor(() => view.getByTestId('sc-seat-empty'))
    fireEvent.click(view.getByText('创建接入'))
    await user.type(view.getByTestId('sc-seat-create-origins'), 'https://admin.example.com')
    fireEvent.click(view.getByRole('button', { name: '创建', exact: true }))
    await settleUntil(() => writeCalls.length > 0, 'create POST 发出')
    // 关闭弹窗后空态上的冲突提示可见
    fireEvent.click(view.getByRole('button', { name: '取消' }))
    await waitFor(() => view.getByTestId('sc-seat-create-conflict'))
    expect(view.getByTestId('sc-seat-create-conflict').textContent).toContain(
      '该工作区已有生效中的接入'
    )
  })
})
