/**
 * RBAC 越权负例（DOM 级）：证明「UI 隐藏 ≠ 安全」在本 phase 的两道锁上都成立。
 *
 * 锁 1（渲染层）：无 `enterprise_business:write` 时写入口 disabled + 显式只读提示。
 * 锁 2（请求层）：即使把 disabled 强行去掉、直接派发事件，也**不会**发出任何
 *   写请求（服务层的 `assertWriteAllowed` 在发请求前抛错）。
 *
 * 后端角色矩阵事实源：imboy `src/adm/adm_index_handler.erl:role_acl/1`
 *   role 1 super_admin     → read + write
 *   role 2 ops_admin       → read only
 *   role 3..6              → 无 enterprise_business 权限
 */
import '../../../test/setupDom'
import { afterEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import client from '@/services/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApplicationGovernanceCard } from './ApplicationGovernanceCard'
import { CredentialPanel } from './CredentialPanel'
import { READ_PERMISSION, WRITE_PERMISSION } from '../api/contracts'
import type { ApplicationDetail } from '../api/pureFunctions'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn; patch: AnyFn; delete: AnyFn }

const mutableClient = client as unknown as MutableClient
const origGet = mutableClient.get
const origPost = mutableClient.post
const origPut = mutableClient.put
const origPatch = mutableClient.patch
const origDelete = mutableClient.delete

const ORG = '1234567890123456789'
const APP = '2234567890123456789'

const DETAIL: ApplicationDetail = {
  id: APP,
  organizationId: ORG,
  name: 'OA 集成应用',
  status: 'active',
  scopes: ['application:read', 'identities:read'],
  version: 4,
  createdAt: '2026-09-01 10:00:00',
  updatedAt: '2026-09-20 10:00:00',
  description: '合成测试数据（无 PII）',
  ownerApplicationKey: 'oa-demo',
}

function payload(body: unknown) {
  return { data: { code: 0, msg: 'ok', payload: body } }
}

let calls: Array<{ method: string; url: string }> = []

/** 装 RBAC 会话：permissions 决定读/写门；只读账号的写请求在后端会被 403。 */
function mockRbac(permissions: string[], options: { rejectWrites?: boolean } = {}) {
  mutableClient.get = async (url: string) => {
    if (url === '/rbac/me') {
      return payload({ role_id: '1', role_ids: ['1'], role_name: 'test', permissions, menu_paths: [] })
    }
    // useAdminPermission 的 sidebar 模板兜底：返回空角色模板，权限只由 profile 决定
    return payload({ items: [], rbac: { roles: [] }, title: 'Imboy Admin' })
  }
  const write = async (url: string) => {
    calls.push({ method: 'write', url })
    if (options.rejectWrites) {
      throw { code: 403, msg: 'forbidden' }
    }
    return payload({ id: '3234567890123456789', credential_prefix: 'ib_int_abc', status: 'active' })
  }
  mutableClient.post = write
  mutableClient.put = write
  mutableClient.patch = write
  mutableClient.delete = write
}

function wrap(element: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => {
  mutableClient.get = origGet
  mutableClient.post = origPost
  mutableClient.put = origPut
  mutableClient.patch = origPatch
  mutableClient.delete = origDelete
  useAuthStore.setState({ admin: null, isAuthenticated: false })
  calls = []
  cleanup()
})

describe('RBAC 越权负例 · 渲染层（锁 1）', () => {
  it('只读角色（role 2 语义：仅 read）：生命周期写按钮全 disabled + 显式只读提示', async () => {
    mockRbac([READ_PERMISSION])
    const view = wrap(<ApplicationGovernanceCard scope={{ organizationId: ORG, applicationId: APP }} detail={DETAIL} onRefresh={() => {}} />)

    await waitFor(() => {
      expect(view.getByTestId('governance-readonly-hint')).toBeTruthy()
    })
    const transition = view.getByTestId('lifecycle-to-disabled') as HTMLButtonElement
    expect(transition.disabled).toBe(true)
    const save = view.getByTestId('application-scope-save') as HTMLButtonElement
    expect(save.disabled).toBe(true)
  })

  it('可写角色（role 1 语义：read+write）：写入口可用且无只读提示', async () => {
    mockRbac([READ_PERMISSION, WRITE_PERMISSION])
    const view = wrap(<ApplicationGovernanceCard scope={{ organizationId: ORG, applicationId: APP }} detail={DETAIL} onRefresh={() => {}} />)

    // bun+jsdom 下条件渲染节点消失有 0.6-1.1s 事件循环延迟（本机 80 端口
    // nginx 使未 stub 的原生 fetch 出网进一步拖慢），默认 1000ms 会稳定超时
    await waitFor(() => {
      expect(view.queryByTestId('governance-readonly-hint')).toBeNull()
    }, { timeout: 5000 })
    await waitFor(() => {
      expect((view.getByTestId('lifecycle-to-disabled') as HTMLButtonElement).disabled).toBe(false)
    }, { timeout: 5000 })
  })

  it('已归档应用：写入口关闭并给出归档提示（生命周期终态）', async () => {
    mockRbac([READ_PERMISSION, WRITE_PERMISSION])
    const view = wrap(
      <ApplicationGovernanceCard
        scope={{ organizationId: ORG, applicationId: APP }}
        detail={{ ...DETAIL, status: 'archived' }}
        onRefresh={() => {}}
      />
    )
    await waitFor(() => {
      expect(view.getByTestId('lifecycle-terminal')).toBeTruthy()
    })
    expect(view.queryByTestId('lifecycle-to-disabled')).toBeNull()
  })

  it('credential 面板：只读角色时签发/轮换/撤销全 disabled + 只读提示', async () => {
    mockRbac([READ_PERMISSION])
    mutableClient.get = async (url: string) => {
      if (url === '/rbac/me') {
        return payload({ role_id: '2', role_ids: ['2'], role_name: 'ops_admin', permissions: [READ_PERMISSION], menu_paths: [] })
      }
      return payload([
        { id: '3234567890123456789', credential_prefix: 'ib_int_abc', status: 'active', version: 1 },
      ])
    }
    const view = wrap(<CredentialPanel scope={{ organizationId: ORG, applicationId: APP }} applicationArchived={false} />)

    // 等凭证行落地后再断言（列表加载态下按钮尚未渲染）
    await waitFor(() => {
      expect(view.getByTestId('credential-rotate-3234567890123456789')).toBeTruthy()
    })
    expect(view.getByTestId('credential-readonly-hint')).toBeTruthy()
    expect((view.getByTestId('credential-issue') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByTestId('credential-rotate-3234567890123456789') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByTestId('credential-revoke-3234567890123456789') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('RBAC 越权负例 · 请求层（锁 2：UI 被绕过也不发写请求）', () => {
  it('只读角色强行 dispatch 写按钮：0 个写请求发出（服务层在发请求前抛错）', async () => {
    mockRbac([READ_PERMISSION])
    const view = wrap(<CredentialPanel scope={{ organizationId: ORG, applicationId: APP }} applicationArchived={false} />)

    await waitFor(() => {
      expect(view.getByTestId('credential-readonly-hint')).toBeTruthy()
    })

    // 绕过 disabled：把按钮恢复可点后派发 click
    const issue = view.getByTestId('credential-issue') as HTMLButtonElement
    issue.disabled = false
    fireEvent.click(issue)

    // 点击只会打开二次确认弹窗（不发请求）；即便确认也不会发出写请求
    const confirm = document.querySelector('[role="alertdialog"] button:last-child') as HTMLButtonElement | null
    if (confirm) fireEvent.click(confirm)

    await waitFor(() => {
      expect(calls.length).toBe(0)
    })
  })

  it('后端 403（真实越权路径）：动作被拒且页面显示错误（不显示成功）', async () => {
    mockRbac([READ_PERMISSION, WRITE_PERMISSION], { rejectWrites: true })
    const view = wrap(<CredentialPanel scope={{ organizationId: ORG, applicationId: APP }} applicationArchived={false} />)

    await waitFor(() => {
      expect((view.getByTestId('credential-issue') as HTMLButtonElement).disabled).toBe(false)
    })
    fireEvent.click(view.getByTestId('credential-issue'))
    const confirm = document.querySelector('[role="alertdialog"] button:last-child') as HTMLButtonElement | null
    expect(confirm).not.toBeNull()
    fireEvent.click(confirm!)

    await waitFor(() => {
      expect(view.getByTestId('credential-action-error')).toBeTruthy()
    })
    expect(view.getByTestId('credential-action-error').textContent).toContain('权限')
    // 失败时绝不出现「一次性 secret 面板」（不产生假成功的凭证）
    expect(view.queryByTestId('secret-once-value')).toBeNull()
  })
})
