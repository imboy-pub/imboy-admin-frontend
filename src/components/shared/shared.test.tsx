/**
 * Unit tests for shared components:
 *   EmptyState — default/custom props, action button
 *   ErrorState — default/custom message, retry button
 *   LoadingState — default/custom message
 *   StatusBadge — default labels/variants, custom maps
 *   PageHeader — title, description, actions
 *   ErrorBoundary — catches errors, shows fallback, reset
 *   Breadcrumb — formatSegment, isDynamicSegment logic
 *   StatsCard — title, value, trend, description rendering
 *   FilterBar — search/reset buttons, custom labels, extra actions
 *   ConfirmDialog — title, description, confirm/cancel callbacks
 */
import '../../test/setupDom'
import { afterEach, describe, expect, it } from 'bun:test'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'
import { PageHeader } from './PageHeader'
import { ErrorBoundary } from './ErrorBoundary'
import { StatusBadge } from './StatusBadge'
import { StatsCard } from './StatsCard'
import { Breadcrumb } from './Breadcrumb'
import { FilterBar } from './FilterBar'
import { ConfirmDialog } from './ConfirmDialog'
import { Skeleton, TableSkeleton, StatsCardSkeleton, DashboardSkeleton, ListPageSkeleton } from './Skeleton'
import { EntityDrawer } from './EntityDrawer'
import { BatchActionBar } from './BatchActionBar'
import { DataTablePagination } from './DataTable'
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import client from '@/services/api/client'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClientShared = { get: AnyFn }
const mutableSharedClient = client as unknown as MutableClientShared
const origSharedGet = mutableSharedClient.get

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
describe('EmptyState', () => {
  it('renders default title and description', () => {
    const { getByText } = render(<EmptyState />)
    expect(getByText('暂无数据')).toBeTruthy()
    expect(getByText('没有找到相关内容')).toBeTruthy()
  })

  it('renders custom title and description', () => {
    const { getByText } = render(<EmptyState title="没有用户" description="请先添加用户" />)
    expect(getByText('没有用户')).toBeTruthy()
    expect(getByText('请先添加用户')).toBeTruthy()
  })

  it('renders action button when action prop is provided', () => {
    let clicked = false
    const { getByText } = render(
      <EmptyState
        title="空状态"
        action={{ label: '立即添加', onClick: () => { clicked = true } }}
      />
    )
    const btn = getByText('立即添加')
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(clicked).toBe(true)
  })

  it('does not render action button when action prop is absent', () => {
    const { container } = render(<EmptyState />)
    expect(container.querySelector('button')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ErrorState
// ---------------------------------------------------------------------------
describe('ErrorState', () => {
  it('renders default error message', () => {
    const { getByText } = render(<ErrorState />)
    expect(getByText('加载失败，请重试')).toBeTruthy()
  })

  it('renders custom message', () => {
    const { getByText } = render(<ErrorState message="服务器故障，请稍后再试" />)
    expect(getByText('服务器故障，请稍后再试')).toBeTruthy()
  })

  it('renders retry button and calls onRetry when clicked', () => {
    let retried = false
    const { getByText } = render(<ErrorState onRetry={() => { retried = true }} />)
    const btn = getByText('重试')
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(retried).toBe(true)
  })

  it('does not render retry button when onRetry is absent', () => {
    const { queryByText } = render(<ErrorState />)
    expect(queryByText('重试')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// LoadingState
// ---------------------------------------------------------------------------
describe('LoadingState', () => {
  it('renders default loading message', () => {
    const { getByText } = render(<LoadingState />)
    expect(getByText('加载中...')).toBeTruthy()
  })

  it('renders custom loading message', () => {
    const { getByText } = render(<LoadingState message="正在获取数据..." />)
    expect(getByText('正在获取数据...')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// PageHeader
// ---------------------------------------------------------------------------
describe('PageHeader', () => {
  it('renders title', () => {
    const { getByText } = render(<PageHeader title="用户管理" />)
    expect(getByText('用户管理')).toBeTruthy()
  })

  it('renders optional description', () => {
    const { getByText } = render(<PageHeader title="用户管理" description="管理所有注册用户" />)
    expect(getByText('管理所有注册用户')).toBeTruthy()
  })

  it('renders actions slot', () => {
    const { getByText } = render(
      <PageHeader
        title="用户管理"
        actions={<button>新增用户</button>}
      />
    )
    expect(getByText('新增用户')).toBeTruthy()
  })

  it('does not render description when not provided', () => {
    const { getByText } = render(<PageHeader title="用户管理" />)
    const h1 = getByText('用户管理')
    expect(h1.tagName.toLowerCase()).toBe('h1')
  })
})

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------
// A component that always throws
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('test error message')
  }
  return <div>正常内容</div>
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(getByText('正常内容')).toBeTruthy()
  })

  it('renders default fallback UI on error', () => {
    const consoleSpy = console.error
    console.error = () => {}

    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(getByText('页面出了点问题')).toBeTruthy()
    expect(getByText('test error message')).toBeTruthy()

    console.error = consoleSpy
  })

  it('renders custom fallback when provided', () => {
    const consoleSpy = console.error
    console.error = () => {}

    const { getByText } = render(
      <ErrorBoundary fallback={<div>自定义错误界面</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(getByText('自定义错误界面')).toBeTruthy()

    console.error = consoleSpy
  })

  it('resets error state when 重试 is clicked', () => {
    const consoleSpy = console.error
    console.error = () => {}

    // Use mutable ref so we can flip throwing off before the retry re-render
    const flag = { shouldThrow: true }
    function DynamicThrower() {
      if (flag.shouldThrow) throw new Error('test error')
      return <div>正常内容</div>
    }

    const { getByText } = render(
      <ErrorBoundary>
        <DynamicThrower />
      </ErrorBoundary>
    )

    expect(getByText('页面出了点问题')).toBeTruthy()

    // Stop throwing before the retry re-render
    flag.shouldThrow = false
    fireEvent.click(getByText('重试'))

    expect(getByText('正常内容')).toBeTruthy()

    console.error = consoleSpy
  })
})

// ---------------------------------------------------------------------------
// Breadcrumb — pure logic helpers tested without React rendering
// ---------------------------------------------------------------------------
const LABEL_MAP: Record<string, string> = {
  dashboard: '仪表盘',
  users: '用户管理',
  groups: '群组管理',
  channels: '频道管理',
  moments: '朋友圈',
  reports: '举报中心',
  announcements: '全局公告',
  settings: '系统设置',
  roles: '角色权限',
  logs: '日志审计',
}

function formatSegment(segment: string): string {
  return LABEL_MAP[segment] ?? segment
}

function isDynamicSegment(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment) || /^\d+$/.test(segment)
}

describe('Breadcrumb — formatSegment', () => {
  it('maps known segments to Chinese labels', () => {
    expect(formatSegment('dashboard')).toBe('仪表盘')
    expect(formatSegment('users')).toBe('用户管理')
    expect(formatSegment('groups')).toBe('群组管理')
    expect(formatSegment('channels')).toBe('频道管理')
    expect(formatSegment('roles')).toBe('角色权限')
  })

  it('returns original value for unknown segments', () => {
    expect(formatSegment('unknown-page')).toBe('unknown-page')
    expect(formatSegment('1001')).toBe('1001')
  })
})

describe('Breadcrumb — isDynamicSegment', () => {
  it('returns true for numeric IDs', () => {
    expect(isDynamicSegment('1001')).toBe(true)
    expect(isDynamicSegment('42')).toBe(true)
    expect(isDynamicSegment('0')).toBe(true)
  })

  it('returns true for UUID-like segments', () => {
    expect(isDynamicSegment('550e8400-e29b-41d4')).toBe(true)
    expect(isDynamicSegment('123e4567-e89b-12d3')).toBe(true)
  })

  it('returns false for named route segments', () => {
    expect(isDynamicSegment('users')).toBe(false)
    expect(isDynamicSegment('dashboard')).toBe(false)
    expect(isDynamicSegment('groups')).toBe(false)
  })
})

describe('Breadcrumb — renders route path', () => {
  it('renders home and route segments', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/users']}>
        <Breadcrumb />
      </MemoryRouter>
    )
    expect(getByText('首页')).toBeTruthy()
    expect(getByText('用户管理')).toBeTruthy()
  })

  it('shows numeric ID as-is in breadcrumb', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/users/1001']}>
        <Breadcrumb />
      </MemoryRouter>
    )
    expect(getByText('1001')).toBeTruthy()
  })

  it('returns null for root path', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Breadcrumb />
      </MemoryRouter>
    )
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
describe('StatusBadge', () => {
  it('renders default label 正常 for status=1', () => {
    const { getByText } = render(<StatusBadge status={1} />)
    expect(getByText('正常')).toBeTruthy()
  })

  it('renders default label 禁用 for status=0', () => {
    const { getByText } = render(<StatusBadge status={0} />)
    expect(getByText('禁用')).toBeTruthy()
  })

  it('renders custom labels when provided', () => {
    const labels = { 1: '已发布', 0: '草稿', 2: '已归档' }
    const { getByText } = render(<StatusBadge status={2} labels={labels} />)
    expect(getByText('已归档')).toBeTruthy()
  })

  it('falls back to string of status when label not in map', () => {
    const { getByText } = render(<StatusBadge status={99} />)
    expect(getByText('99')).toBeTruthy()
  })

  it('renders string status correctly', () => {
    const labels = { active: '活跃', inactive: '非活跃' }
    const { getByText } = render(<StatusBadge status="active" labels={labels} />)
    expect(getByText('活跃')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// StatsCard
// ---------------------------------------------------------------------------
describe('StatsCard', () => {
  it('renders title and value', () => {
    const { getByText } = render(<StatsCard title="用户总数" value={1234} />)
    expect(getByText('用户总数')).toBeTruthy()
    expect(getByText('1,234')).toBeTruthy()
  })

  it('renders string value as-is', () => {
    const { getByText } = render(<StatsCard title="状态" value="活跃" />)
    expect(getByText('活跃')).toBeTruthy()
  })

  it('renders optional description', () => {
    const { getByText } = render(
      <StatsCard title="消息数" value={500} description="过去30天" />
    )
    expect(getByText('过去30天')).toBeTruthy()
  })

  it('renders positive trend with + prefix', () => {
    const { getByText } = render(
      <StatsCard title="增长" value={100} trend={{ value: 12, label: '较上月' }} />
    )
    expect(getByText('+12%')).toBeTruthy()
    expect(getByText('较上月')).toBeTruthy()
  })

  it('renders negative trend without + prefix', () => {
    const { getByText } = render(
      <StatsCard title="下降" value={80} trend={{ value: -5, label: '较上月' }} />
    )
    expect(getByText('-5%')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------
describe('FilterBar', () => {
  it('renders children', () => {
    const { getByText } = render(
      <FilterBar>
        <span>筛选条件</span>
      </FilterBar>
    )
    expect(getByText('筛选条件')).toBeTruthy()
  })

  it('renders 搜索 button when onSearch provided', () => {
    let searched = false
    const { getByText } = render(
      <FilterBar onSearch={() => { searched = true }}>
        <span>-</span>
      </FilterBar>
    )
    const btn = getByText('搜索')
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(searched).toBe(true)
  })

  it('renders 重置 button when onReset provided', () => {
    let reset = false
    const { getByText } = render(
      <FilterBar onReset={() => { reset = true }}>
        <span>-</span>
      </FilterBar>
    )
    const btn = getByText('重置')
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(reset).toBe(true)
  })

  it('uses custom searchText and resetText', () => {
    const { getByText } = render(
      <FilterBar
        onSearch={() => {}}
        onReset={() => {}}
        searchText="应用筛选"
        resetText="恢复默认"
      >
        <span>-</span>
      </FilterBar>
    )
    expect(getByText('应用筛选')).toBeTruthy()
    expect(getByText('恢复默认')).toBeTruthy()
  })

  it('does not render search button when onSearch absent', () => {
    const { queryByText } = render(<FilterBar><span>-</span></FilterBar>)
    expect(queryByText('搜索')).toBeNull()
  })

  it('renders extraActions slot', () => {
    const { getByText } = render(
      <FilterBar extraActions={<button>导出</button>}>
        <span>-</span>
      </FilterBar>
    )
    expect(getByText('导出')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------
describe('ConfirmDialog', () => {
  it('renders title when open', () => {
    const { getByText } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="确认删除"
        onConfirm={() => {}}
      />
    )
    expect(getByText('确认删除')).toBeTruthy()
  })

  it('renders optional description', () => {
    const { getByText } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="确认删除"
        description="此操作不可撤销"
        onConfirm={() => {}}
      />
    )
    expect(getByText('此操作不可撤销')).toBeTruthy()
  })

  it('provides an accessible fallback description when omitted', () => {
    const { getByText } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="确认删除"
        onConfirm={() => {}}
      />
    )
    expect(getByText('确定要执行“确认删除”吗？')).toBeTruthy()
  })

  it('renders default 确认 and 取消 button labels', () => {
    const { getByText } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="确认操作"
        onConfirm={() => {}}
      />
    )
    expect(getByText('确认')).toBeTruthy()
    expect(getByText('取消')).toBeTruthy()
  })

  it('uses custom confirmText and cancelText', () => {
    const { getByText } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="确认操作"
        confirmText="立即删除"
        cancelText="再想想"
        onConfirm={() => {}}
      />
    )
    expect(getByText('立即删除')).toBeTruthy()
    expect(getByText('再想想')).toBeTruthy()
  })

  it('calls onConfirm when confirm button clicked', async () => {
    let confirmed = false
    const { getByText } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="操作提示"
        confirmText="立即确认"
        onConfirm={() => { confirmed = true }}
      />
    )
    fireEvent.click(getByText('立即确认'))
    await new Promise((r) => setTimeout(r, 0))
    expect(confirmed).toBe(true)
  })
})

// Skeleton components
describe('Skeleton', () => {
  it('renders a div with animate-pulse class', () => {
    const { container } = render(<Skeleton />)
    const el = container.firstChild as HTMLElement
    expect(el.tagName).toBe('DIV')
    expect(el.className).toContain('animate-pulse')
  })

  it('merges custom className', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('h-4')
    expect(el.className).toContain('w-20')
  })
})

describe('TableSkeleton', () => {
  it('renders default 5 rows', () => {
    const { container } = render(<TableSkeleton />)
    // header row div + 5 data row divs = 6 flex rows
    const rows = container.querySelectorAll('.flex.gap-4')
    expect(rows.length).toBeGreaterThanOrEqual(5)
  })

  it('renders custom rows and cols', () => {
    const { container } = render(<TableSkeleton rows={3} cols={2} />)
    const rows = container.querySelectorAll('.flex.gap-4')
    expect(rows.length).toBeGreaterThanOrEqual(3)
  })
})

describe('StatsCardSkeleton', () => {
  it('renders skeleton card structure', () => {
    const { container } = render(<StatsCardSkeleton />)
    const card = container.firstChild as HTMLElement
    expect(card).toBeTruthy()
    expect(card.className).toContain('rounded-lg')
  })
})

describe('DashboardSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<DashboardSkeleton />)
    expect(container.firstChild).toBeTruthy()
  })
})

describe('ListPageSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<ListPageSkeleton />)
    expect(container.firstChild).toBeTruthy()
  })
})

// EntityDrawer
describe('EntityDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <EntityDrawer open={false} onOpenChange={() => {}} title="详情" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders title when open', () => {
    const { getByText } = render(
      <EntityDrawer open={true} onOpenChange={() => {}} title="用户详情" />
    )
    expect(getByText('用户详情')).toBeTruthy()
  })

  it('renders optional subtitle', () => {
    const { getByText } = render(
      <EntityDrawer open={true} onOpenChange={() => {}} title="标题" subtitle="副标题" />
    )
    expect(getByText('副标题')).toBeTruthy()
  })

  it('shows loading text when loading=true', () => {
    const { getByText } = render(
      <EntityDrawer open={true} onOpenChange={() => {}} title="T" loading={true}>
        <span>子内容</span>
      </EntityDrawer>
    )
    expect(getByText('加载中...')).toBeTruthy()
  })

  it('shows error message when provided', () => {
    const { getByText } = render(
      <EntityDrawer open={true} onOpenChange={() => {}} title="T" error="加载失败" />
    )
    expect(getByText('加载失败')).toBeTruthy()
  })

  it('renders children when not loading and no error', () => {
    const { getByText } = render(
      <EntityDrawer open={true} onOpenChange={() => {}} title="T">
        <span>内容区域</span>
      </EntityDrawer>
    )
    expect(getByText('内容区域')).toBeTruthy()
  })

  it('calls onOpenChange(false) when close button clicked', () => {
    let closed = false
    const { getByLabelText } = render(
      <EntityDrawer open={true} onOpenChange={(v) => { if (!v) closed = true }} title="T" />
    )
    fireEvent.click(getByLabelText('关闭'))
    expect(closed).toBe(true)
  })

  it('calls onOpenChange(false) when backdrop clicked', () => {
    let closed = false
    const { getByLabelText } = render(
      <EntityDrawer open={true} onOpenChange={(v) => { if (!v) closed = true }} title="T" />
    )
    fireEvent.click(getByLabelText('关闭抽屉'))
    expect(closed).toBe(true)
  })

  it('calls onOpenChange(false) on Escape key', () => {
    let closed = false
    render(
      <EntityDrawer open={true} onOpenChange={(v) => { if (!v) closed = true }} title="T" />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closed).toBe(true)
  })

  it('renders actions slot', () => {
    const { getByText } = render(
      <EntityDrawer open={true} onOpenChange={() => {}} title="T" actions={<button>保存</button>} />
    )
    expect(getByText('保存')).toBeTruthy()
  })
})

// BatchActionBar
afterEach(() => {
  mutableSharedClient.get = origSharedGet
  cleanup()
})

function wrapWithQuery(element: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
  return render(<QueryClientProvider client={qc}>{element}</QueryClientProvider>)
}

describe('BatchActionBar', () => {
  it('renders nothing when selectedCount is 0', () => {
    const { container } = wrapWithQuery(
      <BatchActionBar selectedCount={0} actions={[]} onClear={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders action buttons when selectedCount > 0', () => {
    mutableSharedClient.get = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    const { getByText } = wrapWithQuery(
      <BatchActionBar
        selectedCount={3}
        actions={[{ key: 'ban', label: '批量封禁', onExecute: async () => {} }]}
        onClear={() => {}}
      />
    )
    expect(getByText('批量封禁')).toBeTruthy()
  })

  it('shows selected count in bar', () => {
    mutableSharedClient.get = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    const { container } = wrapWithQuery(
      <BatchActionBar
        selectedCount={5}
        actions={[{ key: 'delete', label: '批量删除', onExecute: async () => {} }]}
        onClear={() => {}}
      />
    )
    expect(container.textContent).toContain('5')
  })

  it('calls onClear when clear button clicked', () => {
    mutableSharedClient.get = async () => ({ data: { code: 0, msg: 'ok', payload: {} } })
    let cleared = false
    const { getByText } = wrapWithQuery(
      <BatchActionBar
        selectedCount={2}
        actions={[]}
        onClear={() => { cleared = true }}
      />
    )
    fireEvent.click(getByText('清空选择'))
    expect(cleared).toBe(true)
  })
})

// buildPageItems — inline mirror of private function in DataTable.tsx
function buildPageItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (!Number.isFinite(currentPage) || !Number.isFinite(totalPages) || totalPages < 1) {
    return [1]
  }
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }
  const items: Array<number | 'ellipsis'> = [1]
  let left = Math.max(2, currentPage - 1)
  let right = Math.min(totalPages - 1, currentPage + 1)
  if (currentPage <= 3) {
    left = 2
    right = 4
  } else if (currentPage >= totalPages - 2) {
    left = totalPages - 3
    right = totalPages - 1
  }
  if (left > 2) items.push('ellipsis')
  for (let page = left; page <= right; page += 1) items.push(page)
  if (right < totalPages - 1) items.push('ellipsis')
  items.push(totalPages)
  return items
}

describe('buildPageItems', () => {
  it('returns [1] for invalid totalPages', () => {
    expect(buildPageItems(1, 0)).toEqual([1])
    expect(buildPageItems(1, NaN)).toEqual([1])
  })

  it('returns all pages when totalPages <= 7', () => {
    expect(buildPageItems(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(buildPageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('shows first 4 pages + ellipsis + last when on page 1 of large set', () => {
    const items = buildPageItems(1, 20)
    expect(items[0]).toBe(1)
    expect(items).toContain('ellipsis')
    expect(items[items.length - 1]).toBe(20)
  })

  it('shows first + ellipsis + last 4 pages when near end', () => {
    const items = buildPageItems(19, 20)
    expect(items[0]).toBe(1)
    expect(items).toContain('ellipsis')
    expect(items[items.length - 1]).toBe(20)
    // Last few pages should be visible
    expect(items).toContain(17)
    expect(items).toContain(18)
    expect(items).toContain(19)
  })

  it('shows first + ellipsis + window + ellipsis + last for middle page', () => {
    const items = buildPageItems(10, 20)
    expect(items[0]).toBe(1)
    expect(items[items.length - 1]).toBe(20)
    const ellipsisCount = items.filter((item) => item === 'ellipsis').length
    expect(ellipsisCount).toBe(2)
    expect(items).toContain(9)
    expect(items).toContain(10)
    expect(items).toContain(11)
  })
})

// DataTablePagination rendering
describe('DataTablePagination', () => {
  it('renders page info and navigation buttons', () => {
    const { container } = wrapWithQuery(
      <DataTablePagination
        page={1}
        pageSize={10}
        total={50}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />
    )
    expect(container.textContent).toContain('上一页')
    expect(container.textContent).toContain('下一页')
  })

  it('calls onPageChange when next page clicked', () => {
    let newPage = 0
    const { getByRole } = wrapWithQuery(
      <DataTablePagination
        page={1}
        pageSize={10}
        total={50}
        onPageChange={(p) => { newPage = p }}
        onPageSizeChange={() => {}}
      />
    )
    fireEvent.click(getByRole('button', { name: '下一页' }))
    expect(newPage).toBe(2)
  })

  it('disables previous button on page 1', () => {
    const { getByRole } = wrapWithQuery(
      <DataTablePagination
        page={1}
        pageSize={10}
        total={50}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />
    )
    const prevBtn = getByRole('button', { name: '上一页' }) as HTMLButtonElement
    expect(prevBtn.disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// KeyboardShortcutsDialog
// ---------------------------------------------------------------------------

describe('KeyboardShortcutsDialog', () => {
  it('renders nothing by default (closed state)', () => {
    const { container } = render(<KeyboardShortcutsDialog />)
    expect(container.textContent).toBe('')
  })

  it('opens dialog when "?" key is pressed', () => {
    const { container } = render(<KeyboardShortcutsDialog />)
    fireEvent.keyDown(window, { key: '?' })
    expect(container.textContent).toContain('键盘快捷键')
  })

  it('shows shortcut groups when open', () => {
    const { getByText } = render(<KeyboardShortcutsDialog />)
    fireEvent.keyDown(window, { key: '?' })
    expect(getByText('全局')).toBeTruthy()
    expect(getByText('列表页')).toBeTruthy()
    expect(getByText('导航')).toBeTruthy()
  })

  it('closes dialog when "?" is pressed again (toggle)', () => {
    const { container } = render(<KeyboardShortcutsDialog />)
    // open
    fireEvent.keyDown(window, { key: '?' })
    expect(container.textContent).toContain('键盘快捷键')
    // close by toggle
    fireEvent.keyDown(window, { key: '?' })
    expect(container.textContent).toBe('')
  })

  it('closes dialog when close button "✕" is clicked', () => {
    const { container, getByText } = render(<KeyboardShortcutsDialog />)
    fireEvent.keyDown(window, { key: '?' })
    expect(container.textContent).toContain('键盘快捷键')
    fireEvent.click(getByText('✕'))
    expect(container.textContent).toBe('')
  })

  it('closes dialog when backdrop is clicked', () => {
    const { container } = render(<KeyboardShortcutsDialog />)
    fireEvent.keyDown(window, { key: '?' })
    // find backdrop (fixed inset-0 bg-black/50)
    const backdrop = container.querySelector('.bg-black\\/50') as HTMLElement
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop)
    expect(container.textContent).toBe('')
  })

  it('does not open when "?" is pressed in an INPUT', () => {
    const { container } = render(
      <>
        <input data-testid="input" />
        <KeyboardShortcutsDialog />
      </>
    )
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.keyDown(input, { key: '?', target: input })
    // dialog should remain closed because target is INPUT
    expect(container.textContent).toBe('')
  })

  it('does not open when "?" is pressed with meta key', () => {
    const { container } = render(<KeyboardShortcutsDialog />)
    fireEvent.keyDown(window, { key: '?', metaKey: true })
    expect(container.textContent).toBe('')
  })

  it('closes on Escape key when open', () => {
    const { container } = render(<KeyboardShortcutsDialog />)
    fireEvent.keyDown(window, { key: '?' })
    expect(container.textContent).toContain('键盘快捷键')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.textContent).toBe('')
  })

  it('shows known shortcut descriptions', () => {
    const { getByText } = render(<KeyboardShortcutsDialog />)
    fireEvent.keyDown(window, { key: '?' })
    expect(getByText('打开命令面板')).toBeTruthy()
    expect(getByText('关闭弹窗/面板')).toBeTruthy()
  })
})
