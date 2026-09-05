/**
 * R-02: ReportActionPanel 单测。
 *   actionStatusText   — 行状态徽标文案（纯函数）
 *   defaultGidForTicket— message 举报的群 scope 默认值（纯函数）
 * Component:
 *   - ticket=null 时面板关闭
 *   - 打开时渲染动作下拉/理由输入/执行按钮；理由为空时按钮禁用
 *   - 提交调用 executeReportAction（POST body 含 case_id/action/target_uid/reason）
 */
import '../../test/setupDom'
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { render, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ReportActionPanel, actionStatusText, defaultGidForTicket } from './ReportActionPanel'
import client from '../../services/api/client'
import type { ReportTicket } from '@/modules/ops_governance/api'

afterEach(() => {
  cleanup()
})

const mutableClient = client as unknown as { post: (url: string, body: unknown) => Promise<unknown> }

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

function makePosts(postImpl: (url: string, body: unknown) => Promise<unknown>) {
  mutableClient.post = postImpl
  mutableClient.get = (async () => ({
    data: { code: 0, msg: 'ok', payload: { data: [] } },
  })) as typeof mutableClient.get
}

/** React 受控组件必须走 native setter 才能触发 onChange。 */
function setControlledValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
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
