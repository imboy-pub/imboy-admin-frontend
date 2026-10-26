/**
 * R09 凭证到期状态与撤销按钮 · 时间合同串联测试（PLAN §7.4 指定新增）。
 *
 * 链路：raw JSON（毫秒 wire）→ listCredentials/toCredentialMeta（R08-AD.0
 * 毫秒 adapter）→ credentialExpiryState → Badge 文案 + 撤销按钮可用性 +
 * 到期/创建展示值。当前时间经 props.now 注入固定，全部用例可复现。
 *
 * 端点单位证据：BE adm_enterprise_application_handler credentials_action →
 * elib_response:success → convert_at_timestamps → elib_dt:rfc3339_to(_, millisecond)
 * —— credential 四时间字段 wire = epoch 毫秒整数或 null。
 */
import '../../../test/setupDom'
import { afterEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import client from '@/services/api/client'
import { useAuthStore } from '@/stores/authStore'
import { CredentialPanel } from './CredentialPanel'
import { READ_PERMISSION, WRITE_PERMISSION } from '../api/contracts'
import { toCredentialMeta } from '../api/pureFunctions'

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
const CREDENTIALS_URL = `/enterprise/organizations/${ORG}/applications/${APP}/credentials`

/** 固定「当前时间」：R09 AC 要求注入后可复现。 */
const NOW = Date.parse('2026-10-26T00:00:00Z')

/** 合成毫秒瞬间（无 PII）。 */
const FUTURE_EXPIRY_MS = 1796083200000 // 2026-12-01T00:00:00.000Z（AC R09-1 原值）
const PAST_EXPIRY_MS = NOW - 1000
const CREATED_MS = 1747267200000 // 2025-05-15T00:00:00.000Z

const ROW_ACTIVE = '3234567890123456781'
const ROW_PAST = '3234567890123456782'
const ROW_NOW = '3234567890123456783'
const ROW_NO_EXPIRY = '3234567890123456784'
const ROW_BAD = '3234567890123456785'
const ROW_REVOKED = '3234567890123456786'

function payload(body: unknown) {
  return { data: { code: 0, msg: 'ok', payload: body } }
}

/** 装 RBAC 会话并喂 credentials 列表（毫秒 wire 原始 JSON）。 */
function mockCredentials(permissions: string[], rows: Array<Record<string, unknown>>) {
  mutableClient.get = async (url: string) => {
    if (url === '/rbac/me') {
      return payload({ role_id: '1', role_ids: ['1'], role_name: 'test', permissions, menu_paths: [] })
    }
    if (url === CREDENTIALS_URL) return payload(rows)
    return payload({ items: [], rbac: { roles: [] }, title: 'Imboy Admin' })
  }
  mutableClient.post = async () => payload({})
  mutableClient.put = async () => payload({})
  mutableClient.patch = async () => payload({})
  mutableClient.delete = async () => payload({})
}

function wrap(element: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>
  )
}

const REVOKE_ROWS = [
  { id: ROW_ACTIVE, credential_prefix: 'ib_int_a', status: 'active', version: 1,
    created_at: CREATED_MS, expires_at: FUTURE_EXPIRY_MS, last_used_at: null, revoked_at: null },
  { id: ROW_PAST, credential_prefix: 'ib_int_b', status: 'active', version: 1,
    created_at: CREATED_MS, expires_at: PAST_EXPIRY_MS, last_used_at: null, revoked_at: null },
  { id: ROW_NOW, credential_prefix: 'ib_int_c', status: 'active', version: 1,
    created_at: CREATED_MS, expires_at: NOW, last_used_at: null, revoked_at: null },
  { id: ROW_NO_EXPIRY, credential_prefix: 'ib_int_d', status: 'active', version: 1,
    created_at: CREATED_MS, expires_at: null, last_used_at: null, revoked_at: null },
  { id: ROW_BAD, credential_prefix: 'ib_int_e', status: 'active', version: 1,
    created_at: CREATED_MS, expires_at: 'not-a-date', last_used_at: null, revoked_at: null },
  { id: ROW_REVOKED, credential_prefix: 'ib_int_f', status: 'revoked', version: 1,
    created_at: CREATED_MS, expires_at: FUTURE_EXPIRY_MS, last_used_at: null, revoked_at: NOW },
]

afterEach(() => {
  mutableClient.get = origGet
  mutableClient.post = origPost
  mutableClient.put = origPut
  mutableClient.patch = origPatch
  mutableClient.delete = origDelete
  useAuthStore.setState({ admin: null, isAuthenticated: false })
  cleanup()
})

describe('R09-1/R09-2 到期状态派生（毫秒 wire → adapter → state）', () => {
  it('adapter 先归一毫秒瞬间：1796083200000 未来到期 → active（R09-1 原值）', async () => {
    // 纯函数层先钉死：raw 毫秒 → ISO（不再走 Date.parse 原字符串的引擎歧义）
    const meta = toCredentialMeta(REVOKE_ROWS[0])
    expect(meta?.expiresAt).toBe('2026-12-01T00:00:00.000Z')
    expect(meta?.createdAt).toBe('2025-05-15T00:00:00.000Z')

    mockCredentials([READ_PERMISSION, WRITE_PERMISSION], REVOKE_ROWS)
    const view = wrap(
      <CredentialPanel
        scope={{ organizationId: ORG, applicationId: APP }}
        applicationArchived={false}
        now={NOW}
      />
    )
    await waitFor(() => {
      expect(view.getByTestId(`credential-expiry-${ROW_ACTIVE}`).textContent).toBe('有效（未过期）')
    })
  })

  it('过去 / 等于当前 / 无到期 / 坏值 / 已撤销 五态（R09-2）', async () => {
    mockCredentials([READ_PERMISSION, WRITE_PERMISSION], REVOKE_ROWS)
    const view = wrap(
      <CredentialPanel
        scope={{ organizationId: ORG, applicationId: APP }}
        applicationArchived={false}
        now={NOW}
      />
    )
    await waitFor(() => {
      expect(view.getByTestId(`credential-expiry-${ROW_ACTIVE}`).textContent).toBe('有效（未过期）')
    })
    expect(view.getByTestId(`credential-expiry-${ROW_PAST}`).textContent).toBe('已过期')
    // 到期时刻等于当前时间视为已过期（半开边界归属到期侧）。
    expect(view.getByTestId(`credential-expiry-${ROW_NOW}`).textContent).toBe('已过期')
    expect(view.getByTestId(`credential-expiry-${ROW_NO_EXPIRY}`).textContent).toBe('有效（无到期）')
    // 坏值不放宽为无到期：unknown（fail-safe）。
    expect(view.getByTestId(`credential-expiry-${ROW_BAD}`).textContent).toBe('未知（fail-safe）')
    // 已撤销优先于期限判定：未来到期的 revoked 不会被重判 active。
    expect(view.getByTestId(`credential-expiry-${ROW_REVOKED}`).textContent).toBe('已撤销')
  })

  it('展示与状态同源：到期/创建列渲染 adapter 规范 ISO，null 语义占位', async () => {
    mockCredentials([READ_PERMISSION, WRITE_PERMISSION], REVOKE_ROWS)
    const view = wrap(
      <CredentialPanel
        scope={{ organizationId: ORG, applicationId: APP }}
        applicationArchived={false}
        now={NOW}
      />
    )
    await waitFor(() => {
      expect(view.getByTestId(`credential-expiry-${ROW_ACTIVE}`).textContent).toBe('有效（未过期）')
    })
    // 多行共享同一瞬间值：按出现次数断言（active 与 revoked 都到期于 FUTURE）。
    expect(view.getAllByText('2026-12-01T00:00:00.000Z').length).toBe(2)
    expect(view.getAllByText('2025-05-15T00:00:00.000Z').length).toBe(6)
    // 无到期 → 「无」；从未使用 → 占位文案（不伪造「刚刚」）。
    expect(view.getAllByText('无').length).toBe(1)
    expect(view.getAllByText('从未使用').length).toBe(6)
  })
})

describe('R09-3 撤销按钮可用性', () => {
  it('写权限 + active/noExpiry → 撤销可用；expired/unknown/revoked → 禁用', async () => {
    mockCredentials([READ_PERMISSION, WRITE_PERMISSION], REVOKE_ROWS)
    const view = wrap(
      <CredentialPanel
        scope={{ organizationId: ORG, applicationId: APP }}
        applicationArchived={false}
        now={NOW}
      />
    )
    await waitFor(() => {
      expect(view.getByTestId(`credential-revoke-${ROW_ACTIVE}`)).toBeTruthy()
    })
    // active 且有写权限：唯一可用
    expect((view.getByTestId(`credential-revoke-${ROW_ACTIVE}`) as HTMLButtonElement).disabled).toBe(false)
    // 已过期 / 等于当前（过期）/ 坏值（unknown）/ 已撤销：禁用
    for (const id of [ROW_PAST, ROW_NOW, ROW_BAD, ROW_REVOKED]) {
      expect((view.getByTestId(`credential-revoke-${id}`) as HTMLButtonElement).disabled).toBe(true)
    }
    // noExpiry 属有效凭证：可撤销
    expect((view.getByTestId(`credential-revoke-${ROW_NO_EXPIRY}`) as HTMLButtonElement).disabled).toBe(false)
  })

  it('无写权限：即使 active 撤销仍禁用（R09-3 负例）', async () => {
    mockCredentials([READ_PERMISSION], [REVOKE_ROWS[0]!])
    const view = wrap(
      <CredentialPanel
        scope={{ organizationId: ORG, applicationId: APP }}
        applicationArchived={false}
        now={NOW}
      />
    )
    await waitFor(() => {
      expect(view.getByTestId(`credential-revoke-${ROW_ACTIVE}`)).toBeTruthy()
    })
    expect((view.getByTestId(`credential-revoke-${ROW_ACTIVE}`) as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByTestId('credential-issue') as HTMLButtonElement).disabled).toBe(true)
  })
})
