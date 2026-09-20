/**
 * ADM-01 客服开通向导组件级单元测试。
 *
 * ⚠️ 测试替身说明（unit 层替身，非真实后端）：
 * - axios client 用手写 mock（内存 responder）模拟
 *   /organizations、/organizations/:id/workspaces、/organizations/:id/members
 *   与 POST /customer-service/organizations/:org_id/provisioning、
 *   POST /customer-service/widget-installations；
 * - RBAC 权限源（@/services/api/rbac、@/services/api/adminConfig）用
 *   bun mock.module 替换（仿 useAdminPermission.rbac404.test.tsx 模式），
 *   afterAll 恢复真实模块避免污染其他测试文件。
 * provisioning 端到端联调 DEPENDENT_BACKEND_BS01B，由 P1-E2E-01 覆盖。
 *
 * 覆盖验收点：A01 自举+审计展示；A02 read/write 分权；A03 选择器无裸 TSID 输入；
 * A04 origins 严格校验；A05 snippet 负例；A06 loading/error/empty。
 */
import '../../../test/setupDom'

import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CsProvisioningWizardPage } from '../index'
import { useAuthStore } from '@/stores/authStore'
import client from '@/services/api/client'
import * as realRbacModule from '@/services/api/rbac'
import * as realAdminConfigModule from '@/services/api/adminConfig'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const realRbacExports = { ...realRbacModule }
const realAdminConfigExports = { ...realAdminConfigModule }

const ORG_ID = '1234567890123456789'
const WS_ID = '9876543210987654321'
const MEMBER_ID = '111111111111111111'

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
const MEMBER_ROW = {
  organization_id: ORG_ID,
  user_id: MEMBER_ID,
  role: 'member',
  status: 'active',
  invited_by: '555555555555555555',
  joined_at: 1758000000,
  nickname: '小客服',
  account: 'cs_agent_01',
}
const PROVISION_PAYLOAD = {
  organization_id: ORG_ID,
  workspace_id: WS_ID,
  identity: { id: MEMBER_ID },
  assignment: { id: '222222222222222222' },
  seat: { business_identity_id: MEMBER_ID, workspace_id: WS_ID, enabled: true, status: 'enabled' },
  repaired: false,
  audit: [
    { action: 'cs_identity.create', actor: 'adm-1', target: `identity:${MEMBER_ID}`, before: null, after: '{"status":"active"}' },
    { action: 'cs_seat.enable', actor: 'adm-1', target: `seat:${MEMBER_ID}`, before: '{"enabled":false}', after: '{"enabled":true}' },
  ],
}
const INSTALLATION_PAYLOAD = {
  id: '999999999999999999',
  organization_id: ORG_ID,
  display_name: '商城在线客服',
  public_widget_id: 'wgt_pub_demo1',
  allowed_origins: ['https://shop.example.com'],
  branding: { display_name: null, primary_color: null },
  consent_version: 'v1',
  status: 'active',
  created_at: 1758000000,
}

type GetResponder = (_url: string) => unknown
type PostResponder = (_url: string, _body: unknown) => unknown

let getResponder: GetResponder = () => ({ list: [ORG_ROW], page: 1, size: 50, total: 1, total_page: 1 })
let postResponder: PostResponder = () => ({})

function defaultGetResponder(url: string): unknown {
  if (url === '/organizations') {
    return { list: [ORG_ROW], page: 1, size: 50, total: 1, total_page: 1 }
  }
  if (url === `/organizations/${ORG_ID}/workspaces`) {
    return { list: [WS_ROW], page: 1, size: 50, total: 1, total_page: 1 }
  }
  if (url === `/organizations/${ORG_ID}/members`) {
    return { list: [MEMBER_ROW], page: 1, size: 50, total: 1, total_page: 1 }
  }
  throw new Error(`unexpected GET url: ${url}`)
}

function defaultPostResponder(url: string): unknown {
  if (url === `/customer-service/organizations/${ORG_ID}/provisioning`) {
    return PROVISION_PAYLOAD
  }
  if (url === '/customer-service/widget-installations') {
    return { installation: INSTALLATION_PAYLOAD }
  }
  throw new Error(`unexpected POST url: ${url}`)
}

// RBAC 权限源替身：permissions 由用例覆盖（write 用例含两种权限，只读用例缺 write）
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

function renderWizard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/customer-service/provisioning']}>
        <CsProvisioningWizardPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function selectByTestId(view: RenderResult, testId: string): HTMLSelectElement {
  const element = view.getByTestId(testId)
  if (!(element instanceof HTMLSelectElement)) throw new Error(`${testId} 不是 select`)
  return element
}

function inputByTestId(view: RenderResult, testId: string): HTMLInputElement | HTMLTextAreaElement {
  const element = view.getByTestId(testId)
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
    throw new Error(`${testId} 不是输入控件`)
  }
  return element
}

async function walkToIdentityStep(postCalls: Array<{ url: string; body: unknown }>): Promise<RenderResult> {
  const view = renderWizard()
  const orgSelect = await waitFor(() => selectByTestId(view, 'cs-provision-org-select'))
  fireEvent.change(orgSelect, { target: { value: ORG_ID } })
  const wsSelect = await waitFor(() => selectByTestId(view, 'cs-provision-ws-select'))
  await waitFor(() => expect(wsSelect.value).toBe(WS_ID))
  fireEvent.click(view.getByRole('button', { name: '下一步：开通客服坐席' }))
  const memberSelect = await waitFor(() => selectByTestId(view, 'cs-provision-member-select'))
  fireEvent.change(memberSelect, { target: { value: MEMBER_ID } })
  const submit = await waitFor(() => view.getByTestId('cs-provision-submit'))
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false))
  expect(postCalls).toHaveLength(0)
  fireEvent.click(submit)
  return view
}

describe('CsProvisioningWizardPage（unit 层替身）', () => {
  const originalGet = mutableClient.get
  const originalPost = mutableClient.post

  beforeEach(() => {
    spyOn(console, 'warn').mockImplementation(() => {})
    spyOn(console, 'error').mockImplementation(() => {})
    getResponder = defaultGetResponder
    postResponder = defaultPostResponder
    rbacPermissions = ['customer_service:read', 'customer_service:write']
    mutableClient.get = (url: unknown) => {
      const payload = getResponder(String(url))
      return { data: { code: 0, msg: 'success', payload } }
    }
    mutableClient.post = (url: unknown, body: unknown) => {
      const payload = postResponder(String(url), body)
      return { data: { code: 0, msg: 'success', payload } }
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

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
    document.body.innerHTML = ''
  })

  it('A01+A03：选择器主流程完成自举，POST 落平台面，审计五键可见，全程无裸 TSID 输入', async () => {
    const postCalls: Array<{ url: string; body: unknown }> = []
    mutableClient.post = (url: unknown, body: unknown) => {
      postCalls.push({ url: String(url), body })
      const payload = defaultPostResponder(String(url))
      return { data: { code: 0, msg: 'success', payload } }
    }

    const view = renderWizard()
    const container = view.container
    const orgSelect = await waitFor(() => selectByTestId(view, 'cs-provision-org-select'))

    // A03：组织/工作区均为 select，主流程无任何数字输入框（裸 TSID 手填面）
    expect(container.querySelectorAll('input[inputmode="numeric"]').length).toBe(0)
    expect(orgSelect.options.length).toBe(2)
    expect(orgSelect.options[1]?.textContent).toContain('Example 商城')

    fireEvent.change(orgSelect, { target: { value: ORG_ID } })

    // 工作区 select 出现且默认选中第一个（default workspace）
    const wsSelect = await waitFor(() => selectByTestId(view, 'cs-provision-ws-select'))
    expect(wsSelect.value).toBe(WS_ID)

    fireEvent.click(view.getByRole('button', { name: '下一步：开通客服坐席' }))
    const memberSelect = await waitFor(() => selectByTestId(view, 'cs-provision-member-select'))
    fireEvent.change(memberSelect, { target: { value: MEMBER_ID } })
    const submit = (await waitFor(() => view.getByTestId('cs-provision-submit'))) as HTMLButtonElement
    await waitFor(() => expect(submit.disabled).toBe(false))
    fireEvent.click(submit)

    // A01：显式 Admin provisioning API 事务化提交
    await waitFor(() => expect(postCalls.some((call) => call.url.endsWith('/provisioning'))).toBe(true))
    const provisionCall = postCalls.find((call) => call.url.endsWith('/provisioning'))
    expect(provisionCall?.url).toBe(`/customer-service/organizations/${ORG_ID}/provisioning`)
    expect(provisionCall?.url.includes('/api/v1')).toBe(false)
    expect(Object.keys(provisionCall?.body as Record<string, unknown>).sort()).toEqual([
      'business_identity_id',
      'workspace_id',
    ])

    // 审计五键投影可见（actor/target/before/after）
    const auditTable = await waitFor(() => view.getByTestId('cs-provision-audit'))
    expect(auditTable.textContent).toContain('cs_identity.create')
    expect(auditTable.textContent).toContain('adm-1')
    expect(auditTable.textContent).toContain('{"enabled":false}')

    // 进入 Widget installation 步骤
    await userEvent.type(await waitFor(() => inputByTestId(view, 'cs-provision-install-name')), '商城在线客服')
    await userEvent.type(inputByTestId(view, 'cs-provision-install-origins'), 'https://shop.example.com')
    const createButton = view.getByTestId('cs-provision-install-submit') as HTMLButtonElement
    await waitFor(() => expect(createButton.disabled).toBe(false))
    fireEvent.click(createButton)

    await waitFor(() => expect(postCalls.some((call) => call.url === '/customer-service/widget-installations')).toBe(true))
    const installCall = postCalls.find((call) => call.url === '/customer-service/widget-installations')
    const installBody = installCall?.body as Record<string, unknown>
    expect(installBody['organization_id']).toBe(ORG_ID)
    expect(installBody['workspace_id']).toBe(WS_ID)
    expect(installBody['allowed_origins']).toEqual(['https://shop.example.com'])

    // A05：snippet 只含 public widget id；origin 只在 loader src；无租户参数/secret
    await userEvent.type(await waitFor(() => inputByTestId(view, 'cs-provision-widget-origin')), 'https://widget.example.com')
    const snippet = await waitFor(() => inputByTestId(view, 'cs-provision-snippet')) as HTMLTextAreaElement
    expect(snippet.value).toBe(
      '<script async src="https://widget.example.com/loader.js" data-widget-id="wgt_pub_demo1"></script>'
    )
    expect(snippet.value.includes('data-org-id')).toBe(false)
    expect(snippet.value.includes(ORG_ID)).toBe(false)
    expect(snippet.value.includes('secret')).toBe(false)
  })

  it('A05：复制按钮把 snippet 写入剪贴板（无 secret）', async () => {
    let copied = ''
    const navigatorWithClipboard = globalThis.navigator as { clipboard?: { writeText: (_text: string) => Promise<void> } }
    Object.defineProperty(navigatorWithClipboard, 'clipboard', {
      value: { writeText: async (text: string) => { copied = text } },
      configurable: true,
    })

    const view = await walkToIdentityStep([])
    await userEvent.type(await waitFor(() => inputByTestId(view, 'cs-provision-install-name')), '商城在线客服')
    await userEvent.type(inputByTestId(view, 'cs-provision-install-origins'), 'https://shop.example.com')
    fireEvent.click(view.getByTestId('cs-provision-install-submit'))
    await userEvent.type(await waitFor(() => inputByTestId(view, 'cs-provision-widget-origin')), 'https://widget.example.com')
    const copyButton = (await waitFor(() => view.getByTestId('cs-provision-copy'))) as HTMLButtonElement
    await waitFor(() => expect(copyButton.disabled).toBe(false))
    fireEvent.click(copyButton)
    await waitFor(() =>
      expect(copied).toBe(
        '<script async src="https://widget.example.com/loader.js" data-widget-id="wgt_pub_demo1"></script>'
      )
    )
  })

  it('A02：只有 read 权限时为只读姿态——提示条可见，开通按钮禁用且无 POST', async () => {
    rbacPermissions = ['customer_service:read']
    const postCalls: Array<{ url: string; body: unknown }> = []
    mutableClient.post = (url: unknown, body: unknown) => {
      postCalls.push({ url: String(url), body })
      const payload = defaultPostResponder(String(url))
      return { data: { code: 0, msg: 'success', payload } }
    }

    const view = renderWizard()
    await waitFor(() => view.getByText(/只读模式/))
    const orgSelect = await waitFor(() => selectByTestId(view, 'cs-provision-org-select'))
    fireEvent.change(orgSelect, { target: { value: ORG_ID } })
    await waitFor(() => selectByTestId(view, 'cs-provision-ws-select'))
    fireEvent.click(view.getByRole('button', { name: '下一步：开通客服坐席' }))
    const memberSelect = await waitFor(() => selectByTestId(view, 'cs-provision-member-select'))
    fireEvent.change(memberSelect, { target: { value: MEMBER_ID } })
    const submit = (await waitFor(() => view.getByTestId('cs-provision-submit'))) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(submit.title).toContain('customer_service:write')
    fireEvent.click(submit)
    expect(postCalls).toHaveLength(0)
  })

  it('A02：无 read 权限 → 整页 fail-closed，不渲染任何向导步骤', async () => {
    rbacPermissions = []
    const view = renderWizard()
    await waitFor(() => view.getByText('无权访问'))
    expect(view.queryByTestId('cs-provision-org-select')).toBeNull()
  })

  it('A04：非法 origin（通配/路径）逐个拒绝并阻断创建', async () => {
    const view = await walkToIdentityStep([])
    await userEvent.type(await waitFor(() => inputByTestId(view, 'cs-provision-install-name')), '商城在线客服')
    await userEvent.type(
      inputByTestId(view, 'cs-provision-install-origins'),
      'https://shop.example.com,https://*.evil.com,https://bad.example.com/path'
    )
    const alert = await waitFor(() => view.getByRole('alert'))
    expect(alert.textContent).toContain('https://*.evil.com')
    expect(alert.textContent).toContain('https://bad.example.com/path')
    expect(alert.textContent).not.toContain('https://shop.example.com')
    const createButton = view.getByTestId('cs-provision-install-submit') as HTMLButtonElement
    expect(createButton.disabled).toBe(true)
  })

  it('A06：组织加载失败呈现错误态并可重试', async () => {
    getResponder = () => {
      throw new Error('boom')
    }
    const view = renderWizard()
    await waitFor(() => view.getByText(/加载组织失败/))
    expect(view.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('A06：空组织呈现空态引导', async () => {
    getResponder = (url) => {
      if (url === '/organizations') return { list: [], page: 1, size: 50, total: 0, total_page: 0 }
      throw new Error(`unexpected GET url: ${url}`)
    }
    const view = renderWizard()
    await waitFor(() => view.getByText('暂无可用组织'))
  })

  it('A06：组织加载中呈现 loading 态', async () => {
    mutableClient.get = () => new Promise(() => {})
    const view = renderWizard()
    await waitFor(() => view.getByText('加载组织列表…'))
  })
})
