import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Activity, FileSearch, KeyRound, Plus, Shield, UserCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DataTable,
  DataTablePagination,
  EntityDrawer,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  StatsCard,
  StatusBadge,
} from '@/components/shared'
import {
  assignAdminRole,
  createAdmin,
  getAdminListPayload,
  type AdminListParams,
  type CreateAdminInput,
} from '@/services/api/admins'
import { getRoleListPayload } from '@/modules/identity'
import { useListQueryState } from '@/hooks/useListQueryState'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/utils'
import type { Admin } from '@/types/admin'

type AdminListPageQuery = {
  page: number
  size: number
  status: number
  role_id: number
  keyword: string
}

type RoleOption = {
  id: number
  name: string
}

type CreateAdminForm = {
  account: string
  pwd: string
  nickname: string
  email: string
  mobile: string
  role_id: number
  status: number
}

const DEFAULT_ROLE_OPTIONS: RoleOption[] = [
  { id: 1, name: '超级管理员' },
  { id: 2, name: '运营管理员' },
  { id: 3, name: '审计管理员' },
]

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (!error || typeof error !== 'object') return String(error)
  const record = error as { msg?: string; message?: string }
  if (typeof record.msg === 'string' && record.msg.length > 0) return record.msg
  if (typeof record.message === 'string' && record.message.length > 0) return record.message
  return String(error)
}

function buildInitialCreateForm(roleOptions: RoleOption[]): CreateAdminForm {
  return {
    account: '',
    pwd: '',
    nickname: '',
    email: '',
    mobile: '',
    role_id: roleOptions[0]?.id || 2,
    status: 1,
  }
}

export function AdminListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentAdminId = useAuthStore((state) => String(state.admin?.id || ''))

  const { state: params, setState: setParams, resetState: resetParams } = useListQueryState<AdminListPageQuery>({
    page: 1,
    size: 10,
    status: -1,
    role_id: -1,
    keyword: '',
  })

  const [searchKeyword, setSearchKeyword] = useState(params.keyword || '')
  const [statusFilter, setStatusFilter] = useState(String(params.status))
  const [roleFilter, setRoleFilter] = useState(String(params.role_id))
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)

  const { data: roleData } = useQuery({
    queryKey: ['roles', 'list', 'admin-page'],
    queryFn: () => getRoleListPayload(),
    retry: false,
  })

  const roleOptions = useMemo<RoleOption[]>(() => {
    const fromApi = roleData?.items
      ?.map((item) => ({ id: Number(item.id), name: item.name }))
      .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.name.length > 0) || []
    if (fromApi.length > 0) return fromApi
    return DEFAULT_ROLE_OPTIONS
  }, [roleData?.items])

  const [createForm, setCreateForm] = useState<CreateAdminForm>(() => buildInitialCreateForm(DEFAULT_ROLE_OPTIONS))

  const requestParams: AdminListParams = {
    page: params.page,
    size: params.size,
    status: params.status,
    keyword: params.keyword.trim() || undefined,
    role_id: params.role_id > 0 ? params.role_id : undefined,
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admins', requestParams],
    queryFn: () => getAdminListPayload(requestParams),
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateAdminInput) => createAdmin(input),
    onSuccess: () => {
      toast.success('管理员创建成功')
      setCreateDrawerOpen(false)
      setCreateForm(buildInitialCreateForm(roleOptions))
      queryClient.invalidateQueries({ queryKey: ['admins'] })
    },
    onError: (mutationError) => {
      toast.error(`创建管理员失败: ${getErrorMessage(mutationError)}`)
    },
  })

  const assignRoleMutation = useMutation({
    mutationFn: ({ adminId, roleId }: { adminId: string; roleId: number }) =>
      assignAdminRole({ admin_id: adminId, role_id: roleId }),
    onSuccess: () => {
      toast.success('管理员角色已更新')
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      queryClient.invalidateQueries({ queryKey: ['rbac', 'me'] })
    },
    onError: (mutationError) => {
      toast.error(`角色更新失败: ${getErrorMessage(mutationError)}`)
    },
  })

  const roleLabelMap = useMemo(() => {
    const map = new Map<number, string>()
    roleOptions.forEach((item) => map.set(item.id, item.name))
    return map
  }, [roleOptions])

  const effectiveCreateRoleId = roleOptions.some((item) => item.id === createForm.role_id)
    ? createForm.role_id
    : (roleOptions[0]?.id || 2)

  const resolveRoleLabel = (roleId: number): string => {
    const matched = roleLabelMap.get(roleId)
    if (matched) return matched
    return `角色 #${roleId}`
  }

  const handleSearch = () => {
    setParams({
      page: 1,
      keyword: searchKeyword.trim(),
      status: Number(statusFilter),
      role_id: Number(roleFilter),
    })
  }

  const handleReset = () => {
    setSearchKeyword('')
    setStatusFilter('-1')
    setRoleFilter('-1')
    resetParams({
      page: 1,
      size: 10,
      status: -1,
      role_id: -1,
      keyword: '',
    })
  }

  const handlePageChange = (page: number) => {
    setParams({ page })
  }

  const handlePageSizeChange = (size: number) => {
    setParams({ page: 1, size })
  }

  const handleRoleChange = (admin: Admin, nextRoleRaw: string) => {
    const nextRole = Number(nextRoleRaw)
    if (!Number.isFinite(nextRole) || nextRole <= 0) return
    if (nextRole === admin.role_id) return

    if (String(admin.id) === currentAdminId) {
      toast.error('当前登录管理员角色不可在此页直接修改')
      return
    }

    assignRoleMutation.mutate({
      adminId: String(admin.id),
      roleId: Math.floor(nextRole),
    })
  }

  const handleCreateAdmin = () => {
    const account = createForm.account.trim()
    const pwd = createForm.pwd.trim()

    if (account.length < 3) {
      toast.error('账号长度至少 3 位')
      return
    }
    if (pwd.length < 6) {
      toast.error('密码长度至少 6 位')
      return
    }
    if (!Number.isFinite(effectiveCreateRoleId) || effectiveCreateRoleId <= 0) {
      toast.error('请选择角色')
      return
    }

    createMutation.mutate({
      account,
      pwd,
      nickname: createForm.nickname.trim(),
      email: createForm.email.trim(),
      mobile: createForm.mobile.trim(),
      role_id: effectiveCreateRoleId,
      status: createForm.status,
    })
  }

  const adminRows = data?.items || []
  const totalAdmins = data?.total || adminRows.length
  const activeCount = adminRows.filter((item) => item.status === 1).length
  const disabledCount = adminRows.filter((item) => item.status !== 1).length

  const columns: ColumnDef<Admin>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: 'account',
      header: '账号',
      cell: ({ row }) => <span className="font-medium">{row.original.account}</span>,
    },
    {
      accessorKey: 'nickname',
      header: '昵称',
      cell: ({ row }) => row.original.nickname || '-',
    },
    {
      accessorKey: 'role_id',
      header: '角色',
      cell: ({ row }) => {
        const admin = row.original
        const isCurrent = String(admin.id) === currentAdminId
        return (
          <div className="flex min-w-44 items-center gap-2">
            <select
              value={String(admin.role_id)}
              onChange={(event) => handleRoleChange(admin, event.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
              disabled={assignRoleMutation.isPending || isCurrent}
            >
              {roleOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            {isCurrent && <span className="text-xs text-muted-foreground">当前</span>}
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
          variants={{ 1: 'success', 0: 'warning', '-1': 'secondary' }}
        />
      ),
    },
    {
      accessorKey: 'login_count',
      header: '登录次数',
      cell: ({ row }) => <span className="font-mono">{row.original.login_count || 0}</span>,
    },
    {
      accessorKey: 'last_login_ip',
      header: '最后登录 IP',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.last_login_ip || '-'}</span>,
    },
    {
      accessorKey: 'last_login_at',
      header: '最后登录时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.last_login_at ? formatDate(row.original.last_login_at) : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.created_at ? formatDate(row.original.created_at) : '-'}
        </span>
      ),
    },
  ]

  const table = useReactTable({
    data: adminRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载管理员列表..." />
  }

  if (error) {
    return <ErrorState message="加载管理员列表失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="管理员中心"
        description="支持管理员账号创建、角色分配与会话审计"
        actions={(
          <>
            <Button variant="outline" onClick={() => navigate('/roles')}>
              <KeyRound className="mr-2 h-4 w-4" />
              角色权限
            </Button>
            <Button variant="outline" onClick={() => navigate('/logs')}>
              <FileSearch className="mr-2 h-4 w-4" />
              审计日志
            </Button>
            <Button onClick={() => setCreateDrawerOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              新增管理员
            </Button>
          </>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="管理员总数"
          value={totalAdmins}
          description="基于当前筛选结果"
          icon={UserCircle}
        />
        <StatsCard
          title="正常账号"
          value={activeCount}
          description={`异常/禁用 ${disabledCount}`}
          icon={Shield}
        />
        <StatsCard
          title="筛选角色"
          value={params.role_id > 0 ? resolveRoleLabel(params.role_id) : '全部角色'}
          description={data?.source === 'current' ? '当前为接口降级视图' : '已连接管理员列表接口'}
          icon={Activity}
        />
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle>管理员列表</CardTitle>
          {data?.source === 'current' && (
            <p className="text-sm text-amber-700">
              管理员列表接口未就绪，当前展示降级数据（仅当前登录管理员）。
            </p>
          )}
          <FilterBar onSearch={handleSearch} onReset={handleReset}>
            <Input
              placeholder="搜索账号 / 昵称"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              className="w-[220px]"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="-1">全部状态</option>
              <option value="1">正常</option>
              <option value="0">禁用</option>
            </select>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="-1">全部角色</option>
              {roleOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </FilterBar>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable table={table} emptyMessage="暂无管理员数据" />
          <DataTablePagination
            page={params.page}
            pageSize={params.size}
            total={data?.total || 0}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </CardContent>
      </Card>

      <EntityDrawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        title="新增管理员"
        subtitle="创建后台管理员账号并分配初始角色"
        actions={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDrawerOpen(false)
                setCreateForm(buildInitialCreateForm(roleOptions))
              }}
              disabled={createMutation.isPending}
            >
              取消
            </Button>
            <Button onClick={handleCreateAdmin} disabled={createMutation.isPending}>
              {createMutation.isPending ? '创建中...' : '确认创建'}
            </Button>
          </>
        )}
      >
        <div className="grid gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">账号 *</label>
            <Input
              placeholder="请输入管理员账号"
              value={createForm.account}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, account: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">密码 *</label>
            <Input
              type="password"
              placeholder="至少 6 位"
              value={createForm.pwd}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, pwd: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">昵称</label>
            <Input
              placeholder="可选"
              value={createForm.nickname}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, nickname: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">邮箱</label>
            <Input
              placeholder="可选"
              value={createForm.email}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">手机号</label>
            <Input
              placeholder="可选"
              value={createForm.mobile}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, mobile: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">角色 *</label>
              <select
                value={String(effectiveCreateRoleId)}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, role_id: Number(event.target.value) }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {roleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">状态</label>
              <select
                value={String(createForm.status)}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, status: Number(event.target.value) }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="1">正常</option>
                <option value="0">禁用</option>
              </select>
            </div>
          </div>
        </div>
      </EntityDrawer>
    </div>
  )
}
