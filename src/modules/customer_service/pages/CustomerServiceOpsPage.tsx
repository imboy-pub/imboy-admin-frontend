import { useMemo, useState, type ReactElement } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { toast } from 'sonner'
import { Headset, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OrganizationWorkspacePicker } from '@/components/shared/OrganizationWorkspacePicker'
import {
  DataTable,
  DataTablePagination,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { coerceEntityId } from '@/lib/entityId'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import {
  closeCsSession,
  getCsSeats,
  getCsSession,
  resumeCsSeat,
  suspendCsSeat,
  transferCsSession,
} from '../api/public'
import { useOrgWorkspaceScope } from './useOrgWorkspaceScope'
import {
  actionFailureMessage,
  classifyActionFailure,
  csSessionStatusLabel,
  isRetryableFailure,
  paginateClientSide,
  type CsActionFailure,
  type CsScopeParams,
  type CsSeat,
  type CsSession,
} from '../api/pureFunctions'

type FailureState = { action: string; failure: CsActionFailure }

const READ_PERMISSION = 'customer_service:read'
const WRITE_PERMISSION = 'customer_service:write'

/**
 * 客服平台运营页（CS-03）。只调 `/api/adm/customer-service/*`（平台面 6 条契约路径）：
 * 坐席列表（read）/ 停用·恢复（write）/ 会话详情（read）/ 转接·关闭（write）。
 * 平台面每条路径都必须显式 org_id + workspace_id，不存在无租户条件的全局列举。
 */
export function CustomerServiceOpsPage() {
  const { state, setState } = useListQueryState<{
    page: number
    size: number
  }>({ page: 1, size: 10 })
  const csScope = useOrgWorkspaceScope()
  const scope = useMemo(
    () => ({ organizationId: csScope.organizationId ?? '', workspaceId: csScope.workspaceId ?? '' }),
    [csScope.organizationId, csScope.workspaceId]
  )
  const scopeReady = scope.organizationId.length > 0 && scope.workspaceId.length > 0

  const { allowed: canRead, loading: readPermLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const seatsQuery = useQuery({
    queryKey: ['customer_service', 'seats', scope.organizationId, scope.workspaceId],
    queryFn: () => getCsSeats(scope),
    enabled: scopeReady && canRead && !readPermLoading,
  })

  const [seatAction, setSeatAction] = useState<{ kind: 'suspend' | 'resume'; seat: CsSeat } | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [seatFailure, setSeatFailure] = useState<FailureState | null>(null)

  const suspendMutation = useMutation({
    mutationFn: () =>
      suspendCsSeat({
        ...scope,
        identityId: seatAction?.seat.business_identity_id ?? '',
        reason: suspendReason,
      }),
    onSuccess: () => {
      toast.success('坐席已停用')
      setSeatAction(null)
      setSuspendReason('')
      setSeatFailure(null)
      void seatsQuery.refetch()
    },
    onError: (err) => {
      const kind = classifyActionFailure(err)
      setSeatFailure({ action: '停用坐席', failure: kind })
      setSeatAction(null)
      toast.error(`停用失败：${actionFailureMessage(kind)}`)
    },
  })

  const resumeMutation = useMutation({
    mutationFn: () =>
      resumeCsSeat({ ...scope, identityId: seatAction?.seat.business_identity_id ?? '' }),
    onSuccess: () => {
      toast.success('坐席已恢复')
      setSeatAction(null)
      setSeatFailure(null)
      void seatsQuery.refetch()
    },
    onError: (err) => {
      const kind = classifyActionFailure(err)
      setSeatFailure({ action: '恢复坐席', failure: kind })
      setSeatAction(null)
      toast.error(`恢复失败：${actionFailureMessage(kind)}`)
    },
  })

  const rows = useMemo(() => seatsQuery.data ?? [], [seatsQuery.data])

  return (
    <div className="space-y-4" data-page="customer-service-ops">
      <PageHeader
        title="客服运营"
        description="平台运营面（customer_service）。查看坐席/会话需 customer_service:read，停用/恢复/转接/关闭需 customer_service:write。"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">租户范围（必填）</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>组织 / 工作区</Label>
            <OrganizationWorkspacePicker
              organizationId={csScope.organizationId}
              workspaceId={csScope.workspaceId}
              organizations={csScope.organizations}
              workspaces={csScope.workspaces}
              loading={csScope.loading}
              onChange={(next) => {
                csScope.onChange(next)
                setState({ page: 1 })
              }}
            />
            <p className="text-xs text-muted-foreground">
              组织/工作区来自共享选择器，上下文写入 URL（org/ws），刷新与分享后不丢失；禁止手填 TSID。
            </p>
          </div>
        </CardContent>
      </Card>

      <FailurePanel failure={seatFailure} onRetry={() => void seatsQuery.refetch()} onDismiss={() => setSeatFailure(null)} />

      <SeatsSection
        scopeReady={scopeReady}
        canRead={canRead && !readPermLoading}
        loading={seatsQuery.isLoading}
        error={seatsQuery.error}
        rows={rows}
        page={state.page}
        size={state.size}
        canWrite={canWrite}
        onPageChange={(page) => setState({ page })}
        onPageSizeChange={(size) => setState({ page: 1, size })}
        onRetry={() => void seatsQuery.refetch()}
        onSuspend={(seat) => setSeatAction({ kind: 'suspend', seat })}
        onResume={(seat) => setSeatAction({ kind: 'resume', seat })}
      />

      <SessionSection
        scope={scope}
        scopeReady={scopeReady}
        canRead={canRead && !readPermLoading}
        canWrite={canWrite}
      />

      <Dialog
        open={seatAction?.kind === 'suspend'}
        onOpenChange={(open) => { if (!open) setSeatAction(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>停用客服坐席</DialogTitle>
            <DialogDescription>
              停用后坐席 {seatAction?.seat.business_identity_id ?? ''} 立即无法接单与发言
              （进行中的会话拒绝新动作）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cs-suspend-reason">停用原因（可选）</Label>
            <Input
              id="cs-suspend-reason"
              value={suspendReason}
              maxLength={200}
              onChange={(event) => setSuspendReason(event.target.value)}
              placeholder="例如：离职交接"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeatAction(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={suspendMutation.isPending}
              onClick={() => suspendMutation.mutate()}
            >
              停用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={seatAction?.kind === 'resume'}
        onOpenChange={(open) => { if (!open) setSeatAction(null) }}
        title="恢复客服坐席"
        description={`恢复后坐席 ${seatAction?.seat.business_identity_id ?? ''} 重新参与调度。确定恢复？`}
        confirmText="恢复"
        loading={resumeMutation.isPending}
        onConfirm={() => resumeMutation.mutate()}
      />
    </div>
  )
}

type SeatsSectionProps = {
  scopeReady: boolean
  canRead: boolean
  loading: boolean
  error: unknown
  rows: CsSeat[]
  page: number
  size: number
  canWrite: boolean
  onPageChange: (_page: number) => void
  onPageSizeChange: (_size: number) => void
  onRetry: () => void
  onSuspend: (_seat: CsSeat) => void
  onResume: (_seat: CsSeat) => void
}

function SeatsSection({ scopeReady, canRead, loading, error, rows, page, size, canWrite, onPageChange, onPageSizeChange, onRetry, onSuspend, onResume }: SeatsSectionProps) {
  const columns = useMemo<LegacyColumnDef<CsSeat>[]>(
    () => [
      {
        header: '坐席业务身份',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.business_identity_id}</span>
        ),
      },
      { header: '职能', accessorKey: 'function_key' },
      {
        header: '状态',
        cell: ({ row }) =>
          row.original.enabled ? (
            <Badge className="bg-green-100 text-green-800">启用</Badge>
          ) : (
            <Badge variant="outline">停用</Badge>
          ),
      },
      {
        header: '并发',
        cell: ({ row }) => `${row.original.active_count} / ${row.original.max_concurrent}`,
      },
      { header: '版本', accessorKey: 'version' },
      {
        header: '操作',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {row.original.enabled ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={!canWrite}
                title={canWrite ? undefined : '需要 customer_service:write 权限'}
                onClick={() => onSuspend(row.original)}
              >
                停用
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={!canWrite}
                title={canWrite ? undefined : '需要 customer_service:write 权限'}
                onClick={() => onResume(row.original)}
              >
                恢复
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canWrite, onSuspend, onResume]
  )

  const table = useLegacyTable({
    data: paginateClientSide(rows, page, size),
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  let body: ReactElement
  if (!scopeReady) {
    body = (
      <EmptyState
        icon={<Headset className="h-8 w-8" />}
        title="请先填写组织与工作区"
        description="平台面不存在无租户条件的全局列举：每条查询都必须携带 organization_id 与 workspace_id。"
      />
    )
  } else if (!canRead) {
    body = <EmptyState title="无查看权限" description="查看坐席列表需要 customer_service:read 权限。" />
  } else if (error) {
    body = <ErrorState message={`加载坐席失败：${getErrorMessage(error)}`} onRetry={onRetry} />
  } else {
    body = (
      <div className="space-y-3">
        <DataTable table={table} loading={loading} emptyMessage="该工作区暂无可调度的客服坐席" />
        <DataTablePagination
          page={page}
          pageSize={size}
          total={rows.length}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          onRefresh={onRetry}
        />
      </div>
    )
  }

  return (
    <Card data-seats-section="true">
      <CardHeader>
        <CardTitle className="text-base">客服坐席</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}

function SessionSection(props: {
  scope: CsScopeParams
  scopeReady: boolean
  canRead: boolean
  canWrite: boolean
}) {
  const [sessionIdInput, setSessionIdInput] = useState('')
  const [sessionId, setSessionId] = useState<EntityId>('')
  const [failure, setFailure] = useState<FailureState | null>(null)

  const sessionQuery = useQuery({
    queryKey: [
      'customer_service',
      'session',
      props.scope.organizationId,
      props.scope.workspaceId,
      sessionId,
    ],
    queryFn: () => getCsSession({ ...props.scope, sessionId }),
    enabled: props.scopeReady && props.canRead && sessionId.length > 0,
  })

  const handleSubmit = () => {
    const id = coerceEntityId(sessionIdInput, '')
    if (id.length === 0) {
      toast.error('请输入会话 ID')
      return
    }
    setFailure(null)
    setSessionId(id)
  }

  return (
    <Card data-session-section="true">
      <CardHeader>
        <CardTitle className="text-base">客服会话（按 ID 查询）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="cs-session-id">会话 ID（session_id）</Label>
            <Input
              id="cs-session-id"
              value={sessionIdInput}
              inputMode="numeric"
              onChange={(event) => setSessionIdInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSubmit()
              }}
              placeholder="TSID，例如 1234567890123456789"
            />
          </div>
          <Button type="button" onClick={handleSubmit} disabled={!props.scopeReady || !props.canRead}>
            <Search className="mr-1 h-4 w-4" />
            查询会话
          </Button>
        </div>

        {!props.scopeReady ? (
          <EmptyState title="请先填写组织与工作区" description="会话查询同样必须携带租户条件。" />
        ) : !props.canRead ? (
          <EmptyState title="无查看权限" description="查看会话需要 customer_service:read 权限。" />
        ) : sessionQuery.isLoading ? (
          <LoadingState message="加载会话详情..." />
        ) : sessionQuery.error ? (
          <ErrorState
            message={`会话查询失败：${getErrorMessage(sessionQuery.error)}`}
            onRetry={() => void sessionQuery.refetch()}
          />
        ) : sessionQuery.data ? (
          <SessionActions
            key={`${sessionQuery.data.id}:${sessionQuery.data.version}`}
            scope={props.scope}
            canWrite={props.canWrite}
            session={sessionQuery.data}
            failure={failure}
            onRetryRefresh={() => void sessionQuery.refetch()}
            onFailure={setFailure}
          />
        ) : (
          <EmptyState title="尚未查询会话" description="输入会话 ID 后查看详情；平台面仅支持按 ID 精确查询。" />
        )}
      </CardContent>
    </Card>
  )
}

function SessionActions(props: {
  scope: CsScopeParams
  canWrite: boolean
  session: CsSession
  failure: FailureState | null
  onRetryRefresh: () => void
  onFailure: (_failure: FailureState | null) => void
}) {
  const { session } = props
  const [toIdentityId, setToIdentityId] = useState('')
  // 组件以 key=<id>:<version> 挂载：版本刷新即重挂载，expected_version 始终从最新版本出发
  const [expectedVersion, setExpectedVersion] = useState(String(session.version))

  const transferMutation = useMutation({
    mutationFn: () =>
      transferCsSession({
        ...props.scope,
        sessionId: session.id,
        toIdentityId: coerceEntityId(toIdentityId, ''),
        expectedVersion: Number(expectedVersion),
      }),
    onSuccess: () => {
      toast.success('会话已转接')
      props.onFailure(null)
      props.onRetryRefresh()
    },
    onError: (err) => props.onFailure({ action: '转接会话', failure: classifyActionFailure(err) }),
  })

  const closeMutation = useMutation({
    mutationFn: () =>
      closeCsSession({
        ...props.scope,
        sessionId: session.id,
        expectedVersion: Number(expectedVersion),
      }),
    onSuccess: () => {
      toast.success('会话已关闭')
      props.onFailure(null)
      props.onRetryRefresh()
    },
    onError: (err) => props.onFailure({ action: '关闭会话', failure: classifyActionFailure(err) }),
  })

  const busy = transferMutation.isPending || closeMutation.isPending
  const parsedVersion = Number(expectedVersion)
  const versionValid = Number.isSafeInteger(parsedVersion) && parsedVersion > 0

  return (
    <div className="space-y-4">
      <SessionSummary session={session} />
      <FailurePanel
        failure={props.failure}
        onRetry={props.onRetryRefresh}
        onDismiss={() => props.onFailure(null)}
      />
      <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_10rem_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="cs-transfer-target">转接目标坐席（to_identity_id）</Label>
          <Input
            id="cs-transfer-target"
            value={toIdentityId}
            inputMode="numeric"
            onChange={(event) => setToIdentityId(event.target.value)}
            placeholder="目标坐席的业务身份 TSID"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-transfer-version">expected_version</Label>
          <Input
            id="cs-transfer-version"
            value={expectedVersion}
            inputMode="numeric"
            onChange={(event) => setExpectedVersion(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={!props.canWrite || busy || toIdentityId.trim().length === 0 || !versionValid}
            title={props.canWrite ? undefined : '需要 customer_service:write 权限'}
            onClick={() => transferMutation.mutate()}
          >
            转接
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!props.canWrite || busy || !versionValid}
            title={props.canWrite ? undefined : '需要 customer_service:write 权限'}
            onClick={() => closeMutation.mutate()}
          >
            关闭会话
          </Button>
        </div>
      </div>
    </div>
  )
}

function SessionSummary({ session }: { session: CsSession }) {
  return (
    <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm" data-testid="cs-session-summary">
      <dt className="text-muted-foreground">会话 ID</dt>
      <dd className="font-mono text-xs">{session.id}</dd>
      <dt className="text-muted-foreground">状态</dt>
      <dd><SessionStatusBadge status={session.status} /></dd>
      <dt className="text-muted-foreground">客户（contact）</dt>
      <dd className="font-mono text-xs">{session.contact_id || '-'}</dd>
      <dt className="text-muted-foreground">会话（conversation）</dt>
      <dd className="font-mono text-xs">{session.conversation_id || '-'}</dd>
      <dt className="text-muted-foreground">当前经办坐席</dt>
      <dd className="font-mono text-xs">{session.business_identity_id ?? '未接单'}</dd>
      <dt className="text-muted-foreground">评分</dt>
      <dd>{session.rating ?? '-'}</dd>
      <dt className="text-muted-foreground">排队/接单/关闭时间（秒级时间戳）</dt>
      <dd className="font-mono text-xs">
        {[session.queued_at, session.claimed_at, session.closed_at]
          .map((value) => (value === null ? '-' : String(value)))
          .join(' / ')}
      </dd>
      <dt className="text-muted-foreground">关闭原因</dt>
      <dd>{session.close_reason ?? '-'}</dd>
      <dt className="text-muted-foreground">版本（expected_version）</dt>
      <dd className="font-mono text-xs">{session.version}</dd>
    </dl>
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
      {csSessionStatusLabel(status)}
    </Badge>
  )
}

function FailurePanel(props: {
  failure: FailureState | null
  onRetry: () => void
  onDismiss: () => void
}) {
  if (!props.failure) return null
  const retryable = isRetryableFailure(props.failure.failure)
  return (
    <div
      data-testid="cs-failure-panel"
      className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm md:flex-row md:items-center md:justify-between"
    >
      <div>
        <p className="font-medium text-destructive">
          {props.failure.action}失败：{actionFailureMessage(props.failure.failure)}
        </p>
        <p className="text-xs text-muted-foreground">
          {retryable
            ? '该失败可重试：点击重试将刷新服务端最新状态后再次尝试。'
            : '该失败不可重试：请先处理前置条件（离岗流程/权限/坐席状态）。'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {retryable ? (
          <Button size="sm" variant="outline" data-testid="cs-failure-retry" onClick={props.onRetry}>
            刷新并重试
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={props.onDismiss}>
          知道了
        </Button>
      </div>
    </div>
  )
}
