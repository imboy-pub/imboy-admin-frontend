import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { SSOConfigPage } from './SSOConfigPage'
import { SECRET_MASK, secretForSubmit, secretInitial } from '../../services/api/sso'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  post: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const emptyConfig = {
  data: { success: true, payload: { ldap: undefined, saml: undefined, oauth2: undefined } },
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  const invalidatedKeys: unknown[] = []
  ;(queryClient as unknown as { invalidateQueries: AnyFn }).invalidateQueries = async (
    arg: unknown
  ) => {
    invalidatedKeys.push((arg as { queryKey?: unknown })?.queryKey)
    return undefined
  }

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SSOConfigPage />
    </QueryClientProvider>
  )
  return { ...utils, invalidatedKeys }
}

describe('SSOConfigPage', () => {
  beforeEach(() => {
    mutableClient.get = async () => emptyConfig
    mutableClient.post = async () => ({ data: { success: true, payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('invalidates sso-config query after saving LDAP config', async () => {
    const { getByText, findByText, invalidatedKeys } = renderPage()
    // 等待加载完成，LDAP 表单出现
    await findByText('启用 LDAP 认证')

    await act(async () => {
      fireEvent.click(getByText('保存配置'))
    })

    await waitFor(() => {
      expect(invalidatedKeys).toContainEqual(['sso-config'])
    })
  })

  it('masked bind_password shows empty input with configured placeholder and posts sentinel when untouched', async () => {
    mutableClient.get = async () => ({
      data: {
        success: true,
        payload: {
          ldap: {
            provider: 'ldap',
            enabled: true,
            host: 'ldap.example.com',
            port: 389,
            use_ssl: false,
            base_dn: 'dc=example,dc=com',
            bind_dn: 'cn=admin,dc=example,dc=com',
            bind_password: SECRET_MASK,
            has_bind_password: true,
            user_filter: '(uid={{username}})',
            uid_attr: 'uid',
            mail_attr: 'mail',
            display_name_attr: 'cn',
          },
        },
      },
    })
    const posts: { url: unknown; body: unknown }[] = []
    mutableClient.post = async (url: unknown, body: unknown) => {
      posts.push({ url, body })
      return { data: { success: true, payload: {} } }
    }

    const { getByText, findByText, getByLabelText } = renderPage()
    await findByText('启用 LDAP 认证')

    // 脱敏值 *** 不进 input：显示为空 + 已配置提示
    const pwdInput = getByLabelText('Bind 密码') as HTMLInputElement
    expect(pwdInput.value).toBe('')
    expect(pwdInput.placeholder).toBe('已配置，留空则保持不变')

    // 未改动直接保存 → 提交哨兵 ***（后端保留已存密文）
    await act(async () => {
      fireEvent.click(getByText('保存配置'))
    })
    await waitFor(() => expect(posts.length).toBe(1))
    expect((posts[0].body as { bind_password: string }).bind_password).toBe(SECRET_MASK)
  })

  it('posts new secret value when user types one', async () => {
    const posts: { body: unknown }[] = []
    mutableClient.post = async (_url: unknown, body: unknown) => {
      posts.push({ body })
      return { data: { success: true, payload: {} } }
    }

    const user = userEvent.setup()
    const { getByText, findByText, getByLabelText } = renderPage()
    await findByText('启用 LDAP 认证')

    // 未配置时提示"尚未配置"
    const pwdInput = getByLabelText('Bind 密码') as HTMLInputElement
    expect(pwdInput.placeholder).toBe('尚未配置')

    // userEvent 触发真实的 React 受控 onChange（fireEvent.change 在 happy-dom
    // 下不触发受控 state 更新，见项目 ChannelDetailPage 测试先例）
    await user.type(pwdInput, 'new-secret')
    expect(pwdInput.value).toBe('new-secret')
    await user.click(getByText('保存配置'))
    await waitFor(() => expect(posts.length).toBe(1))
    expect((posts[0].body as { bind_password: string }).bind_password).toBe('new-secret')
  })

  it('oauth2 tab shows OIDC callback url and posts sentinel for untouched client_secret', async () => {
    mutableClient.get = async () => ({
      data: {
        success: true,
        payload: {
          oauth2: {
            provider: 'oauth2',
            enabled: true,
            client_id: 'cid',
            client_secret: SECRET_MASK,
            has_client_secret: true,
            issuer: 'https://idp.example.com',
            auth_url: 'https://idp.example.com/authorize',
            token_url: 'https://idp.example.com/token',
            userinfo_url: '',
            scopes: 'openid profile email',
          },
        },
      },
    })
    const posts: { body: unknown }[] = []
    mutableClient.post = async (_url: unknown, body: unknown) => {
      posts.push({ body })
      return { data: { success: true, payload: {} } }
    }

    const { getByText, findByText, getByLabelText } = renderPage()
    await findByText('启用 LDAP 认证')

    await act(async () => {
      fireEvent.click(getByText('OAuth 2.0'))
    })
    await findByText('启用 OAuth 2.0 / OIDC 认证')

    // OIDC 回调地址说明（IdP 侧登记）
    getByText('OIDC 回调地址（需在 IdP 侧登记为 Redirect URI）')
    const cbInput = getByLabelText('OIDC 回调地址') as HTMLInputElement
    expect(cbInput.value.endsWith('/api/v1/auth/oidc/callback')).toBe(true)

    // 脱敏 client_secret：空 input + 已配置提示；未改动保存 → 哨兵
    const secretInput = getByLabelText('Client Secret') as HTMLInputElement
    expect(secretInput.value).toBe('')
    expect(secretInput.placeholder).toBe('已配置，留空则保持不变')

    await act(async () => {
      fireEvent.click(getByText('保存配置'))
    })
    await waitFor(() => expect(posts.length).toBe(1))
    const body = posts[0].body as { client_secret: string; issuer: string }
    expect(body.client_secret).toBe(SECRET_MASK)
    expect(body.issuer).toBe('https://idp.example.com')
  })
})

describe('secret sentinel helpers', () => {
  it('secretInitial strips mask, keeps real/empty values', () => {
    expect(secretInitial(SECRET_MASK)).toBe('')
    expect(secretInitial('')).toBe('')
    expect(secretInitial(undefined)).toBe('')
    expect(secretInitial('plain')).toBe('plain')
  })

  it('secretForSubmit maps untouched (empty or ***) to sentinel, new value passes through', () => {
    expect(secretForSubmit('')).toBe(SECRET_MASK)
    expect(secretForSubmit(SECRET_MASK)).toBe(SECRET_MASK)
    expect(secretForSubmit('new-secret')).toBe('new-secret')
  })
})
