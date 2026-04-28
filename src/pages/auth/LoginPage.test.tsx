import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
