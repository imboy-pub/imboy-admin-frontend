import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, UserX, UserCheck, Eye, Loader2, PanelRightOpen, Download, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, LoadingState, ErrorState, StatusBadge, DataTable, DataTablePagination, FilterBar, BatchActionBar, EntityDrawer, ConfirmDialog } from '@/components/shared'
import { pushNotification } from '@/components/shared/NotificationPanel'
import { getUserListPayload, getUserDetailPayload, banUser, unbanUser, UserListParams } from '@/modules/identity/api'
import { User } from '@/types/user'
import { formatDate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import { ColumnDef, RowSelectionState, useReactTable, getCoreRowModel, getSortedRowModel, SortingState, VisibilityState } from '@tanstack/react-table'
import { useListQueryState } from '@/hooks/useListQueryState'
import { trackUxEvent } from '@/lib/uxTelemetry'

type UserListPageQuery = {
  page: number
  size: number
  status: number
  keyword: string
}

const columnLabels: Record<string, string> = {
  select: '选择',
  id: 'ID',
  account: '账号',
  nickname: '昵称',
  email: '邮箱',
  mobile: '手机',
  status: '状态',
  created_at: '注册时间',
  actions: '操作',
}

export function UserListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { state: params, setState: setParams, resetState: resetParams } = useListQueryState<UserListPageQuery>({
    page: 1,
    size: 10,
    status: -1,
    keyword: '',
  })
  const [searchKeyword, setSearchKeyword] = useState(params.keyword || '')
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [showColumnPanel, setShowColumnPanel] = useState(false)
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean
    type: 'ban' | 'unban'
    uid: string | number
    nickname: string
  } | null>(null)

  const requestParams: UserListParams = {
    page: params.page,
    size: params.size,
    status: params.status,
    keyword: params.keyword.trim() || undefined,
  }

  // 获取用户列表
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['users', requestParams],
    queryFn: () => getUserListPayload(requestParams),
  })

  const {
    data: drawerUserDetail,
    isLoading: drawerLoading,
    error: drawerError,
  } = useQuery({
    queryKey: ['users', 'detail', drawerUserId],
    queryFn: () => getUserDetailPayload(drawerUserId || ''),
    enabled: Boolean(drawerUserId),
    retry: false,
  })

  // 封禁用户
  const banMutation = useMutation({
    mutationFn: banUser,
    onSuccess: () => {
      toast.success('用户已封禁')
      pushNotification({ type: 'warning', title: '用户封禁', message: `管理员执行了用户封禁操作` })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: Error) => {
      toast.error(`封禁失败: ${error.message}`)
    },
  })

  // 解封用户
  const unbanMutation = useMutation({
    mutationFn: unbanUser,
    onSuccess: () => {
      toast.success('用户已解封')
      pushNotification({ type: 'info', title: '用户解封', message: `管理员执行了用户解封操作` })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: Error) => {
      toast.error(`解封失败: ${error.message}`)
    },
  })

  // 批量封禁用户
  const batchBanMutation = useMutation({
    mutationFn: async ({ uids }: { uids: string[] }) =>
      Promise.allSettled(uids.map((uid) => banUser(uid))),
    onSuccess: (results) => {
      const successCount = results.filter((item) => item.status === 'fulfilled').length
      const failedCount = results.length - successCount

      if (successCount > 0) {
        toast.success(`批量封禁完成：成功 ${successCount} 个`)
        pushNotification({ type: 'warning', title: '批量封禁', message: `批量封禁 ${successCount} 个用户账号` })
      }
      if (failedCount > 0) {
        toast.error(`批量封禁失败：${failedCount} 个`)
      }

      queryClient.invalidateQueries({ queryKey: ['users'] })
      setRowSelection({})
    },
    onError: (error: Error) => {
      toast.error(`批量封禁失败: ${error.message}`)
    },
  })

  // 批量解封用户
  const batchUnbanMutation = useMutation({
    mutationFn: async ({ uids }: { uids: string[] }) =>
      Promise.allSettled(uids.map((uid) => unbanUser(uid))),
    onSuccess: (results) => {
      const successCount = results.filter((item) => item.status === 'fulfilled').length
      const failedCount = results.length - successCount

      if (successCount > 0) {
        toast.success(`批量解封完成：成功 ${successCount} 个`)
        pushNotification({ type: 'info', title: '批量解封', message: `批量解封 ${successCount} 个用户账号` })
      }
      if (failedCount > 0) {
        toast.error(`批量解封失败：${failedCount} 个`)
      }

      queryClient.invalidateQueries({ queryKey: ['users'] })
      setRowSelection({})
    },
    onError: (error: Error) => {
      toast.error(`批量解封失败: ${error.message}`)
    },
  })

  // 导出当前列表数据
  const handleExportCsv = () => {
    const csvColumns: CsvColumn<User>[] = [
      { header: 'ID', accessor: 'id' },
      { header: '账号', accessor: 'account' },
      { header: '昵称', accessor: 'nickname' },
      { header: '邮箱', accessor: (row) => row.email || '-' },
      { header: '手机', accessor: (row) => row.mobile || '-' },
      { header: '状态', accessor: (row) => ({ 1: '正常', 0: '禁用', '-1': '已删除' }[String(row.status)] || String(row.status)) },
      { header: '注册时间', accessor: (row) => formatDate(row.created_at) },
    ]
    exportCsv(csvColumns, users, 'users_export')
    toast.success(`已导出 ${users.length} 条用户数据`)
  }

  // 搜索处理
  const handleSearch = () => {
    trackUxEvent('ux_filter_apply', {
      page: 'user_list',
      keyword: searchKeyword.trim(),
      status: Number(statusFilter),
    })
    setRowSelection({})
    setParams({
      page: 1,
      keyword: searchKeyword.trim(),
      status: Number(statusFilter),
    })
  }

  const handleReset = () => {
    setRowSelection({})
    setSearchKeyword('')
    setStatusFilter('-1')
    resetParams({
      page: 1,
      size: 10,
      status: -1,
      keyword: '',
    })
  }

  // 分页处理
  const handlePageChange = (page: number) => {
    setRowSelection({})
    setParams({ page })
  }

  const handlePageSizeChange = (size: number) => {
    setRowSelection({})
    setParams({ page: 1, size })
  }

  const openUserDrawer = (userId: string | number) => {
    const normalizedUserId = String(userId)
    setDrawerUserId(normalizedUserId)
    trackUxEvent('ux_drawer_open', {
      entity: 'user',
      entity_id: normalizedUserId,
      source: 'user_list',
    })
  }

  // 表格列定义
  const columns: ColumnDef<User>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="全选当前页用户"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-input align-middle"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`选择用户 ${row.original.id}`}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-input align-middle disabled:opacity-40"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.id}</span>,
    },
    {
      accessorKey: 'account',
      header: '账号',
      cell: ({ row }) => <span className="font-medium">{row.original.account}</span>,
    },
    {
      accessorKey: 'nickname',
      header: '昵称',
    },
    {
      accessorKey: 'email',
      header: '邮箱',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.email || '-'}</span>
      ),
    },
    {
      accessorKey: 'mobile',
      header: '手机',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.mobile || '-'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
          variants={{ 1: 'success', 0: 'error', '-1': 'secondary' }}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '注册时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="快速查看"
            onClick={(event) => {
              event.stopPropagation()
              openUserDrawer(row.original.id)
            }}
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="查看详情"
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/users/${row.original.id}`)
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {row.original.status === 1 ? (
            <Button
              variant="ghost"
              size="icon"
              title="封禁用户"
              onClick={(event) => {
                event.stopPropagation()
                setConfirmAction({
                  open: true,
                  type: 'ban',
                  uid: row.original.id,
                  nickname: row.original.nickname || row.original.account,
                })
              }}
              disabled={banMutation.isPending}
            >
              {banMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserX className="h-4 w-4 text-destructive" />
              )}
            </Button>
          ) : row.original.status === 0 ? (
            <Button
              variant="ghost"
              size="icon"
              title="解封用户"
              onClick={(event) => {
                event.stopPropagation()
                setConfirmAction({
                  open: true,
                  type: 'unban',
                  uid: row.original.id,
                  nickname: row.original.nickname || row.original.account,
                })
              }}
              disabled={unbanMutation.isPending}
            >
              {unbanMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4 text-green-600" />
              )}
            </Button>
          ) : null}
        </div>
      ),
    },
  ]

  const users = data?.items || []
  const pagination = data

  const table = useReactTable({
    data: users,
    columns,
    state: {
      rowSelection,
      sorting,
      columnVisibility,
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    enableRowSelection: (row) => row.original.status !== -1,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const selectedUsers = table.getSelectedRowModel().rows.map((row) => row.original)
  const selectedActiveUserIds = selectedUsers
    .filter((item) => item.status === 1)
    .map((item) => String(item.id))
  const selectedBannedUserIds = selectedUsers
    .filter((item) => item.status === 0)
    .map((item) => String(item.id))

  if (isLoading) {
    return <LoadingState message="加载用户数据..." />
  }

  if (error) {
    return <ErrorState message="加载用户数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户管理"
        description="管理系统用户账户"
      />

      <Card>
        <CardHeader>
          <FilterBar
            onSearch={handleSearch}
            onReset={handleReset}
          >
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索账号/昵称/邮箱..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <select
              className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="-1">全部状态</option>
              <option value="1">正常</option>
              <option value="0">禁用</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={users.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowColumnPanel((v) => !v)}
              >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                列显示
              </Button>
              {showColumnPanel && (
                <div className="absolute right-0 top-10 z-20 w-56 rounded-md border bg-background p-3 shadow-lg">
                  <div className="mb-2 text-xs text-muted-foreground">自定义列表列显示</div>
                  <div className="space-y-2">
                    {table.getAllLeafColumns().filter((col) => col.getCanHide()).map((column) => (
                      <label
                        key={column.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={column.getIsVisible()}
                          onChange={column.getToggleVisibilityHandler()}
                        />
                        <span>{columnLabels[column.id] || column.id}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </FilterBar>
        </CardHeader>
        <CardContent>
          <BatchActionBar
            selectedCount={selectedUsers.length}
            onClear={() => setRowSelection({})}
            actions={[
              {
                key: 'batch-ban',
                label: '批量封禁',
                variant: 'destructive',
                permission: 'users:read',
                roles: [1, 2],
                riskLevel: 'medium',
                description: `将封禁 ${selectedActiveUserIds.length} 个用户账号。`,
                disabled: selectedActiveUserIds.length === 0 || batchUnbanMutation.isPending,
                loading: batchBanMutation.isPending,
                onExecute: async () => {
                  if (selectedActiveUserIds.length === 0) {
                    toast.error('当前选择中没有可封禁用户')
                    return
                  }
                  await batchBanMutation.mutateAsync({
                    uids: selectedActiveUserIds,
                  })
                },
              },
              {
                key: 'batch-unban',
                label: '批量解封',
                variant: 'default',
                permission: 'users:read',
                roles: [1, 2],
                riskLevel: 'low',
                description: `将解封 ${selectedBannedUserIds.length} 个用户账号。`,
                disabled: selectedBannedUserIds.length === 0 || batchBanMutation.isPending,
                loading: batchUnbanMutation.isPending,
                onExecute: async () => {
                  if (selectedBannedUserIds.length === 0) {
                    toast.error('当前选择中没有可解封用户')
                    return
                  }
                  await batchUnbanMutation.mutateAsync({
                    uids: selectedBannedUserIds,
                  })
                },
              },
            ]}
          />

          <DataTable
            table={table}
            onRowClick={(row) => navigate(`/users/${row.id}`)}
          />

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

      <EntityDrawer
        open={Boolean(drawerUserId)}
        onOpenChange={(open) => {
          if (!open) setDrawerUserId(null)
        }}
        title={drawerUserDetail?.nickname || `用户 ${drawerUserId || ''}`}
        subtitle="用户快速详情"
        loading={drawerLoading}
        error={drawerError ? '加载用户详情失败' : undefined}
        actions={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                if (!drawerUserId) return
                navigate(`/users/${drawerUserId}`)
                setDrawerUserId(null)
              }}
            >
              进入详情页
            </Button>
          </>
        )}
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">用户 ID</p>
                <p className="font-mono">{drawerUserDetail?.id || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">账号</p>
                <p>{drawerUserDetail?.account || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">昵称</p>
                <p>{drawerUserDetail?.nickname || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">状态</p>
                <StatusBadge
                  status={drawerUserDetail?.status ?? '-'}
                  labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
                  variants={{ 1: 'success', 0: 'error', '-1': 'secondary' }}
                />
              </div>
              <div>
                <p className="text-muted-foreground">邮箱</p>
                <p>{drawerUserDetail?.email || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">手机</p>
                <p>{drawerUserDetail?.mobile || '-'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3">
            <p className="mb-2 font-medium">运营统计</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-muted-foreground">设备数</p>
                <p className="font-mono">{drawerUserDetail?.device_count ?? 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">好友数</p>
                <p className="font-mono">{drawerUserDetail?.friend_count ?? 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">群组数</p>
                <p className="font-mono">{drawerUserDetail?.group_count ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      </EntityDrawer>

      {/* 封禁/解封确认弹窗 */}
      {confirmAction && (
        <ConfirmDialog
          open={confirmAction.open}
          onOpenChange={(open) => setConfirmAction(open ? confirmAction : null)}
          title={confirmAction.type === 'ban' ? '确认封禁用户' : '确认解封用户'}
          description={
            confirmAction.type === 'ban'
              ? `确定要封禁用户「${confirmAction.nickname}」吗？封禁后该用户将无法登录。`
              : `确定要解封用户「${confirmAction.nickname}」吗？解封后该用户可正常登录。`
          }
          confirmText={confirmAction.type === 'ban' ? '封禁' : '解封'}
          variant={confirmAction.type === 'ban' ? 'destructive' : 'default'}
          loading={confirmAction.type === 'ban' ? banMutation.isPending : unbanMutation.isPending}
          onConfirm={() => {
            if (confirmAction.type === 'ban') {
              banMutation.mutate(confirmAction.uid)
            } else {
              unbanMutation.mutate(confirmAction.uid)
            }
          }}
        />
      )}
    </div>
  )
}
