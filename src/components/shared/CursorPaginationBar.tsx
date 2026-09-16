import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

const LIMIT_OPTIONS = [10, 25, 50, 100] as const

type CursorPaginationBarProps = {
  /** 当前页码（仅用于展示，1 起计；游标语义由页面自持）。 */
  page: number
  /** 本页行数。 */
  pageRows: number
  canPrev: boolean
  canNext: boolean
  limit: number
  loading?: boolean
  onPrev: () => void
  onNext: () => void
  onLimitChange: (_limit: number) => void
  onRefresh?: () => void
}

/**
 * 键集游标分页条（after_id + limit）。
 *
 * 与 DataTablePagination（页码 OFFSET 语义）不同：服务端键集分页没有总页数，
 * 只有「上一页（游标栈回退）/ 下一页（next_after_id 前进）」两个方向。
 */
export function CursorPaginationBar({
  page,
  pageRows,
  canPrev,
  canNext,
  limit,
  loading = false,
  onPrev,
  onNext,
  onLimitChange,
  onRefresh,
}: CursorPaginationBarProps) {
  return (
    <div
      className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center"
      data-testid="cursor-pagination"
    >
      <div className="text-sm text-muted-foreground">
        第 {page} 页 · 本页 {pageRows} 条（键集分页，无总数）
      </div>
      <div className="flex items-center gap-2">
        {onRefresh ? (
          <Button variant="ghost" size="sm" disabled={loading} onClick={onRefresh}>
            <RefreshCw className="mr-1 h-4 w-4" />
            刷新
          </Button>
        ) : null}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">每页</span>
          <Select
            aria-label="每页条数"
            className="h-8 w-20 text-xs"
            value={String(limit)}
            onChange={(event) => onLimitChange(Number(event.target.value))}
          >
            {LIMIT_OPTIONS.map((option) => (
              <option key={option} value={String(option)}>
                {option}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="outline" size="sm" disabled={!canPrev || loading} onClick={onPrev}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          上一页
        </Button>
        <Button variant="outline" size="sm" disabled={!canNext || loading} onClick={onNext}>
          下一页
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
