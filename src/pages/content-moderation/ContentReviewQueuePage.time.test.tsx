/**
 * R12-AD 内容复审日期参数 · 客户端范围构造回归（PLAN §7.4 指定新增，
 * wire 未定条件下的最小落地）。
 *
 * 行为：start/end 日期在客户端经 calendarRange 的日历校验——
 * - 合法 YYYY-MM-DD 原样上送（wire 向后兼容：BE review_queue `$N::date`
 *   合同不变，等待 R12-BE 定义明确瞬间边界参数后再扩展）；
 * - 畸形日期（URL 深链可编辑出 2026-02-30 / 非日期串）不上送，
 *   过滤 nothing 而非错误日（与 auditDateRange 同一 fail-safe 语义）。
 */
import '../../test/setupDom'
import { afterEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import client from '@/services/api/client'
import { ContentReviewQueuePage } from './ContentReviewQueuePage'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const origGet = mutableClient.get
const origPost = mutableClient.post

const calls: Array<{ url: string; params: Record<string, unknown> }> = []

function mockQueue() {
  mutableClient.get = async (url: unknown, config: unknown) => {
    const record = { url: String(url), params: ((config ?? {}) as Record<string, unknown>).params ?? {} }
    calls.push(record)
    return { data: { code: 0, msg: 'ok', payload: { items: [], total: 0, page: 1, size: 10 } } }
  }
  mutableClient.post = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
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
  mutableClient.get = origGet
  mutableClient.post = origPost
  calls.length = 0
  cleanup()
})

describe('内容复审 start/end 日期上送（R12-AD 客户端范围构造）', () => {
  it('合法日期原样上送（wire 兼容：仍为 YYYY-MM-DD）', async () => {
    mockQueue()
    renderAt('?start=2026-10-20&end=2026-10-21')
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/moderation/review-queue')).toBe(true)
    })
    const call = calls.find((c) => c.url === '/moderation/review-queue')!
    expect(call.params.start).toBe('2026-10-20')
    expect(call.params.end).toBe('2026-10-21')
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
})
