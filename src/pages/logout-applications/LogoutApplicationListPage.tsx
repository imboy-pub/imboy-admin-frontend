import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Search, Download, XCircle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  exportLogoutApplicationCsvBlob,
  getLogoutApplicationListPayload,
  rejectLogoutApplication,
  approveLogoutApplication,
} from '@/services/api/logoutApplications'
import { formatDate, truncate } from '@/lib/utils'
import { LogoutApplication, LogoutApplicationListParams } from '@/types/logoutApplication'
import { getErrorMessage } from '@/lib/errorUtils'
import { useAdminPermission } from '@/hooks/useAdminPermission'

export function LogoutApplicationListPage() {
  const queryClient = useQueryClient()
  const [params, setParams] = useState<LogoutApplicationListParams>({
    page: 1,
    size: 10,
  })
  const [uidInput, setUidInput] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [fromTsInput, setFromTsInput] = useState('')
  const [toTsInput, setToTsInput] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [confirmUid, setConfirmUid] = useState<string | null>(null)
  const [approveConfirmUid, setApproveConfirmUid] = useState<string | null>(null)
  const { allowed: canApprove } = useAdminPermission({
    permission: 'logout_applications:approve',
    roles: [1, 2],
  })

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['logout-applications', params],
    queryFn: () => getLogoutApplicationListPayload(params),
  })

  const rejectMutation = useMutation({
    mutationFn: (uid: string) => rejectLogoutApplication(uid),
    onSuccess: () => {
      toast.success('已驳回注销申请')
      void queryClient.invalidateQueries({ queryKey: ['logout-applications'] })
    },
    onError: (err: unknown) => {
      toast.error(`驳回失败: ${getErrorMessage(err)}`)
    },
    onSettled: () => {
      setConfirmUid(null)
    },
  })

  const approveMutation = useMutation({
    mutationFn: (uid: string) => approveLogoutApplication(uid),
    onSuccess: () => {
      toast.success('注销申请已审批通过')
      void queryClient.invalidateQueries({ queryKey: ['logout-applications'] })
    },
    onError: (err: unknown) => {
      toast.error(`审批失败: ${getErrorMessage(err)}`)
    },
    onSettled: () => {
      setApproveConfirmUid(null)
    },
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
      const msg = err instanceof Error ? getErrorMessage(err) : '导出失败'
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
      accessorKey: 'user_status',
      header: '状态',
      cell: ({ row }) => {
        const status = row.original.user_status
        if (status === 2) return <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">注销中</span>
        if (status === 1) return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">已驳回</span>
        if (status === -1) return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">已删除</span>
        return <span className="text-muted-foreground">-</span>
      },
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
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const status = row.original.user_status
        if (status !== 2) return <span className="text-muted-foreground text-xs">-</span>
        if (!canApprove) return <span className="text-muted-foreground text-xs">无权限</span>
        return (
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmUid(String(row.original.uid))}
            >
              <XCircle className="mr-1 h-3 w-3" />
              驳回
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setApproveConfirmUid(String(row.original.uid))}
            >
              <CheckCircle className="mr-1 h-3 w-3" />
              通过
            </Button>
          </div>
        )
      },
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

      <ConfirmDialog
        open={canApprove && confirmUid !== null}
        onOpenChange={(open) => { if (!open) setConfirmUid(null) }}
        title="确认驳回"
        description={`确定要驳回用户 ${confirmUid ?? ''} 的注销申请吗？用户账号将恢复正常状态。`}
        confirmText="驳回"
        onConfirm={() => {
          if (confirmUid) void rejectMutation.mutateAsync(confirmUid)
        }}
        variant="destructive"
        loading={rejectMutation.isPending}
      />

      <ConfirmDialog
        open={canApprove && approveConfirmUid !== null}
        onOpenChange={(open) => { if (!open) setApproveConfirmUid(null) }}
        title="确认审批通过"
        description={`确定要审批通过用户 ${approveConfirmUid ?? ''} 的注销申请吗？该操作将注销用户账号，不可恢复。`}
        confirmText="确认通过"
        onConfirm={() => {
          if (approveConfirmUid) void approveMutation.mutateAsync(approveConfirmUid)
        }}
        variant="destructive"
        loading={approveMutation.isPending}
      />
    </div>
  )
}
