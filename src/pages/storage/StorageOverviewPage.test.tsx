import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StorageOverviewPage } from './StorageOverviewPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const statsFixture = {
  total_files: 500,
  total_size: 10485760,
  image_count: 200,
  video_count: 50,
  document_count: 100,
  other_count: 150,
  today_uploads: 10,
  today_size: 204800,
}

const listFixture = {
  list: [
    {
      id: 'file-001',
      file_hash256: 'abc123',
      mime_type: 'image/png',
      path: '/uploads/2026/01/sample-image.png',
      url: 'https://cdn.example.com/sample-image.png',
      size: 102400,
      referer_time: 0,
      status: 1,
      created_at: '2026-01-10 10:00:00',
    },
  ],
  total: 1,
  page: 1,
  size: 10,
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/storage']}>
        <Routes>
          <Route path="/storage" element={<StorageOverviewPage />} />
          <Route path="/settings" element={<div>settings-page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('StorageOverviewPage flow', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it.each(['ready', 'retry_wait', 'blocked', 'done', 'future_state'])('shows logical and physical %s independently', async (physical) => {
    mutableClient.get = async (url: string) => ({ data: { code: 0, payload: url === '/storage/stats' ? statsFixture : {
      ...listFixture, list: [{ ...listFixture.list[0], id: '8100000000000000001', status: -1,
        lifecycle_state: 'delete_intent', physical_state: physical, deletion_block_reason: 'legal_hold' }],
    } } })
    const view = renderPage()
    const labels: Record<string, string> = { ready: '物理待删除', retry_wait: '物理删除待重试', blocked: '物理删除已阻断（legal_hold）', done: '物理删除已完成', future_state: '物理状态未知' }
    await waitFor(() => expect(view.container.textContent).toContain(`逻辑已删除 · ${labels[physical]}`))
    expect(view.container.textContent).not.toContain('一键物理删除')
  })

  it('loads and displays storage stats with data', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/storage/stats') return { data: { code: 0, msg: 'ok', payload: statsFixture } }
      if (url === '/storage/index') return { data: { code: 0, msg: 'ok', payload: listFixture } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text).toContain('存储管理')
      expect(text).toContain('总文件数')
      expect(text).toContain('500')
      expect(text).toContain('图片')
      expect(text).toContain('200')
      expect(text).toContain('视频')
      expect(text).toContain('50')
      expect(text).toContain('文件类型分布')
    })
  })

  it('shows empty file type distribution when no files exist', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/storage/stats') {
        return {
          data: {
            code: 0, msg: 'ok',
            payload: { ...statsFixture, total_files: 0 },
          },
        }
      }
      if (url === '/storage/index') return { data: { code: 0, msg: 'ok', payload: { list: [], total: 0, page: 1, size: 10 } } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('暂无文件数据')
    })
  })

  it('renders error state when stats API fails', async () => {
    mutableClient.get = async () => { throw new Error('network error') }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      // 接口失败应渲染错误态（含重试），而非把失败当空数据渲染 0 值卡片
      expect(view.container.textContent).toContain('加载存储数据失败')
    })
  })

  it('shows 禁用 button for status=1 file', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/storage/stats') return { data: { code: 0, msg: 'ok', payload: statsFixture } }
      if (url === '/storage/index') return { data: { code: 0, msg: 'ok', payload: listFixture } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('禁用')
    })
  })

  it('shows 启用 button for status=0 file', async () => {
    const disabledList = {
      ...listFixture,
      list: [{ ...listFixture.list[0], status: 0 }],
    }
    mutableClient.get = async (url: string) => {
      if (url === '/storage/stats') return { data: { code: 0, msg: 'ok', payload: statsFixture } }
      if (url === '/storage/index') return { data: { code: 0, msg: 'ok', payload: disabledList } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('启用')
    })
  })

  it('shows 删 button for non-deleted file', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/storage/stats') return { data: { code: 0, msg: 'ok', payload: statsFixture } }
      if (url === '/storage/index') return { data: { code: 0, msg: 'ok', payload: listFixture } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('删')
    })
  })

  it('hides action buttons for status=-1 (soft-deleted) file', async () => {
    const deletedList = {
      ...listFixture,
      list: [{ ...listFixture.list[0], status: -1 }],
    }
    mutableClient.get = async (url: string) => {
      if (url === '/storage/stats') return { data: { code: 0, msg: 'ok', payload: statsFixture } }
      if (url === '/storage/index') return { data: { code: 0, msg: 'ok', payload: deletedList } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      // status=-1 shows 已删除 badge but no 禁用/删 buttons。
      // 注意不能断言全页不含「禁用」子串——状态筛选 Select 的「已禁用」选项
      // 也含该子串；精确匹配文本恰为「禁用」的按钮。
      expect(view.container.textContent).toContain('已删除')
      const disableBtn = [...view.container.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === '禁用'
      )
      expect(disableBtn).toBeUndefined()
    })
  })

  it('renders orphan cleanup panel with 预览 button', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/storage/stats') return { data: { code: 0, msg: 'ok', payload: statsFixture } }
      if (url === '/storage/index') return { data: { code: 0, msg: 'ok', payload: listFixture } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      expect(view.container.textContent).toContain('孤儿附件清理')
      expect(view.container.textContent).toContain('预览')
    })
  })

  it('shows orphan stats after clicking 预览', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/storage/stats') return { data: { code: 0, msg: 'ok', payload: statsFixture } }
      if (url === '/storage/index') return { data: { code: 0, msg: 'ok', payload: listFixture } }
      if (url === '/storage/orphan') return { data: { code: 0, msg: 'ok', payload: { count: 12, total_size: 1048576 } } }
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    await waitFor(() => {
      const btn = Array.from(view.container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '预览'
      )
      expect(btn).toBeDefined()
      if (btn) fireEvent.click(btn)
    })

    await waitFor(() => {
      expect(view.container.textContent).toContain('12')
    })
  })

  it('authorized_pagination_entityid: pagination params reach GET /storage/index and big EntityId id round-trips as string', async () => {
    const BIG_ID = '8100000000000000001' // EntityId：64-bit 大整数必须全程字符串往返
    const getCalls: Array<{ url: string; params: Record<string, unknown> | undefined }> = []
    const postCalls: Array<{ url: string; body: unknown }> = []
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/storage/stats') return { data: { code: 0, msg: 'ok', payload: statsFixture } }
      if (url === '/storage/index') {
        getCalls.push({ url, params: config?.params })
        const params = (config?.params ?? {}) as { page: number; size: number }
        return { data: { code: 0, msg: 'ok', payload: {
          list: [{ ...listFixture.list[0], id: BIG_ID, path: `/uploads/2026/02/page-${params.page}-size-${params.size}.png` }],
          total: 55, page: params.page, size: params.size,
        } } }
      }
      throw new Error(`unexpected GET: ${url}`)
    }
    mutableClient.post = async (url: string, body?: unknown) => {
      postCalls.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => { view = renderPage() })

    // 初始请求：page=1 / size=10 真实到达 GET /storage/index（非仅 UI 假分页）
    await waitFor(() => {
      expect(view.container.textContent).toContain('page-1-size-10.png')
    })
    expect(getCalls.at(-1)?.params).toMatchObject({ page: 1, size: 10 })

    // 点击「下一页」→ page=2 反映到请求参数
    const nextButton = [...view.container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('下一页'))
    expect(nextButton).toBeDefined()
    fireEvent.click(nextButton!)
    await waitFor(() => {
      expect(view.container.textContent).toContain('page-2-size-10.png')
    })
    expect(getCalls.at(-1)?.params).toMatchObject({ page: 2, size: 10 })

    // 修改每页大小 10 → 50（onPageSizeChange → page 重置 1）
    const sizeSelect = [...view.container.querySelectorAll('select')]
      .find((select) => select.value === '10')
    expect(sizeSelect).toBeDefined()
    fireEvent.change(sizeSelect!, { target: { value: '50' } })
    await waitFor(() => {
      expect(view.container.textContent).toContain('page-1-size-50.png')
    })
    expect(getCalls.at(-1)?.params).toMatchObject({ page: 1, size: 50 })

    // EntityId 大整数 id：列表渲染 → 行操作 → 操作请求 body 全程字符串不变形
    const disableButton = [...view.container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '禁用')
    expect(disableButton).toBeDefined()
    fireEvent.click(disableButton!)
    // ConfirmDialog 经 portal 渲染在 document.body：行内按钮 + 弹窗确认按钮
    await waitFor(() => {
      const confirmButtons = [...document.body.querySelectorAll('button')]
        .filter((button) => button.textContent?.trim() === '禁用')
      expect(confirmButtons.length).toBeGreaterThan(1)
    })
    const confirmButton = [...document.body.querySelectorAll('button')]
      .filter((button) => button.textContent?.trim() === '禁用')
      .at(-1)!
    fireEvent.click(confirmButton)
    await waitFor(() => expect(postCalls).toHaveLength(1))
    expect(postCalls[0]?.url).toBe('/storage/disable')
    expect(postCalls[0]?.body).toEqual({ id: BIG_ID })
    const sentId = (postCalls[0]?.body as { id: unknown }).id
    expect(typeof sentId).toBe('string')
    expect(sentId).toBe('8100000000000000001')
    // 精度哨兵：该值若被数字化即失真（Number(BIG_ID) !== BIG_ID），字符串往返是硬约束
    expect(String(Number(BIG_ID))).not.toBe(BIG_ID)
  })
})
