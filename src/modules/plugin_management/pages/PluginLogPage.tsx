import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { FileSearch, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/shared'
import { formatDate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import {
  getPluginLogList,
  pluginLogKeys,
  type PluginLogEntry,
  type PluginAction,
} from '../api/plugins'

const ACTION_LABELS: Record<PluginAction, string> = {
  install: '安装',
  enable: '启用',
  disable: '禁用',
  upgrade: '升级',
  uninstall: '卸载',
  reset: '重置',
  force_uninstall: '强制卸载',
}

const ACTION_VARIANTS: Record<PluginAction, 'info' | 'success' | 'warning' | 'destructive' | 'default'> = {
  install: 'info',
  enable: 'success',
  disable: 'warning',
  upgrade: 'info',
  uninstall: 'destructive',
  reset: 'warning',
  force_uninstall: 'destructive',
}

export function PluginLogPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [actionFilter, setActionFilter] = useState<'all' | PluginAction>('all')
  const [resultFilter, setResultFilter] = useState<'all' | 'success' | 'failure'>('all')
  const [pluginNameFilter, setPluginNameFilter] = useState('')

  const queryParams = {
    page,
    size: pageSize,
    ...(actionFilter !== 'all' ? { action: actionFilter } : {}),
    ...(resultFilter !== 'all' ? { result: resultFilter } : {}),
    ...(pluginNameFilter.trim() ? { plugin_name: pluginNameFilter.trim() } : {}),
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: pluginLogKeys.list(queryParams),
    queryFn: () => getPluginLogList(queryParams),
  })

  const columns: ColumnDef<PluginLogEntry>[] = [
    {
      accessorKey: 'created_at',
      header: '时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: 'plugin_name',
      header: '插件',
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.plugin_name}</span>
      ),
    },
    {
      accessorKey: 'action',
      header: '操作',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.action}
          labels={ACTION_LABELS}
          variants={ACTION_VARIANTS}
        />
      ),
    },
    {
      accessorKey: 'operator',
      header: '操作者',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.operator || '-'}</span>
      ),
    },
    {
      accessorKey: 'result',
      header: '结果',
      cell: ({ row }) => (
        <span className={`text-sm font-medium ${row.original.result === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {row.original.result === 'success' ? '成功' : '失败'}
        </span>
      ),
    },
    {
      accessorKey: 'detail',
      header: '详情',
      cell: ({ row }) => (
        <span
          className="block max-w-[320px] truncate font-mono text-xs text-muted-foreground"
          title={row.original.detail}
        >
          {row.original.detail || '-'}
        </span>
      ),
    },
  ]

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading && !data) {
    return <LoadingState message="加载插件操作日志..." />
  }

  if (error) {
    return <ErrorState message="加载插件操作日志失败" onRetry={() => refetch()} />
  }

  const total = data?.total ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="插件操作日志"
        description="查看插件安装、启停、升级等操作的审计记录"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            操作记录
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value as 'all' | PluginAction)
                setPage(1)
              }}
            >
              <option value="all">全部操作</option>
              <option value="install">安装</option>
              <option value="enable">启用</option>
              <option value="disable">禁用</option>
              <option value="upgrade">升级</option>
              <option value="uninstall">卸载</option>
              <option value="reset">重置</option>
            </select>

            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={resultFilter}
              onChange={(e) => {
                setResultFilter(e.target.value as 'all' | 'success' | 'failure')
                setPage(1)
              }}
            >
              <option value="all">全部结果</option>
              <option value="success">成功</option>
              <option value="failure">失败</option>
            </select>

            <Input
              className="max-w-xs"
              placeholder="按插件名称搜索"
              value={pluginNameFilter}
              onChange={(e) => {
                setPluginNameFilter(e.target.value)
                setPage(1)
              }}
            />

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const items = data?.items ?? []
                const csvColumns: CsvColumn<PluginLogEntry>[] = [
                  { header: '时间', accessor: (row) => formatDate(row.created_at) },
                  { header: '插件', accessor: 'plugin_name' },
                  { header: '操作', accessor: (row) => ACTION_LABELS[row.action] ?? row.action },
                  { header: '操作者', accessor: 'operator' },
                  { header: '结果', accessor: (row) => row.result === 'success' ? '成功' : '失败' },
                  { header: '详情', accessor: 'detail' },
                ]
                exportCsv(csvColumns, items, 'plugin_log_export')
                toast.success(`已导出 ${items.length} 条日志记录`)
              }}
              disabled={(data?.items?.length ?? 0) === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
          </div>

          <DataTable table={table} emptyMessage="暂无插件操作日志" />
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
