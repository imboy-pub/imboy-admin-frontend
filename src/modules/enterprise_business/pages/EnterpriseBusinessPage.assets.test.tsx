/**
 * AC15-ADM-03（EWS-09 口径）—— 企业业务页「附件内容」Tab 专项组件测试。
 *
 * EO06-ADMIN-ASSET-PAGES 唯一 PENDING 格的组件层收敛：此前仅有 2 用例 Tab 渲染
 * smoke（enterprise-business.spec.ts 只断言输入框可见），附件授权代理获取的
 * 成功/失败/必填/泄漏门从未执行。本文件按现行合同（CS-03 / EWS-09）覆盖：
 *
 * ① 必填门：asset_id 与 actor_user_id 任一为空 → 拒绝发请求（toast 提示，无网络调用）；
 * ② 成功：授权代理流式端点取回内存 blob → meta 区展示 Content-Type/字节数 +
 *    下载链接（blob: URL），且**不渲染任何存储地址 / object key / 签名 URL**
 *    （CS-03-A05 泄漏门，组件 DOM 级断言）；
 * ③ 失败（envelope Blob 错误体）：解析出稳定 msg → ErrorState 呈现 + 重试；
 * ④ 响应形状不合法（非 Blob）：fail-closed 错误，不渲染半截 meta；
 * ⑤ 请求参数合同：asset/:id/content 携带 workspace_id + actor_user_id 双判据。
 *
 * 替身说明（unit 层替身，非真实后端）：axios client 走内存 responder；blob 下载
 * 链接经 URL.createObjectURL stub（JSDOM 无实现）。输入驱动统一 userEvent
 * （fireEvent.change 与 React 受控组件 value tracker 不兼容，项目内既有口径）。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import client from '@/services/api/client'
import { EnterpriseBusinessPage } from './EnterpriseBusinessPage'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }
const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const originalFetch = globalThis.fetch

const ORG_A = '1603940848519155'
const WS_A1 = '1603940848519156'
const ASSET_ID = '7100000000000000123'
const ACTOR_ID = '94213488575060'

type GetCall = { url: string; params?: Record<string, unknown> }
let getCalls: GetCall[] = []

function envelope(payload: unknown) {
  return { data: { code: 0, msg: 'ok', payload } }
}

function pageEnvelope(list: unknown[]) {
  return envelope({ list, page: 1, size: 200, total: list.length, total_page: 1 })
}

const ORG_ROWS = [{ id: ORG_A, name: '甲公司', owner_id: 'u1', status: 'active' }]
const WS_ROWS = [{ id: WS_A1, name: '默认工作区' }]

function stubSidebarFetch() {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 0,
        msg: 'ok',
        payload: {
          menus: [],
          version: '1',
          rbac: { roles: [{ id: '1', name: 'super_admin', description: '', permissions: ['enterprise_business:read'] }] },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as typeof globalThis.fetch
}

type AssetResponder = () => { data: Blob | string; headers?: Record<string, string> }

/** 基础 mock（无 asset 分支）：补充 asset responder 即覆盖附件链路。 */
function installMock(assetResponder?: AssetResponder) {
  mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
    getCalls.push({ url, params: config?.params })
    if (url === '/rbac/me') {
      return envelope({ role_id: '1', role_name: 'super_admin', permissions: ['enterprise_business:read'], menu_paths: [] })
    }
    if (url === '/organizations') return pageEnvelope(ORG_ROWS)
    if (url === `/organizations/${ORG_A}/workspaces`) return pageEnvelope(WS_ROWS)
    if (/^\/enterprise-business\/organizations\/[^/]+\/identities$/.test(url)) return envelope([])
    if (assetResponder && /\/assets\/.+\/content(?=\?|$)/.test(url)) {
      return assetResponder()
    }
    throw new Error(`unexpected GET url: ${url}`)
  }
}

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/enterprise-business" element={<EnterpriseBusinessPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** 打开「附件内容」Tab：先等权限门就绪（Tabs 挂载），再切换。 */
async function openAssetsTab(getByRole: (_t: string, _o: { name: string }) => HTMLElement) {
  await waitFor(() => {
    expect(getByRole('tab', { name: '附件内容' })).toBeTruthy()
  })
  await userEvent.setup().click(getByRole('tab', { name: '附件内容' }))
  const card = await waitFor(() => {
    const el = document.querySelector('[data-testid="eb-assets"]')
    expect(el).toBeTruthy()
    return el as HTMLElement
  })
  return within(card)
}

async function fillAndFetch(assets: ReturnType<typeof within>, assetId: string, actorId: string) {
  const user = userEvent.setup()
  await user.type(assets.getByLabelText(/附件 ID（asset_id）/), assetId)
  await user.type(assets.getByLabelText(/责任人 user ID/), actorId)
  await user.click(assets.getByRole('button', { name: /获取内容/ }))
}

beforeEach(() => {
  document.body.innerHTML = ''
  getCalls = []
  stubSidebarFetch()
  // JSDOM 无 createObjectURL：stub 成固定标识（断言下载链接指向内存副本）。
  URL.createObjectURL = (() => 'blob:mock-object-url') as typeof URL.createObjectURL
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL
  installMock()
})

afterEach(() => {
  mutableClient.get = originalGet
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  globalThis.fetch = originalFetch
  cleanup()
})

describe('EnterpriseBusinessPage — 附件内容 Tab（AC15-ADM-03 / EWS-09）', () => {
  it('必填门：asset_id / actor_user_id 任一为空时拒绝发请求', async () => {
    const { getByRole } = renderPage(`/enterprise-business?org=${ORG_A}&ws=${WS_A1}`)
    const assets = await openAssetsTab(getByRole)

    // 两个输入框均为空 → 点获取：不发 asset content 请求。
    await userEvent.setup().click(assets.getByRole('button', { name: /获取内容/ }))
    await waitFor(() => {
      // 停留空态（尚未获取），无 meta、无错误请求路径。
      expect(assets.getByText('尚未获取附件')).toBeTruthy()
    })
    expect(getCalls.some((c) => c.url.includes('/assets/'))).toBe(false)

    // 只填 asset_id 仍拒绝（actor_user_id 是后端 ACL 必填判据）。
    await userEvent.setup().type(assets.getByLabelText(/附件 ID（asset_id）/), ASSET_ID)
    await userEvent.setup().click(assets.getByRole('button', { name: /获取内容/ }))
    expect(getCalls.some((c) => c.url.includes('/assets/'))).toBe(false)
    expect(assets.getByText('尚未获取附件')).toBeTruthy()
  })

  it('成功获取：meta 展示 Content-Type/字节数 + blob 下载链接，且无存储地址/object key 泄漏', async () => {
    installMock(() => ({
      data: new Blob(['png-bytes-fixture'], { type: 'image/png' }),
      headers: { 'content-type': 'image/png', 'x-asset-sha256': 'deadbeef' },
    }))
    const { getByRole, getByTestId } = renderPage(`/enterprise-business?org=${ORG_A}&ws=${WS_A1}`)
    const assets = await openAssetsTab(getByRole)

    await fillAndFetch(assets, ASSET_ID, ACTOR_ID)

    const meta = await waitFor(() => {
      const el = getByTestId('eb-asset-meta')
      expect(el).toBeTruthy()
      return el
    })
    expect(meta.textContent).toContain('image/png')
    // 字节数来自运行时 Blob.size（构造串长度），断言形态而非硬编码字面量。
    expect(meta.textContent).toMatch(/\d+ 字节/)
    // 下载链接 = 内存副本（blob: URL），不是存储 URL。
    const download = getByTestId('eb-asset-download') as HTMLAnchorElement
    expect(download.href).toBe('blob:mock-object-url')
    // CS-03-A05 泄漏门（DOM 级）：附件成功态不渲染任何存储地址/object key/签名串。
    const zoneText = (getByTestId('eb-assets').textContent ?? '') + download.outerHTML
    expect(zoneText).not.toMatch(/object[_-]?key|storage|presign|s3|garage|access[_-]?key|signature=/i)
  })

  it('请求参数合同：content 查询串携带 workspace_id 与 actor_user_id（后端 ACL 双判据）', async () => {
    installMock(() => ({ data: new Blob(['x'], { type: 'text/plain' }), headers: {} }))
    const { getByRole, getByTestId } = renderPage(`/enterprise-business?org=${ORG_A}&ws=${WS_A1}`)
    const assets = await openAssetsTab(getByRole)

    await fillAndFetch(assets, ASSET_ID, ACTOR_ID)
    await waitFor(() => {
      expect(getByTestId('eb-asset-meta')).toBeTruthy()
    })

    // public.ts fetchEbAssetContent 以 URLSearchParams 内联查询串构造请求。
    const assetCall = getCalls.find((c) => /\/assets\/.+\/content\?/.test(c.url))
    expect(assetCall).toBeDefined()
    expect(assetCall!.url.startsWith(`/enterprise-business/organizations/${ORG_A}/assets/${ASSET_ID}/content`)).toBe(true)
    expect(assetCall!.url).toContain(`workspace_id=${WS_A1}`)
    expect(assetCall!.url).toContain(`actor_user_id=${ACTOR_ID}`)
  })

  it('失败路径：envelope Blob 错误体解析出稳定 msg → ErrorState 呈现 + 可重试', async () => {
    let failFirst = true
    installMock(() => {
      if (failFirst) {
        failFirst = false
        throw { response: { data: new Blob([JSON.stringify({ code: 404, msg: 'asset_not_in_scope' })], { type: 'application/json' }) } }
      }
      return { data: new Blob(['retry-ok'], { type: 'text/plain' }), headers: { 'content-type': 'text/plain' } }
    })
    const { getByRole, getByTestId } = renderPage(`/enterprise-business?org=${ORG_A}&ws=${WS_A1}`)
    const assets = await openAssetsTab(getByRole)

    await fillAndFetch(assets, ASSET_ID, ACTOR_ID)

    await waitFor(() => {
      expect(getByTestId('eb-assets').textContent).toContain('附件获取失败：asset_not_in_scope')
    })
    // 失败态不渲染半截 meta。
    expect(document.querySelector('[data-testid="eb-asset-meta"]')).toBeNull()

    // 重试成功 → meta 就位（错误态退出）。
    await userEvent.setup().click(assets.getByRole('button', { name: /重试/ }))
    await waitFor(() => {
      expect(getByTestId('eb-asset-meta').textContent).toContain('8 字节')
    })
    expect(getCalls.filter((c) => /\/assets\/.+\/content(?=\?|$)/.test(c.url)).length).toBe(2)
  })

  it('响应形状不合法（非 Blob）：fail-closed 错误，不渲染 meta', async () => {
    installMock(() => ({ data: 'not-a-blob' }))
    const { getByRole, getByTestId } = renderPage(`/enterprise-business?org=${ORG_A}&ws=${WS_A1}`)
    const assets = await openAssetsTab(getByRole)

    await fillAndFetch(assets, ASSET_ID, ACTOR_ID)

    await waitFor(() => {
      expect(getByTestId('eb-assets').textContent).toContain('附件获取失败')
    })
    expect(document.querySelector('[data-testid="eb-asset-meta"]')).toBeNull()
  })
})
