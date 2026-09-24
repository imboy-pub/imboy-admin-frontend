/**
 * EntityManageListPageLayout 治理列表页布局单测（ENT-ADM-02）：
 *   - 整页 loading / error 两态（带消息与 onRetry）；
 *   - 标准动作对（导出 CSV / 返回）可选渲染、disabled、navigate 导航；
 *   - 列表卡片 + 筛选插槽 + DataTable + 行点击；
 *   - 分页两种既有位置（inside-card / below-card）与不传时不渲染；
 *   - 详情分区卡片与页尾 children。
 */
import '../../test/setupDom'

import { afterEach, describe, expect, it, vi } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { getCoreRowModel, LegacyColumnDef, useLegacyTable } from '@tanstack/react-table/legacy'
import type { EntityManageListPageLayoutProps } from './EntityManageListPageLayout'
import { EntityManageListPageLayout } from './EntityManageListPageLayout'

afterEach(cleanup)

interface Row {
  id: string
  name: string
}

const rows: Row[] = [
  { id: '1', name: 'row-one' },
  { id: '2', name: 'row-two' },
]

const columns: LegacyColumnDef<Row>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: '名称' },
]

type HarnessProps = Partial<Omit<EntityManageListPageLayoutProps<Row>, 'table' | 'title' | 'description' | 'listTitle' | 'loadingMessage' | 'errorMessage' | 'loading' | 'onRetry'>>

function LayoutHarness({
  loading = false,
  error,
  onRetry = () => {},
  ...rest
}: HarnessProps) {
  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <EntityManageListPageLayout<Row>
      title="群标签管理"
      description="群组 88 的标签列表与治理操作"
      loading={loading}
      loadingMessage="加载群标签数据..."
      error={error}
      errorMessage="加载群标签数据失败"
      onRetry={onRetry}
      listTitle="标签列表"
      table={table}
      {...rest}
    />
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}</div>
}

function renderLayout(props: HarnessProps = {}) {
  return render(
    <MemoryRouter initialEntries={['/groups/88/tags']}>
      <Routes>
        <Route path="/groups/:id/tags" element={<LayoutHarness {...props} />} />
        <Route path="/groups/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('EntityManageListPageLayout — 两态分支', () => {
  it('loading 时整页 LoadingState，不渲染表格与动作', () => {
    const view = renderLayout({ loading: true })
    expect(view.container.textContent).toContain('加载群标签数据...')
    expect(view.container.textContent).not.toContain('row-one')
    expect(view.queryByRole('button', { name: '导出当前页 CSV' })).toBeNull()
  })

  it('error 时整页 ErrorState，onRetry 可触发', () => {
    const onRetry = vi.fn(() => {})
    const view = renderLayout({ error: new Error('network error'), onRetry })
    expect(view.container.textContent).toContain('加载群标签数据失败')
    expect(view.container.textContent).not.toContain('row-one')
    fireEvent.click(view.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('EntityManageListPageLayout — 标准动作对', () => {
  it('exportCsv/backTo 均传入时渲染两个标准按钮，onClick 触发', () => {
    const onExport = vi.fn(() => {})
    const view = renderLayout({
      exportCsv: { onClick: onExport, disabled: false },
      backTo: { to: '/groups/88', label: '返回群详情' },
    })
    const exportButton = view.getByRole('button', { name: '导出当前页 CSV' }) as HTMLButtonElement
    expect(exportButton.disabled).toBe(false)
    fireEvent.click(exportButton)
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(view.getByRole('button', { name: '返回群详情' })).toBeTruthy()
  })

  it('exportCsv disabled 时不触发 onClick；可选动作可省略', () => {
    const onExport = vi.fn(() => {})
    const view = renderLayout({ exportCsv: { onClick: onExport, disabled: true } })
    const exportButton = view.getByRole('button', { name: '导出当前页 CSV' }) as HTMLButtonElement
    expect(exportButton.disabled).toBe(true)
    fireEvent.click(exportButton)
    expect(onExport).not.toHaveBeenCalled()
    expect(view.queryByRole('button', { name: '返回群详情' })).toBeNull()
  })

  it('backTo 按钮导航到目标路由', () => {
    const view = renderLayout({ backTo: { to: '/groups/88', label: '返回群详情' } })
    fireEvent.click(view.getByRole('button', { name: '返回群详情' }))
    expect(view.getByTestId('location-probe').textContent).toBe('/groups/88')
  })
})

describe('EntityManageListPageLayout — 列表卡片与分页位置', () => {
  it('渲染标题/描述/列表标题/数据行；filters 插槽在卡片内', () => {
    const view = renderLayout({ filters: <input aria-label="关键词筛选" /> })
    expect(view.container.textContent).toContain('群标签管理')
    expect(view.container.textContent).toContain('群组 88 的标签列表与治理操作')
    expect(view.container.textContent).toContain('标签列表')
    expect(view.container.textContent).toContain('row-one')
    expect(view.container.textContent).toContain('row-two')
    expect(view.getByLabelText('关键词筛选')).toBeTruthy()
  })

  it('onRowClick 时行可点击并回传原始行', () => {
    const onRowClick = vi.fn(() => {})
    const view = renderLayout({ onRowClick })
    // 桌面表格 + 移动端卡片两个视图都渲染行文本，取第一个点击
    fireEvent.click(view.getAllByText('row-one')[0])
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', name: 'row-one' })
  })

  it('pagination 缺省 below-card：分页在列表卡片之后渲染', () => {
    const view = renderLayout({
      pagination: { page: 1, pageSize: 10, total: 30, onPageChange: () => {} },
    })
    const sections = Array.from(view.container.querySelectorAll('.space-y-6 > *'))
    const listCardIdx = sections.findIndex((el) => el.textContent?.includes('row-one'))
    const paginationIdx = sections.findIndex((el) => el.textContent?.includes('共 30 条'))
    expect(listCardIdx).toBeGreaterThanOrEqual(0)
    expect(paginationIdx).toBeGreaterThan(listCardIdx)
  })

  it('paginationPlacement=inside-card：分页在列表卡片内部', () => {
    const view = renderLayout({
      pagination: { page: 1, pageSize: 10, total: 30, onPageChange: () => {} },
      paginationPlacement: 'inside-card',
    })
    const sections = Array.from(view.container.querySelectorAll('.space-y-6 > *'))
    const listCardIdx = sections.findIndex((el) => el.textContent?.includes('row-one'))
    expect(listCardIdx).toBeGreaterThanOrEqual(0)
    // 含分页文本的区块只有一个，且就是列表卡片（分页未作为卡片后的独立区块）
    const paginationSections = sections.filter((el) => el.textContent?.includes('共 30 条'))
    expect(paginationSections.length).toBe(1)
    expect(sections.indexOf(paginationSections[0])).toBe(listCardIdx)
    expect(sections[listCardIdx]?.textContent).toContain('第 1 / 3 页')
  })

  it('不传 pagination 时不渲染分页', () => {
    const view = renderLayout({})
    expect(view.container.textContent).not.toContain('共 30 条')
    expect(view.container.textContent).not.toContain('第 1 / 3 页')
  })
})

describe('EntityManageListPageLayout — 详情分区与页尾', () => {
  it('detail 渲染第二张卡片；children 渲染在页尾', () => {
    const view = renderLayout({
      detail: { title: '标签详情', children: <p>detail-body</p> },
      children: <div data-testid="confirm-slot">confirm</div>,
    })
    const sections = Array.from(view.container.querySelectorAll('.space-y-6 > *'))
    expect(view.getByText('标签详情')).toBeTruthy()
    expect(view.getByText('detail-body')).toBeTruthy()
    expect(view.getByTestId('confirm-slot')).toBeTruthy()
    const listCardIdx = sections.findIndex((el) => el.textContent?.includes('row-one'))
    const detailIdx = sections.findIndex((el) => el.textContent?.includes('标签详情'))
    const tailIdx = sections.findIndex((el) => el.textContent?.includes('confirm'))
    expect(detailIdx).toBeGreaterThan(listCardIdx)
    expect(tailIdx).toBeGreaterThan(detailIdx)
  })

  it('不传 detail/children 时不渲染额外区块', () => {
    const view = renderLayout({})
    expect(view.container.textContent).not.toContain('标签详情')
    const sections = Array.from(view.container.querySelectorAll('.space-y-6 > *'))
    expect(sections.length).toBe(2) // PageHeader + 列表卡片
  })
})
