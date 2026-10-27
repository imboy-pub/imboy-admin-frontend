/**
 * CS-ADM-02（CS-GOV-03B）运营统计面板测试：
 * - UI 数值与 fixture API **逐项相等**（含无样本 null 的诚实显示）；
 * - 时区/范围可见（date + tz_offset 输入、服务端窗口回显 UTC 时刻）；
 * - loading / error / empty / permission 四态完整；
 * - 未选定企业 = 空态引导且不发请求（统计端点是 org 作用域）；
 * - 不客户端重算：面板只投影响应字段（断言值逐字来自 fixture）。
 */
import '../../../test/setupDom'
import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { CsStatsPanel } from './CsStatsPanel'
import * as realPublicModule from '../api/public'
import type { CsSessionStats } from '../api/public'

const ORG = '7266418340025468901'

const realPublicExports = { ...realPublicModule }

type Call = { organizationId: string; date?: string; tzOffset?: number; zone?: string }
let calls: Call[] = []
let statsResult: CsSessionStats | null = null
let statsError: Error | null = null

mock.module('../api/public', () => ({
  ...realPublicExports,
  getCsSessionStats: async (params: Call) => {
    calls.push(params)
    if (statsError !== null) throw statsError
    return statsResult
  },
}))

// bun 的 mock.module 对整个进程永久生效；文件结束时恢复真实实现，
// 避免单进程连跑时污染后续测试文件（rbac404 测试同款纪律）。
afterAll(() => {
  mock.module('../api/public', () => realPublicExports)
})

function fixture(overrides: Partial<CsSessionStats> = {}): CsSessionStats {
  return {
    organizationId: ORG,
    date: '2026-09-25',
    tzOffset: 480,
    zone: null,
    windowMode: 'fixed_offset',
    windowStart: 1790284800,
    windowEnd: 1790371199,
    newSessions: 7,
    firstResponse: { count: 6, avgSeconds: 42.4 },
    firstHumanResponse: { count: 2, avgSeconds: 15 },
    firstAiResponse: { count: 3, avgSeconds: 2 },
    responseUnknownCount: 1,
    closedSessions: 5,
    rating: { count: 4, avg: 4.5 },
    current: { queued: 4, active: 2 },
    ...overrides,
  }
}

function host(ui: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

/** 真等待：query resolve + React 渲染落盘（此 jsdom 环境 waitFor 轮询不刷新）。 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250))
}

/**
 * 确定性等待：轮询直到谓词成立（此 jsdom 环境 waitFor 轮询不刷新，
 * 只能靠真实定时器让出事件循环）。全量并发负载下固定 sleep 会让
 * 断言读到上一个用例的旧渲染（数据晚到），故对内容断言必须轮询。
 */
async function settleUntil(predicate: () => boolean, label: string): Promise<void> {
  // deadline 必须 < bun 单用例默认 5000ms 超时：否则用例被判超时后
  // settleUntil 的 throw 落地为孤儿 rejection，统计上多一条 error。
  const deadline = Date.now() + 4000
  for (;;) {
    await settle()
    if (predicate()) return
    if (Date.now() > deadline) {
      throw new Error(`settleUntil 超时: ${label}`)
    }
  }
}

beforeEach(() => {
  calls = []
  statsResult = null
  statsError = null
})

describe('CsStatsPanel — CS-GOV-03B', () => {
  it('合法负 UTC 起点仍显示服务端统计窗口', async () => {
    statsResult = fixture({ date: '1970-01-01', tzOffset: 480,
      windowStart: -28800, windowEnd: 57600,
    })
    const view = render(host(<CsStatsPanel orgId={ORG} canRead={true} />))
    await settleUntil(() => view.container.querySelector('[data-testid="cs-stats-window"]') !== null,
      '负 UTC 窗口渲染')
    const window = view.container.querySelector('[data-testid="cs-stats-window"]')
    expect(window?.textContent).toContain('1969-12-31 16:00:00 UTC')
    expect(window?.textContent).toContain('1970-01-01 16:00:00 UTC')
  })

  it('数值与 fixture API 逐项相等（含窗口回显与时区可见）', async () => {
    statsResult = fixture()
    const { getByLabelText, getByTestId, container } = render(host(<CsStatsPanel orgId={ORG} canRead={true} />))

    await settle()
    await settle()
    // 只在本用例自己的 container 内查询：裸 bun test 全量连跑时前序文件
    // 的 DOM 残留会占据 document 级查询结果（rbac404 同场组合复现过）。
    const facts = Array.from(container.querySelectorAll('[data-testid="cs-stats-fact"]'))
    expect(facts.length).toBe(8)
    // 逐项：新会话 7、接单等待 6 次平均 42 秒、关闭 5、评分 4.5（4 条）、当前 4 排队 / 2 接待
    expect(facts[0]?.textContent).toContain('7')
    expect(facts[1]?.textContent).toContain('6 次')
    expect(facts[1]?.textContent).toContain('42 秒')
    expect(facts[2]?.textContent).toContain('5')
    expect(facts[3]?.textContent).toContain('4.5')
    expect(facts[3]?.textContent).toContain('4 条评价')
    expect(facts[4]?.textContent).toContain('4 排队 / 2 接待')
    // 窗口回显（epoch 秒 → UTC 时刻，展示服务端值）
    const win = getByTestId('cs-stats-window')
    expect(win.textContent).toContain('2026-09-24 21:20:00 UTC')
    expect(win.textContent).toContain('2026-09-25 21:19:59 UTC')
    // 范围/时区输入可见
    expect(getByLabelText(/日期/)).toBeTruthy()
    expect(getByLabelText(/时区偏移/)).toBeTruthy()
    // 参数按面板当前输入透传（date 缺省=今日、tz 缺省 0）
    expect(calls[0]?.organizationId).toBe(ORG)
    expect(calls[0]?.tzOffset).toBe(-new Date().getTimezoneOffset())
    expect(facts[1]?.textContent).toContain('接单等待')
    expect(getByTestId('cs-stats-definitions').textContent).toContain('排队到接单')
    expect(getByTestId('cs-stats-retrieved-at').textContent).toContain('数据获取时间')
  })

  it('无样本均值为 null 时诚实显示「无样本」（不伪装成 0）', async () => {
    statsResult = fixture({
      newSessions: 3,
      firstResponse: { count: 0, avgSeconds: null },
      rating: { count: 0, avg: null },
      current: { queued: 1, active: 0 },
      closedSessions: 0,
    })
    const view = render(host(<CsStatsPanel orgId={ORG} canRead={true} />))
    // 确定性等待本用例数据落盘（防全量负载下读到上一用例的旧渲染）；
    // 限定 container 内查询——前序文件的 DOM 残留会让 document 级查询
    // 永远读到旧 facts（rbac404 同场组合复现过）。
    const factTexts = () =>
      Array.from(view.container.querySelectorAll('[data-testid="cs-stats-fact"]')).map((n) => n.textContent)
    await settleUntil(() => {
      const t = factTexts()
      return (t[1] ?? '').includes('无样本') && (t[3] ?? '').includes('无样本')
    }, '无样本双事实渲染')
    const facts = factTexts()
    expect(facts[1]).toContain('无样本')
    expect(facts[3]).toContain('无样本')
    expect(facts[3]).not.toContain('0 条评价之外的默认值')
  })

  it('空事实（全零）显示空态且文案解释窗口语义', async () => {
    statsResult = fixture({
      newSessions: 0,
      firstResponse: { count: 0, avgSeconds: null },
      closedSessions: 0,
      rating: { count: 0, avg: null },
      firstHumanResponse: { count: 0, avgSeconds: null },
      firstAiResponse: { count: 0, avgSeconds: null },
      responseUnknownCount: 0,
      current: { queued: 0, active: 0 },
    })
    const { getByText } = render(host(<CsStatsPanel orgId={ORG} canRead={true} />))
    await settle()
    expect(getByText('该时间窗内无客服会话事实')).toBeTruthy()
  })

  it('加载失败显示错误态与重试入口', async () => {
    statsError = new Error('network down')
    const { getByText, getByRole } = render(host(<CsStatsPanel orgId={ORG} canRead={true} />))
    await settle()
    expect(getByText(/加载运营统计失败/)).toBeTruthy()
    expect(getByRole('button', { name: /重试/ })).toBeTruthy()
  })

  it('无 customer_service:read 权限显示无权空态且不发请求', () => {
    const { getByText } = render(host(<CsStatsPanel orgId={ORG} canRead={false} />))
    expect(getByText('无客服读取权限')).toBeTruthy()
    expect(calls.length).toBe(0)
  })

  it('未选定企业显示引导空态且不发请求（统计端点是 org 作用域）', () => {
    const { getByText } = render(host(<CsStatsPanel orgId={null} canRead={true} />))
    expect(getByText('统计按企业维度查看')).toBeTruthy()
    expect(calls.length).toBe(0)
  })

  it('date 与时区输入变化后按新参数重新请求', async () => {
    statsResult = fixture()
    const { getByLabelText } = render(host(<CsStatsPanel orgId={ORG} canRead={true} />))
    await settle()
    // React 19.2 受控输入必须 user-event 驱动（fireEvent.change 无效——
    // SeatWorkspacePage.test 同款结论）。
    const user = userEvent.setup()
    await user.clear(getByLabelText(/时区偏移/))
    await user.type(getByLabelText(/时区偏移/), '480')
    await settle()
    expect(calls.some((c) => c.tzOffset === 480)).toBe(true)
    expect(calls.every((c) => c.organizationId === ORG)).toBe(true)
  })
})


it('人工、AI 首响与接单等待分别展示，并保留未知资格数量', async () => {
  statsResult = fixture()
  const view = render(host(<CsStatsPanel orgId={ORG} canRead={true} />))
  await settleUntil(() => view.container.textContent?.includes('人工首响') === true, '首响指标')
  const cards = Array.from(view.container.querySelectorAll('[data-testid="cs-stats-fact"]'))
  expect(cards[1]?.textContent).toContain('接单等待6 次平均 42 秒')
  expect(cards[5]?.textContent).toContain('人工首响2 次平均 15 秒')
  expect(cards[6]?.textContent).toContain('AI 首响3 次平均 2 秒')
  expect(cards[7]?.textContent).toContain('首响资格未知1 个会话')
  expect(view.container.textContent).toContain('访客首条消息到首条人工回复')
})

it('缺少新指标的旧响应显示未知，已知零样本显示无样本', async () => {
  statsResult = fixture({ firstHumanResponse: null,
    firstAiResponse: { count: 0, avgSeconds: null }, responseUnknownCount: null })
  const view = render(host(<CsStatsPanel orgId={ORG} canRead={true} />))
  await settleUntil(() => view.container.textContent?.includes('人工首响') === true, '未知首响指标')
  const cards = Array.from(view.container.querySelectorAll('[data-testid="cs-stats-fact"]'))
  expect(cards[5]?.textContent).toContain('未知')
  expect(cards[5]?.textContent).not.toContain('0 次')
  expect(cards[6]?.textContent).toContain('0 次平均 无样本')
  expect(cards[7]?.textContent).toContain('未知')
})

it('旧指标全零时不能隐藏未知首响资格', async () => {
  statsResult = fixture({ newSessions: 0, closedSessions: 0,
    firstResponse: { count: 0, avgSeconds: null }, rating: { count: 0, avg: null },
    current: { queued: 0, active: 0 }, firstHumanResponse: null,
    firstAiResponse: null, responseUnknownCount: null })
  const view = render(host(<CsStatsPanel orgId={ORG} canRead={true} />))
  await settleUntil(() => view.container.textContent?.includes('首响资格未知') === true, '未知资格不能为空态')
  expect(view.container.textContent).not.toContain('该时间窗内无客服会话事实')
})

describe('CsStatsPanel — D03 zone 自然日模式', () => {
  it('默认仍是查看者设备偏移的固定模式（旧默认不动），不发 zone', async () => {
    statsResult = fixture()
    render(host(<CsStatsPanel orgId={ORG} canRead={true} />))
    await settleUntil(() => calls.length > 0, 'default query')
    expect(calls[0]?.zone).toBeUndefined()
    expect(typeof calls[0]?.tzOffset).toBe('number')
  })

  it('显式选择 zone 后改发 natural_day 请求并显示 zone 窗口事实', async () => {
    // NY 2026-03-08：05:00Z → 次日 04:00Z（23h）
    statsResult = fixture({
      date: '2026-03-08', tzOffset: null, zone: 'America/New_York',
      windowMode: 'natural_day',
      windowStart: 1772965200, windowEnd: 1772965200 + 23 * 3600,
      newSessions: 0, closedSessions: 0, responseUnknownCount: 0,
      rating: { count: 0, avg: null }, current: { queued: 0, active: 0 },
    })
    const { getByLabelText } = render(host(<CsStatsPanel orgId={ORG} canRead={true} />))
    await settleUntil(() => calls.length > 0, 'initial query')
    // React 19.2 受控输入必须 user-event 驱动（本文件既有结论同款）
    const user = userEvent.setup()
    await user.selectOptions(getByLabelText(/统计时区/), 'America/New_York')
    await settleUntil(() => calls.some((call) => call.zone === 'America/New_York'), 'zone query')
    const zoneCall = calls.find((call) => call.zone === 'America/New_York')
    expect(zoneCall?.tzOffset).toBeUndefined()
    // 自然日窗口事实（23 小时）展示为服务端回显
    await settleUntil(
      () => document.body.textContent?.includes('America/New_York') === true
        && document.body.textContent?.includes('23 小时') === true,
      'zone metadata shown',
    )
  })
})
