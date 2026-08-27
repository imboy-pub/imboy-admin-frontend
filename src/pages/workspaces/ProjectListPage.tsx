import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Eye } from 'lucide-react'
import {
  PageHeader,
  LoadingState,
  ErrorState,
  StatusBadge,
  DataTable,
  DataTablePagination,
  FilterBar,
} from '@/components/shared'
import { getProjectListPayload, projectListQueryKey, type ProjectAdminRow } from '@/services/api/workspaces'
import { useListQueryState } from '@/hooks/useListQueryState'
import { trackUxEvent } from '@/lib/uxTelemetry'
import { formatDate } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { LegacyColumnDef, useLegacyTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table/legacy'
import { SortingState } from '@tanstack/react-table'

type ProjectListPageQuery = {
  page: number
  size: number
  status: string
  keyword: string
}

/**
 * 项目运营管理列表（只读；双体验 v2.5.2 WP7/T11b）
 * Admin 不提供项目写操作（改名/状态流转归用户端 Project Owner/Member）。
 */
export function ProjectListPage() {
  const navigate = useNavigate()

  const { state: params, setState: setParams, resetState: resetParams } = useListQueryState<ProjectListPageQuery>({
    page: 1,
    size: 10,
    status: 'all',
    keyword: '',
  })
  const [searchKeyword, setSearchKeyword] = useState(params.keyword || '')
  const [statusFilter, setStatusFilter] = useState(params.status)
  const [sorting, setSorting] = useState<SortingState>([])

  const requestParams = {
    page: params.page,
    size: params.size,
    status: params.status,
    keyword: params.keyword.trim() || undefined,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: projectListQueryKey(requestParams),
    queryFn: () => getProjectListPayload(requestParams),
  })

  const handleSearch = () => {
    trackUxEvent('ux_filter_apply', {
      page: 'project_list',
      keyword: searchKeyword.trim(),
      status: statusFilter,
    })
    setParams({ page: 1, keyword: searchKeyword.trim(), status: statusFilter })
  }

  const handleReset = () => {
    setSearchKeyword('')
    setStatusFilter('all')
    resetParams({ page: 1, size: 10, status: 'all', keyword: '' })
  }

  const columns: LegacyColumnDef<ProjectAdminRow>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.id}</span>,
    },
    {
      accessorKey: 'name',
      header: '项目名称',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'workspace_name',
      header: '所属工作区',
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{row.original.workspace_name || '—'}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.original.workspace_id}</div>
        </div>
      ),
    },
    {
      accessorKey: 'owner',
      header: '项目 Owner',
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{row.original.owner_nickname || row.original.owner_account || '—'}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.original.owner_id}</div>
        </div>
      ),
    },
    {
      id: 'tasks',
      header: '任务（完成/总数）',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.task_done} / {row.original.task_total}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ active: '进行中', done: '已完成' }}
          variants={{ active: 'info', done: 'success' }}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          title="查看详情"
          onClick={() => navigate(`/projects/${row.original.id}`)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  const rows = data?.items || []

  const table = useLegacyTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载项目数据..." />
  }

  if (error) {
    return <ErrorState message="加载项目数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="项目管理"
        description="运营只读视图：项目归属、任务概览与 assignee 分布（写操作归用户端）"
      />

      <Card>
        <CardHeader>
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索项目名称..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Select
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">全部状态</option>
              <option value="active">进行中</option>
              <option value="done">已完成</option>
            </Select>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <DataTable table={table} onRowClick={(row) => navigate(`/projects/${row.id}`)} />

          {data && (
            <DataTablePagination
              page={data.page}
              pageSize={data.size}
              total={data.total}
              onPageChange={(page) => setParams({ page })}
              onPageSizeChange={(size) => setParams({ page: 1, size })}
              dataUpdatedAt={dataUpdatedAt}
              onRefresh={() => refetch()}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
