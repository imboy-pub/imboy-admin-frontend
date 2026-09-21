import { useMemo, useState, type ReactElement } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { toast } from 'sonner'
import { ArrowLeft, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import { parseOrgWorkspaceQuery, serializeOrgWorkspaceQuery } from '@/components/shared/orgWorkspaceQuery'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { getErrorMessage } from '@/lib/errorUtils'
import { executeEbOffboardingCase, getEbOffboardingCaseDetail } from '../api/public'
import {
  canRetryOffboardingCase,
  classifyListFailure,
  hasOffboardingFailures,
  listFailureMessage,
  offboardingItemStatusLabel,
  offboardingStatusLabel,
  parseOffboardingItemsStatusFilter,
  OFFBOARDING_RETRY_HINT,
  type EbOffboardingItem,
} from '../api/pureFunctions'

const READ_PERMISSION = 'enterprise_business:read'
const WRITE_PERMISSION = 'enterprise_business:write'

/**
 * 平台离岗交接 case 详情页（W2 冻结合同 W2-ADMIN 段）。
 *
 * GET /api/adm/enterprise-business/organizations/:org_id/offboarding/cases/:id
 *   （customer... enterprise_business:read；workspace_id 必填；items_status 过滤）。
 * - items 中 status=failed 的行高亮；case 聚合显示「失败项 N」徽标；
 * - 重试入口：文档化提示（POST execute 幂等重试语义）+ 按钮调既有 execute 端点；
 *   write 门：无 enterprise_business:write 时按钮禁用 + tooltip。
 * 敏感字段白名单：key_digest / token_digest / secret / cipher / object_key 永不渲染。
 */
export function OffboardingCaseDetailPage() {
  const { caseId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  // URL 是上下文真源：org/ws 由共享 codec 解析（安全降级），刷新/分享后不丢失。
  const { org, ws } = parseOrgWorkspaceQuery(searchParams)
  const organizationId = org ?? ''
  const workspaceId = ws ?? ''
  const scopeReady = org !== null && ws !== null && caseId.length > 0

  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })
  const readReady = canRead && !permLoading

  const [itemsStatus, setItemsStatus] = useState('all')
  const itemsStatusFilter = parseOffboardingItemsStatusFilter(itemsStatus)

  const query = useQuery({
    queryKey: [
      'enterprise_business',
      'offboarding-case',
      organizationId,
      workspaceId,
      caseId,
      itemsStatusFilter,
    ],
    queryFn: () => getEbOffboardingCaseDetail({ organizationId, workspaceId }, caseId, itemsStatusFilter),
    enabled: scopeReady && readReady,
  })

  // execute 重试表单：expected_version 预填 case 当前版本；actor_user_id 需责任人手填
  const [expectedVersion, setExpectedVersion] = useState('')
  const [actorUserId, setActorUserId] = useState('')
  const [executeFailure, setExecuteFailure] = useState<string | null>(null)

  const executeMutation = useMutation({
    mutationFn: () =>
      executeEbOffboardingCase({ organizationId, workspaceId }, caseId, {
        expectedVersion: Number(expectedVersion),
        actorUserId: actorUserId.trim(),
      }),
    onSuccess: () => {
      toast.success('交接重试已提交（幂等执行：仅重放失败项）')
      setExecuteFailure(null)
      void query.refetch()
      // 首页列表聚合数可能变化，失效让它下次进入时刷新
      void queryClient.invalidateQueries({ queryKey: ['enterprise_business', 'offboarding-cases'] })
    },
    onError: (err) => {
      const failure = classifyListFailure(err)
      setExecuteFailure(`${listFailureMessage(failure)}（${getErrorMessage(err)}）`)
    },
  })

  const caseRow = query.data ?? null
  const parsedVersion = Number(expectedVersion === '' ? String(caseRow?.version ?? '') : expectedVersion)
  const versionValid = Number.isSafeInteger(parsedVersion) && parsedVersion > 0
  const actorValid = actorUserId.trim().length > 0
  const retryable = caseRow !== null && canRetryOffboardingCase(caseRow, canWrite) && versionValid && actorValid
  const retryBlockedReason = !canWrite
    ? '需要 enterprise_business:write 权限'
    : caseRow !== null && !canRetryOffboardingCase(caseRow, true)
      ? 'case 已完成（completed）或版本无效，无法执行'
      : !versionValid || !actorValid
        ? '请填写有效的 expected_version 与 actor_user_id'
        : undefined

  let body: ReactElement
  if (!scopeReady) {
    body = (
        <EmptyState
          title="缺少租户参数"
          description="本页需要 org 与 ws 查询参数（从列表页进入会自动携带），且路径必须有 case ID。"
        />
    )
  } else if (!readReady) {
    body = <EmptyState title="无查看权限" description="查看离岗交接详情需要 enterprise_business:read 权限。" />
  } else if (query.error) {
    const failure = classifyListFailure(query.error)
    body = (
      <ErrorState
        message={`加载交接详情失败：${listFailureMessage(failure)}（${getErrorMessage(query.error)}）`}
        onRetry={() => void query.refetch()}
      />
    )
  } else if (query.isLoading) {
    body = <LoadingState message="加载交接详情..." />
  } else if (caseRow) {
    body = (
      <div className="space-y-4">
        <CaseSummaryCard caseRow={caseRow} />
        <RetryCard
          caseRow={caseRow}
          canWrite={canWrite}
          retryable={retryable}
          retryBlockedReason={retryBlockedReason}
          expectedVersion={expectedVersion === '' ? String(caseRow.version) : expectedVersion}
          actorUserId={actorUserId}
          failure={executeFailure}
          pending={executeMutation.isPending}
          onExpectedVersionChange={setExpectedVersion}
          onActorUserIdChange={setActorUserId}
          onExecute={() => executeMutation.mutate()}
          onDismissFailure={() => setExecuteFailure(null)}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">交接项（items）</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="eb-off-items-status" className="text-xs text-muted-foreground">
                状态过滤
              </Label>
              <Select
                id="eb-off-items-status"
                className="h-8 w-36 text-xs"
                value={itemsStatusFilter}
                onChange={(event) => setItemsStatus(event.target.value)}
              >
                <option value="all">全部</option>
                <option value="pending">待执行（pending）</option>
                <option value="success">成功（success）</option>
                <option value="failed">失败（failed）</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ItemsTable items={caseRow.items} loading={query.isFetching} />
          </CardContent>
        </Card>
      </div>
    )
  } else {
    body = <EmptyState title="未找到交接 case" description="请确认 case ID 与租户范围是否正确。" />
  }

  return (
    <div className="space-y-4" data-page="eb-offboarding-case-detail">
      <PageHeader
        title="离岗交接详情"
        description="企业离岗交接 case 详情与失败项重试（enterprise_business:read / write）。密钥摘要、cipher、object key 等敏感字段永不渲染（CS-03-A05）。"
      />

      <div>
        <Link
          to={`/enterprise-business/offboarding${serializeOrgWorkspaceQuery({ org, ws }) ? `?${serializeOrgWorkspaceQuery({ org, ws })}` : ''}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          data-testid="eb-offboarding-back"
        >
          <ArrowLeft className="h-4 w-4" />
          返回交接列表
        </Link>
      </div>

      {body}
    </div>
  )
}

function CaseSummaryCard({ caseRow }: { caseRow: { id: string; status: string; leaver_user_id: string; successor_user_id: string; reason: string | null; item_total: number; item_success: number; item_failed: number; created_at: string | null; updated_at: string | null; workspace_id: string; organization_id: string } }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Case <span className="font-mono text-xs">{caseRow.id}</span>
        </CardTitle>
        {hasOffboardingFailures(caseRow) ? (
          <Badge variant="destructive" data-testid="offboarding-detail-failed-badge">
            失败项 {caseRow.item_failed}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm" data-testid="eb-offboarding-summary">
          <dt className="text-muted-foreground">状态</dt>
          <dd>
            <Badge data-status={caseRow.status}>{offboardingStatusLabel(caseRow.status)}</Badge>
          </dd>
          <dt className="text-muted-foreground">离岗人（leaver）</dt>
          <dd className="font-mono text-xs">{caseRow.leaver_user_id || '-'}</dd>
          <dt className="text-muted-foreground">接任人（successor）</dt>
          <dd className="font-mono text-xs">{caseRow.successor_user_id || '-'}</dd>
          <dt className="text-muted-foreground">原因码（reason）</dt>
          <dd>{caseRow.reason ?? '-'}</dd>
          <dt className="text-muted-foreground">交接进度</dt>
          <dd>
            {caseRow.item_success} / {caseRow.item_total}
            {caseRow.item_failed > 0 ? (
              <span className="ml-2 text-destructive">失败 {caseRow.item_failed}</span>
            ) : null}
          </dd>
          <dt className="text-muted-foreground">组织 / 工作区</dt>
          <dd className="font-mono text-xs">
            {caseRow.organization_id || '-'} / {caseRow.workspace_id || '-'}
          </dd>
          <dt className="text-muted-foreground">创建时间</dt>
          <dd className="font-mono text-xs">{caseRow.created_at ?? '-'}</dd>
          <dt className="text-muted-foreground">更新时间</dt>
          <dd className="font-mono text-xs">{caseRow.updated_at ?? '-'}</dd>
        </dl>
      </CardContent>
    </Card>
  )
}

function RetryCard(props: {
  caseRow: { status: string; version: number }
  canWrite: boolean
  retryable: boolean
  retryBlockedReason: string | undefined
  expectedVersion: string
  actorUserId: string
  failure: string | null
  pending: boolean
  onExpectedVersionChange: (_value: string) => void
  onActorUserIdChange: (_value: string) => void
  onExecute: () => void
  onDismissFailure: () => void
}) {
  return (
    <Card data-testid="eb-offboarding-retry-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4" />
          失败项重试
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground" data-testid="eb-offboarding-retry-hint">
          {OFFBOARDING_RETRY_HINT}
        </p>
        {props.failure ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" data-testid="eb-offboarding-retry-failure">
            {props.failure}
            <Button variant="ghost" size="sm" className="ml-2" onClick={props.onDismissFailure}>
              知道了
            </Button>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-[10rem_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="eb-off-execute-version">expected_version</Label>
            <Input
              id="eb-off-execute-version"
              value={props.expectedVersion}
              inputMode="numeric"
              onChange={(event) => props.onExpectedVersionChange(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eb-off-execute-actor">责任人（actor_user_id，审计必填）</Label>
            <Input
              id="eb-off-execute-actor"
              value={props.actorUserId}
              inputMode="numeric"
              onChange={(event) => props.onActorUserIdChange(event.target.value)}
              placeholder="执行本次重试的平台责任人 TSID"
            />
          </div>
          <Button
            type="button"
            disabled={!props.retryable || props.pending}
            title={props.retryBlockedReason ?? undefined}
            onClick={props.onExecute}
            data-testid="eb-offboarding-execute"
          >
            {props.pending ? '执行中...' : props.caseRow.status === 'failed' ? '重试失败项' : '继续执行'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ItemsTable(props: { items: EbOffboardingItem[]; loading: boolean }) {
  const columns = useMemo(() => itemColumns, [])
  const table = useLegacyTable({
    data: props.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return <DataTable table={table} loading={props.loading} emptyMessage="该 case 下暂无交接项" />
}

const itemColumns: LegacyColumnDef<EbOffboardingItem>[] = [
    {
      header: 'Item ID',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    { header: '类型（kind）', cell: ({ row }) => row.original.kind || '-' },
    {
      header: '状态',
      cell: ({ row }) => (
        <Badge
          className={
            row.original.status === 'failed'
              ? 'bg-destructive text-destructive-foreground'
              : row.original.status === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-muted text-muted-foreground'
          }
          data-status={row.original.status}
        >
          {offboardingItemStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      header: '失败原因',
      cell: ({ row }) => (
        <span className={row.original.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
          {row.original.failure_reason ?? '-'}
        </span>
      ),
    },
    { header: '尝试次数', accessorKey: 'attempt' },
    {
      header: '幂等键',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.idempotency_key || '-'}</span>,
    },
  ]
