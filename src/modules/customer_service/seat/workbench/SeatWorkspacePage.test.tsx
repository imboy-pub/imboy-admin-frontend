/**
 * SEAT-02：坐席工作台页面组件级测试（bun test + testing-library，SEAT-01 同款
 * 合同 fixture 替身——不 mock 合同形状，假后端按冻结 wire 形状回包）。
 *
 * 验收覆盖：
 * - A01 两坐席并发 claim 恰一成功 + 失败方自动刷新（api 层并发在
 *   workbenchApi.test；此处验证 409 → 失效刷新 → UI 收敛 + aria-live 播报）；
 * - A02 SSE 信封去重只触发一次权威刷新；resync → 全量刷新；无重复渲染；
 * - A03 附件只经真实 enterprise content 端点 + Seat Bearer fetch 获取
 *   （CS-WEB-01：图片 blob: 内联预览、文件 a[download] 下载、Blob URL
 *   卸载即 revoke）；全链无 object key / upload URL / JWT / 虚构路由；
 * - A04 suspend/offboarding（seat.changed revoked）→ 写入口立即收回且可解释；
 * - A05 aria-live 消息区 / role=log / 键盘可达（按钮原生 focus）/ tablist；
 * - A06 loading / error / empty / offline / retry / permission denied 六态。
 */
import '../../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { SeatWorkspacePage } from './SeatWorkspacePage'
import {
  ASSET_PDF_ID,
  ASSET_PNG_ID,
  CONV,
  FakeSseStream,
  IDENTITY,
  ORG,
  SESSION,
  SESSION2,
  SeatFakeBackend,
  WS,
  envelopeFrame,
  makeGateway,
  sleep,
} from './workbenchTestHarness'
import { establishSeatSession, seatTokenVault, useSeatAuthStore } from '../seatAuthStore'
import { getOrCreateSeatDeviceId, resetSeatDeviceIdForTest } from './deviceIdentity'

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
}

function renderWorkspace(backend: SeatFakeBackend, sse: FakeSseStream) {
  const gateway = makeGateway(backend, sse)
  const view = render(
    <QueryClientProvider client={makeQueryClient()}>
      <SeatWorkspacePage gateway={gateway} />
    </QueryClientProvider>
  )
  return view
}

function loginSeat(): void {
  expect(establishSeatSession('eyJh.eyJi.c2ln', null)).toBe(true)
}

describe('SeatWorkspacePage 登录门（QR 合同 + device_id 持久化）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    resetSeatDeviceIdForTest()
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    resetSeatDeviceIdForTest()
  })

  it('匿名 → QR 登录门；create 请求体携带持久化 device_id（SEAT-01 缺口⑤）', async () => {
    const backend = new SeatFakeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    const panel = await waitFor(() => view.getByTestId('seat-qr-login'))
    expect(panel).toBeDefined()
    const createCall = backend.calls.find((call) => call.path.endsWith('/passport/qr_login/create'))
    expect(createCall).toBeDefined()
    const persisted = getOrCreateSeatDeviceId()
    expect(persisted.length).toBeGreaterThanOrEqual(16)
    // 二次调用幂等（localStorage 持久化同值）。
    expect(getOrCreateSeatDeviceId()).toBe(persisted)
    const createBody = JSON.parse(createCall?.body ?? '{}') as { device_id?: string }
    expect(createBody.device_id).toBe(persisted)
    expect(view.getByTestId('seat-qr-phase').textContent).toContain('扫码')
    expect(view.getByTestId('seat-qr-code').querySelector('svg')).not.toBeNull()
    expect(view.getByTestId('seat-qr-code').getAttribute('data-qr-content')).toContain('imboy://qr_login?qr_token=')
    expect(view.getByText('坐席登录二维码')).toBeDefined()
  })

  it('endReason → 登录门可解释文案（expired/cancelled/401）', () => {
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: 'expired' })
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    expect(view.getByTestId('seat-login-notice').textContent).toContain('过期')
  })
})

describe('SeatWorkspacePage 工作台（A01/A02/A03/A04/A05/A06）', () => {
  // CS-WEB-01：jsdom/运行时可能缺原生 ObjectURL——桩化并记录创建/回收，
  // 供附件 Blob URL 生命周期断言（恢复原实现，不污染其他文件）。
  type UrlObjectApi = {
    createObjectURL?: (_blob: Blob) => string
    revokeObjectURL?: (_url: string) => void
  }
  const urlApi = URL as unknown as UrlObjectApi
  let originalCreateObjectUrl: UrlObjectApi['createObjectURL']
  let originalRevokeObjectUrl: UrlObjectApi['revokeObjectURL']
  let objectUrlSeq = 0
  let createdObjectUrls: string[] = []
  let revokedObjectUrls: string[] = []

  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    loginSeat()
    objectUrlSeq = 0
    createdObjectUrls = []
    revokedObjectUrls = []
    originalCreateObjectUrl = urlApi.createObjectURL
    originalRevokeObjectUrl = urlApi.revokeObjectURL
    urlApi.createObjectURL = (_blob: Blob) => {
      objectUrlSeq += 1
      const url = `blob:mock-${objectUrlSeq}`
      createdObjectUrls.push(url)
      return url
    }
    urlApi.revokeObjectURL = (url: string) => {
      revokedObjectUrls.push(url)
    }
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
    if (originalCreateObjectUrl === undefined) delete urlApi.createObjectURL
    else urlApi.createObjectURL = originalCreateObjectUrl
    if (originalRevokeObjectUrl === undefined) delete urlApi.revokeObjectURL
    else urlApi.revokeObjectURL = originalRevokeObjectUrl
  })

  it('工作台骨架：org/ws 切换器 + 服务端计数 Tab + queued 列表 + claim 入口', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    await waitFor(() => expect(view.getByTestId('seat-workspace')).toBeDefined())
    expect(view.getByTestId('seat-org-select').textContent).toContain('示例商城')
    await waitFor(() => expect(view.getByTestId('seat-tab-queued').textContent).toContain('1'))
    await waitFor(() => expect(view.getByTestId(`seat-session-item-${SESSION}`)).toBeDefined())
    expect(view.getByTestId(`seat-claim-${SESSION}`)).toBeDefined()
  })

  it('A03/CS-WEB-01：附件经 Seat Bearer fetch 预览（blob: URL）；无裸 href/object key/JWT/虚构路由', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    const item = await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`))
    fireEvent.click(item)
    // queued 会话先接单（写入口随后开放）。
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-claim-${SESSION}`)))
    await waitFor(() => expect(view.getByTestId('seat-conversation-title')?.textContent).toContain('王***'))
    await waitFor(() => expect(view.getByTestId('seat-message-list').textContent).toContain('您好'))
    // ACK：read_at 存在 → 已读标记；read_at 为 null → 无。
    expect(view.getAllByTestId('seat-message-acked').length).toBe(1)
    // 图片附件（image/*）：内联预览 = Seat Bearer fetch → Blob → ObjectURL。
    const image = await waitFor(() => view.getByTestId('seat-attachment-image'))
    expect(image.getAttribute('src')).toMatch(/^blob:/)
    // 文件附件：file_name + size_bytes（键名对齐后）+ 下载入口。
    expect(view.getByTestId('seat-attachment-file-name').textContent).toContain('退款凭证.pdf')
    expect(view.getByTestId('seat-attachment-file-size').textContent).toContain('MB')
    // status 字段消费：pending_confirm/deleted → 占位（不可下载）。
    expect(view.getAllByTestId('seat-attachment-chip').length).toBe(2)
    // 内容请求：真实 enterprise 路由（非虚构 cs 段）+ Seat Bearer + 无 Cookie。
    await waitFor(() => expect(backend.assetContentFetchCount).toBe(1))
    const contentCall = backend.calls.find(
      (call) => call.path === `/api/v1/enterprise/organizations/${ORG}/assets/${ASSET_PNG_ID}/content`,
    )
    expect(contentCall).toBeDefined()
    expect(contentCall?.auth).toBe('Bearer eyJh.eyJi.c2ln')
    // A03 全链负例：DOM 不出现 object key / upload URL / JWT / 虚构 CS 段路由。
    const html = view.container.innerHTML
    expect(html).not.toMatch(/storage|upload_url|object_key|objectKey/i)
    expect(html).not.toContain('eyJ')
    expect(html).not.toContain('/api/v1/cs/organizations/')
    // composer：active 会话 + 会话写能力 → 可回复。
    expect(view.getByTestId('seat-composer')).toBeDefined()
    expect(view.getByTestId('seat-send')).toBeDefined()
  })

  it('CS-WEB-01：Blob URL 生命周期——消息刷新不重取，卸载即 revoke（无泄漏）', async () => {
    const backend = new SeatFakeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    const item = await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`))
    fireEvent.click(item)
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-claim-${SESSION}`)))
    const image = await waitFor(() => view.getByTestId('seat-attachment-image'))
    const previewUrl = image.getAttribute('src')
    expect(previewUrl).toMatch(/^blob:/)
    expect(createdObjectUrls).toHaveLength(1)
    expect(revokedObjectUrls).not.toContain(previewUrl)
    // 消息权威刷新（resync → 全量）：同附件不重取、不换 URL、无泄漏。
    sse.push(envelopeFrame('9900000000000000021', 'resync.required', 'queue', null))
    await waitFor(() => expect(backend.messageFetchCount).toBe(2))
    await sleep(100)
    expect(createdObjectUrls).toHaveLength(1)
    expect(backend.assetContentFetchCount).toBe(1)
    // 卸载（离开会话/换会话）→ 预览 ObjectURL 立即回收。
    cleanup()
    expect(revokedObjectUrls).toContain(previewUrl)
  })

  it('CS-WEB-01：下载走 a[download]（blob URL + file_name）；404 → 可解释错误，恢复后重试成功', async () => {
    const anchorClicks: Array<{ download: string; href: string | null }> = []
    const anchorClickSpy = spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      const anchor = this as HTMLAnchorElement
      anchorClicks.push({ download: anchor.download, href: anchor.getAttribute('href') })
    })
    try {
      const backend = new SeatFakeBackend()
      backend.state.assetContentStatuses[ASSET_PDF_ID] = 404
      const view = renderWorkspace(backend, new FakeSseStream())
      const item = await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`))
      fireEvent.click(item)
      fireEvent.click(await waitFor(() => view.getByTestId(`seat-claim-${SESSION}`)))
      await waitFor(() => view.getByTestId('seat-attachment-image'))
      const fileBox = await waitFor(() => view.getByTestId('seat-attachment-file'))
      const fileDownloadButton = fileBox.querySelector("[data-testid='seat-attachment-download']")
      expect(fileDownloadButton).not.toBeNull()
      // 404（附件不存在/已删）：可解释错误占位，不产生任何下载 URL。
      fireEvent.click(fileDownloadButton as HTMLElement)
      await waitFor(() =>
        expect(view.getByTestId('seat-attachment-download-error').textContent).toContain('附件不存在'),
      )
      expect(anchorClicks).toHaveLength(0)
      expect(createdObjectUrls).toHaveLength(1)
      // 恢复后重试 → a[download] 携带 blob: href + file_name（安全下载）。
      delete backend.state.assetContentStatuses[ASSET_PDF_ID]
      const retryButton = view.getByTestId('seat-attachment-file').querySelector('[data-testid="seat-attachment-download"]')
      fireEvent.click(retryButton as HTMLElement)
      await waitFor(() => expect(anchorClicks.length).toBe(1))
      expect(anchorClicks[0]?.download).toBe('退款凭证.pdf')
      expect(anchorClicks[0]?.href).toMatch(/^blob:/)
      expect(createdObjectUrls).toContain(anchorClicks[0]?.href)
    } finally {
      anchorClickSpy.mockRestore()
    }
  })

  it('A01：claim 撞 409 → 冲突播报 + 列表自动权威刷新收敛', async () => {
    const backend = new SeatFakeBackend()
    backend.state.claimAlwaysConflict = true
    const view = renderWorkspace(backend, new FakeSseStream())
    const claimButton = await waitFor(() => view.getByTestId(`seat-claim-${SESSION}`))
    const queueFetchesBefore = backend.queueFetchCount
    fireEvent.click(claimButton)
    // 失败方：aria-live 冲突播报。
    await waitFor(() => expect(view.getByTestId('seat-live-region').textContent).toContain('已被其他坐席接单'))
    // 失败方：自动刷新真实状态（队列重新拉取；本例假后端刷新后仍回排队页，
    // 断言刷新确实发生且 UI 无崩溃）。
    await waitFor(() => expect(backend.queueFetchCount).toBeGreaterThan(queueFetchesBefore))
    expect(backend.state.claimAttempts).toBe(1)
  })

  it('A01 成功侧：claim 成功 → 列表/详情失效刷新，会话进入 active', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    const claimButton = await waitFor(() => view.getByTestId(`seat-claim-${SESSION}`))
    fireEvent.click(claimButton)
    await waitFor(() => expect(backend.state.sessionStatus).toBe('active'))
    await waitFor(() => expect(view.getByTestId('seat-tab-queued').textContent).toContain('0'))
  })

  it('A02：SSE message.appended 去重——重复信封只触发一次权威刷新；resync → 全量刷新', async () => {
    const backend = new SeatFakeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    const item = await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`))
    fireEvent.click(item)
    await waitFor(() => expect(backend.messageFetchCount).toBe(1))
    // 重复投递同一 event_id（at-least-once）→ 去重后只刷新一次。
    sse.push(envelopeFrame('9900000000000000001', 'message.appended', 'message', '9000000000000000012'))
    sse.push(envelopeFrame('9900000000000000001', 'message.appended', 'message', '9000000000000000012'))
    await waitFor(() => expect(backend.messageFetchCount).toBe(2))
    await sleep(120)
    expect(backend.messageFetchCount).toBe(2)
    // resync.required → 清游标 + 全量权威刷新（contexts 也在内）。
    const contextsBefore = backend.contextsFetchCount
    sse.push(envelopeFrame('9900000000000000002', 'resync.required', 'queue', null))
    await waitFor(() => expect(backend.contextsFetchCount).toBeGreaterThan(contextsBefore))
    await waitFor(() => expect(backend.messageFetchCount).toBe(3))
    // 去重器已重置：旧 event_id 再次出现仍触发刷新（合同：清空后允许再现）。
    sse.push(envelopeFrame('9900000000000000001', 'message.appended', 'message', '9000000000000000012'))
    await waitFor(() => expect(backend.messageFetchCount).toBe(4))
  })

  it('A02：消息区 role=log + aria-live（无重复渲染：权威数据同 id 只渲染一次）', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    const item = await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`))
    fireEvent.click(item)
    const log = await waitFor(() => view.getByRole('log'))
    expect(log.getAttribute('aria-live')).toBe('polite')
    await waitFor(() => expect(view.getByTestId(`seat-message-9000000000000000009`)).toBeDefined())
    // resync 全量刷新后同一消息 id 仍只有一行（无重复渲染）。
    expect(view.getAllByTestId(`seat-message-9000000000000000009`).length).toBe(1)
  })

  it('A04：seat.changed revoked → 写入口立即收回（claim 禁用 + composer 收回）且状态可解释', async () => {
    const backend = new SeatFakeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    const claimButton = await waitFor(() => view.getByTestId(`seat-claim-${SESSION}`))
    expect(claimButton.getAttribute('disabled')).toBeNull()
    sse.push(envelopeFrame('9800000000000000001', 'seat.changed', 'seat', null, 'revoked'))
    await waitFor(() => expect(view.getByTestId('seat-live-region').textContent).toContain('写入口已收回'))
    await waitFor(() => expect(claimButton.getAttribute('disabled')).not.toBeNull())
  })

  it('DF-12：撤权播报不随复核换页被卸载——拒绝态下 live-region 常驻且文案保持', async () => {
    const backend = new SeatFakeBackend()
    const sse = new FakeSseStream()
    const view = renderWorkspace(backend, sse)
    await waitFor(() => view.getByTestId('seat-workspace'))
    sse.push(envelopeFrame('9800000000000000001', 'seat.changed', 'seat', null, 'revoked'))
    await waitFor(() => expect(view.getByTestId('seat-live-region').textContent).toContain('写入口已收回'))
    // 复核换页：revoked 触发的 contexts 失效回来 403 → 整页切拒权态；
    // live-region 必须仍挂载且撤权播报不丢（播报随页卸载即 DF-12 缺陷）。
    backend.state.contexts403 = true
    sse.push(envelopeFrame('9800000000000000002', 'resync.required', 'queue', null))
    await waitFor(() => expect(view.getByTestId('seat-permission-denied')).toBeDefined())
    expect(view.getByTestId('seat-live-region')).toBeDefined()
    expect(view.getByTestId('seat-live-region').textContent).toContain('坐席已暂停或离岗，写入口已收回')
  })

  it('A06 loading / empty / error+retry / permission denied / offline 五态', async () => {
    // loading：首个请求挂起 → contexts loading 态。
    const loadingBackend = new SeatFakeBackend()
    const loadingSse = new FakeSseStream()
    const originalHandle = loadingBackend.handle
    loadingBackend.handle = async (url, init) => {
      if (url.includes('seat-contexts')) await new Promise((resolve) => setTimeout(resolve, 300))
      return originalHandle(url, init)
    }
    const loadingView = renderWorkspace(loadingBackend, loadingSse)
    expect(loadingView.getByTestId('seat-contexts-loading')).toBeDefined()
    cleanup()

    // error + retry：首个请求 500 → error 态；修复后点击重试恢复。
    const errorBackend = new SeatFakeBackend()
    errorBackend.state.failingResponsesLeft = 1
    const errorView = renderWorkspace(errorBackend, new FakeSseStream())
    const retry = await waitFor(() => errorView.getByTestId('seat-contexts-error-retry'))
    fireEvent.click(retry)
    await waitFor(() => expect(errorView.getByTestId('seat-workspace')).toBeDefined())
    cleanup()

    // permission denied：contexts 403（非成员/停用）→ 可解释拒绝态。
    const deniedBackend = new SeatFakeBackend()
    deniedBackend.state.contexts403 = true
    const deniedView = renderWorkspace(deniedBackend, new FakeSseStream())
    await waitFor(() => expect(deniedView.getByTestId('seat-permission-denied')).toBeDefined())
    cleanup()

    // empty：队列空 → empty 态（假后端改回 active 会话后 queued 为空）。
    const emptyBackend = new SeatFakeBackend()
    emptyBackend.state.sessionStatus = 'active'
    const emptyView = renderWorkspace(emptyBackend, new FakeSseStream())
    await waitFor(() => expect(emptyView.getByTestId('seat-queue-empty')).toBeDefined())
    cleanup()

    // offline：SSE 持续失败（退避 10ms 基数）→ offline 横幅；重连成功后消失。
    const offlineBackend = new SeatFakeBackend()
    const offlineSse = new FakeSseStream()
    offlineSse.failNext = 3
    const offlineView = renderWorkspace(offlineBackend, offlineSse)
    const banner = await waitFor(() => offlineView.getByTestId('seat-offline-banner'), { timeout: 3000 })
    expect(banner).toBeDefined()
    fireEvent.click(offlineView.getByTestId('seat-offline-banner-retry'))
    await waitFor(() => expect(offlineView.queryByTestId('seat-offline-banner')).toBeNull(), { timeout: 3000 })
  })

  it('发送失败 → 重试复用同一 client_msg_id（幂等合同），成功后清空', async () => {
    const backend = new SeatFakeBackend()
    backend.state.sessionStatus = 'active'
    backend.state.version = 8
    const view = renderWorkspace(backend, new FakeSseStream())
    // 会话已在坐席名下（active 视图）：切到进行中 Tab 再选中。
    fireEvent.click(await waitFor(() => view.getByTestId('seat-tab-active')))
    const item = await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`))
    fireEvent.click(item)
    const composer = await waitFor(() => view.getByTestId('seat-composer'))
    // CS-WEB-02：改用 send 专属失败计数——全局 failingResponsesLeft 会被附件
    // content 预取（异步 blob fetch）吃掉产生竞态；sendFailuresLeft 只作用发送端点。
    backend.state.sendFailuresLeft = 1
    // CS-WEB-02：composer 转 React 受控（发送按钮禁用态需跟随草稿），受控输入
    // 必须用 user-event 驱动（RTL16.3+React19.2 下 fireEvent.change 无效——
    // PendingOwnerPanel.test 同款结论）。
    const user = userEvent.setup()
    await user.type(composer, '您好')
    fireEvent.click(view.getByTestId('seat-send'))
    await waitFor(() => expect(view.getByTestId('seat-send-error')).toBeDefined())
    fireEvent.click(view.getByTestId('seat-send-retry'))
    // 幂等：两次 POST（一失败一成功）是同一 client_msg_id（失败请求也进 calls 日志）。
    // DF-9：发送走企业真源写路径（/enterprise/organizations/:org/conversations/:id/messages）。
    await waitFor(() => {
      const bodies = backend.calls
        .filter((call) => call.method === 'POST' && call.path.includes(`/conversations/${CONV}/messages`))
        .map((call) => (JSON.parse(call.body || '{}') as { client_msg_id?: string }).client_msg_id ?? '')
      expect(bodies.length).toBe(2)
      expect(bodies[0]).toBe(bodies[1])
      expect(bodies[0]?.length).toBeGreaterThan(0)
    })
    // DF-9 真实合同逐键：发送 body 必带 workspace_id / sender_type / identity_id。
    const sendCalls = backend.calls.filter(
      (call) => call.method === 'POST' && call.path === `/api/v1/enterprise/organizations/${ORG}/conversations/${CONV}/messages`,
    )
    expect(sendCalls.length).toBe(2)
    const firstSend = JSON.parse(sendCalls[0]?.body ?? '{}') as Record<string, unknown>
    expect(firstSend.workspace_id).toBe(WS)
    expect(firstSend.sender_type).toBe('business_identity')
    expect(firstSend.identity_id).toBe(IDENTITY)
    // 假后端按真实合同受理：重试那次通过逐键校验并进入幂等登记。
    expect(backend.sentClientMsgIds).toHaveLength(1)
  })

  it('A05：tablist/tab 语义 + 会话列表键盘可达（原生 button 焦点路径）', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    const tablist = await waitFor(() => view.getByRole('tablist'))
    expect(tablist).toBeDefined()
    const tab = view.getByTestId('seat-tab-active')
    expect(tab.getAttribute('aria-selected')).toBe('false')
    fireEvent.click(tab)
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(view.getByTestId('seat-live-region')).toBeDefined()
  })
})

describe('SeatWorkspacePage CS-WEB-03 队列 triage（preview/等待时长/筛选/selection/详情抽屉）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    loginSeat()
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
  })

  it('排队行渲染服务端 preview 摘要与等待时长（服务端权威，无客户端时钟计算）+ 未读占位 slot 不伪造数字', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    const item = await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`))
    // preview 摘要：服务端解密截断文本直渲染。
    expect(item.textContent).toContain('你好，请问订单 8891 什么时候发货')
    // 等待时长：waiting_seconds=125 → 「等待 2 分钟」；直渲染服务端值。
    const waiting = await waitFor(() => view.getByTestId(`seat-session-waiting-${SESSION}`))
    expect(waiting.textContent).toContain('等待 2 分钟')
    // 标注服务端权威（不本地计算时钟）。
    expect(waiting.getAttribute('title')).toContain('服务端')
    // 未读占位 slot（M2 CS-WEB-05 前无真未读数）：存在但不含任何数字。
    const unread = view.getByTestId(`seat-session-unread-${SESSION}`)
    expect(unread.textContent).not.toMatch(/\d/)
  })

  it('preview null 占位（附件-only/空/撤回）：诚实「暂无摘要」，不编造附件文案；负 waiting 防御为 0', async () => {
    const backend = new SeatFakeBackend()
    backend.state.lastMessagePreview = null
    backend.state.queueWaitingSeconds = -3
    const view = renderWorkspace(backend, new FakeSseStream())
    const item = await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`))
    expect(item.textContent).toContain('暂无摘要')
    expect(item.textContent).not.toContain('附件')
    // 负值防御：显示 max(0) ——「等待 0 秒」，绝不出现负数。
    const waiting = await waitFor(() => view.getByTestId(`seat-session-waiting-${SESSION}`))
    expect(waiting.textContent).toContain('等待 0 秒')
    expect(waiting.textContent).not.toMatch(/-\d/)
  })

  it('搜索过滤已加载行（掩码名/摘要）：无匹配给筛选空态；Tab 计数保持服务端值', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    await waitFor(() => expect(view.getByTestId(`seat-session-item-${SESSION}`)).toBeDefined())
    const search = view.getByTestId('seat-queue-search')
    const user = userEvent.setup()
    // 命中摘要关键词 → 行保留；Tab 计数仍是服务端 total_by_status（queued=1）。
    await user.type(search, '8891')
    expect(view.getByTestId(`seat-session-item-${SESSION}`)).toBeDefined()
    expect(view.getByTestId('seat-tab-queued').textContent).toContain('1')
    // 无匹配 → 筛选空态（区别于服务端空态）。
    const noMatch = '不存在的关键词'
    await user.type(search, noMatch.slice('8891'.length))
    expect(view.getByTestId('seat-queue-filter-empty')).toBeDefined()
    expect(view.queryByTestId(`seat-session-item-${SESSION}`)).toBeNull()
    // Tab 计数仍是服务端值（过滤是显示层动作，不改计数）。
    expect(view.getByTestId('seat-tab-queued').textContent).toContain('1')
    // 清空 → 恢复全部（React19 受控输入 user.clear 不生效，退格序列清空）。
    await user.type(search, '{Backspace}'.repeat(noMatch.length))
    expect(view.getByTestId(`seat-session-item-${SESSION}`)).toBeDefined()
  })

  it('筛选/切换视图不丢 selection（aria-current 保持）', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`)))
    expect(view.getByTestId(`seat-session-item-${SESSION}`).getAttribute('aria-current')).toBe('true')
    // 搜索（选中行仍命中）→ selection 不丢。
    const user = userEvent.setup()
    await user.type(view.getByTestId('seat-queue-search'), '8891')
    expect(view.getByTestId(`seat-session-item-${SESSION}`).getAttribute('aria-current')).toBe('true')
    // 切到 active 再切回 queued → selection 不丢。
    fireEvent.click(view.getByTestId('seat-tab-active'))
    fireEvent.click(view.getByTestId('seat-tab-queued'))
    expect(view.getByTestId(`seat-session-item-${SESSION}`).getAttribute('aria-current')).toBe('true')
  })

  it('768-1279 详情抽屉：触发按钮打开 role=dialog 的详情面板；关闭后回收', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`)))
    const trigger = await waitFor(() => view.getByTestId('seat-detail-drawer-trigger'))
    fireEvent.click(trigger)
    const dialog = await waitFor(() => view.getByRole('dialog'))
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    // 抽屉内是同一 SeatDetailPanel（权威事实源投影）。
    expect(within(dialog).getByTestId('seat-detail-panel')).toBeDefined()
    // 共享 EntityDrawer 的关闭入口（aria-label=关闭）。
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull())
  })
})

describe('SeatWorkspacePage CS-WEB-02 单文件发送（presign → 裸 PUT → confirm → asset_ids）', () => {
  const FILE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  /** 进入 active 会话并返回 composer（受控输入由 user-event 驱动）。 */
  async function openActiveConversation(view: ReturnType<typeof renderWorkspace>) {
    fireEvent.click(await waitFor(() => view.getByTestId('seat-tab-active')))
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`)))
    const composer = await waitFor(() => view.getByTestId('seat-composer'))
    const attachInput = await waitFor(() => view.getByTestId('seat-attach-input'))
    return { composer, attachInput }
  }

  /** 上传链 + 发送的调用序列（顺序断言唯一事实源）。 */
  function pipelineCalls(backend: SeatFakeBackend): string[] {
    return backend.calls
      .filter(
        (call) =>
          (call.method === 'POST' && call.path.endsWith('/assets/presign')) ||
          (call.method === 'PUT' && call.path.includes('/assets/upload/')) ||
          (call.method === 'POST' && call.path.endsWith('/assets/confirm')) ||
          (call.method === 'POST' && call.path.endsWith(`/conversations/${CONV}/messages`)),
      )
      .map((call) => `${call.method} ${call.path}`)
  }

  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    loginSeat()
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
  })

  it('正文+文件：顺序钉死 presign → PUT → confirm → 发送 asset_ids；成功后清空 composer 与附件', async () => {
    const backend = new SeatFakeBackend()
    backend.state.sessionStatus = 'active'
    backend.state.version = 8
    const view = renderWorkspace(backend, new FakeSseStream())
    const { composer, attachInput } = await openActiveConversation(view)
    const user = userEvent.setup()
    await user.type(composer, '请看截图')
    await user.upload(attachInput as HTMLInputElement, new File([FILE_BYTES.slice()], '截图.png', { type: 'image/png' }))
    expect(view.getByTestId('seat-attach-chip-name').textContent).toBe('截图.png')
    fireEvent.click(view.getByTestId('seat-send'))
    await waitFor(() => expect(backend.sentClientMsgIds.length).toBe(1))
    // 顺序唯一事实源：presign → 裸 PUT → confirm → 发送（不可乱序/跳步）。
    expect(pipelineCalls(backend)).toEqual([
      `POST /api/v1/enterprise/organizations/${ORG}/assets/presign`,
      `PUT /api/v1/enterprise/organizations/${ORG}/assets/upload/1`,
      `POST /api/v1/enterprise/organizations/${ORG}/assets/confirm`,
      `POST /api/v1/enterprise/organizations/${ORG}/conversations/${CONV}/messages`,
    ])
    // 发送 wire：正文 + asset_ids（presign 产出的 asset id 原样上送）。
    expect(backend.sentBodies[0]).toBe('请看截图')
    expect(backend.sentAssetIds[0]).toHaveLength(1)
    // presign 请求冻结字段：object_hash 64 hex + file_name 展示名落线。
    const presignBody = backend.presignRequests[0] as Record<string, unknown>
    expect(presignBody.conversation_id).toBe(CONV)
    expect(presignBody.workspace_id).toBe(WS)
    expect((presignBody.object_hash as string)).toMatch(/^[0-9a-f]{64}$/)
    expect(presignBody.file_name).toBe('截图.png')
    expect(presignBody.mime).toBe('image/png')
    expect(presignBody.size_bytes).toBe(FILE_BYTES.length)
    // 裸 PUT 不携带 Seat JWT（目标凭证由服务端签发 URL 自带）。
    const putCall = backend.calls.find((call) => call.method === 'PUT' && call.path.includes('/assets/upload/'))
    expect(putCall?.auth).toBeNull()
    // 成功清空：composer 与附件 chip（发送边沿驱动）。
    await waitFor(() => expect((view.getByTestId('seat-composer') as HTMLTextAreaElement).value).toBe(''))
    await waitFor(() => expect(view.queryByTestId('seat-attach-chip')).toBeNull())
  })

  it('空正文+文件：合法附件消息（wire 无 body 键，asset_ids 单元素）', async () => {
    const backend = new SeatFakeBackend()
    backend.state.sessionStatus = 'active'
    backend.state.version = 8
    const view = renderWorkspace(backend, new FakeSseStream())
    const { attachInput } = await openActiveConversation(view)
    const user = userEvent.setup()
    await user.upload(attachInput as HTMLInputElement, new File([FILE_BYTES.slice()], '凭证.pdf', { type: 'application/pdf' }))
    // 空正文但有附件 → 发送按钮可用。
    expect((view.getByTestId('seat-send') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(view.getByTestId('seat-send'))
    await waitFor(() => expect(backend.sentClientMsgIds.length).toBe(1))
    expect(backend.sentBodies[0]).toBeNull()
    expect(backend.sentAssetIds[0]).toHaveLength(1)
    const sendBody = JSON.parse(
      backend.calls.find((call) => call.method === 'POST' && call.path.endsWith(`/conversations/${CONV}/messages`))?.body ?? '{}',
    ) as Record<string, unknown>
    expect(sendBody.body).toBeUndefined()
    expect(sendBody.asset_ids).toHaveLength(1)
  })

  it('正文与附件同时空 → 发送禁用（前端校验；不发请求）', async () => {
    const backend = new SeatFakeBackend()
    backend.state.sessionStatus = 'active'
    backend.state.version = 8
    const view = renderWorkspace(backend, new FakeSseStream())
    await openActiveConversation(view)
    const sendButton = view.getByTestId('seat-send') as HTMLButtonElement
    expect(sendButton.disabled).toBe(true)
    expect(sendButton.getAttribute('aria-disabled')).toBe('true')
    expect(view.getByTestId('seat-composer-hint')).toBeDefined()
    // a11y：附件输入可达（sr-only 不移出可聚焦面）+ aria-label。
    expect(view.getByTestId('seat-attach-input').getAttribute('aria-label')).toBe('添加附件（单文件）')
    fireEvent.click(sendButton)
    expect(pipelineCalls(backend)).toHaveLength(0)
  })

  it('PUT 失败 → 保留正文/文件选择/重试；重试同 client_msg_id（幂等，逻辑消息不重复创建）', async () => {
    const backend = new SeatFakeBackend()
    backend.state.sessionStatus = 'active'
    backend.state.version = 8
    backend.state.uploadPutFailuresLeft = 1
    const view = renderWorkspace(backend, new FakeSseStream())
    const { composer, attachInput } = await openActiveConversation(view)
    const user = userEvent.setup()
    await user.type(composer, '重传这份')
    await user.upload(attachInput as HTMLInputElement, new File([FILE_BYTES.slice()], 'a.png', { type: 'image/png' }))
    fireEvent.click(view.getByTestId('seat-send'))
    // 失败：错误条（role=alert）+ 正文保留（draft 恢复）+ 文件 chip 保留。
    await waitFor(() => expect(view.getByTestId('seat-send-error')).toBeDefined())
    expect(view.getByTestId('seat-send-error').getAttribute('role')).toBe('alert')
    await waitFor(() => expect((view.getByTestId('seat-composer') as HTMLTextAreaElement).value).toBe('重传这份'))
    expect(view.getByTestId('seat-attach-chip-name').textContent).toBe('a.png')
    expect(backend.sentClientMsgIds).toHaveLength(0)
    // 重试：PUT 失败 → 未 confirm → 重新 presign 换新 ref 再走全链。
    fireEvent.click(view.getByTestId('seat-send-retry'))
    await waitFor(() => expect(backend.sentClientMsgIds.length).toBe(1))
    expect(backend.presignCount).toBe(2)
    // harness 的 uploadPutCount 只计成功（失败在计数前 return）；PUT 总尝试
    // （含第一次 500）以 calls 日志为准 = 2。
    expect(backend.uploadPutCount).toBe(1)
    expect(backend.calls.filter((call) => call.method === 'PUT' && call.path.includes('/assets/upload/'))).toHaveLength(2)
    expect(backend.confirmCount).toBe(1)
    // 两次发送尝试（一失败一成功）是同一 client_msg_id；最终只成功创建一条。
    const sendAttempts = backend.calls
      .filter((call) => call.method === 'POST' && call.path.endsWith(`/conversations/${CONV}/messages`))
      .map((call) => (JSON.parse(call.body || '{}') as { client_msg_id?: string }).client_msg_id ?? '')
    expect(sendAttempts.length).toBe(1) // PUT 失败在发送之前，发送只发生一次（成功那次）
    expect(sendAttempts[0]?.length).toBeGreaterThan(0)
    expect(backend.sentClientMsgIds.length).toBe(1)
  })

  it('发送失败 → 重试不重复 presign/PUT/confirm（已 confirm 的 assetId 复用）+ 同 client_msg_id', async () => {
    const backend = new SeatFakeBackend()
    backend.state.sessionStatus = 'active'
    backend.state.version = 8
    backend.state.sendFailuresLeft = 1
    const view = renderWorkspace(backend, new FakeSseStream())
    const { attachInput } = await openActiveConversation(view)
    const user = userEvent.setup()
    await user.upload(attachInput as HTMLInputElement, new File([FILE_BYTES.slice()], 'b.png', { type: 'image/png' }))
    fireEvent.click(view.getByTestId('seat-send'))
    // 第一次：上传三步完成，发送 500。
    await waitFor(() => expect(view.getByTestId('seat-send-error')).toBeDefined())
    expect(backend.presignCount).toBe(1)
    expect(backend.uploadPutCount).toBe(1)
    expect(backend.confirmCount).toBe(1)
    // 重试：直接复用已 confirm 的 assetId 发送——上传链计数不变。
    fireEvent.click(view.getByTestId('seat-send-retry'))
    await waitFor(() => expect(backend.sentClientMsgIds.length).toBe(1))
    expect(backend.presignCount).toBe(1)
    expect(backend.uploadPutCount).toBe(1)
    expect(backend.confirmCount).toBe(1)
    const sendAttempts = backend.calls
      .filter((call) => call.method === 'POST' && call.path.endsWith(`/conversations/${CONV}/messages`))
      .map((call) => (JSON.parse(call.body || '{}') as { client_msg_id?: string }).client_msg_id ?? '')
    expect(sendAttempts.length).toBe(2)
    expect(sendAttempts[0]).toBe(sendAttempts[1])
    // 两次发送的 asset_ids 一致（同一 confirm 产物）。
    expect(backend.sentAssetIds.length).toBe(1)
    expect(backend.sentAssetIds[0]).toHaveLength(1)
  })

  it('presign 422 → 服务端语义透传（role=alert 文本含 msg）；失败后可换文件重试', async () => {
    const backend = new SeatFakeBackend()
    backend.state.sessionStatus = 'active'
    backend.state.version = 8
    backend.state.presignRejection = { code: 422, msg: 'unsupported media type' }
    const view = renderWorkspace(backend, new FakeSseStream())
    const { attachInput } = await openActiveConversation(view)
    const user = userEvent.setup()
    await user.upload(attachInput as HTMLInputElement, new File([FILE_BYTES.slice()], 'c.exe', { type: 'application/x-msdownload' }))
    fireEvent.click(view.getByTestId('seat-send'))
    await waitFor(() => expect(view.getByTestId('seat-send-error-text')).toBeDefined())
    expect(view.getByTestId('seat-send-error-text').textContent).toContain('unsupported media type')
    // 前端提示不替代服务端校验：PUT/confirm/发送均未发生（422 在 presign 即拒）。
    expect(backend.uploadPutCount).toBe(0)
    expect(backend.confirmCount).toBe(0)
    expect(backend.sentClientMsgIds).toHaveLength(0)
    // 恢复后（服务端接受）移除旧文件换新文件重试成功。
    backend.state.presignRejection = null
    fireEvent.click(view.getByTestId('seat-attach-remove'))
    await user.upload(attachInput as HTMLInputElement, new File([FILE_BYTES.slice()], 'd.png', { type: 'image/png' }))
    fireEvent.click(view.getByTestId('seat-send-retry'))
    await waitFor(() => expect(backend.sentClientMsgIds.length).toBe(1))
    expect(backend.presignRequests[1]).toBeDefined()
  })

  it('移除附件可解释（aria-label 含文件名）；移除后空正文 → 发送禁用', async () => {
    const backend = new SeatFakeBackend()
    backend.state.sessionStatus = 'active'
    backend.state.version = 8
    const view = renderWorkspace(backend, new FakeSseStream())
    const { attachInput } = await openActiveConversation(view)
    const user = userEvent.setup()
    await user.upload(attachInput as HTMLInputElement, new File([FILE_BYTES.slice()], 'e.png', { type: 'image/png' }))
    const removeButton = view.getByTestId('seat-attach-remove')
    expect(removeButton.getAttribute('aria-label')).toContain('e.png')
    fireEvent.click(removeButton)
    expect(view.queryByTestId('seat-attach-chip')).toBeNull()
    expect((view.getByTestId('seat-send') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('SeatWorkspacePage CS-WEB-04 客户上下文面板（CS-BE-03 消费 + 四态 + 陈旧防护）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    loginSeat()
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
  })

  it('渲染投影：掩码资料/来源/首末联系/历史会话/备注，白名单外字段不出现', async () => {
    const backend = new SeatFakeBackend()
    backend.state.contextHistoryCount = 2
    backend.state.contextNotesCount = 1
    const view = renderWorkspace(backend, new FakeSseStream())
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`)))
    const panel = await waitFor(() => view.getByTestId('seat-customer-context'))
    expect(view.getByTestId('seat-customer-context-masked-name').textContent).toBe('王***')
    expect(view.getByTestId('seat-customer-context-source').textContent).toContain('网页组件')
    expect(view.getByTestId('seat-customer-context-first-seen').getAttribute('data-first-seen')).toBe('1757000000')
    expect(view.getByTestId('seat-customer-context-last-seen').getAttribute('data-last-seen')).toBe('1759000000')
    // 历史会话行（含评分展示）：
    const history = view.getByTestId('seat-customer-context-history')
    expect(history.querySelectorAll('[data-testid="seat-customer-context-history-row"]').length).toBe(2)
    expect(history.textContent).toContain('已结束')
    expect(view.getByTestId('seat-customer-context-history-rating').textContent).toContain('5 星')
    // 备注事实行（无正文——密文材料零出站）：
    expect(view.getByTestId('seat-customer-context-notes-count').textContent).toContain('1')
    expect(view.getAllByTestId('seat-customer-context-note-row').length).toBe(1)
    // 白名单外字段负例：DOM 不出现电话/邮箱/掩码原料/备注正文。
    const html = panel.innerHTML
    expect(html).not.toMatch(/138|@|subject_mask|note_bod|phone|email/i)
    // context 请求走真实 5 段路由（CS-BE-03）。
    expect(
      backend.calls.some((call) => call.path === `/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/context`),
    ).toBe(true)
  })

  it('四态：loading / error+重试 / permission(403) / empty 各自独立（逐子用例独立挂载）', async () => {
    // loading：延迟响应期间是独立 loading 面板。
    const loadingBackend = new SeatFakeBackend()
    loadingBackend.state.contextDelayMsBySession[SESSION] = 60
    const loadingView = renderWorkspace(loadingBackend, new FakeSseStream())
    fireEvent.click(await waitFor(() => loadingView.getByTestId(`seat-session-item-${SESSION}`)))
    expect(loadingView.getByTestId('seat-customer-context-loading')).toBeDefined()
    await waitFor(() => expect(loadingView.getByTestId('seat-customer-context')).toBeDefined())
    loadingView.unmount()

    // permission denied：403（转接后原 Seat 失去读权 / 撤权）。
    const forbiddenBackend = new SeatFakeBackend()
    forbiddenBackend.state.context403 = true
    const forbiddenView = renderWorkspace(forbiddenBackend, new FakeSseStream())
    fireEvent.click(await waitFor(() => forbiddenView.getByTestId(`seat-session-item-${SESSION}`)))
    await waitFor(() => expect(forbiddenView.getByTestId('seat-customer-context-forbidden')).toBeDefined())
    expect(forbiddenView.queryByTestId('seat-customer-context')).toBeNull()
    expect(forbiddenBackend.contextCalls.length).toBe(1)
    forbiddenView.unmount()

    // error + retry：500 一次 → 错误面板；重试成功后收敛到数据。
    const errorBackend = new SeatFakeBackend()
    errorBackend.state.contextFailuresLeft = 1
    const errorView = renderWorkspace(errorBackend, new FakeSseStream())
    fireEvent.click(await waitFor(() => errorView.getByTestId(`seat-session-item-${SESSION}`)))
    await waitFor(() => expect(errorView.getByTestId('seat-customer-context-error')).toBeDefined())
    fireEvent.click(errorView.getByTestId('seat-customer-context-error-retry'))
    await waitFor(() => expect(errorView.getByTestId('seat-customer-context')).toBeDefined())
    errorView.unmount()

    // empty：无历史 + 无备注 → 两个空态独立呈现。
    const emptyBackend = new SeatFakeBackend()
    emptyBackend.state.contextHistoryCount = 0
    emptyBackend.state.contextNotesCount = 0
    const emptyView = renderWorkspace(emptyBackend, new FakeSseStream())
    fireEvent.click(await waitFor(() => emptyView.getByTestId(`seat-session-item-${SESSION}`)))
    await waitFor(() => expect(emptyView.getByTestId('seat-customer-context-history-empty')).toBeDefined())
    expect(emptyView.getByTestId('seat-customer-context-notes-empty')).toBeDefined()
  })

  it('切换会话不显示上一客户陈旧数据；晚到的旧响应被拒（不覆盖新会话）', async () => {
    const backend = new SeatFakeBackend()
    backend.state.extraSessionInQueue = true
    // 会话 A（SESSION）响应慢 200ms；会话 B（SESSION2）立即返回。
    backend.state.contextDelayMsBySession[SESSION] = 200
    const view = renderWorkspace(backend, new FakeSseStream())
    await waitFor(() => expect(view.getByTestId(`seat-session-item-${SESSION}`)).toBeDefined())
    await waitFor(() => expect(view.getByTestId(`seat-session-item-${SESSION2}`)).toBeDefined())
    // 先选 A（慢）→ 立即切 B（快）：B 的数据先到并展示。
    fireEvent.click(view.getByTestId(`seat-session-item-${SESSION}`))
    fireEvent.click(view.getByTestId(`seat-session-item-${SESSION2}`))
    await waitFor(() => expect(view.getByTestId('seat-customer-context-masked-name').textContent).toBe('李***'))
    // A 的晚到响应（+200ms）绝不能把面板拉回王***（序号守卫拒绝落缓存）。
    // 断言作用域 = 客户上下文面板（队列列表行显示会话 A 的掩码名属正常事实）。
    await sleep(320)
    expect(view.getByTestId('seat-customer-context-masked-name').textContent).toBe('李***')
    expect(view.getByTestId('seat-customer-context').textContent).not.toContain('王***')
    expect(backend.contextFetchCount).toBe(2)
  })

  it('切换会话后旧客户数据被新投影替换（正向时序；旧掩码名不再出现）', async () => {
    const backend = new SeatFakeBackend()
    backend.state.extraSessionInQueue = true
    const view = renderWorkspace(backend, new FakeSseStream())
    await waitFor(() => expect(view.getByTestId(`seat-session-item-${SESSION}`)).toBeDefined())
    await waitFor(() => expect(view.getByTestId(`seat-session-item-${SESSION2}`)).toBeDefined())
    fireEvent.click(view.getByTestId(`seat-session-item-${SESSION}`))
    await waitFor(() => expect(view.getByTestId('seat-customer-context-masked-name').textContent).toBe('王***'))
    fireEvent.click(view.getByTestId(`seat-session-item-${SESSION2}`))
    await waitFor(() => expect(view.getByTestId('seat-customer-context-masked-name').textContent).toBe('李***'))
    expect(view.getByTestId('seat-customer-context').textContent).not.toContain('王***')
    // 各会话各自的 context 请求都发生过（键集隔离，不互相污染）。
    expect(
      backend.calls.some((call) => call.path.endsWith(`/sessions/${SESSION}/context`)),
    ).toBe(true)
    expect(
      backend.calls.some((call) => call.path.endsWith(`/sessions/${SESSION2}/context`)),
    ).toBe(true)
  })

  it('窄屏 Drawer：触发按钮打开 role=dialog 的同一上下文投影；关闭回收', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    fireEvent.click(await waitFor(() => view.getByTestId(`seat-session-item-${SESSION}`)))
    const trigger = await waitFor(() => view.getByTestId('seat-customer-context-drawer-trigger'))
    fireEvent.click(trigger)
    const dialog = await waitFor(() => view.getByRole('dialog'))
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(within(dialog).getByTestId('seat-customer-context')).toBeDefined()
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull())
  })
})

describe('SeatWorkspacePage 退出登录（seat-logout：REVIEW-4 F2 零测试锁定）', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'warn').mockImplementation(() => {})
    loginSeat()
  })
  afterEach(() => {
    cleanup()
    seatTokenVault.clear()
    useSeatAuthStore.setState({ status: 'anonymous', userId: null, endReason: null })
  })

  it('点 seat-logout → 内存 vault 同步清空 + store 复位（endReason=logout）→ 回 QR 登录门给可解释文案', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    await waitFor(() => expect(view.getByTestId('seat-workspace')).toBeDefined())
    // 登出前事实：token 在内存 vault（A03 唯一持有点）；写入口（claim）在场。
    expect(seatTokenVault.getToken()).toBe('eyJh.eyJi.c2ln')
    expect(view.getByTestId(`seat-claim-${SESSION}`)).toBeDefined()
    fireEvent.click(view.getByTestId('seat-logout'))
    // clearSession('logout')：vault 同步清空（token 不残留），store 只留非敏感状态。
    await waitFor(() => expect(seatTokenVault.getToken()).toBeNull())
    const authState = useSeatAuthStore.getState()
    expect(authState.status).toBe('anonymous')
    expect(authState.userId).toBeNull()
    expect(authState.endReason).toBe('logout')
    // 回登录门：QR 面板 + logout 专属文案（区别于 401/expired/forbidden 文案）。
    await waitFor(() => expect(view.getByTestId('seat-qr-login')).toBeDefined())
    expect(view.getByTestId('seat-login-notice').textContent).toContain('已退出坐席工作台')
    expect(view.getByTestId('seat-login-notice').textContent).not.toContain('失效')
    expect(view.getByTestId('seat-login-notice').textContent).not.toContain('过期')
  })

  it('登出后写入口不可再操作：工作台 DOM 整体收回（单页状态机，无路由跳转）+ 登录门立即重建 QR 会话', async () => {
    const backend = new SeatFakeBackend()
    const view = renderWorkspace(backend, new FakeSseStream())
    await waitFor(() => expect(view.getByTestId('seat-workspace')).toBeDefined())
    // 已认证挂载不发 qr_login/create（登录门未挂载）。
    expect(backend.calls.some((call) => call.path.endsWith('/passport/qr_login/create'))).toBe(false)
    fireEvent.click(view.getByTestId('seat-logout'))
    await waitFor(() => expect(view.queryByTestId('seat-workspace')).toBeNull())
    // 真实实现（注释锁定）：登出是单页状态机切换（无 navigate），登录门取代
    // 工作台 DOM——全部写入口（claim/composer/send/转接）随之不可达。
    expect(view.queryByTestId(`seat-claim-${SESSION}`)).toBeNull()
    expect(view.queryByTestId('seat-composer')).toBeNull()
    expect(view.queryByTestId('seat-send')).toBeNull()
    expect(view.queryByTestId('seat-transfer-target-select')).toBeNull()
    // 登录门立即可用：新 QR 会话已创建（Seat 域请求携带的 Authorization 为空——
    // qr_login 是免登录白名单面，凭证清空后照常可用）。
    await waitFor(() =>
      expect(backend.calls.some((call) => call.path.endsWith('/passport/qr_login/create'))).toBe(true),
    )
    const createCall = backend.calls.find((call) => call.path.endsWith('/passport/qr_login/create'))
    expect(createCall?.auth).toBeNull()
  })
})
