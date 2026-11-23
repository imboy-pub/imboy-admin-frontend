import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { toast } from 'sonner'
import { md5 } from 'js-md5'
import { LoginPage } from './LoginPage'
import client from '../../services/api/client'
import { useAuthStore } from '../../stores/authStore'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

// Mock login page API data
const loginPageFixture = {
  csrf_token: 'test-csrf',
  public_key: '',
  system_name: 'Imboy 测试系统',
}

/** 与 src/lib/passwordCrypto.test.ts 同源的 RSA 测试公钥（驱动真实加密链）。 */
const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDARqnAEpvlAB/3zZFAkJZMdvgO
7sfzCRcS9NggJtmwmOG9KTKhDL8NlNAmTzUXQvMQEtSmqt7rWjyhbt325ecCKrdp
MPgMDXIvDceV0pAwSS99mie5gvACH1x/NsKBWTnBV5hFpyZ0CB0DQ670PwicwWDm
4MUBJW/q8y2aiLIfHQIDAQAB
-----END PUBLIC KEY-----`

const LOGIN_SUCCESS_PAYLOAD = {
  id: '9007199254740993',
  account: 'admin',
  nickname: '管理员',
  avatar: '',
  role_id: 3,
  next: '/dashboard',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<div>setup-page</div>} />
        <Route path="/dashboard" element={<div>dashboard-page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LoginPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    // Ensure unauthenticated state
    useAuthStore.getState().logout()
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    useAuthStore.getState().logout()
    cleanup()
  })

  it('renders login form with account/password/captcha fields', async () => {
    mutableClient.get = async () => {
      return { data: { code: 0, msg: 'ok', payload: { initialized: true } } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('Imboy')
      expect(text).toContain('账号')
      expect(text).toContain('密码')
      expect(text).toContain('验证码')
    })
  })

  it('shows custom system name from API', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/setup/status') {
        return { data: { code: 0, msg: 'ok', payload: { initialized: true } } }
      }
      // getLoginPage() uses a different URL — return fixture
      return { data: { code: 0, msg: 'ok', payload: loginPageFixture } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('Imboy 测试系统')
    })
  })

  it('redirects to setup page when system is not initialized', async () => {
    mutableClient.get = async () => {
      return { data: { code: 0, msg: 'ok', payload: { initialized: false } } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('setup-page')
    })
  })

  it('redirects to dashboard when already authenticated', async () => {
    // Pre-set authenticated state in the store
    useAuthStore.getState().setAdmin({
      id: 'admin-1',
      account: 'admin',
      nickname: 'Admin',
      avatar: '',
      role_id: 1,
      status: 1,
      login_count: 0,
      last_login_ip: '',
      last_login_at: '',
      created_at: '',
    })

    mutableClient.get = async () => {
      return { data: { code: 0, msg: 'ok', payload: { initialized: true } } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })
    await waitFor(() => {
      expect(view.container.textContent).toContain('dashboard-page')
    })
  })
})

describe('A-06 实际 Admin 登录调用方（S-04 服务端合同消费）', () => {
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  /** 已初始化、可用登录参数及当前浏览器 Cookie 对应的会话。 */
  function authedGet(url: string) {
    if (url === '/setup/status') {
      return { data: { code: 0, msg: 'ok', payload: { initialized: true } } }
    }
    if (url === '/current') {
      return { data: { code: 0, msg: 'ok', payload: LOGIN_SUCCESS_PAYLOAD } }
    }
    return { data: { code: 0, msg: 'ok', payload: {
      csrf_token: 'test-csrf', public_key: TEST_PUBLIC_KEY, system_name: 'Imboy 测试系统',
    } } }
  }

  type Submitted = { url: unknown; body: Record<string, unknown> }

  async function fillAndSubmit(view: ReturnType<typeof renderPage>, captcha = '8g3a') {
    const user = userEvent.setup()
    await waitFor(() => {
      expect((view.container.querySelector('#account') as HTMLInputElement)).toBeDefined()
      expect((view.container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false)
    })
    await act(async () => {
      await user.type(view.container.querySelector('#account')!, 'admin')
      await user.type(view.container.querySelector('#password')!, 'admin888')
      await user.type(view.container.querySelector('#captcha')!, captcha)
      await user.click(view.container.querySelector('button[type="submit"]')!)
    })
  }

  function captchaImageSrc(view: ReturnType<typeof renderPage>): string {
    return (view.container.querySelector('img[alt="验证码"]') as HTMLImageElement).src
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    useAuthStore.getState().logout()
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    useAuthStore.getState().logout()
    mock.restore()
    cleanup()
  })

  it('A-06:LOCAL:01 合法登录成功路径不退化：明文/预哈希绝不上行，成功才入认证态并跳转', async () => {
    const submitted: Submitted[] = []
    mutableClient.get = authedGet
    mutableClient.post = async (url: unknown, body: Record<string, unknown>) => {
      submitted.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: LOGIN_SUCCESS_PAYLOAD } }
    }
    const toastSuccess = spyOn(toast, 'success').mockImplementation(() => {})

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })
    await fillAndSubmit(view)

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
    expect(useAuthStore.getState().admin).toMatchObject({ id: '9007199254740993', account: 'admin', role_id: '3' })
    await waitFor(() => expect(view.container.textContent).toContain('dashboard-page'))
    // wire 合同：单次 do_login；账号/验证码/CSRF 原样；密码只以 RSA 密文上行。
    expect(submitted).toHaveLength(1)
    expect(submitted[0]!.url).toBe('/passport/do_login')
    expect(submitted[0]!.body).toMatchObject({ account: 'admin', captcha: '8g3a', csrf_token: 'test-csrf' })
    const pwd = submitted[0]!.body.pwd
    expect(typeof pwd).toBe('string')
    expect(pwd).not.toBe('admin888')
    expect(pwd).not.toBe(md5('admin888'))
    expect(String(pwd).length).toBeGreaterThan(20)
    expect(toastSuccess.mock.calls[0]?.[0]).toBe('登录成功')
  })

  // S-04 冻结服务端错误合同（adm_passport_handler/adm_passport_logic 原文）：
  // 禁用账号 / 验证码有误 / 密码校验失败 / 密码解密失败。
  for (const serverMsg of ['账号被禁用', '验证码有误', 'errorPassword', '密码有误']) {
    it(`A-06:LOCAL:01 身份/核验失败（${serverMsg}）→ 不入认证态、提示服务端原文、验证码轮换、零自动重放`, async () => {
      const toastError = spyOn(toast, 'error').mockImplementation(() => {})
      const toastSuccess = spyOn(toast, 'success').mockImplementation(() => {})
      let postCount = 0
      mutableClient.get = authedGet
      mutableClient.post = async () => {
        postCount += 1
        throw { code: 50001, msg: serverMsg }
      }

      let view: ReturnType<typeof renderPage>
      await act(async () => { view = renderPage() })
      const captchaBefore = captchaImageSrc(view)
      await fillAndSubmit(view)

      await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
      // 提示准确：服务端合同原文透传，不显示登录成功。
      expect(toastError.mock.calls[0]?.[0]).toBe(serverMsg)
      expect(toastSuccess).not.toHaveBeenCalled()
      await sleep(30)
      // 失败不入认证态（无凭据副作用）。
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().admin).toBeNull()
      expect(view.container.textContent).not.toContain('dashboard-page')
      // 不自动重放敏感操作：恰一次提交。
      expect(postCount).toBe(1)
      // 验证码已轮换（挑战图换新，须人工重输）。
      expect(captchaImageSrc(view)).not.toBe(captchaBefore)
    })
  }

  it('A-06:LOCAL:01 会话签发 fail-closed（登录态服务暂不可用）→ 不入认证态', async () => {
    const toastError = spyOn(toast, 'error').mockImplementation(() => {})
    mutableClient.get = authedGet
    mutableClient.post = async () => {
      throw { code: 50000, msg: '登录态服务暂不可用，请稍后重试' }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })
    await fillAndSubmit(view)

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(view.container.textContent).not.toContain('dashboard-page')
  })

  it('A-06:LOCAL:01 迟到的登录成功不得复活已注销/过期的认证域', async () => {
    let resolveLogin!: (_value: { data: { code: number; msg: string; payload: typeof LOGIN_SUCCESS_PAYLOAD } }) => void
    let postStarted = false
    mutableClient.get = authedGet
    mutableClient.post = () => {
      postStarted = true
      return new Promise((resolve) => { resolveLogin = resolve })
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })
    await fillAndSubmit(view)
    await waitFor(() => expect(postStarted).toBe(true))
    // 提交在途时认证域被终结（注销 / 401 auth-expired 等价路径均收敛到 logout）。
    useAuthStore.getState().logout()
    await act(async () => {
      resolveLogin({ data: { code: 0, msg: 'ok', payload: LOGIN_SUCCESS_PAYLOAD } })
      await sleep(40)
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().admin).toBeNull()
    expect(view.container.textContent).not.toContain('dashboard-page')
  })

  it('discards a late login result without interrupting its cookie response', async () => {
    const response = Promise.withResolvers<unknown>()
    let sent = false
    mutableClient.get = authedGet
    mutableClient.post = (_url: string, _data: unknown, config: { signal?: AbortSignal }) => {
      expect(config.signal).toBeUndefined()
      sent = true
      return response.promise
    }

    let view!: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })
    await fillAndSubmit(view)
    await waitFor(() => expect(sent).toBe(true))
    view.unmount()

    await act(async () => {
      response.resolve({ data: { code: 0, payload: LOGIN_SUCCESS_PAYLOAD } })
    })
    expect(useAuthStore.getState().admin).toBeNull()
  })
})
