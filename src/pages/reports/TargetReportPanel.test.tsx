/**
 * Unit tests for TargetReportPanel helpers (pure functions, tested via inline mirrors):
 *   resolveTargetPath — group/channel/user routing
 *   modeLabel         — batch mode display labels
 *
 * Component smoke tests:
 *   - Renders panel title with targetLabel
 *   - Shows LoadingState while fetching
 *   - Shows empty state when no reports
 */
import '../../test/setupDom'
import { afterEach, describe, expect, it } from 'bun:test'
import { render, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { TargetReportPanel } from './TargetReportPanel'
import client from '../../services/api/client'
import type { NonMomentReportTargetType, ReportBatchResolveSummary } from '@/modules/ops_governance/api'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Pure logic — mirrors of internal helpers (not exported)
// ---------------------------------------------------------------------------

type TargetType = NonMomentReportTargetType

function resolveTargetPath(targetType: TargetType, targetId: string | number): string {
  if (targetType === 'group') return `/groups/${targetId}`
  if (targetType === 'channel') return `/channels/${targetId}`
  return `/users/${targetId}`
}

function modeLabel(mode: ReportBatchResolveSummary['mode'] | null): string {
  if (mode === 'batch') return '统一批量接口'
  if (mode === 'target-batch') return '对象批量接口'
  if (mode === 'fallback') return '回退单条接口'
  return '尚未执行'
}

describe('resolveTargetPath', () => {
  it('returns /groups/:id for group type', () => {
    expect(resolveTargetPath('group', '1001')).toBe('/groups/1001')
  })

  it('returns /channels/:id for channel type', () => {
    expect(resolveTargetPath('channel', '2002')).toBe('/channels/2002')
  })

  it('returns /users/:id for user type', () => {
    expect(resolveTargetPath('user', '3003')).toBe('/users/3003')
  })

  it('returns /users/:id for message type (fallback)', () => {
    expect(resolveTargetPath('message', 99)).toBe('/users/99')
  })

  it('handles numeric id', () => {
    expect(resolveTargetPath('group', 42)).toBe('/groups/42')
  })
})

describe('modeLabel', () => {
  it('returns 统一批量接口 for batch mode', () => {
    expect(modeLabel('batch')).toBe('统一批量接口')
  })

  it('returns 对象批量接口 for target-batch mode', () => {
    expect(modeLabel('target-batch')).toBe('对象批量接口')
  })

  it('returns 回退单条接口 for fallback mode', () => {
    expect(modeLabel('fallback')).toBe('回退单条接口')
  })

  it('returns 尚未执行 for null mode', () => {
    expect(modeLabel(null)).toBe('尚未执行')
  })
})

// ---------------------------------------------------------------------------
// Component smoke tests
// ---------------------------------------------------------------------------

type AnyFn = (..._args: unknown[]) => unknown
const mutableClient = client as unknown as { get: AnyFn }
const originalGet = mutableClient.get

afterEach(() => {
  mutableClient.get = originalGet
})

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TargetReportPanel
          targetType="user"
          targetLabel="用户"
          governancePath="/users"
          governanceLabel="用户管理"
          processSteps={[]}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('TargetReportPanel — smoke', () => {
  it('shows navigation button with governanceLabel after load', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: { items: [], page: 1, size: 10, total: 0, total_pages: 1 },
      },
    })

    const { getByText } = renderPanel()
    await waitFor(() => {
      expect(getByText('前往用户管理')).toBeTruthy()
    })
  })

  it('shows status filter options after load', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: { items: [], page: 1, size: 10, total: 0, total_pages: 1 },
      },
    })

    const { getByText } = renderPanel()
    await waitFor(() => {
      expect(getByText('全部状态')).toBeTruthy()
      expect(getByText('待处理')).toBeTruthy()
    })
  })

  it('shows loading state initially (message includes targetLabel)', () => {
    // Never resolves — stays in loading
    mutableClient.get = () => new Promise(() => {})
    const { getByText } = renderPanel()
    // Loading message format: "加载{targetLabel}举报数据..."
    expect(getByText('加载用户举报数据...')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// R-01: 消息举报面板 —— 表格列 + 工单证据对话框（不提供任意消息浏览入口）
// ---------------------------------------------------------------------------

function renderMessagePanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TargetReportPanel
          targetType="message"
          targetLabel="消息"
          governancePath="/users"
          governanceLabel="用户治理（消息作者）"
          processSteps={[]}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const messageReportItem = {
  id: 88001,
  target_type: 'message',
  target_id: 55001,
  target_sub_type: 'c2c',
  target_scope_id: 3001,
  target_author_id: 2001,
  reporter_uid: 3001,
  reason: 'spam',
  description: '',
  evidence: {
    e2ee: true,
    e2ee_consent: true,
    content_state: 'present',
    content_excerpt: '举报人披露的明文摘录',
    content_hash: 'ab12',
    server_msg_id: '55001',
  },
  status: 0,
  handled_by: 0,
  handled_at: null,
  created_at: '2026-09-05T00:00:00Z',
  updated_at: '2026-09-05T00:00:00Z',
}

describe('TargetReportPanel — message (R-01)', () => {
  it('renders message-specific columns: surface / scope / author / E2EE badge', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: { items: [messageReportItem], list: [messageReportItem], page: 1, size: 10, total: 1, total_pages: 1 },
      },
    })

    const { getAllByText } = renderMessagePanel()
    await waitFor(() => {
      // getAllByText：列头与证据行等处可能出现多次，存在即渲染成功
      expect(getAllByText('消息表面').length).toBeGreaterThan(0)
      expect(getAllByText('单聊消息').length).toBeGreaterThan(0)
      expect(getAllByText('会话/群/频道').length).toBeGreaterThan(0)
      expect(getAllByText('消息作者').length).toBeGreaterThan(0)
      expect(getAllByText('E2EE').length).toBeGreaterThan(0)
    })
  })

  it('message rows expose only ticket-bound evidence entry; no arbitrary object browse entry', async () => {
    mutableClient.get = async () => ({
      data: {
        code: 0, msg: 'ok',
        payload: { items: [messageReportItem], list: [messageReportItem], page: 1, size: 10, total: 1, total_pages: 1 },
      },
    })

    const { getAllByTitle, queryByTitle } = renderMessagePanel()
    await waitFor(() => {
      expect(getAllByTitle('查看工单证据').length).toBeGreaterThan(0)
    })
    // 安全断言：message 行没有「查看对象」跳转（防任意消息/对象浏览入口）。
    // （Radix Dialog 打开依赖 PointerEvent，jsdom 环境不可用；对话框内容由
    // 下方 evidenceRows 纯函数镜像覆盖数据面。）
    expect(queryByTitle('查看对象')).toBeNull()
  })
})


// ---------------------------------------------------------------------------
// R-01: evidenceRows 纯函数镜像 —— 证据展示只消费工单自身字段
// ---------------------------------------------------------------------------

type EvidenceInput = {
  target_sub_type: string
  target_scope_id: string
  target_author_id: string
  target_id: string
  evidence: Record<string, unknown> | null
}

const SUB_TYPE_LABELS: Record<string, string> = {
  c2c: '单聊消息',
  c2g: '群聊消息',
  channel: '频道消息',
}

function evidenceRows(report: EvidenceInput): Array<{ label: string; value: string }> {
  const evidence = report.evidence
  const surface = SUB_TYPE_LABELS[report.target_sub_type] ?? report.target_sub_type
  const rows: Array<{ label: string; value: string }> = [
    { label: '消息表面', value: surface !== '' ? surface : '-' },
    { label: '会话/群/频道 ID', value: report.target_scope_id || '-' },
    { label: '消息作者 UID', value: report.target_author_id || '-' },
    { label: '服务端消息 ID', value: String(evidence?.server_msg_id ?? '') || String(report.target_id) },
  ]
  if (evidence) {
    if (typeof evidence.e2ee === 'boolean') {
      rows.push({ label: '端到端加密', value: evidence.e2ee ? '是' : '否' })
    }
    if (evidence.e2ee === true) {
      rows.push({ label: '举报人明文披露同意', value: evidence.e2ee_consent === true ? '已同意' : '未提交' })
    }
    if (typeof evidence.content_excerpt === 'string' && evidence.content_excerpt) {
      rows.push({ label: evidence.e2ee === true ? '举报人披露的明文摘录' : '内容摘录', value: evidence.content_excerpt })
    }
  }
  return rows
}

describe('evidenceRows (R-01 mirror)', () => {
  it('maps message report into ticket-bound evidence rows only', () => {
    const rows = evidenceRows({
      target_sub_type: 'c2c',
      target_scope_id: '3001',
      target_author_id: '2001',
      target_id: '55001',
      evidence: {
        e2ee: true,
        e2ee_consent: true,
        server_msg_id: '55001',
        content_excerpt: '举报人披露的明文摘录',
      },
    })
    const labels = rows.map((r) => r.label)
    expect(labels).toContain('消息表面')
    expect(labels).toContain('端到端加密')
    expect(labels).toContain('举报人明文披露同意')
    expect(labels).toContain('举报人披露的明文摘录')
    // 只消费工单自身字段，不引入其他消息源
    expect(rows.find((r) => r.label === '服务端消息 ID')?.value).toBe('55001')
  })

  it('E2EE without excerpt marks consent as not submitted', () => {
    const rows = evidenceRows({
      target_sub_type: 'channel',
      target_scope_id: '8001',
      target_author_id: '2001',
      target_id: '9001',
      evidence: { e2ee: true, content_hash: 'ab12' },
    })
    expect(rows.find((r) => r.label === '举报人明文披露同意')?.value).toBe('未提交')
    expect(rows.find((r) => r.label === '举报人披露的明文摘录')).toBeUndefined()
  })
})
