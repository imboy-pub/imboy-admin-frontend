/**
 * R-02: ReportActionPanel 单测。
 *   actionStatusText   — 行状态徽标文案（纯函数）
 *   defaultGidForTicket— message 举报的群 scope 默认值（纯函数）
 * Component:
 *   - ticket=null 时面板关闭
 *   - 打开时渲染动作下拉/理由输入/执行按钮；理由为空时按钮禁用
 *   - 提交调用 executeReportAction（POST body 含 case_id/action/target_uid/reason）
 * A-05 补充（处置可追踪 + 只展示后端已实现动作集）：
 *   - 动作下拉只含 MVP 4 项，不出现 content_removal/account_restrict 假能力
 *   - 未知动作状态原样透传（不伪造文案）
 *   - 动作历史按后端行渲染 executed/failed/reversed；失败留痕可见；
 *     撤销入口仅对 executed 行开放
 *   - 撤销提交走 /report_action/reverse 且携带 action_id + 必填理由
 */
import '../../test/setupDom'
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ReportActionPanel, actionStatusText, defaultGidForTicket } from './ReportActionPanel'
import client from '../../services/api/client'
import type { ReportActionRow, ReportTicket } from '@/modules/ops_governance/api'

afterEach(() => {
  cleanup()
})

const mutableClient = client as unknown as { post: (_url: string, _body: unknown) => Promise<unknown> }

const TICKET: ReportTicket = {
  id: '510001',
  target_type: 'message',
  target_id: '3001',
  target_sub_type: 'c2c',
  target_scope_id: '4002',
  target_author_id: '77',
  reporter_uid: '55',
  reason: 'spam',
  description: '',
  evidence: null,
  status: 2,
  handled_by: '',
  handled_at: null,
  created_at: '2026-09-05T00:00:00Z',
  updated_at: '2026-09-05T00:00:00Z',
}

function makePosts(postImpl: (_url: string, _body: unknown) => Promise<unknown>) {
  mutableClient.post = postImpl
  mutableClient.get = (async () => ({
    data: { code: 0, msg: 'ok', payload: { data: [] } },
  })) as typeof mutableClient.get
}

/** React 受控组件必须走 native setter 才能触发 onChange。 */
function _setControlledValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function renderPanel(ticket: ReportTicket | null = TICKET) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ReportActionPanel ticket={ticket} canHandleReports onClose={() => {}} />
    </QueryClientProvider>
  )
}

describe('actionStatusText', () => {
  it('maps statuses to chinese labels', () => {
    expect(actionStatusText('executed')).toBe('已执行')
    expect(actionStatusText('failed')).toBe('执行失败')
    expect(actionStatusText('reversed')).toBe('已撤销')
    expect(actionStatusText('expired')).toBe('已到期')
  })
})

describe('defaultGidForTicket', () => {
  it('uses ticket target_scope_id as group scope', () => {
    expect(defaultGidForTicket(TICKET)).toBe('4002')
  })
})

describe('ReportActionPanel — component', () => {
  it('renders nothing meaningful when ticket is null (dialog closed)', () => {
    makePosts(async () => ({ data: { code: 0, msg: 'ok', payload: {} } }))
    const { queryByText } = renderPanel(null)
    expect(queryByText('处置动作')).toBeNull()
  })

  it('renders action select, reason input and disabled submit when reason empty', async () => {
    makePosts(async () => ({ data: { code: 0, msg: 'ok', payload: {} } }))
    const { getByText, getByLabelText, getAllByText } = renderPanel()
    await waitFor(() => {
      expect(getByText('处置动作')).toBeTruthy()
    })
    expect(getByText('警告通知')).toBeTruthy()
    const reasonInput = getByLabelText('处置理由（必填，写入审计）') as HTMLTextAreaElement
    expect(reasonInput.value).toBe('')
    const buttons = getAllByText('执行动作')
    expect(buttons.length).toBeGreaterThan(0)
    const submit = buttons[0].closest('button') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('api layer: executeReportAction posts case_id/action/target_uid/reason', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    makePosts(async (url, body) => {
      calls.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: { id: '690001' } } }
    })
    const { executeReportAction } = await import('@/modules/ops_governance/api')
    await executeReportAction({
      case_id: '510001',
      action: 'warning',
      target_uid: '77',
      reason: '确认违规：垃圾内容',
    })
    const executeCall = calls.find((item) => item.url.includes('report_action/execute'))
    expect(executeCall).toBeTruthy()
    const body = executeCall!.body as Record<string, unknown>
    expect(body['case_id']).toBe('510001')
    expect(body['action']).toBe('warning')
    expect(body['target_uid']).toBe('77')
    expect(body['reason']).toBe('确认违规：垃圾内容')
  })

  it('mock.module guard: client post is replaced per-test', () => {
    expect(typeof mutableClient.post).toBe('function')
    mock.restore()
  })
})

// ---------------------------------------------------------------------------
// A-05：只展示后端已实现动作集 + 处置/撤销可追踪（证据最小化的动作面）
// ---------------------------------------------------------------------------

/** 构造完整 ReportActionRow（镜像 normalizeReportAction 出参合同）。 */
function makeActionRow(overrides: Partial<ReportActionRow> = {}): ReportActionRow {
  return {
    id: '690001',
    case_id: '510001',
    action: 'warning',
    target_type: 'message',
    target_id: '3001',
    target_uid: '77',
    scope: {},
    reason: 'a05-reason',
    actor_id: '42',
    status: 'executed',
    result: {},
    fail_reason: '',
    start_at: '2026-09-05T00:00:00Z',
    end_at: '2026-09-05T00:00:01Z',
    reversed_at: null,
    reversed_by: '',
    reverse_reason: '',
    created_at: '2026-09-05T00:00:00Z',
    updated_at: '2026-09-05T00:00:00Z',
    ...overrides,
  }
}

const a05ActionPosts: Array<{ url: string; body: unknown }> = []

function mockA05ActionApi(rows: ReportActionRow[]) {
  mutableClient.post = async (url: string, body: unknown) => {
    a05ActionPosts.push({ url, body })
    return { data: { code: 0, msg: 'ok', payload: makeActionRow() } }
  }
  mutableClient.get = (async (url: string) => {
    if (url === '/report_action/list') {
      return { data: { code: 0, msg: 'ok', payload: { data: rows } } }
    }
    throw new Error(`unexpected GET: ${url}`)
  }) as typeof mutableClient.get
}

describe('A-05 处置动作集与可追踪性', () => {
  afterEach(() => {
    a05ActionPosts.length = 0
    cleanup()
  })

  it('动作下拉只含后端 MVP 动作集，无 content_removal/account_restrict 假能力', async () => {
    mockA05ActionApi([])
    const { getByText } = renderPanel()
    await waitFor(() => {
      expect(getByText('处置动作')).toBeTruthy()
    })
    // Radix Dialog 经 portal 渲染在 document.body，select 按 body 查询
    const select = document.body.querySelector('#report-action-type') as HTMLSelectElement
    expect(select).toBeTruthy()
    const optionTexts = [...select.querySelectorAll('option')].map((option) => option.textContent?.trim())
    expect(optionTexts).toEqual(['警告通知', '群禁言', '移出群聊', '驳回（不处置）'])
    // 后端 fail-closed 的动作不得以可执行选项形式出现在 UI
    const lower = optionTexts.join('|').toLowerCase()
    expect(lower).not.toContain('content_removal')
    expect(lower).not.toContain('account_restrict')
    expect(optionTexts.join('|')).not.toContain('删帖')
    expect(optionTexts.join('|')).not.toContain('封禁')
  })

  it('actionStatusText 未知状态原样透传，不伪造状态文案', () => {
    expect(actionStatusText('future_status')).toBe('future_status')
    expect(actionStatusText('')).toBe('')
  })

  it('动作历史按后端行渲染：失败留痕可见，撤销入口仅对 executed 行开放', async () => {
    mockA05ActionApi([
      makeActionRow({ id: '690001', action: 'warning', status: 'executed' }),
      makeActionRow({
        id: '690002',
        action: 'group_mute',
        status: 'failed',
        fail_reason: 'a05-mute-failed',
      }),
      makeActionRow({ id: '690003', action: 'group_kick', status: 'reversed' }),
    ])
    const { getByText, getAllByTitle, queryAllByTitle } = renderPanel()

    await waitFor(() => {
      expect(getByText('已执行')).toBeTruthy()
    })
    // 失败同样留痕：行可见且状态如实展示（不隐藏、不粉饰为成功）
    expect(getByText('执行失败')).toBeTruthy()
    expect(getByText('已撤销')).toBeTruthy()
    // 动作行如实展示后端 action 值
    expect(getByText('group_mute')).toBeTruthy()

    // 撤销入口只对 executed 行开放（1 个）；failed/reversed 行没有撤销按钮
    const reverseButtons = getAllByTitle('撤销该动作')
    expect(reverseButtons).toHaveLength(1)
    expect(queryAllByTitle('撤销该动作').length).toBe(1)
  })

  it('撤销动作提交 /report_action/reverse，携带 action_id 与必填理由', async () => {
    mockA05ActionApi([makeActionRow({ id: '690009', action: 'group_mute', status: 'executed' })])
    const user = userEvent.setup()
    const { getAllByTitle } = renderPanel()

    const reverseButton = await waitFor(() => {
      const buttons = getAllByTitle('撤销该动作')
      expect(buttons.length).toBe(1)
      return buttons[0] as HTMLButtonElement
    })
    await user.click(reverseButton)

    // 撤销理由必填：弹窗打开时确认按钮禁用
    await waitFor(() => {
      const button = [...document.body.querySelectorAll('button')]
        .find((item) => item.textContent?.trim() === '确认撤销')
      expect(button).toBeDefined()
      expect((button as HTMLButtonElement).disabled).toBe(true)
    })

    const reasonField = await waitFor(() => {
      const field = document.body.querySelector('#report-action-reverse-reason') as HTMLTextAreaElement | null
      expect(field).toBeTruthy()
      return field as HTMLTextAreaElement
    })
    // userEvent 触发真实受控 onChange（fireEvent/native setter 对 portal
    // 内受控组件不可靠，见 SSOConfigPage 测试先例）
    await user.type(reasonField, '  a05 复核撤销：误处置  ')

    // 重新查询确认按钮（Radix presence 重渲染可能替换节点，避免旧引用）
    const confirmReverse = await waitFor(() => {
      const button = [...document.body.querySelectorAll('button')]
        .find((item) => item.textContent?.trim() === '确认撤销') as HTMLButtonElement | undefined
      expect(button).toBeDefined()
      expect(button!.disabled).toBe(false)
      return button as HTMLButtonElement
    })
    await user.click(confirmReverse)

    await waitFor(() => {
      const reverseCall = a05ActionPosts.find((item) => item.url.includes('report_action/reverse'))
      expect(reverseCall).toBeTruthy()
      expect(reverseCall!.body).toEqual({ action_id: '690009', reason: 'a05 复核撤销：误处置' })
    })
    // 撤销前不得有其他写请求
    expect(a05ActionPosts.filter((item) => !item.url.includes('report_action/reverse'))).toHaveLength(0)
  })
})
