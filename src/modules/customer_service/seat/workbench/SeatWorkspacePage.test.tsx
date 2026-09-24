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
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { SeatWorkspacePage } from './SeatWorkspacePage'
import {
  ASSET_PDF_ID,
  ASSET_PNG_ID,
  CONV,
  FakeSseStream,
  IDENTITY,
  ORG,
  SeatFakeBackend,
  SESSION,
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
    backend.state.failingResponsesLeft = 1
    fireEvent.change(composer, { target: { value: '您好' } })
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
