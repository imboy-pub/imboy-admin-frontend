import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Search, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  exportLogoutApplicationCsvBlob,
  getLogoutApplicationListPayload,
} from '@/services/api/logoutApplications'
import { formatDate, truncate } from '@/lib/utils'
import { LogoutApplication, LogoutApplicationListParams } from '@/types/logoutApplication'

export function LogoutApplicationListPage() {
  const [params, setParams] = useState<LogoutApplicationListParams>({
    page: 1,
    size: 10,
  })
  const [uidInput, setUidInput] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [fromTsInput, setFromTsInput] = useState('')
  const [toTsInput, setToTsInput] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['logout-applications', params],
    queryFn: () => getLogoutApplicationListPayload(params),
  })

  const handleSearch = () => {
    const uid = uidInput.trim()
    setParams((prev) => ({
      ...prev,
      page: 1,
      uid: uid || undefined,
      keyword: keywordInput.trim() || undefined,
      from_ts: fromTsInput.trim() || undefined,
      to_ts: toTsInput.trim() || undefined,
    }))
  }

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (size: number) => {
    setParams((prev) => ({ ...prev, page: 1, size }))
  }

  const handleExportCsv = async () => {
    setIsExporting(true)
    try {
      const blob = await exportLogoutApplicationCsvBlob(params)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `logout_applications_${Date.now()}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('已开始下载导出文件')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导出失败'
      toast.error(msg)
    } finally {
      setIsExporting(false)
    }
  }

  const columns: ColumnDef<LogoutApplication>[] = [
    {
      accessorKey: 'uid',
      header: 'UID',
      cell: ({ row }) => <span className="font-mono">{row.original.uid}</span>,
    },
    {
      accessorKey: 'account',
      header: '账号',
      cell: ({ row }) => <span className="font-medium">{row.original.account || '-'}</span>,
    },
    {
      accessorKey: 'nickname',
      header: '昵称',
      cell: ({ row }) => <span>{row.original.nickname || '-'}</span>,
    },
    {
      accessorKey: 'app_vsn',
      header: 'App版本',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.app_vsn || '-'}</span>,
    },
    {
      accessorKey: 'dtype',
      header: '设备类型',
      cell: ({ row }) => <span>{row.original.dtype || '-'}</span>,
    },
    {
      accessorKey: 'did',
      header: '设备ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs" title={row.original.did || ''}>
          {row.original.did ? truncate(row.original.did, 20) : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'ip',
      header: 'IP',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.ip || '-'}</span>,
    },
    {
      accessorKey: 'created_at',
      header: '申请时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: 'body',
      header: '原始数据',
      cell: ({ row }) => (
        <span className="block max-w-[280px] truncate font-mono text-xs text-muted-foreground" title={row.original.body || ''}>
          {row.original.body ? truncate(row.original.body, 100) : '-'}
        </span>
      ),
    },
  ]

  const items = data?.items || []
  const pagination = data

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载注销申请数据..." />
  }

  if (error) {
    return <ErrorState message="加载注销申请数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="注销申请"
        description="查看用户账号注销申请记录（审计）"
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="w-28"
              placeholder="UID"
              value={uidInput}
              onChange={(e) => setUidInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Input
              className="w-56"
              placeholder="账号/昵称关键词"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Input
              className="w-56"
              placeholder="开始时间(RFC3339/毫秒)"
              value={fromTsInput}
              onChange={(e) => setFromTsInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Input
              className="w-56"
              placeholder="结束时间(RFC3339/毫秒)"
              value={toTsInput}
              onChange={(e) => setToTsInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch}>
              <Search className="mr-2 h-4 w-4" />
              搜索
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={isExporting}>
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? '导出中...' : '导出CSV'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable table={table} />
          {pagination && (
            <DataTablePagination
              page={pagination.page}
              pageSize={pagination.size}
              total={pagination.total}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              dataUpdatedAt={dataUpdatedAt}
              onRefresh={() => refetch()}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
