/**
 * V3-27 快捷回复管理页组件级单元测试（CsQuickRepliesPage）。
 *
 * ⚠️ 测试替身说明（unit 层替身，非真实后端，仿 CsWidgetInstallationsPage.test.tsx）：
 * - axios client 手写 mock（内存 responder）模拟 /organizations、
 *   /organizations/:id/workspaces、/customer-service/quick-replies*；
 * - RBAC 权限源用 bun mock.module 替换，afterAll 恢复真实模块；
 * - 文本输入一律走 userEvent（本环境 fireEvent.change 不触发 onChange）。
 *
 * 覆盖（任务验收口径）：
 * - 成功旅程：列表分页（服务端 page/size/total）→ 创建 → 编辑 → 删除（软删）；
 * - 反例：缺 read 权限 fail-closed 不发请求；列表 403（越权 workspace）可解释呈现；
 *   超长 title（>64）表单预拒不发 POST；
 * - 防重复提交（合同 §5）：创建 pending 期间连点提交只发一次 POST。
 */
import '../../../test/setupDom'

import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CsQuickRepliesPage } from './CsQuickRepliesPage'
import { useAuthStore } from '@/stores/authStore'
import client from '@/services/api/client'
import * as realRbacModule from '@/services/api/rbac'
import * as realAdminConfigModule from '@/services/api/adminConfig'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn; delete: AnyFn }

const mutableClient = client as unknown as MutableClient
const realRbacExports = { ...realRbacModule }
const realAdminConfigExports = { ...realAdminConfigModule }

const ORG_ID = '1234567890123456789'
const WS_ID = '8876543210987654321'
const WS2_ID = '246813572468135724'

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

function replyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '999999999999999999',
    organization_id: ORG_ID,
    workspace_id: WS_ID,
    title: '问候语',
    content: '您好，很高兴为您服务。',
    sort: 0,
    created_by: '555555555555555555',
    created_at: 1789900000,
    updated_at: 1789900000,
    ...overrides,
  }
}

type GetCall = { url: string; params: unknown }
type WriteCall = { method: 'POST' | 'PUT' | 'DELETE'; url: string; body: unknown }

let getCalls: GetCall[] = []
let writeCalls: WriteCall[] = []
let listPayload: unknown = { list: [replyRow()], page: 1, size: 10, total: 1, total_page: 1 }
let listError: Error | null = null
let createError: Error | null = null

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

function orgPagePayload(list: unknown[]) {
  return { list, page: 1, size: 50, total: list.length, total_page: 1 }
}

function setUrl(wsId: string | null): void {
  const search = wsId === null ? '' : `?org=${ORG_ID}&ws=${wsId}`
  window.history.replaceState(null, '', `/customer-service/quick-replies${search}`)
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[window.location.pathname + window.location.search]}>
        <CsQuickRepliesPage />
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
  listPayload = { list: [replyRow()], page: 1, size: 10, total: 1, total_page: 1 }
  listError = null
  createError = null
  rbacPermissions = ['customer_service:read', 'customer_service:write']
  mutableClient.get = (url: unknown, config: unknown) => {
    const record = { url: String(url), params: (config as { params?: unknown })?.params }
    getCalls.push(record)
    if (record.url === '/customer-service/quick-replies') {
      if (listError !== null) return Promise.reject(listError)
      return { data: { code: 0, msg: 'success', payload: listPayload } }
    }
    if (record.url === '/organizations') return orgPagePayload([ORG_ROW])
    if (record.url === `/organizations/${ORG_ID}/workspaces`) return orgPagePayload([WS_ROW, WS2_ROW])
    throw new Error(`unexpected GET url: ${record.url}`)
  }
  mutableClient.post = (url: unknown, body: unknown) => {
    writeCalls.push({ method: 'POST', url: String(url), body })
    if (createError !== null) return Promise.reject(createError)
    return { data: { code: 0, msg: 'success', payload: { quick_reply: replyRow({ title: (body as { title: string }).title }) } } }
  }
  mutableClient.put = (url: unknown, body: unknown) => {
    writeCalls.push({ method: 'PUT', url: String(url), body })
    return { data: { code: 0, msg: 'success', payload: { quick_reply: replyRow() } } }
  }
  mutableClient.delete = (url: unknown, config: unknown) => {
    writeCalls.push({ method: 'DELETE', url: String(url), body: (config as { data?: unknown })?.data })
    return { data: { code: 0, msg: 'success', payload: { ok: true } } }
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

async function openCreateDialog(view: ReturnType<typeof renderPage>) {
  fireEvent.click(view.getByTestId('csqr-create-open'))
  await waitFor(() => expect(view.getByTestId('csqr-form-title')).not.toBeNull())
}

describe('CsQuickRepliesPage — 成功旅程', () => {
  it('列表：显式租户条件 + 默认分页 page=1/size=10，行渲染 TSID string', async () => {
    const view = renderPage()
    await settleUntil(
      () => (view.container.textContent ?? '').includes('问候语'),
      '列表行渲染'
    )
    const listCall = getCalls.find((call) => call.url === '/customer-service/quick-replies')
    expect(listCall).toBeDefined()
    expect((listCall?.params as Record<string, unknown>)?.organization_id).toBe(ORG_ID)
    expect((listCall?.params as Record<string, unknown>)?.workspace_id).toBe(WS_ID)
    expect((listCall?.params as Record<string, unknown>)?.page).toBe(1)
    expect((listCall?.params as Record<string, unknown>)?.size).toBe(10)
    // 分页条渲染服务端 total
    expect(view.container.textContent ?? '').toContain('第 1 / 1 页')
    view.unmount()
  })

  it('分页：翻页携带新 page；改页大小重置 page=1', async () => {
    listPayload = {
      list: Array.from({ length: 12 }, (_, index) => replyRow({ id: String(100 + index), title: `条目${index}` })),
      page: 1,
      size: 10,
      total: 12,
      total_page: 2,
    }
    const view = renderPage()
    await settleUntil(
      () => (view.container.textContent ?? '').includes('第 1 / 2 页'),
      '分页条渲染'
    )
    fireEvent.click(view.getByRole('button', { name: '2' }))
    await settleUntil(
      () =>
        getCalls.some(
          (call) => call.url === '/customer-service/quick-replies' &&
            (call.params as Record<string, unknown>)?.page === 2
        ),
      '第 2 页请求'
    )
    view.unmount()
  })

  it('创建：填写表单 → POST 正文白名单 → 列表刷新', async () => {
    const user = userEvent.setup()
    const view = renderPage()
    await settleUntil(
      () => (view.container.textContent ?? '').includes('问候语'),
      '列表就绪'
    )
    await openCreateDialog(view)
    await user.type(view.getByTestId('csqr-form-title'), '发货安抚')
    await user.type(view.getByTestId('csqr-form-content'), '您的包裹正在加急配送中。')
    fireEvent.click(view.getByTestId('csqr-form-submit'))
    await settleUntil(() => writeCalls.some((call) => call.method === 'POST'), '创建 POST')
    const post = writeCalls.find((call) => call.method === 'POST')
    expect(post?.url).toBe('/customer-service/quick-replies')
    expect(Object.keys((post?.body as object) ?? {}).sort()).toEqual([
      'content',
      'organization_id',
      'sort',
      'title',
      'workspace_id',
    ])
    expect((post?.body as Record<string, unknown>).title).toBe('发货安抚')
    view.unmount()
  })

  it('编辑：PUT /:id 全量提交；删除：DELETE /:id 软删 body 带租户条件', async () => {
    const user = userEvent.setup()
    const view = renderPage()
    await settleUntil(
      () => (view.container.textContent ?? '').includes('问候语'),
      '列表就绪'
    )
    // 表格行可视化+辅助双份渲染（CsWidgetInstallationsPage.test 同款纪律），用 getAll 取首个。
    fireEvent.click(view.getAllByRole('button', { name: '编辑' })[0] as HTMLElement)
    await waitFor(() => expect(view.getByTestId('csqr-form-title')).not.toBeNull())
    // 编辑回填（key remount 语义）：表单初值 = 行值
    await waitFor(() =>
      expect((view.getByTestId('csqr-form-title') as HTMLInputElement).value).toBe('问候语')
    )
    await user.clear(view.getByTestId('csqr-form-title'))
    await user.type(view.getByTestId('csqr-form-title'), '问候语V2')
    fireEvent.click(view.getByTestId('csqr-form-submit'))
    await settleUntil(() => writeCalls.some((call) => call.method === 'PUT'), '编辑 PUT')
    const put = writeCalls.find((call) => call.method === 'PUT')
    expect(put?.url).toBe('/customer-service/quick-replies/999999999999999999')
    expect((put?.body as Record<string, unknown>).title).toBe('问候语V2')
    expect('id' in (put?.body as Record<string, unknown>)).toBe(false)

    fireEvent.click(view.getAllByRole('button', { name: '删除' })[0] as HTMLElement)
    // ConfirmDialog = Radix AlertDialog（role=alertdialog）；确认按钮 = 底部最后一个按钮
    const dialog = await waitFor(() => {
      const element = document.querySelector('[role="alertdialog"]')
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).at(-1) as HTMLButtonElement)
    await settleUntil(() => writeCalls.some((call) => call.method === 'DELETE'), '软删 DELETE')
    const remove = writeCalls.find((call) => call.method === 'DELETE')
    expect(remove?.url).toBe('/customer-service/quick-replies/999999999999999999')
    expect((remove?.body as Record<string, unknown>).workspace_id).toBe(WS_ID)
    view.unmount()
  })
})

describe('CsQuickRepliesPage — 反例与防重复提交', () => {
  it('缺 read 权限 → fail-closed：呈现无权访问且不发列表请求', async () => {
    rbacPermissions = []
    const view = renderPage()
    await settleUntil(
      () => (view.container.textContent ?? '').includes('无权访问'),
      '权限拒绝呈现'
    )
    expect(getCalls.some((call) => call.url === '/customer-service/quick-replies')).toBe(false)
    view.unmount()
  })

  it('越权 workspace（后端 403）→ 可解释错误态 + 重试', async () => {
    const axiosLike = Object.assign(new Error('forbidden'), {
      response: { status: 403, data: { code: 403, msg: '您无权访问此资源' } },
    })
    listError = axiosLike as Error
    const view = renderPage()
    await settleUntil(
      () => (view.container.textContent ?? '').includes('加载快捷回复失败'),
      '错误态呈现'
    )
    expect(view.container.textContent ?? '').toContain('forbidden')
    view.unmount()
  })

  it('超长 title（65 字符）→ 表单预拒不发 POST', async () => {
    const user = userEvent.setup()
    const view = renderPage()
    await settleUntil(
      () => (view.container.textContent ?? '').includes('问候语'),
      '列表就绪'
    )
    await openCreateDialog(view)
    const titleInput = view.getByTestId('csqr-form-title') as HTMLInputElement
    await user.click(titleInput)
    // 粘贴到合法边界，再真实键入第 65 字符，避免逐字输入的重复渲染成本。
    await user.paste('a'.repeat(64))
    await user.type(titleInput, 'a')
    expect(titleInput.value).toHaveLength(65)
    await user.type(view.getByTestId('csqr-form-content'), '内容')
    fireEvent.click(view.getByTestId('csqr-form-submit'))
    await waitFor(() => expect(view.getByTestId('csqr-form-title-error')).not.toBeNull())
    expect(view.getByTestId('csqr-form-title-error').textContent).toContain('64')
    expect(writeCalls.filter((call) => call.method === 'POST')).toHaveLength(0)
    view.unmount()
  })

  it('防重复提交（合同 §5）：pending 期间连点提交只发一次 POST', async () => {
    const user = userEvent.setup()
    let releasePost: (() => void) | null = null
    mutableClient.post = (url: unknown, body: unknown) => {
      writeCalls.push({ method: 'POST', url: String(url), body })
      return new Promise((resolve) => {
        releasePost = () => resolve({ data: { code: 0, msg: 'success', payload: { quick_reply: replyRow() } } })
      })
    }
    const view = renderPage()
    await settleUntil(
      () => (view.container.textContent ?? '').includes('问候语'),
      '列表就绪'
    )
    await openCreateDialog(view)
    await user.type(view.getByTestId('csqr-form-title'), '发货安抚')
    await user.type(view.getByTestId('csqr-form-content'), '内容')
    const submit = view.getByTestId('csqr-form-submit')
    fireEvent.click(submit)
    // pending 门生效需要一次 re-render（mutate → isPending），等待后断言
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true))
    // pending 中连点：disabled 按钮不触发 onClick（合同 §5 UI pending 门）
    fireEvent.click(submit)
    fireEvent.click(submit)
    releasePost?.()
    await settleUntil(() => writeCalls.length > 0, 'POST 完成')
    expect(writeCalls.filter((call) => call.method === 'POST')).toHaveLength(1)
    view.unmount()
  })
})
