import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageSquare } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { OrganizationWorkspacePicker } from '@/components/shared/OrganizationWorkspacePicker'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { getErrorMessage } from '@/lib/errorUtils'
import type { WidgetInstallation } from '../api/widgetInstallationsPure'
import { useOrgWorkspaceScope } from './useOrgWorkspaceScope'
import {
  buildEmbedCode,
  parseAllowedOriginsInput,
} from '../api/widgetInstallationsPure'
import { paginateClientSide } from '../api/pureFunctions'
import {
  createWidgetInstallation,
  listWidgetInstallations,
  revokeWidgetInstallation,
} from '../api/widgetInstallations'
import { CUSTOMER_SERVICE_WIDGET_ORIGIN } from '../widgetConfig'

const READ_PERMISSION = 'customer_service:read'
const WRITE_PERMISSION = 'customer_service:write'

/**
 * 客服 Widget 接入管理页（CSW-01 / §12.5.2）。
 *
 * - read（customer_service:read）：installation 列表 + public_widget_id + 复制接入代码；
 * - write（customer_service:write）：创建 / 撤销；
 * - 接入代码只含 script 标签 + public widget_id，绝不出现任何 secret；
 * - shop_key 是另一套 Org 级门店接入凭证，不属于 Widget installation。
 */
export function CsWidgetInstallationsPage() {
  const { state, setState } = useListQueryState<{
    page: number
    size: number
  }>({ page: 1, size: 10 })
  const scope = useOrgWorkspaceScope()
  const organizationId = scope.organizationId ?? ''
  const workspaceId = scope.workspaceId ?? ''
  const scopeReady = organizationId.length > 0 && workspaceId.length > 0

  const { allowed: canRead, loading: readPermLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const listQuery = useQuery({
    queryKey: ['customer_service', 'widget_installations', organizationId, workspaceId],
    queryFn: () => listWidgetInstallations({ organizationId, workspaceId }),
    enabled: scopeReady && canRead && !readPermLoading,
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<WidgetInstallation | null>(null)
  const [embedTarget, setEmbedTarget] = useState<WidgetInstallation | null>(null)
  const createMutation = useMutation({
    mutationFn: (input: {
      displayName: string
      allowedOrigins: string[]
      brandingDisplayName: string
      brandingPrimaryColor: string
      consentVersion: string
    }) =>
      createWidgetInstallation({
        organizationId,
        workspaceId,
        displayName: input.displayName,
        allowedOrigins: input.allowedOrigins,
        branding: {
          displayName: input.brandingDisplayName.trim() || null,
          primaryColor: input.brandingPrimaryColor.trim() || null,
        },
        consentVersion: input.consentVersion,
      }),
    onSuccess: (installation) => {
      toast.success('Widget 接入已创建')
      setCreateOpen(false)
      setEmbedTarget(installation)
      void listQuery.refetch()
    },
    onError: (error) => toast.error(`创建失败：${getErrorMessage(error)}`),
  })

  const revokeMutation = useMutation({
    mutationFn: (installation: WidgetInstallation) =>
      revokeWidgetInstallation({ organizationId, workspaceId, installationId: installation.id }),
    onSuccess: () => {
      toast.success('接入已撤销')
      setRevokeTarget(null)
      void listQuery.refetch()
    },
    onError: (error) => toast.error(`撤销失败：${getErrorMessage(error)}`),
  })

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])

  return (
    <div className="space-y-4" data-page="cs-widget-installations">
      <PageHeader
        title="网站接入"
        description="管理显示在线客服入口的网站。"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">租户范围（必填）</CardTitle>
          <Button
            size="sm"
            disabled={!canWrite || !scopeReady || createMutation.isPending}
            title={canWrite ? undefined : '需要 customer_service:write 权限'}
            onClick={() => setCreateOpen(true)}
          >
            添加网站
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>组织 / 工作区</Label>
            <OrganizationWorkspacePicker
              organizationId={scope.organizationId}
              workspaceId={scope.workspaceId}
              organizations={scope.organizations}
              workspaces={scope.workspaces}
              loading={scope.loading}
              onChange={scope.onChange}
            />
            <p className="text-xs text-muted-foreground">
              组织/工作区来自共享选择器，上下文写入 URL（org/ws），刷新与分享后不丢失；禁止手填 TSID。
            </p>
          </div>
        </CardContent>
      </Card>

      <InstallationsSection
        scopeReady={scopeReady}
        canRead={canRead && !readPermLoading}
        loading={listQuery.isLoading}
        error={listQuery.error}
        rows={rows}
        page={state.page}
        size={state.size}
        canWrite={canWrite}
        onPageChange={(page) => setState({ page })}
        onPageSizeChange={(size) => setState({ page: 1, size })}
        onRetry={() => void listQuery.refetch()}
        onCopyEmbed={setEmbedTarget}
        onRevoke={setRevokeTarget}
      />

      <CreateInstallationDialog
        open={createOpen}
        pending={createMutation.isPending}
        onOpenChange={setCreateOpen}
        onSubmit={(input) => createMutation.mutate(input)}
      />

      <EmbedCodeDialog
        installation={embedTarget}
        onClose={() => setEmbedTarget(null)}
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        title="停用网站接入"
        description="停用后，对应网站上的客服入口将立即不可用。"
        confirmText="停用"
        loading={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeTarget !== null) revokeMutation.mutate(revokeTarget)
        }}
      />
    </div>
  )
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  } catch {
    toast.error('复制失败，请手动选择文本复制')
  }
}

type InstallationsSectionProps = {
  scopeReady: boolean
  canRead: boolean
  loading: boolean
  error: unknown
  rows: WidgetInstallation[]
  page: number
  size: number
  canWrite: boolean
  onPageChange: (_page: number) => void
  onPageSizeChange: (_size: number) => void
  onRetry: () => void
  onCopyEmbed: (_installation: WidgetInstallation) => void
  onRevoke: (_installation: WidgetInstallation) => void
}

function InstallationsSection(props: InstallationsSectionProps) {
  if (!props.scopeReady) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState icon={<MessageSquare className="h-10 w-10" />} title="请先填写组织与工作区" description="Widget 接入归属组织；管理接口要求显式提供 org_id 与 workspace_id。" />
        </CardContent>
      </Card>
    )
  }
  if (!props.canRead) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState icon={<MessageSquare className="h-10 w-10" />} title="无权访问" description="需要 customer_service:read 权限。" />
        </CardContent>
      </Card>
    )
  }
  if (props.loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <LoadingState message="加载 Widget 接入列表…" />
        </CardContent>
      </Card>
    )
  }
  if (props.error !== null && props.error !== undefined) {
    return (
      <Card>
        <CardContent className="py-8">
          <ErrorState
            message={`加载 Widget 接入失败：${getErrorMessage(props.error)}`}
            onRetry={props.onRetry}
          />
        </CardContent>
      </Card>
    )
  }
  return (
    <InstallationTable
      rows={props.rows}
      page={props.page}
      size={props.size}
      canWrite={props.canWrite}
      onPageChange={props.onPageChange}
      onPageSizeChange={props.onPageSizeChange}
      onCopyEmbed={props.onCopyEmbed}
      onRevoke={props.onRevoke}
    />
  )
}

function InstallationTable({ rows, page, size, canWrite, onPageChange, onPageSizeChange, onCopyEmbed, onRevoke }: {
  rows: WidgetInstallation[]
  page: number
  size: number
  canWrite: boolean
  onPageChange: (_page: number) => void
  onPageSizeChange: (_size: number) => void
  onCopyEmbed: (_installation: WidgetInstallation) => void
  onRevoke: (_installation: WidgetInstallation) => void
}) {
  const columns = useMemo<LegacyColumnDef<WidgetInstallation>[]>(
    () => [
      { header: '名称', accessorKey: 'display_name' },
      {
        header: '公开标识',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.public_widget_id}</span>,
      },
      {
        header: '允许来源',
        cell: ({ row }) => (
          <span className="max-w-[240px] truncate text-xs" title={row.original.allowed_origins.join('\n')}>
            {row.original.allowed_origins.length > 0 ? row.original.allowed_origins.join(', ') : '—'}
          </span>
        ),
      },
      { header: '同意版本', accessorKey: 'consent_version' },
      {
        header: '状态',
        cell: ({ row }) =>
          row.original.status === 'revoked' ? (
            <Badge variant="outline">已撤销</Badge>
          ) : (
            <Badge className="bg-green-100 text-green-800">启用</Badge>
          ),
      },
      {
        header: '操作',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onCopyEmbed(row.original)}>
              复制代码
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canWrite || row.original.status === 'revoked'}
              title={canWrite ? undefined : '需要 customer_service:write 权限'}
              onClick={() => onRevoke(row.original)}
            >
              停用
            </Button>
          </div>
        ),
      },
    ],
    [canWrite, onCopyEmbed, onRevoke]
  )
  const table = useLegacyTable({
    data: paginateClientSide(rows, page, size),
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState icon={<MessageSquare className="h-10 w-10" />} title="暂无网站接入" description="点击「添加网站」启用第一个网站客服入口。" />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="space-y-3">
        <DataTable table={table} loading={false} emptyMessage="暂无 Widget 接入" />
        <DataTablePagination
          page={page}
          pageSize={size}
          total={rows.length}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          onRefresh={() => undefined}
        />
      </CardContent>
    </Card>
  )
}

function CreateInstallationDialog(props: {
  open: boolean
  pending: boolean
  onOpenChange: (_open: boolean) => void
  onSubmit: (_input: {
    displayName: string
    allowedOrigins: string[]
    brandingDisplayName: string
    brandingPrimaryColor: string
    consentVersion: string
  }) => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [originsInput, setOriginsInput] = useState('')
  const [brandingDisplayName, setBrandingDisplayName] = useState('')
  const [brandingPrimaryColor, setBrandingPrimaryColor] = useState('')
  const [consentVersion, setConsentVersion] = useState('v1')
  const parsedOrigins = useMemo(() => parseAllowedOriginsInput(originsInput), [originsInput])
  const submitDisabled =
    props.pending || displayName.trim().length === 0 || parsedOrigins.origins.length === 0 || parsedOrigins.errors.length > 0 || consentVersion.trim().length === 0

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加接入网站</DialogTitle>
          <DialogDescription>
            创建后即可复制代码并添加到网站页面。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="csw-display-name">显示名称（display_name）</Label>
            <Input id="csw-display-name" value={displayName} maxLength={100} onChange={(e) => setDisplayName(e.target.value)} placeholder="例如：商城在线客服" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csw-origins">允许来源（allowed_origins，每行一个 origin）</Label>
            <Textarea id="csw-origins" rows={3} value={originsInput} onChange={(e) => setOriginsInput(e.target.value)} placeholder={'https://shop.example.com\nhttps://www.example.com'} />
            {parsedOrigins.errors.length > 0 && (
              <p className="text-xs text-destructive">非法 origin（需 http(s) 且无路径/通配）：{parsedOrigins.errors.join('、')}</p>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="csw-brand-name">品牌名（branding.display_name，可选）</Label>
              <Input id="csw-brand-name" value={brandingDisplayName} maxLength={50} onChange={(e) => setBrandingDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csw-brand-color">品牌主色（branding.primary_color，可选）</Label>
              <Input id="csw-brand-color" value={brandingPrimaryColor} maxLength={9} onChange={(e) => setBrandingPrimaryColor(e.target.value)} placeholder="#2563eb" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csw-consent-version">隐私同意版本（consent_version）</Label>
            <Input id="csw-consent-version" value={consentVersion} maxLength={20} onChange={(e) => setConsentVersion(e.target.value)} placeholder="v1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button>
          <Button disabled={submitDisabled} onClick={() => props.onSubmit({ displayName, allowedOrigins: parsedOrigins.origins, brandingDisplayName, brandingPrimaryColor, consentVersion })}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmbedCodeDialog(props: {
  installation: WidgetInstallation | null
  onClose: () => void
}) {
  const widgetOrigin = CUSTOMER_SERVICE_WIDGET_ORIGIN
  let snippet = ''
  let snippetError: string | null = null
  if (props.installation !== null) {
    try {
      snippet = buildEmbedCode(props.installation.public_widget_id, {
        widgetOrigin,
      })
    } catch (error) {
      snippetError = getErrorMessage(error)
    }
  }
  return (
    <Dialog open={props.installation !== null} onOpenChange={(open) => { if (!open) props.onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>网站接入代码</DialogTitle>
          <DialogDescription>
            将以下代码粘贴到网站页面的 &lt;body&gt; 内。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {snippetError !== null ? (
            <p className="text-xs text-destructive">{snippetError}</p>
          ) : (
            <Textarea readOnly rows={3} value={snippet} className="font-mono text-xs" data-testid="csw-embed-code" onFocus={(e) => e.currentTarget.select()} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onClose()}>关闭</Button>
          <Button disabled={snippet.length === 0} onClick={() => void copyText(snippet)}>复制接入代码</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
