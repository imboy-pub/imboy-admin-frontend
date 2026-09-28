import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
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
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog, DataTable, DataTablePagination, EmptyState, EntityDrawer, ErrorState, PageHeader } from '@/components/shared'
import type { EntityDrawerSection } from '@/components/shared'
import { serializeOrgWorkspaceQuery } from '@/components/shared/orgWorkspaceQuery'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { t } from '@/i18n'
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination'
import {
  approveOrganization,
  archiveOrganization,
  getOrganizations,
  rejectOrganization,
  restoreOrganization,
} from '../api/public'
// GZAPP-08：建企走 V2 双模式（registered 复用 EADM-01；pending_phone 建待激活 Owner）
import { OrganizationCreateDialogV2 } from './OrganizationCreateDialogV2'
// 入驻组织邀请码二维码弹窗（GET/POST/DELETE invite_code；打开才发请求）
import { OrganizationQrcodeDialog } from './OrganizationQrcodeDialog'
// CS-ADM-01：档案 Drawer 内嵌组织级客服摘要（Drawer 打开才挂载才发请求）。
import { CsSummaryPanel } from '../components/CsSummaryPanel'
import type { EntityId } from '@/types/common'
import {
  asOrgStatusFilter,
  classifyOrgError,
  isOrgWriteAllowed,
  orgStatusLabel,
  type OrganizationSummary,
  type OrgStatusFilter,
} from '../api/pureFunctions'

const READ_PERMISSION = 'organizations:read'
const WRITE_PERMISSION = 'organizations:write'

type ListState = {
  page: number
  size: number
  q: string
  /** 服务端状态筛选档位（'all' = 不过滤；pending/rejected 为入驻审核两态）。 */
  status: OrgStatusFilter
}

/** 状态筛选下拉选项（值即服务端 status 档位字面量）。 */
const STATUS_FILTER_OPTIONS: Array<{ value: OrgStatusFilter; label: string }> = [
  { value: 'all', label: t('ent.orgList.statusAll') },
  { value: 'active', label: t('ent.orgList.statusActive') },
  { value: 'pending', label: t('ent.orgList.statusPending') },
  { value: 'rejected', label: t('ent.orgList.statusRejected') },
  { value: 'archived', label: t('ent.orgList.statusArchived') },
]

/**
 * 组织列表页（ORG-14 → ORG-ADMIN-ADM-WIRING 平台面）。
 *
 * 数据面：GET /api/adm/organizations（平台视角分页 + 服务端搜索：status /
 * keyword 命中组织名或 TSID）。权限矩阵：页面可达 = organizations:read；
 * mutation 入口 = organizations:write（adm_acl 分权，read-only 恒 403）。
 * Platform Admin 不映射 org owner/admin——member_role 不参与裁决。
 */
export function OrganizationListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { state, setState } = useListQueryState<ListState>({ page: 1, size: DEFAULT_PAGE_SIZE, q: '', status: 'all' })

  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [keywordDraft, setKeywordDraft] = useState(state.q)
  const [pendingArchive, setPendingArchive] = useState<OrganizationSummary | null>(null)
  const [pendingRestore, setPendingRestore] = useState<OrganizationSummary | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  // 组织档案 Drawer（T-P2-4 最小补差，ENT-ADM-04）：消费 ENT-FND-01 的
  // EntityDrawer sections 能力，只读投影行内既有事实，不新发请求。
  const [profileOrg, setProfileOrg] = useState<OrganizationSummary | null>(null)
  // 入驻审核（review 域）+ 邀请码二维码弹窗：org!=null 即 open（复用行对象携带名称等上下文）
  const [pendingApprove, setPendingApprove] = useState<OrganizationSummary | null>(null)
  const [pendingReject, setPendingReject] = useState<OrganizationSummary | null>(null)
  const [qrcodeOrg, setQrcodeOrg] = useState<OrganizationSummary | null>(null)
  // 驳回原因草稿（可选；弹窗内草稿态，确认提交时才 trim 上送）
  const [rejectReasonDraft, setRejectReasonDraft] = useState('')

  const handleCreated = useCallback(
    (organizationId: EntityId, workspaceId: EntityId, _created: boolean) => {
      // 上下文保持：用 EADM-06 org/ws codec 携带 org/ws，禁止手写字符串拼接。
      const qs = serializeOrgWorkspaceQuery({ org: organizationId, ws: workspaceId })
      const target = qs
        ? `/organizations/${encodeURIComponent(organizationId)}?${qs}`
        : `/organizations/${encodeURIComponent(organizationId)}`
      navigate(target, { replace: false })
    },
    [navigate]
  )

  const keyword = state.q.trim()
  // URL 状态是事实源但值不可信（手输/历史链接），经防御收窄后再进 queryKey/请求。
  const statusFilter = asOrgStatusFilter(state.status)
  const query = useQuery({
    queryKey: ['organization', 'list', state.page, state.size, statusFilter, keyword],
    queryFn: () => getOrganizations(state.page, state.size, statusFilter, keyword),
    enabled: readReady,
  })

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', 'list'] })
    void queryClient.invalidateQueries({ queryKey: ['organization', 'detail'] })
  }

  const archiveMutation = useMutation({
    mutationFn: (orgId: string) => archiveOrganization(orgId),
    onSuccess: (result, orgId) => {
      toast.success(
        t('ent.orgList.archiveToast', {
          orgId,
          status: result.status,
          suffix: result.changed ? '' : t('ent.orgList.archiveToastReplaySuffix'),
        })
      )
      setPendingArchive(null)
      invalidateList()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const restoreMutation = useMutation({
    mutationFn: (orgId: string) => restoreOrganization(orgId),
    onSuccess: (result, orgId) => {
      toast.success(t('ent.orgList.restoreToast', { orgId, status: result.status }))
      setPendingRestore(null)
      invalidateList()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  // 入驻审核（review 域）：仅 pending 态可达（入口由 isOrgWriteAllowed 门控），
  // 服务端对非 pending 一律 409；成功后 invalidate 列表/详情让状态列即时收敛。
  const approveMutation = useMutation({
    mutationFn: (orgId: string) => approveOrganization(orgId),
    onSuccess: (result, orgId) => {
      toast.success(t('ent.orgList.approveToast', { orgId, status: result.status }))
      setPendingApprove(null)
      invalidateList()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const rejectMutation = useMutation({
    mutationFn: (input: { orgId: string; reason: string }) => rejectOrganization(input.orgId, input.reason),
    onSuccess: (result, input) => {
      toast.success(t('ent.orgList.rejectToast', { orgId: input.orgId, status: result.status }))
      setPendingReject(null)
      setRejectReasonDraft('')
      invalidateList()
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const rows = useMemo(() => query.data?.items ?? [], [query.data])

  const openDetail = useCallback(
    (org: OrganizationSummary) => {
      navigate(`/organizations/${encodeURIComponent(org.id)}`)
    },
    [navigate]
  )

  const columns = useMemo<LegacyColumnDef<OrganizationSummary>[]>(
    () => [
      {
        header: t('ent.orgList.colName'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center font-medium underline-offset-2 hover:underline"
              onClick={() => openDetail(row.original)}
            >
              {row.original.name}
            </button>
            {row.original.status === 'archived' && <Badge variant="destructive">{t('ent.orgList.archivedBadge')}</Badge>}
            {/* 入驻审核两态徽章（与 archivedBadge 同位呈现，风格一致） */}
            {row.original.status === 'pending' && <Badge variant="secondary">{t('ent.orgList.pendingBadge')}</Badge>}
            {row.original.status === 'rejected' && <Badge variant="destructive">{t('ent.orgList.rejectedBadge')}</Badge>}
          </div>
        ),
      },
      {
        header: t('ent.orgList.colOrgId'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      {
        header: t('ent.orgList.colOwner'),
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.ownerNickname || row.original.ownerId ? (
              <>
                {row.original.ownerNickname || '-'}
                {row.original.ownerAccount ? (
                  <span className="ml-1 text-muted-foreground">({row.original.ownerAccount})</span>
                ) : null}
                {row.original.ownerId ? (
                  <span className="ml-1 font-mono text-muted-foreground">{row.original.ownerId}</span>
                ) : null}
              </>
            ) : (
              '-'
            )}
          </span>
        ),
      },
      {
        header: t('ent.orgList.colMemberWorkspace'),
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.memberCount ?? '-'} / {row.original.workspaceCount ?? '-'}
          </span>
        ),
      },
      {
        header: t('ent.orgList.colStatus'),
        cell: ({ row }) => <span className="font-mono text-xs">{orgStatusLabel(row.original.status)}</span>,
      },
      {
        header: t('ent.orgList.colCreatedAt'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.createdAt || '-'}</span>,
      },
      {
        header: t('ent.orgList.colActions'),
        cell: ({ row }) => {
          const org = row.original
          // 档案 Drawer 为只读投影（organizations:read 门内页面即可用），
          // read-only 账号也提供；归档 / 恢复写入口仍按 canWrite 分权裁决。
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                data-testid="org-profile-btn"
                onClick={() => setProfileOrg(org)}
              >
                {t('ent.orgList.actionProfile')}
              </Button>
              {!canWrite ? (
                <span className="text-xs text-muted-foreground">{t('ent.orgList.readonlyHint', { permission: WRITE_PERMISSION })}</span>
              ) : (
                <>
                  {/* 邀请码二维码（扫码加入组织；打开弹窗后才发请求） */}
                  <Button variant="ghost" size="sm" data-testid="org-qrcode-btn" onClick={() => setQrcodeOrg(org)}>
                    {t('ent.orgList.qrcode')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openDetail(org)}>
                    {t('ent.orgList.actionGovern')}
                  </Button>
                  {isOrgWriteAllowed(org.status, 'approve') ? (
                    <Button variant="outline" size="sm" data-testid="org-approve-btn" onClick={() => setPendingApprove(org)}>
                      {t('ent.orgList.actionApprove')}
                    </Button>
                  ) : null}
                  {isOrgWriteAllowed(org.status, 'reject') ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      data-testid="org-reject-btn"
                      onClick={() => {
                        setRejectReasonDraft('')
                        setPendingReject(org)
                      }}
                    >
                      {t('ent.orgList.actionReject')}
                    </Button>
                  ) : null}
                  {isOrgWriteAllowed(org.status, 'archive') ? (
                    <Button variant="outline" size="sm" data-testid="org-archive-btn" onClick={() => setPendingArchive(org)}>
                      {t('ent.orgList.actionArchive')}
                    </Button>
                  ) : null}
                  {isOrgWriteAllowed(org.status, 'restore') ? (
                    <Button variant="outline" size="sm" data-testid="org-restore-btn" onClick={() => setPendingRestore(org)}>
                      {t('ent.orgList.actionRestore')}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          )
        },
      },
    ],
    [openDetail, canWrite]
  )

  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  let body: ReactElement
  if (!readReady) {
    body = <EmptyState title={t('ent.orgList.noPermissionTitle')} description={t('ent.orgList.noPermissionDescription', { permission: READ_PERMISSION })} />
  } else if (query.error) {
    const failure = classifyOrgError(query.error)
    body = (
      <ErrorState
        message={failure.message}
        onRetry={() => void query.refetch()}
      />
    )
  } else {
    body = (
      <div className="space-y-3">
        <DataTable table={table} loading={query.isLoading} emptyMessage={keyword ? t('ent.orgList.emptyWithKeyword') : t('ent.orgList.empty')} />
        <DataTablePagination
          page={query.data?.page ?? state.page}
          pageSize={query.data?.size ?? state.size}
          total={query.data?.total ?? 0}
          onPageChange={(page) => setState({ page })}
          onPageSizeChange={(size) => setState({ size, page: 1 })}
          dataUpdatedAt={query.dataUpdatedAt}
          onRefresh={() => void query.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4" data-page="organization-list">
      <PageHeader
        title={t('ent.orgList.pageTitle')}
        description={t('ent.orgList.pageDescription', { readPermission: READ_PERMISSION, writePermission: WRITE_PERMISSION })}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t('ent.orgList.cardTitle')}</CardTitle>
          {/*
            §9-2 合同（EADM-07）：read-only 账号「只见只读页、无写入口」。
            「无写入口」= 该入口不进 DOM，而不是渲染一个 disabled 按钮——disabled 仍是
            可见的写入口，且会被无障碍树暴露为可聚焦控件。授权真源仍是服务端
            adm_acl fail-closed（本页直调写 API 亦恒 403，见同用例断言 4），
            这里只负责「不给不该写的人看见入口」。
          */}
          {canWrite && (
            <Button
              type="button"
              size="sm"
              data-testid="org-create-entry"
              title={t('ent.orgList.createOrg')}
              onClick={() => setCreateOpen(true)}
            >
              {t('ent.orgList.createOrg')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex max-w-2xl items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setState({ q: keywordDraft, page: 1 })
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="org-list-q">{t('ent.orgList.searchLabel')}</Label>
              <Input
                id="org-list-q"
                value={keywordDraft}
                onChange={(event) => setKeywordDraft(event.target.value)}
                placeholder={t('ent.orgList.searchPlaceholder')}
              />
            </div>
            {/* 状态筛选（服务端 status 档位；变更即时写回 URL 并重置页码） */}
            <div className="w-44 space-y-1.5">
              <Label htmlFor="org-list-status">{t('ent.orgList.statusFilterLabel')}</Label>
              <Select
                id="org-list-status"
                value={statusFilter}
                data-testid="org-status-filter"
                onChange={(event) => setState({ status: asOrgStatusFilter(event.target.value), page: 1 })}
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" size="sm" variant="outline" data-testid="org-search-submit">
              <Search className="mr-1 h-4 w-4" />
              {t('ent.orgList.search')}
            </Button>
          </form>
          {body}
          <p className="text-xs text-muted-foreground">{t('ent.orgList.footnote')}</p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingArchive != null}
        onOpenChange={(open) => {
          if (!open) setPendingArchive(null)
        }}
        title={t('ent.orgList.archiveTitle', { name: pendingArchive?.name ?? '' })}
        description={t('ent.orgList.archiveDescription')}
        confirmText={t('ent.orgList.archiveConfirm')}
        variant="destructive"
        loading={archiveMutation.isPending}
        onConfirm={async () => {
          if (pendingArchive) await archiveMutation.mutateAsync(pendingArchive.id)
        }}
      />

      <ConfirmDialog
        open={pendingRestore != null}
        onOpenChange={(open) => {
          if (!open) setPendingRestore(null)
        }}
        title={t('ent.orgList.restoreTitle', { name: pendingRestore?.name ?? '' })}
        description={t('ent.orgList.restoreDescription')}
        confirmText={t('ent.orgList.restoreConfirm')}
        loading={restoreMutation.isPending}
        onConfirm={async () => {
          if (pendingRestore) await restoreMutation.mutateAsync(pendingRestore.id)
        }}
      />

      {/* 入驻审核：通过（简单确认） */}
      <ConfirmDialog
        open={pendingApprove != null}
        onOpenChange={(open) => {
          if (!open) setPendingApprove(null)
        }}
        title={t('ent.orgList.approveTitle', { name: pendingApprove?.name ?? '' })}
        description={t('ent.orgList.approveDescription')}
        confirmText={t('ent.orgList.approveConfirm')}
        loading={approveMutation.isPending}
        onConfirm={async () => {
          if (pendingApprove) await approveMutation.mutateAsync(pendingApprove.id)
        }}
      />

      {/* 入驻审核：驳回（可选原因 textarea；确认前二次确认） */}
      <Dialog
        open={pendingReject != null}
        onOpenChange={(open) => {
          if (!open) setPendingReject(null)
        }}
      >
        <DialogContent data-testid="org-reject-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ent.orgList.rejectTitle', { name: pendingReject?.name ?? '' })}</DialogTitle>
            <DialogDescription>{t('ent.orgList.rejectDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="org-reject-reason">{t('ent.orgList.rejectReasonLabel')}</Label>
            <Textarea
              id="org-reject-reason"
              value={rejectReasonDraft}
              onChange={(event) => setRejectReasonDraft(event.target.value)}
              placeholder={t('ent.orgList.rejectReasonPlaceholder')}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={rejectMutation.isPending}
              onClick={() => setPendingReject(null)}
            >
              {t('ent.orgList.rejectCancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="org-reject-confirm"
              disabled={rejectMutation.isPending}
              onClick={() => {
                if (pendingReject) {
                  rejectMutation.mutate({ orgId: pendingReject.id, reason: rejectReasonDraft })
                }
              }}
            >
              {rejectMutation.isPending ? t('ent.orgList.rejectSubmitting') : t('ent.orgList.rejectConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 组织邀请码二维码（open 才发请求；关闭即卸载内容并复位会话态） */}
      <OrganizationQrcodeDialog
        org={qrcodeOrg}
        open={qrcodeOrg != null}
        onOpenChange={(open) => {
          if (!open) setQrcodeOrg(null)
        }}
      />

      <OrganizationCreateDialogV2
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      {/* 组织档案 Drawer（T-P2-4 最小补差 + CS-ADM-01 客服摘要）：行内事实只读投影
          + 客服摘要（custom 分区，Drawer 打开才挂载/发请求）+ 合同背书关系导航 */}
      <EntityDrawer
        open={profileOrg != null}
        onOpenChange={(open) => {
          if (!open) setProfileOrg(null)
        }}
        title={t('ent.orgProfile.drawerTitle')}
        subtitle={profileOrg ? `${profileOrg.name} · ${orgStatusLabel(profileOrg.status)}` : undefined}
        sections={profileOrg ? buildOrgProfileSections(profileOrg) : []}
      />
    </div>
  )
}

/**
 * 组织档案 Drawer 分区（ENT-FND-01 sections 消费，对齐 MembersPage 模式）：
 * - profile 分区：列表行内既有事实（只读投影，不新发请求）；
 * - relationship 分区：合同背书路由的关系导航（组织详情 / 成员 / 邀请 / 部门 /
 *   Owner 用户详情——均为 App.tsx 已注册的既有 URL，不造新路由）。
 * branding/settings 键值可能含租户私有配置，档案分区不渲染取值（只投影计数事实）。
 */
function buildOrgProfileSections(org: OrganizationSummary): EntityDrawerSection[] {
  const orgBase = `/organizations/${encodeURIComponent(org.id)}`
  // CS-ADM-01：客服治理面直达（org 经共享 codec 生成，禁止手写 ?org= 拼接）。
  const csScope = serializeOrgWorkspaceQuery({ org: org.id })
  const csHref = csScope.length > 0 ? `/customer-service?${csScope}` : '/customer-service'
  return [
    {
      id: 'org-profile-facts',
      kind: 'profile',
      title: t('ent.orgProfile.sectionTitle'),
      fields: [
        { label: t('ent.orgProfile.fieldTsid'), value: org.id, mono: true },
        { label: t('ent.orgProfile.fieldName'), value: org.name },
        { label: t('ent.orgProfile.fieldOwnerId'), value: org.ownerId || '-', mono: true },
        {
          label: t('ent.orgProfile.fieldOwner'),
          value: `${org.ownerNickname || '-'}${org.ownerAccount ? ` (${org.ownerAccount})` : ''}`,
        },
        { label: t('ent.orgProfile.fieldStatus'), value: orgStatusLabel(org.status), mono: true },
        { label: t('ent.orgProfile.fieldMemberCount'), value: org.memberCount == null ? '-' : String(org.memberCount), mono: true },
        { label: t('ent.orgProfile.fieldWorkspaceCount'), value: org.workspaceCount == null ? '-' : String(org.workspaceCount), mono: true },
        { label: t('ent.orgProfile.fieldCreatedAt'), value: org.createdAt || '-', mono: true },
      ],
    },
    {
      // CS-ADM-01：组织级客服摘要（custom 分区承载活数据；其余分区仍是
      // 「不新发请求」的行内只读投影——只有本分区按需取数，且仅在 Drawer
      // 打开期间挂载）。面板自带 customer_service:read 门（fail-closed）。
      id: 'org-profile-cs-summary',
      kind: 'custom',
      title: t('ent.orgProfile.csSectionTitle'),
      content: <CsSummaryPanel organizationId={org.id} variant="inline" />,
    },
    {
      id: 'org-profile-relations',
      kind: 'relationship',
      title: t('ent.orgProfile.relationSectionTitle'),
      items: [
        { id: 'relation-org-detail', label: t('ent.orgProfile.relationOrgDetail'), href: orgBase },
        { id: 'relation-org-members', label: t('ent.orgProfile.relationMembers'), href: `${orgBase}/members` },
        { id: 'relation-org-invitations', label: t('ent.orgProfile.relationInvitations'), href: `${orgBase}/invitations` },
        { id: 'relation-org-departments', label: t('ent.orgProfile.relationDepartments'), href: `${orgBase}/departments` },
        { id: 'relation-org-cs', label: t('ent.orgProfile.relationCs'), href: csHref },
        ...(org.ownerId
          ? [{ id: 'relation-owner-user', label: t('ent.orgProfile.relationOwnerUser'), href: `/users/${encodeURIComponent(org.ownerId)}` }]
          : []),
      ],
      emptyMessage: t('ent.orgProfile.relationEmpty'),
    },
  ]
}
