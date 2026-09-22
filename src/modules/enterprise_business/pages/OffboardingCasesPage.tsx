import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { ListChecks } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  CursorPaginationBar,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/shared'
import { OrganizationWorkspacePicker, type OrganizationWorkspaceValue } from '@/components/shared/OrganizationWorkspacePicker'
import { parseOrgWorkspaceQuery, serializeOrgWorkspaceQuery } from '@/components/shared/orgWorkspaceQuery'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import { getEbOffboardingCases } from '../api/public'
import { useOrganizationOptions, useWorkspaceOptions } from './useOrgWorkspaceOptions'
import {
  classifyListFailure,
  hasOffboardingFailures,
  listFailureMessage,
  offboardingStatusLabel,
  parseOffboardingStatusFilter,
  type EbOffboardingCase,
} from '../api/pureFunctions'

const READ_PERMISSION = 'enterprise_business:read'

type ListState = {
  status: string
  limit: number
}

/**
 * 平台离岗交接 case 列表页（W2 冻结合同 W2-ADMIN 段）。
 *
 * GET /api/adm/enterprise-business/organizations/:org_id/offboarding/cases
 *   （workspace_id 必填；status 6 态过滤；after_id+limit 键集分页）。
 * 失败聚合（item_failed>0）显示「失败项 N」徽标；case 投影走冻结合同白名单，
 * digest/secret/cipher/object_key 永不渲染（CS-03-A05）。
 *
 * 组织/工作区上下文统一走共享的 OrganizationWorkspacePicker，选中值经
 * parseOrgWorkspaceQuery / serializeOrgWorkspaceQuery 读写进 URL（org / ws 参数），
 * 刷新与分享后不丢失。
 */
export function OffboardingCasesPage() {
  const navigate = useNavigate()
  const { state, setState } = useListQueryState<ListState>({ status: 'all', limit: 50 })
  const [searchParams, setSearchParams] = useSearchParams()
  // URL 是上下文真源：org/ws 由共享 codec 解析（安全降级），刷新/分享后不丢失。
  const { org, ws } = parseOrgWorkspaceQuery(searchParams)
  const organizationId = org ?? ''
  const workspaceId = ws ?? ''
  const scopeReady = org !== null && ws !== null
  const status = parseOffboardingStatusFilter(state.status)
  const limit = state.limit

  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  // 组织/工作区可选项：消费既有 org API，映射为共享 picker 所需结构。
  const orgOptionsQuery = useOrganizationOptions(readReady)
  const wsOptionsQuery = useWorkspaceOptions(org, readReady)

  const [cursor, setCursor] = useState<EntityId | null>(null)
  const [cursorStack, setCursorStack] = useState<Array<EntityId | null>>([])
  const [pageNo, setPageNo] = useState(1)

  const resetCursor = () => {
    setCursor(null)
    setCursorStack([])
    setPageNo(1)
  }

  // 选中变化写回 URL（org/ws 由 codec 序列化，其他参数原样保留）并重置游标。
  const handleScopeChange = (next: OrganizationWorkspaceValue) => {
    resetCursor()
    const qs = serializeOrgWorkspaceQuery({ org: next.organizationId, ws: next.workspaceId }, searchParams)
    setSearchParams(qs ? `?${qs}` : '', { replace: true })
  }

  const query = useQuery({
    queryKey: ['enterprise_business', 'offboarding-cases', organizationId, workspaceId, status, limit, cursor],
    queryFn: () => getEbOffboardingCases({ organizationId, workspaceId }, { status, afterId: cursor, limit }),
    enabled: scopeReady && readReady,
  })

  const updateScope = (patch: Partial<ListState>) => {
    setState(patch)
    resetCursor()
  }

  const goToNext = () => {
    const next = query.data?.next_after_id ?? null
    if (next === null) return
    setCursorStack((prev) => [...prev, cursor])
    setCursor(next)
    setPageNo((prev) => prev + 1)
  }

  const goToPrev = () => {
    if (cursorStack.length === 0) return
    const last = cursorStack[cursorStack.length - 1] ?? null
    setCursorStack((prev) => prev.slice(0, -1))
    setCursor(last)
    setPageNo((prev) => Math.max(1, prev - 1))
  }

  const rows = useMemo(() => query.data?.cases ?? [], [query.data])

  const openDetail = useCallback(
    (caseRow: EbOffboardingCase) => {
      const qs = serializeOrgWorkspaceQuery({ org, ws })
      navigate(
        `/enterprise-business/offboarding/${encodeURIComponent(caseRow.id)}${qs ? `?${qs}` : ''}`
      )
    },
    [navigate, org, ws]
  )

  const columns = useMemo<LegacyColumnDef<EbOffboardingCase>[]>(
    () => [
      {
        header: 'Case ID',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      {
        header: '状态',
        cell: ({ row }) => <CaseStatusBadge status={row.original.status} />,
      },
      {
        header: '离岗人（leaver）',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.leaver_user_id || '-'}</span>,
      },
      {
        header: '接任人（successor）',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.successor_user_id || '-'}</span>,
      },
      {
        header: '交接进度',
        cell: ({ row }) => `${row.original.item_success} / ${row.original.item_total}`,
      },
      {
        header: '失败项',
        cell: ({ row }) =>
          hasOffboardingFailures(row.original) ? (
            <Badge variant="destructive" data-testid="offboarding-failed-badge">
              失败项 {row.original.item_failed}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      { header: '原因码', cell: ({ row }) => row.original.reason ?? '-' },
      {
        header: '创建时间',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.created_at ?? '-'}</span>,
      },
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

  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  let body: ReactElement
  if (!scopeReady) {
    body = (
      <EmptyState
        icon={<ListChecks className="h-8 w-8" />}
        title="请先填写组织与工作区"
        description="平台面不存在无租户条件的全局列举：查询必须携带 organization_id 与 workspace_id。"
      />
    )
  } else if (!readReady) {
    body = <EmptyState title="无查看权限" description="查看离岗交接需要 enterprise_business:read 权限。" />
  } else if (query.error) {
    const failure = classifyListFailure(query.error)
    body = (
      <ErrorState
        message={`加载离岗交接列表失败：${listFailureMessage(failure)}（${getErrorMessage(query.error)}）`}
        onRetry={() => void query.refetch()}
      />
    )
  } else {
    body = (
      <div className="space-y-3">
        <DataTable table={table} loading={query.isLoading} emptyMessage="暂无离岗交接 case（当前过滤条件下没有记录）" />
        <CursorPaginationBar
          page={pageNo}
          pageRows={rows.length}
          canPrev={cursorStack.length > 0}
          canNext={query.data?.next_after_id != null}
          limit={limit}
          loading={query.isFetching}
          onPrev={goToPrev}
          onNext={goToNext}
          onLimitChange={(next) => updateScope({ limit: next })}
          onRefresh={() => void query.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4" data-page="eb-offboarding-cases">
      <PageHeader
        title="离岗交接"
        description="企业离岗交接 case 平台视角（enterprise_business:read）。失败项可在详情页执行幂等重试（需 enterprise_business:write）。"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">租户范围（必填）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <OrganizationWorkspacePicker
            organizationId={org}
            workspaceId={ws}
            organizations={orgOptionsQuery.data ?? []}
            workspaces={wsOptionsQuery.data ?? []}
            loading={orgOptionsQuery.isLoading || wsOptionsQuery.isLoading}
            disabled={!readReady}
            onChange={handleScopeChange}
            onOrganizationChange={() => {
              // 工作区维度已在 onChange 中重置为 null；按新 organizationId 重新拉取工作区列表。
              void wsOptionsQuery.refetch()
            }}
          />
          {scopeReady ? (
            <div
              className="rounded-md border bg-muted/40 p-3 text-xs"
              data-testid="eb-off-scope-troubleshooting"
            >
              <div className="mb-1 font-medium text-muted-foreground">高级排障（只读，可复制）</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono">
                <span>org: {org}</span>
                <span>ws: {ws}</span>
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="eb-off-status">状态过滤（status）</Label>
            <Select
              id="eb-off-status"
              value={status}
              onChange={(event) => updateScope({ status: event.target.value })}
            >
              <option value="all">全部</option>
              <option value="draft">草稿（draft）</option>
              <option value="frozen">已冻结（frozen）</option>
              <option value="transferring">交接中（transferring）</option>
              <option value="verifying">校验中（verifying）</option>
              <option value="completed">已完成（completed）</option>
              <option value="failed">有失败项（failed）</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">离岗交接 case 列表</CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  )
}

function CaseStatusBadge({ status }: { status: string }) {
  const variantClass =
    status === 'failed'
      ? 'bg-destructive text-destructive-foreground'
      : status === 'completed'
        ? 'bg-green-100 text-green-800'
        : status === 'draft'
          ? 'bg-muted text-muted-foreground'
          : 'bg-amber-100 text-amber-800'
  return (
    <Badge className={variantClass} data-status={status}>
      {offboardingStatusLabel(status)}
    </Badge>
  )
}
