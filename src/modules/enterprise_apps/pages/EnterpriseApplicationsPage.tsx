import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { DataTable, DataTablePagination, EmptyState, ErrorState, PageHeader } from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, READ_PERMISSION, GOVERNANCE_BACKEND_WIRED } from '../api/contracts'
import {
  applicationStatusLabel,
  classifyGovernanceFailure,
  governanceFailureMessage,
  type ApiErrorLike,
  type ApplicationSummary,
} from '../api/pureFunctions'
import { listApplications } from '../api/public'

type ListState = {
  org: string
  status: string
  q: string
  page: number
  size: number
}

function toApiError(err: unknown): ApiErrorLike | null {
  return err && typeof err === 'object' ? (err as ApiErrorLike) : null
}

/**
 * Admin 企业应用治理 — Application 列表（`/enterprise/applications`）。
 *
 * 平台面无「无租户条件的全局列举」：必须显式给 organization_id（与
 * `/enterprise-business`、`/organizations` 的平台面约定一致）。
 * 未接线（404 / PENDING_A0_WIRING）时展示诚实失败提示，不伪造数据。
 */
export function EnterpriseApplicationsPage() {
  const navigate = useNavigate()
  const { state, setState } = useListQueryState<ListState>({
    org: '',
    status: '',
    q: '',
    page: 1,
    size: 10,
  })

  const organizationId = state.org.trim()
  const scopeReady = organizationId.length > 0
  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  const query = useQuery({
    queryKey: ['enterprise_apps', 'applications', organizationId, state.status, state.q, state.page, state.size],
    queryFn: () =>
      listApplications(organizationId, {
        page: state.page,
        size: state.size,
        status: state.status.length > 0 ? state.status : undefined,
        q: state.q.trim().length > 0 ? state.q.trim() : undefined,
      }),
    enabled: scopeReady && readReady,
  })

  const updateScope = useCallback(
    (patch: Partial<ListState>) => {
      // 分页/筛选变化时重置 page=1（仓内规范）
      setState({ ...patch, page: patch.page ?? 1 })
    },
    [setState]
  )

  const openDetail = useCallback(
    (row: ApplicationSummary) => {
      navigate(`/enterprise/applications/${encodeURIComponent(row.id)}?org_id=${encodeURIComponent(organizationId)}`)
    },
    [navigate, organizationId]
  )

  const columns = useMemo<LegacyColumnDef<ApplicationSummary>[]>(
    () => [
      { header: 'Application ID', cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span> },
      { header: '名称', cell: ({ row }) => row.original.name || '-' },
      {
        header: '生命周期',
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === 'active'
                ? 'secondary'
                : row.original.status === 'unknown'
                  ? 'destructive'
                  : 'outline'
            }
            data-testid={`app-status-${row.original.id}`}
          >
            {applicationStatusLabel(row.original.status)}
          </Badge>
        ),
      },
      { header: 'scope 数', cell: ({ row }) => row.original.scopes.length },
      { header: 'version', cell: ({ row }) => row.original.version },
      { header: '更新时间', cell: ({ row }) => <span className="font-mono text-xs">{row.original.updatedAt || '-'}</span> },
      {
        header: '操作',
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => openDetail(row.original)}>
            详情
          </Button>
        ),
      },
    ],
    [openDetail]
  )

  const rows = useMemo(() => query.data?.items ?? [], [query.data])
  const table = useLegacyTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  const failureKind = query.error ? classifyGovernanceFailure(toApiError(query.error), { wired: GOVERNANCE_BACKEND_WIRED }) : null

  let body
  if (!scopeReady) {
    body = (
      <EmptyState
        icon={<Building2 className="h-8 w-8" />}
        title="请先填写组织 ID"
        description="Admin 平台面没有无租户条件的全局列举：查询必须携带 organization_id。"
      />
    )
  } else if (!readReady) {
    body = <EmptyState title="无查看权限" description={`查看企业应用需要 ${READ_PERMISSION} 权限。`} />
  } else if (failureKind !== null) {
    body = (
      <ErrorState
        message={`加载应用列表失败：${governanceFailureMessage(failureKind)}`}
        onRetry={() => void query.refetch()}
      />
    )
  } else {
    body = (
      <div className="space-y-3">
        <DataTable
          table={table}
          loading={query.isLoading}
          emptyMessage="该组织下暂无企业应用（或当前过滤条件无命中）"
        />
        <DataTablePagination
          page={state.page}
          pageSize={state.size}
          total={query.data?.total ?? 0}
          onPageChange={(page) => setState({ page })}
          onPageSizeChange={(size) => updateScope({ size })}
          dataUpdatedAt={query.dataUpdatedAt}
          onRefresh={() => void query.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4" data-page="enterprise-applications">
      <PageHeader
        title="企业应用治理"
        description={`Application 列表 / 生命周期 / scope / 凭证 / 授权（${READ_PERMISSION} 读；${'enterprise_business:write'} 可写）。`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">组织范围（必填）</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ea-org">组织 ID（organization_id）</Label>
            <Input
              id="ea-org"
              value={state.org}
              inputMode="numeric"
              onChange={(event) => updateScope({ org: event.target.value })}
              placeholder="TSID，例如 1234567890123456789"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ea-status">生命周期过滤</Label>
            <Select id="ea-status" value={state.status} onChange={(event) => updateScope({ status: event.target.value })}>
              <option value="">全部</option>
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {APPLICATION_STATUS_LABELS[status]}（{status}）
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ea-q">关键字</Label>
            <Input
              id="ea-q"
              value={state.q}
              onChange={(event) => updateScope({ q: event.target.value })}
              placeholder="应用名称/关键字"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application 列表</CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  )
}
