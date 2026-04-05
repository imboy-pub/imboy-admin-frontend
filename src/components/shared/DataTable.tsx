import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from './EmptyState'
import { LoadingState } from './LoadingState'
import { flexRender, Table as ReactTable } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react'

interface DataTableProps<TData> {
  table: ReactTable<TData>
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (_row: TData) => void
  /** 移动端卡片标题字段 key，默认用第一列 */
  cardTitleKey?: string
}

export function DataTable<TData>({
  table,
  loading = false,
  emptyMessage = '暂无数据',
  onRowClick,
}: DataTableProps<TData>) {
  const rowClickable = typeof onRowClick === 'function'

  if (loading) {
    return <LoadingState message="加载数据中..." />
  }

  const rows = table.getRowModel().rows
  const hasData = rows?.length > 0

  return (
    <>
      {/* 桌面端表格 */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-3 h-8 gap-1"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </Button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {hasData ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={rowClickable ? () => onRowClick(row.original) : undefined}
                  className={rowClickable ? 'cursor-pointer' : ''}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24 text-center"
                >
                  <EmptyState title={emptyMessage} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 移动端卡片视图 */}
      <div className="md:hidden space-y-3">
        {hasData ? (
          rows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border bg-card p-3 space-y-2"
              onClick={rowClickable ? () => onRowClick(row.original) : undefined}
              role={rowClickable ? 'button' : undefined}
              tabIndex={rowClickable ? 0 : undefined}
            >
              {row.getVisibleCells()
                .filter((cell) => cell.column.id !== 'select')
                .map((cell) => {
                  const header = cell.column.columnDef.header
                  let headerText: string
                  if (typeof header === 'string') {
                    headerText = header
                  } else if (typeof header === 'function') {
                    headerText = ''
                  } else {
                    headerText = ''
                  }
                  // 隐藏没有 header 也没有值的 cell
                  const value = flexRender(cell.column.columnDef.cell, cell.getContext())
                  return (
                    <div key={cell.id} className="flex items-center justify-between gap-2 text-sm">
                      {headerText && (
                        <span className="text-muted-foreground shrink-0 min-w-20">{headerText}</span>
                      )}
                      <span className="text-right flex-1 truncate">{value}</span>
                    </div>
                  )
                })}
            </div>
          ))
        ) : (
          <EmptyState title={emptyMessage} />
        )}
      </div>
    </>
  )
}

// 分页组件
interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (_page: number) => void
  onPageSizeChange?: (_size: number) => void
  /** 数据最后更新时间戳（ms），来自 useQuery 的 dataUpdatedAt */
  dataUpdatedAt?: number
  /** 手动刷新回调，来自 useQuery 的 refetch */
  onRefresh?: () => void
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 500, 1000]

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

  if (left > 2) {
    items.push('ellipsis')
  }

  for (let page = left; page <= right; page += 1) {
    items.push(page)
  }

  if (right < totalPages - 1) {
    items.push('ellipsis')
  }

  items.push(totalPages)
  return items
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  dataUpdatedAt,
  onRefresh,
}: PaginationProps) {
  const normalizedTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10
  const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const computedTotalPages = Math.ceil(normalizedTotal / safePageSize)
  const totalPages = Number.isFinite(computedTotalPages) && computedTotalPages > 0 ? computedTotalPages : 1
  const currentPage = Math.min(Math.max(1, normalizedPage), totalPages)
  const start = normalizedTotal === 0 ? 0 : (currentPage - 1) * safePageSize + 1
  const end = Math.min(currentPage * safePageSize, normalizedTotal)
  const pageItems = buildPageItems(currentPage, totalPages)
  const pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS.includes(safePageSize)
    ? DEFAULT_PAGE_SIZE_OPTIONS
    : [...DEFAULT_PAGE_SIZE_OPTIONS, safePageSize].sort((a, b) => a - b)

  const handlePageSizeChange = (value: string) => {
    if (!onPageSizeChange) return
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    onPageSizeChange(parsed)
  }

  const updatedAtText = dataUpdatedAt && dataUpdatedAt > 0
    ? new Date(dataUpdatedAt).toLocaleTimeString('zh-CN')
    : ''

  return (
    <div className="flex flex-col gap-3 px-2 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          显示 {start}-{end} 条，共 {normalizedTotal} 条
        </span>
        {updatedAtText && (
          <span className="hidden sm:inline">更新于 {updatedAtText}</span>
        )}
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={onRefresh}
            title="刷新数据"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">每页</span>
            <select
              value={String(safePageSize)}
              onChange={(event) => handlePageSizeChange(event.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          上一页
        </Button>

        <div className="flex items-center gap-1">
          {pageItems.map((item, index) => {
            if (item === 'ellipsis') {
              return (
                <span key={`ellipsis-${index}`} className="px-1 text-sm text-muted-foreground">
                  ...
                </span>
              )
            }

            return (
              <Button
                key={item}
                variant={item === currentPage ? 'default' : 'outline'}
                size="sm"
                className="min-w-8 px-2"
                onClick={() => onPageChange(item)}
                disabled={item === currentPage}
              >
                {item}
              </Button>
            )
          })}
        </div>

        <span className="text-sm">
          第 {currentPage} / {totalPages} 页
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          下一页
        </Button>
      </div>
    </div>
  )
}
