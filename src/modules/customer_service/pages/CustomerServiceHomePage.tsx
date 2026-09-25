import { useMemo, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { Globe2, Headphones, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Badge
} from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { Select } from '@/components/ui/select'
import {
  ConfirmDialog,
  CursorPaginationBar,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  isTsidLike,
  parseOrgWorkspaceQuery,
  serializeOrgWorkspaceQuery,
} from '@/components/shared/orgWorkspaceQuery'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import {
  getOrganizationMembers,
  listOrganizationWorkspaces,
  getOrganizations,
} from '@/modules/organization/api'
import { provisionCustomerServiceSeat } from '../api/provisioning'
import { getPlatformSeats, resumeCsSeat, suspendCsSeat } from '../api/public'
import { CsStatsPanel } from './CsStatsPanel'
import type { PlatformSeatRow } from '../api/pureFunctions'

const READ_PERMISSION = 'customer_service:read'
const WRITE_PERMISSION = 'customer_service:write'

type ListState = {
  limit: number
}

/**
 * 在线客服坐席首页（平台运营面）。
 *
 * GET /api/adm/customer-service/seats（organization_id 可选过滤 + after_id/limit 键集分页）：
 *   - `/customer-service`          —— 跨企业坐席分页列表；
 *   - `/customer-service?org=X`    —— 指定企业 X 的坐席分页列表。
 * 两个视图都有「添加客服坐席」（POST organizations/:org_id/provisioning）与
 * 停用/恢复（organizations/:org_id/seats/:id/suspend|resume，workspace_id 取
 * 行投影的默认接待工作区）。
 *
 * `org` 上下文走 EADM-06 URL codec（刷新/分享不丢失）；列表含已停用坐席。
 */
export function CustomerServiceHomePage() {
  const { allowed: canRead, loading: permissionLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })
  const readReady = canRead && !permissionLoading

  // org 过滤上下文：URL 是真源（EADM-06 codec）；null = 全部企业。
  const [orgId, setOrgId] = useState<EntityId | null>(() => {
    const { org } = parseOrgWorkspaceQuery(window.location.search)
    return isTsidLike(org) ? org : null
  })
  const updateOrg = (next: EntityId | null) => {
    setOrgId(next)
    const qs = serializeOrgWorkspaceQuery({ org: next, ws: null }, window.location.search)
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }

  const { state, setState } = useListQueryState<ListState>({ limit: 10 })
  const limit = state.limit

  // 键集游标：当前页游标 + 上一页回退栈（游标语义服务端自持，无总页数）。
  const [cursor, setCursor] = useState<EntityId | null>(null)
  const [cursorStack, setCursorStack] = useState<Array<EntityId | null>>([])
  const [pageNo, setPageNo] = useState(1)

  const orgsQuery = useQuery({
    queryKey: ['customer_service', 'home', 'organizations'],
    queryFn: () => getOrganizations(1, 50, 'active'),
  })
  const organizations = useMemo(() => orgsQuery.data?.items ?? [], [orgsQuery.data])

  const seatsQuery = useQuery({
    queryKey: ['customer_service', 'home', 'platform-seats', orgId ?? '', limit, cursor],
    queryFn: () => getPlatformSeats({ organizationId: orgId, afterId: cursor, limit }),
    enabled: readReady,
  })

  const resetCursor = () => {
    setCursor(null)
    setCursorStack([])
    setPageNo(1)
  }

  const goToNext = () => {
    const next = seatsQuery.data?.next_after_id ?? null
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

  const rows = useMemo(() => seatsQuery.data?.seats ?? [], [seatsQuery.data])
  const [addSeatOpen, setAddSeatOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<
    { kind: 'suspend' | 'resume'; seat: PlatformSeatRow } | null
  >(null)

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (pendingAction === null) throw new Error(t('cs.home.pendingActionError'))
      const { kind, seat } = pendingAction
      if (!seat.workspace_id) {
        throw new Error(t('cs.home.noWorkspaceError'))
      }
      const scope = {
        organizationId: seat.organization_id,
        workspaceId: seat.workspace_id,
        identityId: seat.business_identity_id,
      }
      if (kind === 'suspend') {
        await suspendCsSeat(scope)
        return t('cs.home.suspendToast')
      }
      await resumeCsSeat(scope)
      return t('cs.home.resumeToast')
    },
    onSuccess: async (message) => {
      toast.success(message)
      setPendingAction(null)
      await seatsQuery.refetch()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  // 过滤 select 的选项：企业列表 + （org 不在前 50 时）用行内企业名兜底。
  const orgOptions = useMemo(() => {
    const options = organizations.map((org) => ({ value: org.id, label: org.name }))
    if (orgId !== null && !options.some((option) => option.value === orgId)) {
      const nameFromRow = rows.find((row) => row.organization_id === orgId)?.organization_name
      options.push({ value: orgId, label: nameFromRow && nameFromRow.length > 0 ? nameFromRow : orgId })
    }
    return options
  }, [organizations, orgId, rows])

  const columns = useMemo<LegacyColumnDef<PlatformSeatRow>[]>(
    () => [
      {
        header: t('cs.home.colEnterprise'),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.organization_name || row.original.organization_id}
          </span>
        ),
      },
      {
        header: t('cs.home.colSeat'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate">{row.original.display_name ?? t('cs.home.unnamedSeat')}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {row.original.business_identity_id}
            </div>
          </div>
        ),
      },
      {
        header: t('cs.home.colStatus'),
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? 'default' : 'outline'}>
            {row.original.enabled ? t('cs.home.statusEnabled') : t('cs.home.statusDisabled')}
          </Badge>
        ),
      },
      {
        header: t('cs.home.colActive'),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.active_count} / {row.original.max_concurrent}
          </span>
        ),
      },
      {
        header: t('cs.home.colActions'),
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            disabled={!canWrite}
            onClick={() =>
              setPendingAction({ kind: row.original.enabled ? 'suspend' : 'resume', seat: row.original })
            }
          >
            {row.original.enabled ? t('cs.home.actionSuspend') : t('cs.home.actionResume')}
          </Button>
        ),
      },
    ],
    [canWrite]
  )

  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  let body: ReactElement
  if (!readReady) {
    body = permissionLoading ? (
      <LoadingState message={t('cs.home.loading')} />
    ) : (
      <EmptyState icon={<Headphones className="h-8 w-8" />} title={t('cs.home.noPermission')} />
    )
  } else if (seatsQuery.error) {
    body = (
      <ErrorState
        message={t('cs.home.loadError', { message: getErrorMessage(seatsQuery.error) })}
        onRetry={() => void seatsQuery.refetch()}
      />
    )
  } else {
    body = (
      <div className="space-y-3">
        <DataTable
          table={table}
          loading={seatsQuery.isLoading}
          emptyMessage={
            orgId !== null
              ? t('cs.home.emptyWithOrg')
              : t('cs.home.emptyAll')
          }
        />
        <CursorPaginationBar
          page={pageNo}
          pageRows={rows.length}
          canPrev={cursorStack.length > 0}
          canNext={seatsQuery.data?.next_after_id != null}
          limit={limit}
          loading={seatsQuery.isFetching}
          onPrev={goToPrev}
          onNext={goToNext}
          onLimitChange={(next) => {
            setState({ limit: next })
            resetCursor()
          }}
          onRefresh={() => void seatsQuery.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4" data-page="customer-service-home">
      <PageHeader
        title={t('cs.home.pageTitle')}
        description={t('cs.home.pageDescription')}
        actions={
          <Button disabled={!canWrite} onClick={() => setAddSeatOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />{t('cs.home.addSeat')}
          </Button>
        }
      />

      {/* CS-ADM-02（CS-GOV-03B）：运营统计面板——org 作用域（选定企业后现算）。 */}
      <CsStatsPanel orgId={orgId} canRead={readReady} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            {orgId !== null ? t('cs.home.seatsOfOrg') : t('cs.home.seatsOfAll')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              id="cs-home-org-filter"
              aria-label={t('cs.home.orgFilterLabel')}
              className="w-[240px]"
              value={orgId ?? ''}
              onChange={(event) => {
                updateOrg(event.target.value === '' ? null : event.target.value)
                resetCursor()
              }}
            >
              <option value="">{t('cs.home.allOrgs')}</option>
              {orgOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Link to="/customer-service/widgets" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              <Globe2 className="mr-1 h-4 w-4" />{t('cs.home.widgetsLink')}
            </Link>
          </div>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>

      {addSeatOpen && (
        <AddSeatDialog
          open={addSeatOpen}
          onOpenChange={setAddSeatOpen}
          organizations={organizations}
          orgsLoading={orgsQuery.isLoading}
          lockedOrganizationId={orgId}
          onCompleted={async () => {
            resetCursor()
            await seatsQuery.refetch()
          }}
        />
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
        title={pendingAction?.kind === 'resume' ? t('cs.home.resumeTitle') : t('cs.home.suspendTitle')}
        description={
          pendingAction?.kind === 'resume'
            ? t('cs.home.resumeDescription')
            : t('cs.home.suspendDescription')
        }
        confirmText={pendingAction?.kind === 'resume' ? t('cs.home.resumeConfirm') : t('cs.home.suspendConfirm')}
        loading={actionMutation.isPending}
        onConfirm={() => actionMutation.mutate()}
      />
    </div>
  )
}

function AddSeatDialog(props: {
  open: boolean
  onOpenChange: (_open: boolean) => void
  organizations: Array<{ id: EntityId; name: string }>
  orgsLoading: boolean
  lockedOrganizationId: EntityId | null
  onCompleted: () => Promise<void>
}) {
  // 仅在 open 时挂载（父层条件渲染）：state 初始化即重置，企业过滤页锁定企业。
  const [orgId, setOrgId] = useState<EntityId | ''>(() => props.lockedOrganizationId ?? '')
  const [workspaceId, setWorkspaceId] = useState<EntityId | ''>('')
  const [memberId, setMemberId] = useState<EntityId | ''>('')
  const [maxConcurrent, setMaxConcurrent] = useState(3)

  const wssQuery = useQuery({
    queryKey: ['customer_service', 'home', 'add-seat', 'workspaces', orgId],
    queryFn: () => listOrganizationWorkspaces(orgId as EntityId, 1, 50),
    enabled: props.open && orgId.length > 0,
  })
  const membersQuery = useQuery({
    queryKey: ['customer_service', 'home', 'add-seat', 'members', orgId],
    queryFn: () => getOrganizationMembers(orgId as EntityId, 1, 50),
    enabled: props.open && orgId.length > 0,
  })
  const workspaces = useMemo(
    () => (wssQuery.data?.items ?? []).filter((ws) => ws.status === 'active'),
    [wssQuery.data]
  )
  const members = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data])

  // 渲染期派生：缺省取第一个 active 工作区（provisioning 必填 workspace_id）。
  const selectedWorkspaceId = workspaces.some((ws) => ws.id === workspaceId)
    ? workspaceId
    : (workspaces[0]?.id ?? '')

  const onOrgChange = (next: EntityId | '') => {
    setOrgId(next)
    setWorkspaceId('')
    setMemberId('')
  }

  const member = members.find((item) => item.userId === memberId)
  const mutation = useMutation({
    mutationFn: async () => {
      if (!member) throw new Error(t('cs.addSeat.memberRequired'))
      return provisionCustomerServiceSeat({
        organizationId: orgId,
        workspaceId: selectedWorkspaceId,
        userId: member.userId,
        displayName: member.nickname.trim() || member.account.trim(),
        maxConcurrent,
      })
    },
    onSuccess: async () => {
      toast.success(t('cs.addSeat.successToast'))
      props.onOpenChange(false)
      await props.onCompleted()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cs.addSeat.title')}</DialogTitle>
          <DialogDescription>{t('cs.addSeat.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cs-add-seat-org">{t('cs.addSeat.orgLabel')}</Label>
            <Select
              id="cs-add-seat-org"
              value={orgId}
              disabled={props.orgsLoading || props.lockedOrganizationId !== null}
              onChange={(event) => onOrgChange(event.target.value)}
            >
              <option value="">{props.orgsLoading ? t('cs.addSeat.orgLoading') : t('cs.addSeat.orgPlaceholder')}</option>
              {props.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cs-add-seat-workspace">{t('cs.addSeat.workspaceLabel')}</Label>
            <Select
              id="cs-add-seat-workspace"
              value={selectedWorkspaceId}
              disabled={orgId.length === 0 || wssQuery.isLoading}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              <option value="">
                {orgId.length === 0
                  ? t('cs.addSeat.orgRequiredFirst')
                  : wssQuery.isLoading
                    ? t('cs.addSeat.workspaceLoading')
                    : workspaces.length === 0
                      ? t('cs.addSeat.workspaceEmpty')
                      : t('cs.addSeat.workspacePlaceholder')}
              </option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cs-add-seat-member">{t('cs.addSeat.memberLabel')}</Label>
            <Select
              id="cs-add-seat-member"
              value={memberId}
              disabled={orgId.length === 0 || membersQuery.isLoading}
              onChange={(event) => setMemberId(event.target.value)}
            >
              <option value="">
                {orgId.length === 0
                  ? t('cs.addSeat.orgRequiredFirst')
                  : membersQuery.isLoading
                    ? t('cs.addSeat.memberLoading')
                    : t('cs.addSeat.memberPlaceholder')}
              </option>
              {members.map((item) => (
                <option key={item.userId} value={item.userId}>
                  {item.nickname || item.account}
                </option>
              ))}
            </Select>
          </div>
          <details className="rounded-md border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">{t('cs.addSeat.advanced')}</summary>
            <div className="mt-3 max-w-xs space-y-2">
              <Label htmlFor="cs-add-seat-max">{t('cs.addSeat.maxConcurrent')}</Label>
              <Input
                id="cs-add-seat-max"
                type="number"
                min={1}
                max={20}
                value={maxConcurrent}
                onChange={(event) =>
                  setMaxConcurrent(Math.max(1, Math.min(20, Number(event.target.value) || 3)))
                }
              />
            </div>
          </details>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {t('cs.addSeat.cancel')}
          </Button>
          <Button
            disabled={
              orgId.length === 0 ||
              selectedWorkspaceId.length === 0 ||
              !member ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('cs.addSeat.submitting') : t('cs.addSeat.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
