import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Globe2,
  Headphones,
  MessageSquareText,
  Plus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { OrganizationWorkspacePicker } from '@/components/shared/OrganizationWorkspacePicker'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
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
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/errorUtils'
import { getOrganizationMembers } from '@/modules/organization/api'
import {
  createWidgetInstallation,
  listWidgetInstallations,
  revokeWidgetInstallation,
} from '../api/widgetInstallations'
import type { WidgetInstallation } from '../api/widgetInstallationsPure'
import { originOrNull } from '../api/widgetInstallationsPure'
import { buildProvisionSnippet } from '../api/provisioningPure'
import { provisionCustomerServiceSeat } from '../api/provisioning'
import { getCsSeats, getPlatformCsSessions, resumeCsSeat, suspendCsSeat } from '../api/public'
import type { CsSeat } from '../api/pureFunctions'
import { csSessionStatusLabel } from '../api/pureFunctions'
import { CUSTOMER_SERVICE_WIDGET_ORIGIN } from '../widgetConfig'
import { useOrgWorkspaceScope } from './useOrgWorkspaceScope'

const READ_PERMISSION = 'customer_service:read'
const WRITE_PERMISSION = 'customer_service:write'

type PendingAction =
  | { kind: 'suspend' | 'resume'; seat: CsSeat }
  | { kind: 'revoke'; installation: WidgetInstallation }
  | null

export function CustomerServiceHomePage() {
  const { allowed: canRead, loading: permissionLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })
  const scope = useOrgWorkspaceScope({ autoSelectSingle: true })
  const organizationId = scope.organizationId ?? ''
  const workspaceId = scope.workspaceId ?? ''
  const scopeReady = organizationId.length > 0 && workspaceId.length > 0
  const selectedOrganization = scope.organizations.find((item) => item.id === organizationId) ?? null
  const selectedWorkspace = scope.workspaces.find((item) => item.id === workspaceId) ?? null
  const queryScope = useMemo(() => ({ organizationId, workspaceId }), [organizationId, workspaceId])

  const seatsQuery = useQuery({
    queryKey: ['customer_service', 'home', 'seats', organizationId, workspaceId],
    queryFn: () => getCsSeats(queryScope),
    enabled: scopeReady && canRead && !permissionLoading,
  })
  const installationsQuery = useQuery({
    queryKey: ['customer_service', 'home', 'websites', organizationId, workspaceId],
    queryFn: () => listWidgetInstallations(queryScope),
    enabled: scopeReady && canRead && !permissionLoading,
  })
  const sessionsQuery = useQuery({
    queryKey: ['customer_service', 'home', 'sessions', organizationId, workspaceId],
    queryFn: () => getPlatformCsSessions(queryScope, { status: 'all', limit: 5 }),
    enabled: scopeReady && canRead && !permissionLoading,
  })
  const membersQuery = useQuery({
    queryKey: ['customer_service', 'home', 'members', organizationId],
    queryFn: () => getOrganizationMembers(organizationId, 1, 50),
    enabled: scopeReady && canWrite,
  })

  const seats = useMemo(() => seatsQuery.data ?? [], [seatsQuery.data])
  const activeInstallations = useMemo(
    () => (installationsQuery.data ?? []).filter((item) => item.status !== 'revoked'),
    [installationsQuery.data]
  )
  const hasSeat = seats.length > 0
  const hasWebsite = activeInstallations.length > 0
  const [addSeatOpen, setAddSeatOpen] = useState(false)
  const [addWebsiteOpen, setAddWebsiteOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const refresh = async () => {
    if (!scopeReady) {
      scope.refetchOrganizations()
      scope.refetchWorkspaces()
      return
    }
    await Promise.all([seatsQuery.refetch(), installationsQuery.refetch(), sessionsQuery.refetch()])
  }

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (pendingAction?.kind === 'suspend') {
        await suspendCsSeat({ ...queryScope, identityId: pendingAction.seat.business_identity_id })
        return '坐席已停用'
      }
      if (pendingAction?.kind === 'resume') {
        await resumeCsSeat({ ...queryScope, identityId: pendingAction.seat.business_identity_id })
        return '坐席已恢复'
      }
      if (pendingAction?.kind === 'revoke') {
        await revokeWidgetInstallation({
          ...queryScope,
          installationId: pendingAction.installation.id,
        })
        return '网站接入已停用'
      }
      throw new Error('没有待执行的操作')
    },
    onSuccess: async (message) => {
      toast.success(message)
      setPendingAction(null)
      await refresh()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (permissionLoading) return <LoadingState message="正在加载在线客服…" />
  if (!canRead) return <EmptyState icon={<Headphones />} title="无权访问在线客服" />

  const loading = scope.loading || (scopeReady && (seatsQuery.isLoading || installationsQuery.isLoading))
  const loadError = scope.orgsError ?? scope.workspacesError ?? seatsQuery.error ?? installationsQuery.error

  return (
    <div className="space-y-6" data-page="customer-service-home">
      <PageHeader
        title="在线客服"
        description="查看接入状态、管理客服成员并处理客户会话。"
        actions={scopeReady ? (
          <OrganizationWorkspacePicker
            organizationId={scope.organizationId}
            workspaceId={scope.workspaceId}
            organizations={scope.organizations}
            workspaces={scope.workspaces}
            loading={scope.loading}
            onChange={scope.onChange}
            className="w-[260px] max-w-full"
            triggerLabel="切换企业和工作区"
          />
        ) : undefined}
      />

      {loading ? (
        <LoadingState message="正在读取客服状态…" />
      ) : loadError ? (
        <ErrorState message={`加载在线客服失败：${getErrorMessage(loadError)}`} onRetry={() => void refresh()} />
      ) : !scopeReady ? (
        <ScopePicker scope={scope} />
      ) : !hasSeat || !hasWebsite ? (
        <SetupPanel
          organizationName={selectedOrganization?.name ?? '当前企业'}
          workspaceName={selectedWorkspace?.name ?? '当前工作区'}
          organizationId={organizationId}
          workspaceId={workspaceId}
          members={membersQuery.data?.items ?? []}
          membersLoading={membersQuery.isLoading}
          hasSeat={hasSeat}
          hasWebsite={hasWebsite}
          canWrite={canWrite}
          onCompleted={refresh}
        />
      ) : (
        <CustomerServiceDashboard
          organizationName={selectedOrganization?.name ?? '当前企业'}
          workspaceName={selectedWorkspace?.name ?? '当前工作区'}
          seats={seats}
          installations={activeInstallations}
          sessions={sessionsQuery.data?.sessions ?? []}
          sessionsLoading={sessionsQuery.isLoading}
          canWrite={canWrite}
          onAddSeat={() => setAddSeatOpen(true)}
          onAddWebsite={() => setAddWebsiteOpen(true)}
          onSeatAction={(kind, seat) => setPendingAction({ kind, seat })}
          onRevoke={(installation) => setPendingAction({ kind: 'revoke', installation })}
        />
      )}

      <SeatDialog
        open={addSeatOpen}
        onOpenChange={setAddSeatOpen}
        organizationId={organizationId}
        workspaceId={workspaceId}
        members={membersQuery.data?.items ?? []}
        onCompleted={refresh}
      />
      <WebsiteDialog
        open={addWebsiteOpen}
        onOpenChange={setAddWebsiteOpen}
        organizationId={organizationId}
        workspaceId={workspaceId}
        organizationName={selectedOrganization?.name ?? '网站'}
        onCompleted={refresh}
      />
      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open) setPendingAction(null) }}
        title={pendingAction?.kind === 'revoke' ? '停用网站接入' : pendingAction?.kind === 'resume' ? '恢复客服成员' : '停用客服成员'}
        description={pendingAction?.kind === 'revoke'
          ? '停用后，对应网站上的客服入口将立即不可用。'
          : pendingAction?.kind === 'resume'
            ? '恢复后，该成员可以重新参与客服接待。'
            : '停用后，该成员将不能继续接待新会话。'}
        confirmText={pendingAction?.kind === 'resume' ? '恢复' : '停用'}
        loading={actionMutation.isPending}
        onConfirm={() => actionMutation.mutate()}
      />
    </div>
  )
}

function ScopePicker({ scope }: { scope: ReturnType<typeof useOrgWorkspaceScope> }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-lg">选择要管理的企业</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">选择一次后会保留在当前页面地址中。</p>
        <OrganizationWorkspacePicker
          organizationId={scope.organizationId}
          workspaceId={scope.workspaceId}
          organizations={scope.organizations}
          workspaces={scope.workspaces}
          loading={scope.loading}
          onChange={scope.onChange}
          className="w-full sm:w-[360px]"
        />
      </CardContent>
    </Card>
  )
}

function SetupPanel(props: {
  organizationName: string
  workspaceName: string
  organizationId: string
  workspaceId: string
  members: Array<{ userId: string; nickname: string; account: string }>
  membersLoading: boolean
  hasSeat: boolean
  hasWebsite: boolean
  canWrite: boolean
  onCompleted: () => Promise<void>
}) {
  const [memberId, setMemberId] = useState('')
  const [website, setWebsite] = useState('')
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const websiteOrigin = originOrNull(website)
  const mutation = useMutation({
    mutationFn: async () => {
      if (!props.hasSeat) {
        const member = props.members.find((item) => item.userId === memberId)
        if (!member) throw new Error('请选择客服成员')
        await provisionCustomerServiceSeat({
          organizationId: props.organizationId,
          workspaceId: props.workspaceId,
          userId: member.userId,
          displayName: member.nickname.trim() || member.account.trim(),
          maxConcurrent,
        })
      }
      if (!props.hasWebsite) {
        if (websiteOrigin === null) throw new Error('请输入正确的网站地址，例如 https://www.example.com')
        await createWidgetInstallation({
          organizationId: props.organizationId,
          workspaceId: props.workspaceId,
          displayName: `${props.organizationName} 网站客服`,
          allowedOrigins: [websiteOrigin],
          branding: { displayName: props.organizationName, primaryColor: null },
          consentVersion: 'v1',
        })
      }
    },
    onSuccess: async () => {
      toast.success('在线客服已启用')
      await props.onCompleted()
    },
    onError: async (error) => {
      toast.error(`启用失败：${getErrorMessage(error)}`)
      await props.onCompleted()
    },
  })
  const disabled = !props.canWrite || mutation.isPending || (!props.hasSeat && !memberId) || (!props.hasWebsite && websiteOrigin === null)

  return (
    <Card className="max-w-3xl" data-testid="customer-service-setup">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Headphones className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">启用在线客服</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{props.organizationName} / {props.workspaceName}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!props.hasSeat && (
          <div className="space-y-2">
            <Label htmlFor="cs-home-member">客服成员</Label>
            <select
              id="cs-home-member"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={memberId}
              disabled={props.membersLoading}
              onChange={(event) => setMemberId(event.target.value)}
            >
              <option value="">{props.membersLoading ? '正在加载成员…' : '选择负责接待的成员'}</option>
              {props.members.map((member) => (
                <option key={member.userId} value={member.userId}>{member.nickname || member.account}</option>
              ))}
            </select>
          </div>
        )}
        {!props.hasWebsite && (
          <div className="space-y-2">
            <Label htmlFor="cs-home-website">接入网站</Label>
            <Input
              id="cs-home-website"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://www.example.com"
            />
            {website.length > 0 && websiteOrigin === null && (
              <p className="text-xs text-destructive">请输入完整的 http(s) 网站地址，不要包含路径。</p>
            )}
          </div>
        )}
        {!props.hasSeat && (
          <details className="rounded-md border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">高级设置</summary>
            <div className="mt-3 max-w-xs space-y-2">
              <Label htmlFor="cs-home-concurrent">每位客服同时接待数</Label>
              <Input
                id="cs-home-concurrent"
                type="number"
                min={1}
                max={20}
                value={maxConcurrent}
                onChange={(event) => setMaxConcurrent(Math.max(1, Math.min(20, Number(event.target.value) || 3)))}
              />
            </div>
          </details>
        )}
        <Button className="w-full sm:w-auto" disabled={disabled} onClick={() => mutation.mutate()}>
          {mutation.isPending ? '正在启用…' : '启用在线客服'}
        </Button>
        {!props.canWrite && <p className="text-sm text-amber-700">当前账号只有查看权限，不能执行开通操作。</p>}
      </CardContent>
    </Card>
  )
}

function CustomerServiceDashboard(props: {
  organizationName: string
  workspaceName: string
  seats: CsSeat[]
  installations: WidgetInstallation[]
  sessions: Array<{ id: string; status: string; business_identity_id: string | null }>
  sessionsLoading: boolean
  canWrite: boolean
  onAddSeat: () => void
  onAddWebsite: () => void
  onSeatAction: (_kind: 'suspend' | 'resume', _seat: CsSeat) => void
  onRevoke: (_installation: WidgetInstallation) => void
}) {
  const enabledSeats = props.seats.filter((seat) => seat.enabled)
  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 border-y bg-muted/30 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
          <div>
            <h2 className="font-semibold">在线客服已启用</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {props.organizationName} / {props.workspaceName} · {enabledSeats.length} 位客服可接待 · {props.installations.length} 个网站接入
            </p>
          </div>
        </div>
        <Link to="/customer-service/workspace" className={buttonVariants()}>
          <ExternalLink className="mr-2 h-4 w-4" />打开坐席工作台
        </Link>
      </section>

      <section aria-labelledby="cs-websites-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="cs-websites-title" className="flex items-center gap-2 text-base font-semibold"><Globe2 className="h-4 w-4" />网站接入</h2>
            <p className="mt-1 text-sm text-muted-foreground">复制代码到网站即可显示客服入口。</p>
          </div>
          <Button variant="outline" size="sm" disabled={!props.canWrite} onClick={props.onAddWebsite}>
            <Plus className="mr-1 h-4 w-4" />添加网站
          </Button>
        </div>
        <div className="divide-y rounded-md border">
          {props.installations.map((installation) => (
            <div key={installation.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium">{installation.display_name || '网站客服'}</div>
                <div className="mt-1 truncate text-sm text-muted-foreground">
                  {installation.allowed_origins.join('、') || '尚未限制网站来源'}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => void copyInstallationCode(installation)}>
                  <ClipboardCopy className="mr-1 h-4 w-4" />复制代码
                </Button>
                <Button variant="ghost" size="sm" disabled={!props.canWrite} onClick={() => props.onRevoke(installation)}>停用</Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="cs-seats-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="cs-seats-title" className="flex items-center gap-2 text-base font-semibold"><Users className="h-4 w-4" />客服成员</h2>
            <p className="mt-1 text-sm text-muted-foreground">同一工作区的客服共同接待网站访客。</p>
          </div>
          <Button variant="outline" size="sm" disabled={!props.canWrite} onClick={props.onAddSeat}>
            <Plus className="mr-1 h-4 w-4" />添加成员
          </Button>
        </div>
        <div className="divide-y rounded-md border">
          {props.seats.map((seat, index) => (
            <div key={seat.business_identity_id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium">客服成员 {index + 1}</div>
                <div className="mt-1 text-sm tabular-nums text-muted-foreground">当前接待 {seat.active_count} / {seat.max_concurrent}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={seat.enabled ? 'default' : 'outline'}>{seat.enabled ? '可接待' : '已停用'}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!props.canWrite}
                  onClick={() => props.onSeatAction(seat.enabled ? 'suspend' : 'resume', seat)}
                >
                  {seat.enabled ? '停用' : '恢复'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="cs-sessions-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="cs-sessions-title" className="flex items-center gap-2 text-base font-semibold"><MessageSquareText className="h-4 w-4" />最近会话</h2>
            <p className="mt-1 text-sm text-muted-foreground">查看访客排队和接待进度。</p>
          </div>
          <Link to="/customer-service/sessions" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>查看全部</Link>
        </div>
        {props.sessionsLoading ? (
          <LoadingState message="正在加载会话…" />
        ) : props.sessions.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">还没有客户会话</div>
        ) : (
          <div className="divide-y rounded-md border">
            {props.sessions.map((session) => (
              <Link
                key={session.id}
                to={`/customer-service/sessions/${encodeURIComponent(session.id)}`}
                className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="text-sm">客户会话</span>
                <Badge variant="outline">{csSessionStatusLabel(session.status)}</Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SeatDialog(props: {
  open: boolean
  onOpenChange: (_open: boolean) => void
  organizationId: string
  workspaceId: string
  members: Array<{ userId: string; nickname: string; account: string }>
  onCompleted: () => Promise<void>
}) {
  const [memberId, setMemberId] = useState('')
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const mutation = useMutation({
    mutationFn: async () => {
      const member = props.members.find((item) => item.userId === memberId)
      if (!member) throw new Error('请选择客服成员')
      await provisionCustomerServiceSeat({
        organizationId: props.organizationId,
        workspaceId: props.workspaceId,
        userId: member.userId,
        displayName: member.nickname.trim() || member.account.trim(),
        maxConcurrent,
      })
    },
    onSuccess: async () => {
      toast.success('客服成员已添加')
      props.onOpenChange(false)
      setMemberId('')
      await props.onCompleted()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>添加客服成员</DialogTitle><DialogDescription>选择企业成员后即可参与客服接待。</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cs-add-seat-member">企业成员</Label>
            <select id="cs-add-seat-member" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
              <option value="">请选择成员</option>
              {props.members.map((member) => <option key={member.userId} value={member.userId}>{member.nickname || member.account}</option>)}
            </select>
          </div>
          <details className="rounded-md border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">高级设置</summary>
            <div className="mt-3 space-y-2"><Label htmlFor="cs-add-seat-max">同时接待数</Label><Input id="cs-add-seat-max" type="number" min={1} max={20} value={maxConcurrent} onChange={(event) => setMaxConcurrent(Math.max(1, Math.min(20, Number(event.target.value) || 3)))} /></div>
          </details>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button><Button disabled={!memberId || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? '正在添加…' : '添加成员'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WebsiteDialog(props: {
  open: boolean
  onOpenChange: (_open: boolean) => void
  organizationId: string
  workspaceId: string
  organizationName: string
  onCompleted: () => Promise<void>
}) {
  const [website, setWebsite] = useState('')
  const origin = originOrNull(website)
  const mutation = useMutation({
    mutationFn: () => {
      if (origin === null) throw new Error('请输入正确的网站地址')
      return createWidgetInstallation({
        organizationId: props.organizationId,
        workspaceId: props.workspaceId,
        displayName: `${props.organizationName} 网站客服`,
        allowedOrigins: [origin],
        branding: { displayName: props.organizationName, primaryColor: null },
        consentVersion: 'v1',
      })
    },
    onSuccess: async (installation) => {
      toast.success('网站接入已创建，接入代码已复制')
      await copyInstallationCode(installation)
      props.onOpenChange(false)
      setWebsite('')
      await props.onCompleted()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>添加接入网站</DialogTitle><DialogDescription>创建后会自动复制网站接入代码。</DialogDescription></DialogHeader>
        <div className="space-y-2"><Label htmlFor="cs-add-website">网站地址</Label><Input id="cs-add-website" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://www.example.com" />{website && origin === null ? <p className="text-xs text-destructive">请输入完整的网站地址，不要包含路径。</p> : null}</div>
        <DialogFooter><Button variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button><Button disabled={origin === null || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? '正在创建…' : '添加并复制代码'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

async function copyInstallationCode(installation: WidgetInstallation): Promise<void> {
  const snippet = buildProvisionSnippet(installation.public_widget_id, { widgetOrigin: CUSTOMER_SERVICE_WIDGET_ORIGIN })
  try {
    await navigator.clipboard.writeText(snippet)
    toast.success('网站接入代码已复制')
  } catch {
    toast.error('复制失败，请检查浏览器剪贴板权限')
  }
}
