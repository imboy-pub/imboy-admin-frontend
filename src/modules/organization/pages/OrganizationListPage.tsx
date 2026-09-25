import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog, DataTable, DataTablePagination, EmptyState, EntityDrawer, ErrorState, PageHeader } from '@/components/shared'
import type { EntityDrawerSection } from '@/components/shared'
import { serializeOrgWorkspaceQuery } from '@/components/shared/orgWorkspaceQuery'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { t } from '@/i18n'
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination'
import {
  archiveOrganization,
  getOrganizations,
  restoreOrganization,
} from '../api/public'
// GZAPP-08：建企走 V2 双模式（registered 复用 EADM-01；pending_phone 建待激活 Owner）
import { OrganizationCreateDialogV2 } from './OrganizationCreateDialogV2'
// CS-ADM-01：档案 Drawer 内嵌组织级客服摘要（Drawer 打开才挂载才发请求）。
import { CsSummaryPanel } from '../components/CsSummaryPanel'
import type { EntityId } from '@/types/common'
import {
  classifyOrgError,
  isOrgWriteAllowed,
  orgStatusLabel,
  type OrganizationSummary,
} from '../api/pureFunctions'

const READ_PERMISSION = 'organizations:read'
const WRITE_PERMISSION = 'organizations:write'

type ListState = {
  page: number
  size: number
  q: string
}

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
  const { state, setState } = useListQueryState<ListState>({ page: 1, size: DEFAULT_PAGE_SIZE, q: '' })

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
  const query = useQuery({
    queryKey: ['organization', 'list', state.page, state.size, keyword],
    queryFn: () => getOrganizations(state.page, state.size, 'all', keyword),
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
              className="font-medium underline-offset-2 hover:underline"
              onClick={() => openDetail(row.original)}
            >
              {row.original.name}
            </button>
            {row.original.status === 'archived' && <Badge variant="destructive">{t('ent.orgList.archivedBadge')}</Badge>}
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
                  <Button variant="ghost" size="sm" onClick={() => openDetail(org)}>
                    {t('ent.orgList.actionGovern')}
                  </Button>
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
            className="flex max-w-md items-end gap-2"
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
