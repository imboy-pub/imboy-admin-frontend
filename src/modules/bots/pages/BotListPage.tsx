import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { toast } from 'sonner'
import { Copy, Eye, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  PageHeader,
  LoadingState,
  ErrorState,
  DataTable,
  DataTablePagination,
  ConfirmDialog,
  EntityDrawer,
  StatusBadge,
} from '@/components/shared'
import { useListQueryState } from '@/hooks/useListQueryState'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import {
  getBotList,
  getBotDetail,
  setBotStatus,
  type BotListItem,
  type BotDetail,
} from '../api/public'

const LIST_KEY = 'bots'

/**
 * Bot 运营管理页（平台处置视角）。
 * Bot 注册/编辑/属主自管走客户端 /api/v1/bot/*；本页仅提供：
 * 浏览（列表 + 详情抽屉）与启停（bots:update 平台处置权）。
 */
export function BotListPage() {
  const queryClient = useQueryClient()
  const { state: params, setState: setParams } = useListQueryState<{
    page: number
    size: number
  }>({ page: 1, size: 10 })
  const [drawerBotId, setDrawerBotId] = useState<EntityId | null>(null)
  const [statusConfirm, setStatusConfirm] = useState<BotListItem | null>(null)

  const requestParams = { page: params.page, size: params.size }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: [LIST_KEY, requestParams],
    queryFn: () => getBotList(requestParams),
  })

  const rows = useMemo(() => data?.items ?? [], [data])

  // 详情抽屉按需加载（含 webhook/commands/events，列表接口不带）
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: [LIST_KEY, 'detail', drawerBotId],
    queryFn: () => getBotDetail(drawerBotId as EntityId),
    enabled: drawerBotId !== null,
  })

  const statusMutation = useMutation({
    mutationFn: (input: { botId: EntityId; status: 0 | 1 }) => setBotStatus(input.botId, input.status),
    onSuccess: (_result, variables) => {
      toast.success(variables.status === 1 ? 'Bot 已启用' : 'Bot 已停用')
      setStatusConfirm(null)
      void queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
    },
    onError: (err) => toast.error(`操作失败: ${getErrorMessage(err)}`),
  })

  const columns = useMemo<LegacyColumnDef<BotListItem>[]>(
    () => [
      {
        header: 'Bot',
        accessorKey: 'name',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.name || '(未命名)'}</span>
            <span className="text-xs text-muted-foreground">@{row.original.username}</span>
          </div>
        ),
      },
      {
        header: '属主',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm">{row.original.nickname || '-'}</span>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(row.original.owner_uid)
                toast.success('属主 UID 已复制')
              }}
            >
              <Copy className="h-3 w-3" />
              {row.original.owner_uid}
            </button>
          </div>
        ),
      },
      {
        header: '简介',
        cell: ({ row }) => (
          <span
            className="block max-w-[16rem] truncate text-sm text-muted-foreground"
            title={row.original.description}
          >
            {row.original.description || '-'}
          </span>
        ),
      },
      {
        header: '公开',
        cell: ({ row }) =>
          row.original.is_public ? (
            <Badge variant="secondary">公开</Badge>
          ) : (
            <Badge variant="outline">私有</Badge>
          ),
      },
      {
        header: '状态',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        header: '操作',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDrawerBotId(row.original.user_id)}
            >
              <Eye className="mr-1 h-3.5 w-3.5" />
              详情
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={statusMutation.isPending}
              onClick={() => setStatusConfirm(row.original)}
            >
              <Power className="mr-1 h-3.5 w-3.5" />
              {row.original.status === 1 ? '停用' : '启用'}
            </Button>
          </div>
        ),
      },
    ],
    [statusMutation.isPending]
  )

  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const handleConfirmStatus = useCallback(() => {
    if (!statusConfirm) return
    statusMutation.mutate({
      botId: statusConfirm.user_id,
      status: statusConfirm.status === 1 ? 0 : 1,
    })
  }, [statusConfirm, statusMutation])

  if (isLoading) return <LoadingState message="加载 Bot 列表..." />
  if (error) return <ErrorState message="加载 Bot 列表失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bot 管理"
        description="开发者注册的第三方服务（Webhook 驱动）。平台可浏览与启停处置；注册与编辑由开发者在客户端完成。"
      />
      <DataTable table={table} emptyMessage="暂无注册 Bot" />
      <DataTablePagination
        page={params.page}
        pageSize={params.size}
        total={data?.total ?? 0}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(size) => setParams({ page: 1, size })}
        dataUpdatedAt={dataUpdatedAt}
        onRefresh={() => refetch()}
      />

      <EntityDrawer
        open={drawerBotId !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerBotId(null)
        }}
        title={detail?.name ?? 'Bot 详情'}
        subtitle={detail ? `@${detail.username}` : undefined}
        loading={drawerBotId !== null && detailLoading}
      >
        {detail ? <BotDetailBody detail={detail} /> : undefined}
      </EntityDrawer>

      <ConfirmDialog
        open={statusConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setStatusConfirm(null)
        }}
        title={statusConfirm?.status === 1 ? '停用 Bot' : '启用 Bot'}
        description={
          statusConfirm?.status === 1
            ? `停用后 @${statusConfirm.username} 将无法收发消息（Webhook 推送与 API 调用均拒绝），确定停用？`
            : `启用后 @${statusConfirm?.username} 恢复收发消息，确定启用？`
        }
        confirmText={statusConfirm?.status === 1 ? '停用' : '启用'}
        variant={statusConfirm?.status === 1 ? 'destructive' : 'default'}
        loading={statusMutation.isPending}
        onConfirm={handleConfirmStatus}
      />
    </div>
  )
}

/** 详情抽屉内容：基础信息 + webhook + 能力声明（commands/events/permissions） */
function BotDetailBody({ detail }: { detail: BotDetail }) {
  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <h4 className="font-medium">基础信息</h4>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-muted-foreground">Bot ID</dt>
          <dd className="font-mono text-xs">{detail.user_id}</dd>
          <dt className="text-muted-foreground">属主</dt>
          <dd>
            {detail.nickname}（{detail.owner_uid}）
          </dd>
          <dt className="text-muted-foreground">状态</dt>
          <dd>
            <StatusBadge status={detail.status} />
          </dd>
          <dt className="text-muted-foreground">可见性</dt>
          <dd>{detail.is_public ? '公开（注册表可检索）' : '私有'}</dd>
          {detail.created_at ? (
            <>
              <dt className="text-muted-foreground">注册时间</dt>
              <dd>{detail.created_at}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="space-y-2">
        <h4 className="font-medium">Webhook</h4>
        {detail.webhook_url ? (
          <p className="break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">
            {detail.webhook_url}
          </p>
        ) : (
          <p className="text-muted-foreground">未配置（Bot 无法接收消息推送）</p>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="font-medium">能力声明</h4>
        <CapabilityList label="命令" items={detail.commands} />
        <CapabilityList label="订阅事件" items={detail.events} />
        <CapabilityList label="权限" items={detail.permissions} />
      </section>
    </div>
  )
}

function CapabilityList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {items.map((item) => (
            <Badge key={item} variant="outline" className="font-mono text-xs">
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">-</span>
      )}
    </div>
  )
}
