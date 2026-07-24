import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { OnboardingConfigPage } from './OnboardingConfigPage'
import client from '../../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const configFixture = {
  enabled: true,
  welcome_agent_uid: '123456789012345678',
  default_channels: ['ch_news', 'ch_talk'],
  welcome_template: '嗨 {{nickname}}，欢迎来到 imboy',
  welcome_llm_enabled: false,
}

const envelope = (payload: unknown) => ({ data: { code: 0, msg: 'ok', payload } })

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OnboardingConfigPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('OnboardingConfigPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => envelope(configFixture)
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays onboarding config', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/onboarding_config') return envelope(configFixture)
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('新手引导配置')
    })
    // 表单初值渲染：模板文案 + 逗号分隔频道
    expect(view.container.querySelector('#welcome_template')?.textContent).toContain(
      '欢迎来到 imboy'
    )
    const channels = view.container.querySelector('#default_channels') as HTMLInputElement | null
    expect(channels?.value).toBe('ch_news, ch_talk')
  })

  it('shows error state when API fails', async () => {
    mutableClient.get = async () => {
      throw new Error('network error')
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('加载新手引导配置失败')
    })
  })

  it('sends save patch through client.post', async () => {
    mutableClient.get = async () => envelope(configFixture)
    let posted: { url?: string; body?: unknown } = {}
    mutableClient.post = async (url: string, body: unknown) => {
      posted = { url, body }
      return envelope(configFixture)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => {
      expect(view.container.textContent).toContain('保存配置')
    })

    const saveBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('保存配置')
    ) as HTMLButtonElement
    await act(async () => {
      saveBtn.click()
    })

    await waitFor(() => {
      expect(posted.url).toBe('/ai_agent/onboarding_config')
    })
    // patch 携带全部字段，default_channels 由逗号文本解析回数组
    expect(posted.body).toMatchObject({
      enabled: true,
      welcome_agent_uid: '123456789012345678',
      default_channels: ['ch_news', 'ch_talk'],
      welcome_llm_enabled: false,
    })
  })
})
