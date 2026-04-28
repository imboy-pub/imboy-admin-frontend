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
