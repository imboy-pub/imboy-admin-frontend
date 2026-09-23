/**
 * 邀请管理页组件级单测（创建邀请：搜索选择被邀请人 + 一次性 token reveal）。
 *
 * 背景：2026-09-23 起创建邀请的被邀请人从手填 TSID 改为用户搜索选择
 * （UserSearchSelect，按账号/昵称/邮箱/手机号），E2E 旅程⑤ 因 seed 无已知
 * 账号降级为冒烟——reveal（一次性 token 唯一出现点）的 UI 链路由本文件覆盖。
 *
 * ⚠️ 替身与反污染约定同 OrganizationDetailPage.test.tsx：不用 mock.module；
 * 权限源经真实 useAdminPermission 的权威端点 `GET /rbac/me` 供料，sidebar
 * 模板走全局 fetch stub；client.get/post 内存 responder（`{data: 信封}`）。
 */
import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import React from 'react'
import client from '@/services/api/client'
import { OrganizationInvitationsPage } from './OrganizationInvitationsPage'

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn; post: AnyFn }
const realGet = mutableClient.get
const realPost = mutableClient.post
const realFetch = globalThis.fetch

const ORG_ID = '8800487111111111111'
const INVITEE = { id: '6600487333333333333', account: 'invitee_account', nickname: '被邀请人', status: 1 }

const RBAC_PROFILE = {
  role_id: '1',
  role_ids: ['1'],
  permissions: ['organizations:read', 'organizations:write'],
  menu_paths: [],
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
          rbac: {
            roles: [
              { id: '1', name: 'super_admin', description: '', permissions: ['organizations:read', 'organizations:write'] },
            ],
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof globalThis.fetch
}

function envelope(payload: unknown) {
  return { data: { code: 0, msg: 'ok', payload } }
}

beforeEach(() => {
  stubSidebarFetch()
  mutableClient.get = ((url: string) => {
    if (url === '/rbac/me') return Promise.resolve(envelope(RBAC_PROFILE))
    if (url === `/organizations/${ORG_ID}`) {
      return Promise.resolve(
        envelope({
          id: ORG_ID,
          name: 'imboy',
          owner_id: '7700487999999999999',
          status: 'active',
          member_count: 1,
          workspace_count: 0,
        })
      )
    }
    if (url === `/organizations/${ORG_ID}/invitations`) return Promise.resolve(envelope([]))
    if (url === '/user/search') {
      return Promise.resolve({
        data: { code: 0, msg: 'ok', payload: { list: [INVITEE], page: 1, size: 20, total: 1, total_page: 1 } },
      })
    }
    throw new Error(`unexpected GET url: ${url}`)
  }) as AnyFn
  mutableClient.post = (() => Promise.resolve({ data: { code: 0, msg: 'ok', payload: {} } })) as AnyFn
})

afterEach(() => {
  mutableClient.get = realGet
  mutableClient.post = realPost
  globalThis.fetch = realFetch
  cleanup()
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/organizations/${ORG_ID}/invitations`]}>
        <Routes>
          <Route path="/organizations/:organizationId/invitations" element={<OrganizationInvitationsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

type View = ReturnType<typeof renderPage>

async function waitPageReady(view: View) {
  await waitFor(() => expect(view.queryByTestId('invitation-create-btn')).not.toBeNull())
}

describe('OrganizationInvitationsPage — 创建邀请（搜索选择被邀请人）', () => {
  it('未选择被邀请人时创建按钮禁用；选择后可提交（POST body.target_user_id=所选 TSID）', async () => {
    const posts: Array<{ url: string; body: unknown }> = []
    mutableClient.post = ((_url: string, _body: unknown) => {
      posts.push({ url: _url, body: _body })
      return Promise.resolve({
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            invitation_id: '9900487555555555555',
            organization_id: ORG_ID,
            target_user_id: INVITEE.id,
            invited_by: null,
            status: 'pending',
            expires_at: 1780000000,
            token: 'one-time-token-abcdef',
          },
        },
      })
    }) as AnyFn

    const view = renderPage()
    await waitPageReady(view)
    const user = userEvent.setup()

    await user.click(view.getByTestId('invitation-create-btn'))
    const submit = view.getByTestId('invitation-create-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    await user.type(view.getByTestId('invitation-target-search-input'), 'invitee')
    await user.click(view.getByText('搜索'))
    await waitFor(() => expect(view.queryByTestId('invitation-target-option')).not.toBeNull())
    await user.click(view.getByTestId('invitation-target-option'))
    await waitFor(() => expect(view.queryByTestId('invitation-target-selected')).not.toBeNull())
    expect((view.getByTestId('invitation-create-submit') as HTMLButtonElement).disabled).toBe(false)

    await user.click(view.getByTestId('invitation-create-submit'))
    await waitFor(() => expect(view.queryByTestId('invitation-token-reveal')).not.toBeNull())
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe(`/organizations/${ORG_ID}/invitations`)
    expect(posts[0].body).toEqual({ target_user_id: INVITEE.id })

    // 一次性 token 唯一出现点：reveal 可见且值正确
    const tokenInput = view.getByLabelText(/token（一次性）/) as HTMLInputElement
    expect(tokenInput.value).toBe('one-time-token-abcdef')
  })
})
