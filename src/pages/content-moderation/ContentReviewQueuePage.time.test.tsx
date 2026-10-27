/**
 * R12-AD：页面 → moderation API → Axios 序列化后的日期与 IANA zone。
 * 只替换传输 adapter，保留真实服务调用、请求拦截器和参数序列化。
 */
import '../../test/setupDom'
import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import client from '@/services/api/client'
import { ContentReviewQueuePage } from './ContentReviewQueuePage'

const originalAdapter = client.defaults.adapter
const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions
const localOptions = Intl.DateTimeFormat().resolvedOptions()

const calls: Array<{ url: string; params: Record<string, unknown> }> = []

function mockQueue(zone = 'UTC', failFirst = false) {
  spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    ...localOptions,
    timeZone: zone,
  })
  client.defaults.adapter = async (config) => {
    const url = new URL(client.getUri(config), 'http://localhost')
    calls.push({ url: config.url!, params: Object.fromEntries(url.searchParams) })
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: failFirst && calls.length === 1
        ? { code: 503, msg: 'synthetic queue failure', payload: null }
        : { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } },
    }
  }
}

function renderAt(query: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/content-review${query}`]}>
        <ContentReviewQueuePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  client.defaults.adapter = originalAdapter
  Intl.DateTimeFormat.prototype.resolvedOptions = originalResolvedOptions
  calls.length = 0
})

describe('内容复审 start/end 日期上送（R12-AD 客户端范围构造）', () => {
  it.each([
    ['UTC', '2026-10-20'],
    ['Asia/Shanghai', '2026-10-20'],
    ['Asia/Kathmandu', '2026-10-20'],
    ['America/New_York', '2026-03-08'],
    ['America/New_York', '2026-11-01'],
  ])('本地整日 %s %s 随真实请求发送 zone', async (zone, day) => {
    mockQueue(zone)
    renderAt(`?start=${day}&end=${day}`)
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/moderation/review-queue')).toBe(true)
    })
    const call = calls.find((c) => c.url === '/moderation/review-queue')!
    expect(call.params).toMatchObject({ start: day, end: day, zone })
    expect(call.params.start_at).toBeUndefined()
    expect(call.params.end_at).toBeUndefined()
  })

  it('畸形日期（02-30 滚动 / 非日期串）不上送：过滤 nothing，不发错误日', async () => {
    mockQueue()
    renderAt('?start=2026-02-30&end=garbage')
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/moderation/review-queue')).toBe(true)
    })
    const call = calls.find((c) => c.url === '/moderation/review-queue')!
    expect(call.params.start).toBeUndefined()
    expect(call.params.end).toBeUndefined()
  })

  it('空参数行为不变（不上送 start/end 值）', async () => {
    mockQueue()
    renderAt('')
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/moderation/review-queue')).toBe(true)
    })
    const call = calls.find((c) => c.url === '/moderation/review-queue')!
    expect(call.params.start).toBeUndefined()
    expect(call.params.end).toBeUndefined()
  })

  it.each([
    ['?start=2026-03-08&end=2026-02-30', '2026-03-08', undefined],
    ['?start=invalid&end=2026-11-01', undefined, '2026-11-01'],
  ])('单侧有效日期仍携带本地 zone：%s', async (query, start, end) => {
    mockQueue('America/New_York')
    renderAt(query)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].params).toMatchObject({ zone: 'America/New_York' })
    expect(calls[0].params.start).toBe(start)
    expect(calls[0].params.end).toBe(end)
  })

  it('深链日期随分页、状态和 Unicode 关键字一起序列化', async () => {
    mockQueue('America/New_York')
    renderAt('?page=3&status=pending&keyword=%E5%AE%A1%E6%A0%B8&start=2026-03-07&end=2026-03-08')
    await waitFor(() => {
      expect(calls[0]?.params).toMatchObject({
        page: '3',
        status: 'pending',
        keyword: '审核',
        start: '2026-03-07',
        end: '2026-03-08',
        zone: 'America/New_York',
      })
    })
  })

  it('带 zone 的请求失败后展示错误，点击重试仍保留原日期与 zone', async () => {
    mockQueue('America/New_York', true)
    const view = renderAt('?page=3&status=pending&keyword=%E5%AE%A1%E6%A0%B8&start=2026-03-07&end=2026-03-08')

    await view.findByText('加载审核队列失败')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      url: '/moderation/review-queue',
      params: {
        page: '3',
        size: '10',
        status: 'pending',
        keyword: '审核',
        start: '2026-03-07',
        end: '2026-03-08',
        zone: 'America/New_York',
      },
    })

    fireEvent.click(view.getByRole('button', { name: '重试' }))

    await view.findByText('内容人工复审')
    expect(view.queryByText('加载审核队列失败')).toBeNull()
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
  })
})
