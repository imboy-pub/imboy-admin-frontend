import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { Headphones } from 'lucide-react'
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
import { getPlatformCsSessions } from '../api/public'
import {
  classifyListFailure,
  csSessionListStatusLabel,
  listFailureMessage,
  parseCsSessionStatusFilter,
  type CsSessionSummary,
} from '../api/pureFunctions'

const READ_PERMISSION = 'customer_service:read'

type ListState = {
  org: string
  ws: string
  status: string
  limit: number
}

/**
 * 平台 CS 会话列表页（W2 冻结合同 C1）。
 *
 * GET /api/adm/customer-service/organizations/:org_id/sessions
 *   （workspace_id 必填；status=queued|active|closed 过滤；after_id+limit 键集分页）。
 * 列表投影走 C1 白名单（session summary）：visit_token_id / close_reason /
 * 任何 digest·secret·cipher 不渲染（CS-03-A05 列表级）。
 * 点击行进入会话详情路由（/customer-service/sessions/:id，详情走既有平台端点）。
 */
export function PlatformCsSessionsPage() {
  const navigate = useNavigate()
  const { state, setState } = useListQueryState<ListState>({ org: '', ws: '', status: 'all', limit: 50 })

  const organizationId = state.org.trim()
  const workspaceId = state.ws.trim()
  const scopeReady = organizationId.length > 0 && workspaceId.length > 0
  const status = parseCsSessionStatusFilter(state.status)
  const limit = state.limit

  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  // 键集游标：当前页游标 + 上一页回退栈（游标语义服务端自持，无总页数）
  const [cursor, setCursor] = useState<EntityId | null>(null)
  const [cursorStack, setCursorStack] = useState<Array<EntityId | null>>([])
  const [pageNo, setPageNo] = useState(1)

  const query = useQuery({
    queryKey: ['customer_service', 'platform-sessions', organizationId, workspaceId, status, limit, cursor],
    queryFn: () => getPlatformCsSessions({ organizationId, workspaceId }, { status, afterId: cursor, limit }),
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

  const rows = useMemo(() => query.data?.sessions ?? [], [query.data])

  const openDetail = useCallback(
    (session: CsSessionSummary) => {
      navigate(
        `/customer-service/sessions/${encodeURIComponent(session.id)}?org_id=${encodeURIComponent(organizationId)}&workspace_id=${encodeURIComponent(workspaceId)}`
      )
    },
    [navigate, organizationId, workspaceId]
  )

  const columns = useMemo<LegacyColumnDef<CsSessionSummary>[]>(
    () => [
      {
        header: '会话 ID',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      {
        header: '状态',
        cell: ({ row }) => <SessionStatusBadge status={row.original.status} />,
      },
      {
        header: '客户（contact）',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.contact_id ?? '-'}</span>
        ),
      },
      {
        header: '经办坐席',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.business_identity_id ?? '未接单'}</span>
        ),
      },
      { header: '评分', cell: ({ row }) => row.original.rating ?? '-' },
      {
        header: '排队时间',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.queued_at ?? '-'}</span>
        ),
      },
      { header: '版本', accessorKey: 'version' },
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
        icon={<Headphones className="h-8 w-8" />}
        title="请先填写组织与工作区"
        description="平台面不存在无租户条件的全局列举：查询必须携带 organization_id 与 workspace_id（C1 契约）。"
      />
    )
  } else if (!readReady) {
    body = <EmptyState title="无查看权限" description="查看会话列表需要 customer_service:read 权限。" />
  } else if (query.error) {
    const failure = classifyListFailure(query.error)
    body = (
      <ErrorState
        message={`加载会话列表失败：${listFailureMessage(failure)}（${getErrorMessage(query.error)}）`}
        onRetry={() => void query.refetch()}
      />
    )
  } else {
    body = (
      <div className="space-y-3">
        <DataTable table={table} loading={query.isLoading} emptyMessage="暂无会话（当前过滤条件下没有记录）" />
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
    <div className="space-y-4" data-page="cs-platform-sessions">
      <PageHeader
        title="客服会话列表"
        description="平台 CS 会话检索（C1 契约，customer_service:read）。列表仅展示白名单字段：密钥摘要、关闭原因等敏感字段不出站（CS-03-A05）。"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">租户范围（必填）</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cs-sessions-org">组织 ID（organization_id）</Label>
            <Input
              id="cs-sessions-org"
              value={state.org}
              inputMode="numeric"
              onChange={(event) => updateScope({ org: event.target.value })}
              placeholder="TSID，例如 1234567890123456789"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-sessions-ws">工作区 ID（workspace_id）</Label>
            <Input
              id="cs-sessions-ws"
              value={state.ws}
              inputMode="numeric"
              onChange={(event) => updateScope({ ws: event.target.value })}
              placeholder="TSID，例如 1234567890123456789"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-sessions-status">状态过滤（status）</Label>
            <Select
              id="cs-sessions-status"
              value={status}
              onChange={(event) => updateScope({ status: event.target.value })}
            >
              <option value="all">全部</option>
              <option value="queued">排队中（queued）</option>
              <option value="active">服务中（active）</option>
              <option value="closed">已关闭（closed）</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">会话列表</CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  )
}

function SessionStatusBadge({ status }: { status: string }) {
  const variantClass =
    status === 'active'
      ? 'bg-green-100 text-green-800'
      : status === 'queued'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-muted text-muted-foreground'
  return (
    <Badge className={variantClass} data-status={status}>
      {csSessionListStatusLabel(status)}
    </Badge>
  )
}
