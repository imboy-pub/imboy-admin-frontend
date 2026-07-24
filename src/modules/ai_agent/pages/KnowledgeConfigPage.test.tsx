import '../../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { KnowledgeConfigPage } from './KnowledgeConfigPage'
import client from '../../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const configFixture = {
  enabled: true,
  group_rule: '1. 禁止广告\n2. 友好交流',
  faq: 'Q：怎么改昵称？\nA：我的-设置',
}

const envelope = (payload: unknown) => ({ data: { code: 0, msg: 'ok', payload } })

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <KnowledgeConfigPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('KnowledgeConfigPage flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mutableClient.post = async () => envelope(configFixture)
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('loads and displays knowledge config', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/knowledge_config') return envelope(configFixture)
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('AI 知识库配置')
    })
    // 表单初值渲染：群规与 FAQ 文本回显
    const groupRule = view.container.querySelector('#group_rule') as HTMLTextAreaElement | null
    expect(groupRule?.value).toBe('1. 禁止广告\n2. 友好交流')
    const faq = view.container.querySelector('#faq') as HTMLTextAreaElement | null
    expect(faq?.value).toBe('Q：怎么改昵称？\nA：我的-设置')
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
      expect(view.container.textContent).toContain('加载知识库配置失败')
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
      expect(posted.url).toBe('/ai_agent/knowledge_config')
    })
    // patch 携带三字段全量
    expect(posted.body).toMatchObject({
      enabled: true,
      group_rule: '1. 禁止广告\n2. 友好交流',
      faq: 'Q：怎么改昵称？\nA：我的-设置',
    })
  })
})
