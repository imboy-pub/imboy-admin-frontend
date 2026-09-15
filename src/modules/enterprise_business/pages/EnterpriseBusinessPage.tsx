import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { toast } from 'sonner'
import { Building2, Download, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DataTable,
  DataTablePagination,
  EmptyState,
  EntityDrawer,
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
  fetchEbAssetContent,
  getEbContacts,
  getEbContactDetail,
  getEbConversationMessages,
  getEbIdentities,
  type EbAssetContent,
} from '../api/public'
import {
  type EbContact,
  type EbIdentity,
  type EbMessage,
  type EbScopeParams,
} from '../api/pureFunctions'

const READ_PERMISSION = 'enterprise_business:read'

/**
 * 企业业务平台只读页（CS-03）。只调 `/api/adm/enterprise-business/*` 读端点
 * （enterprise_business:read）：业务身份/assignment、企业客户、会话企业消息与
 * 附件内容。平台面每条路径都必须显式 org_id + workspace_id；页面不渲染任何
 * 密文、HMAC、object key（CS-03-A05，展示字段白名单见 api/pureFunctions）。
 */
export function EnterpriseBusinessPage() {
  const { state, setState } = useListQueryState<{
    page: number
    size: number
    org: string
    ws: string
  }>({ page: 1, size: 10, org: '', ws: '' })
  const scope = useMemo<EbScopeParams | null>(() => {
    const organizationId = state.org.trim()
    const workspaceId = state.ws.trim()
    if (organizationId.length === 0 || workspaceId.length === 0) return null
    return { organizationId, workspaceId }
  }, [state.org, state.ws])

  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  // Tabs 是受控组件（value + onValueChange）
  const [activeTab, setActiveTab] = useState('identities')

  // 筛选（org/ws）变化一律重置 page=1
  const updateScope = (patch: { org?: string; ws?: string }) => setState({ ...patch, page: 1 })

  return (
    <div className="space-y-4" data-page="enterprise-business-readonly">
      <PageHeader
        title="企业业务数据"
        description="平台只读详情（enterprise_business:read）：业务身份/assignment、企业客户、会话企业消息与附件内容。密文与 HMAC 字段平台不可读、不展示。"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">租户范围（必填）</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <ScopeField
            id="eb-org-id"
            label="组织 ID（organization_id）"
            value={state.org}
            onChange={(value) => updateScope({ org: value })}
            placeholder="TSID，例如 1234567890123456789"
          />
          <ScopeField
            id="eb-ws-id"
            label="工作区 ID（workspace_id）"
            value={state.ws}
            onChange={(value) => updateScope({ ws: value })}
            placeholder="TSID，例如 1234567890123456789"
          />
        </CardContent>
      </Card>

      {scope === null ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="请先填写组织与工作区"
          description="平台面不存在无租户条件的全局列举：每条查询都必须携带 organization_id 与 workspace_id。"
        />
      ) : !readReady ? (
        <EmptyState title="无查看权限" description="查看企业业务数据需要 enterprise_business:read 权限。" />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="identities">业务身份</TabsTrigger>
            <TabsTrigger value="contacts">企业客户</TabsTrigger>
            <TabsTrigger value="messages">会话消息</TabsTrigger>
            <TabsTrigger value="assets">附件内容</TabsTrigger>
          </TabsList>
          <TabsContent value="identities">
            <IdentitiesSection key={`${scope.organizationId}:${scope.workspaceId}`} scope={scope} defaultSize={state.size} />
          </TabsContent>
          <TabsContent value="contacts">
            <ContactsSection key={`${scope.organizationId}:${scope.workspaceId}`} scope={scope} defaultSize={state.size} />
          </TabsContent>
          <TabsContent value="messages">
            <MessagesSection key={`${scope.organizationId}:${scope.workspaceId}`} scope={scope} defaultSize={state.size} />
          </TabsContent>
          <TabsContent value="assets">
            <AssetSection key={`${scope.organizationId}:${scope.workspaceId}`} scope={scope} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function ScopeField(props: {
  id: string
  label: string
  value: string
  onChange: (_value: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        value={props.value}
        inputMode="numeric"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
      />
    </div>
  )
}

type CursorListState<T> = {
  items: T[]
  page: number
  pageSize: number
  hasMore: boolean
  loading: boolean
  error: string | null
}

function initialCursorState<T>(pageSize: number): CursorListState<T> {
  return { items: [], page: 1, pageSize, hasMore: true, loading: false, error: null }
}

/**
 * 键集分页累积器（后端 `id > after_id` 语义，非 OFFSET）：已取回的块按序累积，
 * 「下一页」在越过已取回范围时才按游标取下一块。
 *
 * 无内部 reset effect：调用方以 `key=<resetKey>` 挂载本 hook 所属组件，
 * 筛选变化即整体重挂载（等价 page=1 重置）。
 */
function useCursorList<T extends { id: EntityId }>({ initialSize, fetchChunk }: {
  initialSize: number
  fetchChunk: (_afterId: EntityId | undefined, _limit: number) => Promise<T[]>
}) {
  const [list, setList] = useState<CursorListState<T>>(() => initialCursorState(initialSize))
  const inflight = useRef(false)

  const loadChunk = useCallback(
    async (target: CursorListState<T>) => {
      if (inflight.current) return
      inflight.current = true
      setList((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const afterId = target.items.length > 0 ? target.items[target.items.length - 1].id : undefined
        const chunk = await fetchChunk(afterId, target.pageSize)
        setList((prev) => ({
          ...prev,
          items: [...prev.items, ...chunk],
          hasMore: chunk.length >= prev.pageSize,
          loading: false,
        }))
      } catch (err) {
        setList((prev) => ({ ...prev, loading: false, error: getErrorMessage(err) }))
      } finally {
        inflight.current = false
      }
    },
    [fetchChunk]
  )

  const loadedPages = Math.floor(list.items.length / list.pageSize)
  const gotoPage = (page: number) => {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
    if (safePage <= loadedPages) {
      setList((prev) => ({ ...prev, page: safePage }))
      return
    }
    if (list.hasMore && safePage === loadedPages + 1 && !list.loading) {
      setList((prev) => ({ ...prev, page: safePage }))
      void loadChunk(list)
    }
  }
  const changePageSize = (size: number) => setList(() => initialCursorState(size))
  const refresh = () => setList((prev) => initialCursorState(prev.pageSize))

  // 首块自动加载：items 为空且可能还有数据时取第一块（重挂载/刷新/换页大小后自动触发）
  useEffect(() => {
    if (list.items.length === 0 && list.hasMore && !list.loading && list.error === null) {
      void loadChunk(list)
    }
  }, [list, loadChunk])

  return { ...list, gotoPage, changePageSize, refresh }
}

function CursorTableFrame(props: {
  title: string
  loading: boolean
  error: string | null
  emptyMessage: string
  isEmpty: boolean
  children: React.ReactNode
  footer?: React.ReactNode
  onRetry: () => void
  testId: string
}) {
  return (
    <Card data-testid={props.testId}>
      <CardHeader>
        <CardTitle className="text-base">{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.error ? (
          <ErrorState message={`加载失败：${props.error}`} onRetry={props.onRetry} />
        ) : props.loading && props.isEmpty ? (
          <LoadingState message="加载数据中..." />
        ) : props.isEmpty ? (
          <EmptyState title="暂无数据" description={props.emptyMessage} />
        ) : (
          <>
            {props.children}
            {props.footer}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function IdentitiesSection({ scope, defaultSize }: { scope: EbScopeParams; defaultSize: number }) {
  const cursor = useCursorList<EbIdentity>({
    initialSize: defaultSize,
    fetchChunk: (afterId, limit) => getEbIdentities(scope, afterId, limit),
  })
  const rows = cursor.items.slice((cursor.page - 1) * cursor.pageSize, cursor.page * cursor.pageSize)

  const columns = useMemo<LegacyColumnDef<EbIdentity>[]>(
    () => [
      { header: '身份 ID', cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span> },
      { header: '职能（function_key）', accessorKey: 'function_key' },
      { header: '显示名', accessorKey: 'display_name' },
      {
        header: '状态（assignment）',
        cell: ({ row }) => <EbStatusBadge status={row.original.status} />,
      },
      { header: '版本', accessorKey: 'version' },
    ],
    []
  )
  const table = useLegacyTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <CursorTableFrame
      title="业务身份 / assignment"
      testId="eb-identities"
      loading={cursor.loading}
      error={cursor.error}
      isEmpty={cursor.items.length === 0}
      emptyMessage="该工作区暂无企业业务身份"
      onRetry={cursor.refresh}
      footer={
        <DataTablePagination
          page={cursor.page}
          pageSize={cursor.pageSize}
          total={cursor.items.length + (cursor.hasMore ? 1 : 0)}
          onPageChange={cursor.gotoPage}
          onPageSizeChange={cursor.changePageSize}
          onRefresh={cursor.refresh}
        />
      }
    >
      <DataTable table={table} emptyMessage="该工作区暂无企业业务身份" />
    </CursorTableFrame>
  )
}

function ContactsSection({ scope, defaultSize }: { scope: EbScopeParams; defaultSize: number }) {
  const cursor = useCursorList<EbContact>({
    initialSize: defaultSize,
    fetchChunk: (afterId, limit) => getEbContacts(scope, afterId, limit),
  })
  const [selected, setSelected] = useState<EbContact | null>(null)
  const rows = cursor.items.slice((cursor.page - 1) * cursor.pageSize, cursor.page * cursor.pageSize)

  const detailQuery = useQuery({
    queryKey: ['enterprise_business', 'contact-detail', scope.organizationId, scope.workspaceId, selected?.id],
    queryFn: () => getEbContactDetail(scope, selected?.id ?? ''),
    enabled: selected !== null,
  })

  const columns = useMemo<LegacyColumnDef<EbContact>[]>(
    () => [
      { header: '客户 ID', cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span> },
      { header: '关联用户', cell: ({ row }) => <span className="font-mono text-xs">{row.original.imboy_user_id ?? '-'}</span> },
      { header: '显示名', accessorKey: 'display_name' },
      { header: '状态', cell: ({ row }) => <EbStatusBadge status={row.original.status} /> },
      { header: '版本', accessorKey: 'version' },
    ],
    []
  )
  const table = useLegacyTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })
  const detail = detailQuery.data ?? selected

  return (
    <>
      <CursorTableFrame
        title="企业客户（只读）"
        testId="eb-contacts"
        loading={cursor.loading}
        error={cursor.error}
        isEmpty={cursor.items.length === 0}
        emptyMessage="该工作区暂无企业客户"
        onRetry={cursor.refresh}
        footer={
          <DataTablePagination
            page={cursor.page}
            pageSize={cursor.pageSize}
            total={cursor.items.length + (cursor.hasMore ? 1 : 0)}
            onPageChange={cursor.gotoPage}
            onPageSizeChange={cursor.changePageSize}
            onRefresh={cursor.refresh}
          />
        }
      >
        <DataTable
          table={table}
          emptyMessage="该工作区暂无企业客户"
          onRowClick={(row) => setSelected(row)}
        />
      </CursorTableFrame>

      <EntityDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        title="客户详情（只读）"
        subtitle={detail?.display_name || undefined}
        loading={selected !== null && detailQuery.isLoading}
      >
        {detail ? (
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm" data-testid="eb-contact-detail">
            <dt className="text-muted-foreground">客户 ID</dt>
            <dd className="font-mono text-xs">{detail.id}</dd>
            <dt className="text-muted-foreground">关联用户</dt>
            <dd className="font-mono text-xs">{detail.imboy_user_id ?? '-'}</dd>
            <dt className="text-muted-foreground">显示名</dt>
            <dd>{detail.display_name || '-'}</dd>
            <dt className="text-muted-foreground">状态</dt>
            <dd><EbStatusBadge status={detail.status} /></dd>
            <dt className="text-muted-foreground">版本</dt>
            <dd className="font-mono text-xs">{detail.version}</dd>
          </dl>
        ) : (
          <LoadingState message="加载客户详情..." />
        )}
        <p className="pt-3 text-xs text-muted-foreground">
          依据数据最小化原则，客户画像密文（profile_cipher）与主题 HMAC 平台不展示。
        </p>
      </EntityDrawer>
    </>
  )
}

function MessagesSection({ scope, defaultSize }: { scope: EbScopeParams; defaultSize: number }) {
  const [conversationInput, setConversationInput] = useState('')
  const [conversationId, setConversationId] = useState<EntityId>('')

  const handleSearch = () => {
    const id = coerceEntityId(conversationInput, '')
    if (id.length === 0) {
      toast.error('请输入会话 ID')
      return
    }
    setConversationId(id)
  }

  return (
    <Card data-testid="eb-messages">
      <CardHeader>
        <CardTitle className="text-base">会话企业消息（只读，按会话 ID 查询）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="eb-conversation-id">会话 ID（conversation_id）</Label>
            <Input
              id="eb-conversation-id"
              value={conversationInput}
              inputMode="numeric"
              onChange={(event) => setConversationInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch()
              }}
              placeholder="TSID，例如 1234567890123456789"
            />
          </div>
          <Button type="button" onClick={handleSearch}>
            <Search className="mr-1 h-4 w-4" />
            查询消息
          </Button>
        </div>

        {conversationId.length === 0 ? (
          <EmptyState title="尚未查询" description="输入会话 ID 后按键集分页拉取企业消息。" />
        ) : (
          <MessageList
            key={conversationId}
            scope={scope}
            conversationId={conversationId}
            defaultSize={defaultSize}
          />
        )}
      </CardContent>
    </Card>
  )
}

function MessageList(props: { scope: EbScopeParams; conversationId: EntityId; defaultSize: number }) {
  const cursor = useCursorList<EbMessage>({
    initialSize: props.defaultSize,
    fetchChunk: (afterId, limit) =>
      getEbConversationMessages(props.scope, props.conversationId, afterId, limit),
  })
  const rows = cursor.items.slice((cursor.page - 1) * cursor.pageSize, cursor.page * cursor.pageSize)

  const columns = useMemo<LegacyColumnDef<EbMessage>[]>(
    () => [
      { header: '消息 ID', cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span> },
      { header: '发送方', cell: ({ row }) => <EbSenderCell message={row.original} /> },
      { header: '内容', cell: () => <span className="text-xs text-muted-foreground">（端到端加密密文，平台不可读）</span> },
      { header: '可见性', accessorKey: 'visibility' },
      {
        header: '保留策略',
        cell: ({ row }) =>
          row.original.retention_days === null
            ? '-'
            : `${row.original.retention_days} 天${row.original.retain_until ? ` · 至 ${row.original.retain_until}` : ''}`,
      },
      { header: '版本', accessorKey: 'version' },
    ],
    []
  )
  const table = useLegacyTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <CursorTableFrame
      title={`会话 ${props.conversationId} 的企业消息`}
      testId="eb-message-list"
      loading={cursor.loading}
      error={cursor.error}
      isEmpty={cursor.items.length === 0}
      emptyMessage="该会话暂无企业消息（或不在当前工作区作用域）"
      onRetry={cursor.refresh}
      footer={
        <DataTablePagination
          page={cursor.page}
          pageSize={cursor.pageSize}
          total={cursor.items.length + (cursor.hasMore ? 1 : 0)}
          onPageChange={cursor.gotoPage}
          onPageSizeChange={cursor.changePageSize}
          onRefresh={cursor.refresh}
        />
      }
    >
      <DataTable table={table} emptyMessage="该会话暂无企业消息" />
    </CursorTableFrame>
  )
}

function EbSenderCell({ message }: { message: EbMessage }) {
  if (message.sender_type === 'contact') {
    return <span className="font-mono text-xs">访客 {message.sender_contact_id ?? '-'}</span>
  }
  if (message.sender_type === 'business_identity') {
    return <span className="font-mono text-xs">坐席 {message.sender_business_identity_id ?? '-'}</span>
  }
  return <span className="text-xs">{message.sender_type || '-'}</span>
}

function AssetSection({ scope }: { scope: EbScopeParams }) {
  const [assetIdInput, setAssetIdInput] = useState('')
  const [actorInput, setActorInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState<EbAssetContent | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const handleFetch = async () => {
    const assetId = coerceEntityId(assetIdInput, '')
    const actorUserId = coerceEntityId(actorInput, '')
    if (assetId.length === 0 || actorUserId.length === 0) {
      toast.error('附件 ID 与责任人 user ID 均为必填')
      return
    }
    setLoading(true)
    setError(null)
    setContent(null)
    setDownloadUrl(null)
    try {
      const result = await fetchEbAssetContent(scope, assetId, actorUserId)
      setContent(result)
      setDownloadUrl(URL.createObjectURL(result.blob))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card data-testid="eb-assets">
      <CardHeader>
        <CardTitle className="text-base">附件内容（授权代理只读）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="eb-asset-id">附件 ID（asset_id）</Label>
            <Input
              id="eb-asset-id"
              value={assetIdInput}
              inputMode="numeric"
              onChange={(event) => setAssetIdInput(event.target.value)}
              placeholder="TSID"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eb-asset-actor">责任人 user ID（actor_user_id，ACL 判据）</Label>
            <Input
              id="eb-asset-actor"
              value={actorInput}
              inputMode="numeric"
              onChange={(event) => setActorInput(event.target.value)}
              placeholder="本组织 Owner/Admin 的 user TSID"
            />
          </div>
          <Button type="button" disabled={loading} onClick={() => void handleFetch()}>
            <Download className="mr-1 h-4 w-4" />
            获取内容
          </Button>
        </div>

        {loading ? <LoadingState message="经授权代理拉取附件内容..." /> : null}
        {error ? <ErrorState message={`附件获取失败：${error}`} onRetry={() => void handleFetch()} /> : null}
        {!loading && !error && !content ? (
          <EmptyState
            title="尚未获取附件"
            description="内容经平台授权代理流式端点取回到内存；不展示、不持久化任何存储地址或 object key。"
          />
        ) : null}
        {content && downloadUrl ? (
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm" data-testid="eb-asset-meta">
            <dt className="text-muted-foreground">Content-Type</dt>
            <dd className="font-mono text-xs">{content.contentType}</dd>
            <dt className="text-muted-foreground">大小</dt>
            <dd>{content.sizeBytes} 字节</dd>
            <dt className="text-muted-foreground">完整性校验</dt>
            <dd className="text-xs">
              服务端响应头已携带内容摘要（x-asset-sha256），页面不渲染摘要值本身。
            </dd>
            <dt className="text-muted-foreground">内容</dt>
            <dd>
              <a
                href={downloadUrl}
                download
                className="text-sm text-primary underline"
                data-testid="eb-asset-download"
              >
                下载到本机（内存副本，无存储 URL）
              </a>
            </dd>
          </dl>
        ) : null}
      </CardContent>
    </Card>
  )
}

function EbStatusBadge({ status }: { status: string }) {
  const positive = status === 'active' || status === 'open'
  return (
    <Badge
      className={positive ? 'bg-green-100 text-green-800' : undefined}
      variant={positive ? 'default' : 'outline'}
      data-status={status}
    >
      {status.length > 0 ? status : '未知'}
    </Badge>
  )
}
