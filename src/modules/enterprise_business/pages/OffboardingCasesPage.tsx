import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { ListChecks } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  CursorPaginationBar,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import { getEbOffboardingCases } from '../api/public'
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
  org: string
  ws: string
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
 */
export function OffboardingCasesPage() {
  const navigate = useNavigate()
  const { state, setState } = useListQueryState<ListState>({ org: '', ws: '', status: 'all', limit: 50 })

  const organizationId = state.org.trim()
  const workspaceId = state.ws.trim()
  const scopeReady = organizationId.length > 0 && workspaceId.length > 0
  const status = parseOffboardingStatusFilter(state.status)
  const limit = state.limit

  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  const [cursor, setCursor] = useState<EntityId | null>(null)
  const [cursorStack, setCursorStack] = useState<Array<EntityId | null>>([])
  const [pageNo, setPageNo] = useState(1)

  const query = useQuery({
    queryKey: ['enterprise_business', 'offboarding-cases', organizationId, workspaceId, status, limit, cursor],
    queryFn: () => getEbOffboardingCases({ organizationId, workspaceId }, { status, afterId: cursor, limit }),
    enabled: scopeReady && readReady,
  })

  const resetCursor = () => {
    setCursor(null)
    setCursorStack([])
    setPageNo(1)
  }

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
      navigate(
        `/enterprise-business/offboarding/${encodeURIComponent(caseRow.id)}?org_id=${encodeURIComponent(organizationId)}&workspace_id=${encodeURIComponent(workspaceId)}`
      )
    },
    [navigate, organizationId, workspaceId]
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
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="eb-off-org">组织 ID（organization_id）</Label>
            <Input
              id="eb-off-org"
              value={state.org}
              inputMode="numeric"
              onChange={(event) => updateScope({ org: event.target.value })}
              placeholder="TSID，例如 1234567890123456789"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eb-off-ws">工作区 ID（workspace_id）</Label>
            <Input
              id="eb-off-ws"
              value={state.ws}
              inputMode="numeric"
              onChange={(event) => updateScope({ ws: event.target.value })}
              placeholder="TSID，例如 1234567890123456789"
            />
          </div>
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
