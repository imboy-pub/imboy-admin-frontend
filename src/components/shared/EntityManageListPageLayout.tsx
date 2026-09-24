/**
 * 实体治理列表页布局（ENT-ADM-02）。
 *
 * 收敛群/频道治理子页（ENT-00 取证：群 12 子页 + 频道 8 页手工复制同骨架）
 * 中逐页复制的页面骨架：
 *   - 整页 loading / error 两态分支（LoadingState / ErrorState）；
 *   - PageHeader + 标准动作对（“导出当前页 CSV” + 返回上级详情）；
 *   - 列表 Card（CardHeader/CardTitle + CardContent > DataTable）；
 *   - DataTablePagination 接线（卡片内或卡片下方两种既有位置）；
 *   - 列表卡片后的详情分区卡片；
 *   - 页尾附加节点（ConfirmDialog 等，Radix portal，位置不影响行为）。
 *
 * 刻意不吸收的部分（保持页面语义零漂移）：
 *   - useQuery / useMutation / useListQueryState / useAdminPermission 接线
 *     （queryKey、enabled、placeholderData、防抖逐页不同，请求语义归页面）；
 *   - columns / CSV 列定义（页面领域数据）；
 *   - loading 的判定条件（如 keepPreviousData 页为 `isLoading && !data`）。
 */
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RowData } from '@tanstack/react-table'
import { LegacyTable } from '@tanstack/react-table/legacy'
import { ArrowLeft, Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, DataTablePagination } from './DataTable'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'
import { PageHeader } from './PageHeader'

export interface EntityManageListPagination {
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

export interface EntityManageListPageLayoutProps<TData extends RowData> {
  /** 页面标题（PageHeader.title） */
  title: string
  /** 页面描述（PageHeader.description） */
  description: string
  /** 标准“导出当前页 CSV”动作；不传则不渲染该按钮 */
  exportCsv?: {
    onClick: () => void
    disabled: boolean
  }
  /** 标准返回动作（按钮触发 navigate(to)）；不传则不渲染该按钮 */
  backTo?: {
    to: string
    label: string
  }
  /** 列表加载中 → 整页 LoadingState（判定条件由调用方给出） */
  loading: boolean
  loadingMessage: string
  /** 列表加载失败 → 整页 ErrorState（truthy 即失败，判定条件由调用方给出） */
  error?: unknown
  errorMessage: string
  onRetry: () => void
  /** 列表卡片标题 */
  listTitle: ReactNode
  /** tanstack legacy table 实例 */
  table: LegacyTable<TData>
  onRowClick?: (_row: TData) => void
  /** 表格上方筛选插槽（渲染在列表卡片内容顶部） */
  filters?: ReactNode
  /** 分页属性；不传则不渲染分页（调用方自行用 data 条件包裹） */
  pagination?: EntityManageListPagination
  /**
   * 分页渲染位置，对应既有两种骨架：
   * inside-card = 列表卡片内表格下方；below-card = 列表卡片下方页面级。
   * 默认 below-card。
   */
  paginationPlacement?: 'inside-card' | 'below-card'
  /** 列表卡片之后的详情分区卡片；不传则不渲染 */
  detail?: {
    title: ReactNode
    children: ReactNode
  }
  /** 页尾附加节点（ConfirmDialog 等端口组件） */
  children?: ReactNode
}

export function EntityManageListPageLayout<TData extends RowData>({
  title,
  description,
  exportCsv,
  backTo,
  loading,
  loadingMessage,
  error,
  errorMessage,
  onRetry,
  listTitle,
  table,
  onRowClick,
  filters,
  pagination,
  paginationPlacement = 'below-card',
  detail,
  children,
}: EntityManageListPageLayoutProps<TData>) {
  const navigate = useNavigate()

  if (loading) {
    return <LoadingState message={loadingMessage} />
  }

  if (error) {
    return <ErrorState message={errorMessage} onRetry={onRetry} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={(
          <>
            {exportCsv && (
              <Button variant="outline" size="sm" onClick={exportCsv.onClick} disabled={exportCsv.disabled}>
                <Download className="mr-2 h-4 w-4" />
                导出当前页 CSV
              </Button>
            )}
            {backTo && (
              <Button variant="outline" onClick={() => navigate(backTo.to)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {backTo.label}
              </Button>
            )}
          </>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>{listTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {filters}
          <DataTable table={table} onRowClick={onRowClick} />
          {pagination && paginationPlacement === 'inside-card' && (
            <DataTablePagination {...pagination} />
          )}
        </CardContent>
      </Card>

      {pagination && paginationPlacement === 'below-card' && (
        <DataTablePagination {...pagination} />
      )}

      {detail && (
        <Card>
          <CardHeader>
            <CardTitle>{detail.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">{detail.children}</CardContent>
        </Card>
      )}

      {children}
    </div>
  )
}
