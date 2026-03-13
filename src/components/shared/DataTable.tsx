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

interface DataTableProps<TData> {
  table: ReactTable<TData>
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (row: TData) => void
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

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
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
  )
}

// 分页组件
interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
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

  return (
    <div className="flex flex-col gap-3 px-2 py-4 md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-muted-foreground">
        显示 {start}-{end} 条，共 {normalizedTotal} 条
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
