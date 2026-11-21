import { installAttachmentLocksShim } from '@/test/attachmentJournalFixture'
installAttachmentLocksShim()
/**
 * C02 失权后访问（AT08）——admin 坐席工作台组件级补测（session-revoked 三断言）。
 *
 * 缺口背景（STATE 卡 AT08/C02）：A04/DF-12 已覆盖「队列视图下 revoked → claim
 * 禁用 + live-region 播报」，但组件级仍缺三块失权 UI 行为：
 * 1. 接单会话打开时收到 seat.changed revoked → composer 写入口整体收回
 *    （输入不可用）+ `seat-write-closed` 只读降级注记可见且可解释；
 * 2. 踢出播报（live-region）在会话视图下可见且不随后续流量消失；
 * 3. 断线重连（自动重连 / offline 横幅手动 retry）只恢复链路，不恢复写入口
 *    ——未证明授权前 composer 不复活、claim 不解禁。
 *
 * 全部走 workbenchTestHarness 假后端/SSE（同 SEAT-02 口径，isolate 车道，
 * 不依赖浏览器/API/SQL）。
 */
import '../../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import client from '@/services/api/client'
import { PlatformCsSessionsPage } from '@/modules/customer_service/pages/PlatformCsSessionsPage'
import { CsSessionDetailPage } from '@/modules/customer_service/pages/CsSessionDetailPage'
import { SeatWorkspacePage } from './SeatWorkspacePage'
import {
  CONV,
  CONTACT,
  FakeSseStream,
  SESSION,
  SESSION2,
  SeatFakeBackend,
  envelopeFrame,
  makeGateway,
} from './workbenchTestHarness'
import { establishSeatSession, seatTokenVault, useSeatAuthStore } from '../seatAuthStore'

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
}

function renderWorkspace(backend: SeatFakeBackend, sse: FakeSseStream) {
  const gateway = makeGateway(backend, sse)
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <SeatWorkspacePage gateway={gateway} />
    </QueryClientProvider>,
  )
}

async function claimActiveSession(view: ReturnType<typeof renderWorkspace>): Promise<void> {
  fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`), { timeout: 3000 }))
  fireEvent.click(await waitFor(() => view.getByTestId(`seat-claim-${SESSION}`), { timeout: 3000 }))
  await waitFor(() => expect(view.getByTestId('seat-composer')).toBeDefined(), { timeout: 3000 })
}

function pushRevoked(sse: FakeSseStream, eventId: string): void {
  sse.push(envelopeFrame(eventId, 'seat.changed', 'seat', null, 'revoked'))
}

describe('SeatWorkspacePage C02 失权后组件状态（session-revoked：输入禁用/踢出提示/只读降级）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    expect(establishSeatSession('eyJh.eyJi.c2ln', null)).toBe(true)
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    mock.restore()
  })

  it('失权断言①+②：接单会话打开时收到 seat.changed revoked → composer 写入口整体收回（输入不可用）+ seat-write-closed 只读降级注记可见且可解释 + live-region 踢出播报在场', async () => {
    const backend = new SeatFakeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    await claimActiveSession(view)
    // 失权前写入口可用：composer 可输入（对照事实）。
    fireEvent.change(view.getByTestId('seat-composer'), { target: { value: '撤权前草稿' } })
    expect((view.getByTestId('seat-composer') as HTMLTextAreaElement).value).toBe('撤权前草稿')

    pushRevoked(sse, '9900000000000000001')

    // 踢出提示可见（aria-live 播报，DF-12 同源文案）。
    await waitFor(() => expect(view.getByTestId('seat-live-region').textContent).toContain('写入口已收回'))
    expect(view.getByTestId('seat-live-region').textContent).toContain('坐席已暂停或离岗')
    // 输入禁用（fail-closed 强于 disabled：composer 与发送按钮整体收回，不存在可输入面）。
    expect(view.queryByTestId('seat-composer')).toBeNull()
    expect(view.queryByTestId('seat-send')).toBeNull()
    // 只读降级注记可见且可解释（seat-write-closed 此前全仓零测试引用）。
    const note = await waitFor(() => view.getByTestId('seat-write-closed'))
    expect(note.getAttribute('role')).toBe('note')
    expect(note.textContent).toContain('坐席已暂停或离岗')
    expect(note.textContent).toContain('回复与操作已收回')
  })

  it('失权断言③a：自动重连成功只恢复链路不恢复写入口——online + 仅 benign updated/appended 信封，composer 不复活、只读注记与踢出播报保持', async () => {
    const backend = new SeatFakeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    await claimActiveSession(view)
    pushRevoked(sse, '9900000000000000002')
    // 轮询布尔值，避免旧 DOM 暂态的 Fiber 展开阻塞异步撤权。
    // Poll a boolean so formatting a transient DOM/Fiber tree cannot block the update.
    await waitFor(() => expect(view.queryByTestId('seat-composer') === null).toBe(true))

    // 服务端正常 fin → 客户端凭 Last-Event-ID 自动无损重连（网络层允许）。
    sse.close()
    await waitFor(() => expect(sse.connectCount).toBeGreaterThanOrEqual(2), { timeout: 5000 })
    // 重连后的流量全部 benign（非撤权、非证明授权）：updated + 普通消息追加。
    await waitFor(() => expect(view.queryByTestId('seat-composer') === null).toBe(true))
    sse.push(envelopeFrame('9900000000000000003', 'seat.changed', 'seat', null, 'updated'))
    sse.push(envelopeFrame('9900000000000000004', 'message.appended', 'message', SESSION))
    await waitFor(() => expect(view.getByTestId('seat-live-region').textContent).toContain('写入口已收回'))
    // 写入口未复活：composer/发送钮仍收回，只读注记与原因保持。
    expect(view.queryByTestId('seat-composer')).toBeNull()
    expect(view.queryByTestId('seat-send')).toBeNull()
    expect(view.getByTestId('seat-write-closed').textContent).toContain('坐席已暂停或离岗，回复与操作已收回')
  })

  it('失权断言③b：offline 横幅手动重连被拒——retry 只重开事件流，写入口仍关闭且排队 claim 仍禁用（无 proving grant 不解禁）', async () => {
    // 队列视图（不开会话）：harness 的第二排队行只在主会话仍 queued 时在场
    // （pageText 以 sessionStatus 为视图事实源），故此用例不先接单。
    const backend = new SeatFakeBackend()
    backend.state.extraSessionInQueue = true
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    await waitFor(() => view.getByTestId(`seat-claim-${SESSION2}`))
    // 失权前：排队会话可 claim（对照事实）。
    expect(view.getByTestId(`seat-claim-${SESSION2}`).getAttribute('disabled')).toBeNull()

    pushRevoked(sse, '9900000000000000005')
    await waitFor(() => expect(view.getByTestId(`seat-claim-${SESSION2}`).getAttribute('disabled')).not.toBeNull())
    await waitFor(() => expect(view.getByTestId('seat-live-region').textContent).toContain('坐席已暂停或离岗，写入口已收回'))

    // 持续断网：自动重连连败 → offline 横幅；用户点 retry 手动重连。
    sse.close()
    sse.failNext = 99
    const banner = await waitFor(() => view.getByTestId('seat-offline-banner'), { timeout: 3000 })
    expect(banner).toBeDefined()
    const connectsBeforeRetry = sse.connectCount
    fireEvent.click(view.getByTestId('seat-offline-banner-retry'))
    await waitFor(() => expect(sse.connectCount).toBeGreaterThan(connectsBeforeRetry), { timeout: 3000 })

    // 重连尝试被拒（写入口语义）：链路可以重试，但写入口不复开、claim 不解禁。
    expect(view.getByTestId(`seat-claim-${SESSION2}`).getAttribute('disabled')).not.toBeNull()
    expect(view.getByTestId('seat-live-region').textContent).toContain('坐席已暂停或离岗，写入口已收回')

    // 网络恢复：允许下一次重连成功（新流），随后只推 benign 信封——
    // 无 proving grant 也不解禁（写入口恢复只认权威 contexts/capability 复核）。
    sse.failNext = 0
    await waitFor(() => expect(sse.connectCount).toBeGreaterThan(connectsBeforeRetry + 1), { timeout: 3000 })
    sse.push(envelopeFrame('9900000000000000006', 'seat.changed', 'seat', null, 'updated'))
    sse.push(envelopeFrame('9900000000000000007', 'message.appended', 'message', SESSION))
    expect(view.getByTestId(`seat-claim-${SESSION2}`).getAttribute('disabled')).not.toBeNull()
    expect(view.queryByTestId('seat-composer')).toBeNull()
  })
})

/**
 * A-04:LOCAL:02 权限撤销后分页和导出无法续读（页面级，读权限维度）。
 *
 * 与上方 C02/AT08 写入口撤权不同：本组断言读链路——消息历史分页（加载更早
 * 的消息）在续读下一页被服务端 403 拒绝后必须整体 fail-closed：
 * 1. 已渲染的历史正文立即从 DOM 收回（不是保留缓存正文）；
 * 2. 「加载更早的消息」分页入口消失（hasOlderMessages 归零）；
 * 3. 任何重试/交互都不能再触发消息读取（fetch 计数冻结）；
 * 4. 撤权后零 ACK（readAllowed 门控，正文不可见即不可已读）。
 *
 * 续读拒绝用带 before_id 的第二页 GET 模拟（第一页满页 50 条 → hasNextPage
 * 真）；服务端撤销读权限的裁决由假后端按冻结错误信封回 403。
 */
describe('SeatWorkspacePage A-04 撤权后历史分页无法续读（message read revocation mid-pagination）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    expect(establishSeatSession('eyJh.eyJi.c2ln', null)).toBe(true)
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    mock.restore()
  })

  it('第二页 403 → 已加载正文收回、分页入口消失、重试零读取、零 ACK（fail-closed 续读阻断）', async () => {
    const backend = new SeatFakeBackend()
    const sse = new FakeSseStream()

    // A04HIST 标记正文：仅本用例合成，撤权后 DOM 不得残留。
    const fullPage = Array.from(
      { length: 50 },
      (_, i) =>
        `{"id":91000000000000000${String(10 + i)},"sender_type":"contact","sender_contact_id":"${CONTACT}",` +
        `"body":"A04HIST-body-${String(i).padStart(2, '0')}","client_msg_id":"a04-hist-${i}",` +
        `"created_at":"2026-09-20T05:30:00Z","read_at":null}`,
    ).join(',')
    const messagesPath = `/api/v1/seat/enterprise/conversations/${CONV}/messages`
    const originalHandle = backend.handle
    let messageReadCalls = 0
    backend.handle = async (url: string, init?: RequestInit) => {
      const [path, query = ''] = url.split('?')
      if (path === messagesPath && (init?.method ?? 'GET') === 'GET') {
        // 续读（带 before_id 游标翻更早一页）一律 403：服务端撤销该 scope 读权限。
        if (query.includes('before_id=')) {
          messageReadCalls += 1
          return new Response('{"code":403,"msg":"message read permission revoked","payload":{}}', {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(`{"code":0,"msg":"success","payload":[${fullPage}]}`, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return originalHandle(url, init)
    }

    const view = renderWorkspace(backend, sse)
    await claimActiveSession(view)

    // 对照事实：满页 50 条 → hasNextPage 真，分页入口在场，正文已渲染。
    await waitFor(() => expect(view.getByTestId('seat-load-older')).toBeDefined(), { timeout: 5000 })
    expect(view.container.querySelectorAll('[data-message-id]').length).toBe(50)
    expect(view.container.textContent).toContain('A04HIST-body-00')
    expect(view.container.textContent).toContain('A04HIST-body-49')

    // 续读下一页 → 403 → 该 scope 读权限撤销。
    fireEvent.click(view.getByTestId('seat-load-older'))
    await waitFor(
      () => expect(view.container.querySelectorAll('[data-message-id]').length).toBe(0),
      { timeout: 5000 },
    )

    // 1) 正文收回：标记串从 DOM 全部消失。
    expect(view.container.textContent?.includes('A04HIST-body-')).toBe(false)
    // 2) 分页入口消失。
    expect(view.queryByTestId('seat-load-older')).toBeNull()
    // 3) 重试面（如在场）点击后零新增消息读取。
    const baselineReadCalls = messageReadCalls
    const retryAlert = view.container.querySelector('[role="alert"] button')
    if (retryAlert !== null) fireEvent.click(retryAlert)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(messageReadCalls).toBe(baselineReadCalls)
    // 4) 撤权后零 ACK（readAllowed=false 门控）。
    expect(backend.ackCalls).toBe(0)
  })
})

/**
 * A-04:LOCAL:01/02 跨组织/跨会话/撤权读取拒绝——平台 CS 审计页组件级断言
 * （PlatformCsSessionsPage 列表 + CsSessionDetailPage 详情）。
 *
 * 写集内两个审计页的读边界：
 * - 跨组织/无租户：列表页没有无租户条件的全局列举（C1 契约），缺 org/ws 时
 *   零审计网络调用；
 * - 撤权（customer_service:read 缺失）：零审计网络调用；
 * - 分页续读撤权：键set分页第二页（after_id）403 → 错误态整体替换列表+分页
 *   控件，无法续读；
 * - 跨会话/租户参数不全：详情页零审计网络调用；
 * - 详情 403（跨组织/跨会话可见性拒绝）：错误态、无摘要渲染、重试再拒。
 * 错误态文案不带任何令牌样材料（LOCAL:03 页面投影）。
 */
describe('A-04 CS 审计页跨组织/跨会话/撤权读取拒绝（PlatformCsSessionsPage / CsSessionDetailPage）', () => {
  type AnyFn = (..._args: unknown[]) => unknown
  const mutableAdminClient = client as unknown as { get: AnyFn }
  const originalAdminGet = mutableAdminClient.get
  const originalFetch = globalThis.fetch

  const ORG_A = '1234567890123456789'
  const WS_1 = '9876543210987654321'
  const SESSION_A = '7300000000000000001'
  const CONTACT_A = '4444444444444444444'

  const SESSION_ROW = {
    id: SESSION_A,
    organization_id: ORG_A,
    workspace_id: WS_1,
    contact_id: CONTACT_A,
    business_identity_id: null,
    status: 'active',
    rating: null,
    queued_at: 1700000000,
    claimed_at: null,
    closed_at: null,
    version: 1,
    conversation_id: '5000000000000000005',
  }

  let getCalls: Array<{ url: string; params: Record<string, unknown> }> = []

  function auditCalls(): Array<{ url: string; params: Record<string, unknown> }> {
    return getCalls.filter((call) => call.url.includes('/customer-service/'))
  }

  function stubAdminClient(options: {
    permissions: string[]
    sessionsResponses?: Array<{ data: { code: number; msg: string; payload?: unknown } }>
    detailResponses?: Array<{ data: { code: number; msg: string; payload?: unknown } }>
  }) {
    getCalls = []
    mutableAdminClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      getCalls.push({ url, params: ((config?.params ?? {}) as Record<string, unknown>) })
      if (url === '/rbac/me') {
        return { data: { code: 0, msg: 'ok', payload: { permissions: options.permissions } } }
      }
      if (url === '/organizations') {
        return {
          data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 50, total: 0, total_pages: 0 } },
        }
      }
      if (url.startsWith('/organizations/') && url.endsWith('/workspaces')) {
        return {
          data: { code: 0, msg: 'ok', payload: { items: [], page: 1, size: 50, total: 0, total_pages: 0 } },
        }
      }
      if (url === `/customer-service/organizations/${ORG_A}/sessions`) {
        const responses = options.sessionsResponses ?? []
        const response = responses.shift() ?? {
          data: { code: 0, msg: 'ok', payload: { sessions: [SESSION_ROW], next_after_id: null } },
        }
        return response
      }
      if (url === `/customer-service/organizations/${ORG_A}/sessions/${SESSION_A}`) {
        const responses = options.detailResponses ?? []
        const response = responses.shift() ?? {
          data: { code: 0, msg: 'ok', payload: SESSION_ROW },
        }
        return response
      }
      throw new Error(`unexpected GET url: ${url}`)
    }
  }

  function renderAuditRoutes(entry: string) {
    // 列表页 scope hook 从 window.location 初始化（URL codec 是上下文真源）。
    window.history.replaceState(null, '', entry)
    return render(
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/customer-service/sessions" element={<PlatformCsSessionsPage />} />
            <Route path="/customer-service/sessions/:sessionId" element={<CsSessionDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    // sidebar 配置查询走全局 fetch：rbac profile 已含 permissions 时权限判定
    // 不依赖它，但保持查询安静收敛（404 → 模板源缺失走 profile 判定）。
    globalThis.fetch = (async () =>
      new Response('{"menu":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
  })

  afterEach(() => {
    cleanup()
    mutableAdminClient.get = originalAdminGet
    globalThis.fetch = originalFetch
    mock.restore()
  })

  it('A-04:LOCAL:01 跨组织/无租户：列表页缺 org/ws → 空态提示，零审计网络调用（无全局/跨组织列举入口）', async () => {
    stubAdminClient({ permissions: ['customer_service:read'] })
    const view = renderAuditRoutes('/customer-service/sessions')

    await waitFor(() => expect(view.container.textContent).toContain('请先填写组织与工作区'))
    expect(view.container.textContent).toContain('平台面不存在无租户条件的全局列举')
    expect(auditCalls().length).toBe(0)
  })

  it('A-04:LOCAL:02 权限缺失（customer_service:read 撤销）：零审计网络调用，空态说明权限要求', async () => {
    stubAdminClient({ permissions: ['messages:read'] })
    const view = renderAuditRoutes(`/customer-service/sessions?org=${ORG_A}&ws=${WS_1}`)

    await waitFor(() => expect(view.container.textContent).toContain('无查看权限'))
    expect(view.container.textContent).toContain('customer_service:read')
    expect(auditCalls().length).toBe(0)
  })

  it('A-04:LOCAL:02 分页续读撤权：第二页（after_id）403 → 错误态替换列表与分页控件，重试无第三页', async () => {
    stubAdminClient({
      permissions: ['customer_service:read'],
      sessionsResponses: [
        { data: { code: 0, msg: 'ok', payload: { sessions: [SESSION_ROW], next_after_id: '7300000000000000099' } } },
        { data: { code: 403, msg: 'permission revoked mid-pagination A04-TOKEN-MARKER' } },
      ],
    })
    const view = renderAuditRoutes(`/customer-service/sessions?org=${ORG_A}&ws=${WS_1}`)

    // 对照事实：第一页渲染 + 分页可用。
    await waitFor(() => expect(view.container.textContent).toContain(SESSION_A))
    await waitFor(() => expect(view.getByTestId('cursor-pagination')).toBeDefined())
    expect(auditCalls().length).toBe(1)

    // 续读第二页 → 403。
    fireEvent.click(view.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(view.container.textContent).toContain('加载会话列表失败'))
    // 分页控件整体消失：无法续读。
    expect(view.queryByTestId('cursor-pagination')).toBeNull()
    // 第一页行（含 contact TSID 白名单字段）随之收回，错误态不保留旧数据。
    expect(view.container.textContent?.includes(SESSION_A)).toBe(false)
    // 错误文案不带令牌样材料（服务端 msg 不透传进 UI）。
    expect(view.container.textContent?.includes('A04-TOKEN-MARKER')).toBe(false)
    expect(auditCalls().length).toBe(2)
    expect(auditCalls()[1]?.params.after_id).toBe('7300000000000000099')
  })

  it('A-04:LOCAL:01 跨会话/租户参数不全：详情页缺 org/ws → 空态提示，零审计网络调用', async () => {
    stubAdminClient({ permissions: ['customer_service:read'] })
    const view = renderAuditRoutes(`/customer-service/sessions/${SESSION_A}`)

    await waitFor(() => expect(view.container.textContent).toContain('缺少租户参数'))
    expect(auditCalls().length).toBe(0)
  })

  it('A-04:LOCAL:01 详情可见性 403（跨组织/跨会话拒绝）：错误态、无摘要、无 PII，重试再请求仍拒', async () => {
    stubAdminClient({
      permissions: ['customer_service:read'],
      detailResponses: [
        { data: { code: 403, msg: 'session visibility denied A04-TOKEN-MARKER' } },
        { data: { code: 403, msg: 'session visibility denied A04-TOKEN-MARKER' } },
      ],
    })
    const view = renderAuditRoutes(
      `/customer-service/sessions/${SESSION_A}?org=${ORG_A}&ws=${WS_1}`,
    )

    await waitFor(() => expect(view.container.textContent).toContain('会话详情加载失败'))
    expect(view.queryByTestId('cs-session-detail-summary')).toBeNull()
    expect(view.container.textContent?.includes(CONTACT_A)).toBe(false)
    expect(view.container.textContent?.includes('A04-TOKEN-MARKER')).toBe(false)
    expect(auditCalls().length).toBe(1)

    // 重试真实再请求（无本地旁路），仍被拒，仍无摘要。
    fireEvent.click(view.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(auditCalls().length).toBe(2))
    await waitFor(() => expect(view.container.textContent).toContain('会话详情加载失败'))
    expect(view.queryByTestId('cs-session-detail-summary')).toBeNull()
    expect(view.container.textContent?.includes(CONTACT_A)).toBe(false)
  })

  it('A-04:LOCAL:01 详情正向对照：租户参数齐全且授权 → 唯一 scoped 调用（workspace_id 必带），白名单摘要渲染', async () => {
    stubAdminClient({ permissions: ['customer_service:read'] })
    const view = renderAuditRoutes(
      `/customer-service/sessions/${SESSION_A}?org=${ORG_A}&ws=${WS_1}`,
    )

    await waitFor(() => expect(view.getByTestId('cs-session-detail-summary')).toBeDefined())
    const calls = auditCalls()
    expect(calls.length).toBe(1)
    expect(calls[0]?.url).toBe(`/customer-service/organizations/${ORG_A}/sessions/${SESSION_A}`)
    expect(calls[0]?.params.workspace_id).toBe(WS_1)
    // 白名单摘要：conversation 可见；visit_token_id/close_reason 等敏感键不渲染。
    expect(view.container.textContent).toContain('5000000000000000005')
    expect(view.container.textContent?.toLowerCase().includes('token')).toBe(false)
  })
})
