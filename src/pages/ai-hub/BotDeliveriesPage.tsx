import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/errorUtils'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import {
  listDeadDeliveries,
  replayDeadDelivery,
  BotDelivery,
} from '@/services/api/botDeliveries'

const PAGE_SIZE = 20

/** 复制脱敏 correlation_id（A06：可复制、不含 secret/PII） */
function CorrelationCell({ value }: { value: string }) {
  return (
    <button
      type="button"
      className="text-xs font-mono hover:underline"
      title="点击复制 correlation_id"
      onClick={() => {
        void navigator.clipboard?.writeText(value)
      }}
      data-testid="copy-correlation"
    >
      {value}
    </button>
  )
}

/** 出站交付死信管理（WH-01）：按状态过滤（dead）、分页、单次重放。 */
export function BotDeliveriesPage() {
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  const { allowed: canWrite } = useAdminPermission({
    permission: 'mcp_clients:approve',
    roles: ['1', '2'],
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['bot-deliveries', page],
    queryFn: () => listDeadDeliveries(page),
    placeholderData: keepPreviousData,
  })

  const replay = useMutation({
    mutationFn: (id: string) => replayDeadDelivery(id),
    onSuccess: () => {
      toast.success('已重新入队')
      void queryClient.invalidateQueries({ queryKey: ['bot-deliveries'] })
    },
    onError: (err: unknown) => {
      toast.error(`重放失败: ${getErrorMessage(err)}`)
    },
  })

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message="加载交付失败" />

  const rows: BotDelivery[] = data?.items ?? []
  const total = Number(data?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader title="出站交付死信" description="dead 交付审计与单次重放（delivery_id 不变）" />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>共 {total} 条死信</div>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState description="暂无死信交付" />
          ) : (
            <table className="w-full text-sm" data-testid="delivery-table">
              <thead>
                <tr className="text-left">
                  <th className="py-2">delivery_id</th>
                  <th className="py-2">bot_id</th>
                  <th className="py-2">事件</th>
                  <th className="py-2">尝试次数</th>
                  <th className="py-2">correlation_id</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.delivery_id} className="border-t">
                    <td className="py-2 font-mono text-xs">{d.delivery_id}</td>
                    <td className="py-2 font-mono text-xs">{d.bot_id}</td>
                    <td className="py-2">{d.event_type}</td>
                    <td className="py-2">{d.attempt_count}</td>
                    <td className="py-2">
                      <CorrelationCell value={d.correlation_id} />
                    </td>
                    <td className="py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canWrite || replay.isPending}
                        data-testid={`replay-${d.delivery_id}`}
                        onClick={() => replay.mutate(d.delivery_id)}
                      >
                        重放
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {/* 分页切换不重置筛选——重置 page=1 的语义由筛选变化触发（A04） */}
          <div data-testid="page-indicator" data-page={page} className="mt-2 text-xs text-muted-foreground">
            第 {page} 页
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default BotDeliveriesPage
