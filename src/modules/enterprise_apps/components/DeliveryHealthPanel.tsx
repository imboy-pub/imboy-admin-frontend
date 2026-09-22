import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, RotateCcw, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, ErrorState, LoadingState, StatsCard } from '@/components/shared'
import { GOVERNANCE_BACKEND_WIRED } from '../api/contracts'
import {
  classifyGovernanceFailure,
  formatRate,
  governanceFailureMessage,
  type ApiErrorLike,
} from '../api/pureFunctions'
import { getDeliveryStats, listDeliveries, type GovernanceScope } from '../api/public'

export type DeliveryHealthPanelProps = {
  scope: GovernanceScope
  /** 是否展示投递明细表（健康度摘要页为 true；详情页也复用）。 */
  showList?: boolean
}

function toApiError(err: unknown): ApiErrorLike | null {
  return err && typeof err === 'object' ? (err as ApiErrorLike) : null
}

const STATUS_OPTIONS = ['', 'pending', 'retry', 'success', 'dead'] as const

/**
 * 投递与健康度（只读，对接 FULL-03 的统计读面）。
 *
 * 页面与响应均**不含 payload / secret**：服务层对投递读面同时施加
 * `assertNoSecretFields` 与 `assertNoPayloadFields` 熔断，投影只保留
 * `DELIVERY_SAFE_KEYS` 元数据白名单。
 */
export function DeliveryHealthPanel({ scope, showList = true }: DeliveryHealthPanelProps) {
  const [status, setStatus] = useState<string>('')

  const statsQuery = useQuery({
    queryKey: ['enterprise_apps', 'delivery-stats', scope.organizationId, scope.applicationId],
    queryFn: () => getDeliveryStats(scope),
  })

  const listQuery = useQuery({
    queryKey: ['enterprise_apps', 'deliveries', scope.organizationId, scope.applicationId, status],
    queryFn: () => listDeliveries(scope, { page: 1, size: 20, status: status.length > 0 ? status : undefined }),
    enabled: showList,
  })

  const stats = statsQuery.data
  const statsFailure = statsQuery.error
    ? classifyGovernanceFailure(toApiError(statsQuery.error), { wired: GOVERNANCE_BACKEND_WIRED })
    : null
  const listFailure = listQuery.error
    ? classifyGovernanceFailure(toApiError(listQuery.error), { wired: GOVERNANCE_BACKEND_WIRED })
    : null
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])

  return (
    <div className="space-y-4" data-testid="delivery-health-panel">
      {statsFailure !== null ? (
        <ErrorState
          message={`加载投递统计失败：${governanceFailureMessage(statsFailure)}`}
          onRetry={() => void statsQuery.refetch()}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-4">
          <StatsCard
            title="成功率"
            value={stats ? formatRate(stats.successRate) : '—'}
            description="口径 success / (success + dead)（与后端 FULL-03 一致）"
            icon={Activity}
          />
          <StatsCard title="重试中" value={stats?.retry ?? '—'} description="非终态，等待下一次尝试" icon={RotateCcw} />
          <StatsCard title="死信" value={stats?.dead ?? '—'} description="终态失败（可 replay）" icon={AlertTriangle} />
          <StatsCard title="投递总数" value={stats?.total ?? '—'} description="含 pending / retry / success / dead" icon={Send} />
        </div>
      )}

      {showList && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">投递明细（仅元数据，不含 payload）</CardTitle>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="投递状态过滤"
              data-testid="delivery-status-filter"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option || 'all'} value={option}>
                  {option === '' ? '全部状态' : option}
                </option>
              ))}
            </Select>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading ? (
              <LoadingState message="加载投递列表..." />
            ) : listFailure !== null ? (
              <ErrorState
                message={`加载投递列表失败：${governanceFailureMessage(listFailure)}`}
                onRetry={() => void listQuery.refetch()}
              />
            ) : rows.length === 0 ? (
              <EmptyState title="暂无投递" description="该应用尚无 webhook 投递记录。" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>投递 ID</TableHead>
                    <TableHead>事件</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>尝试</TableHead>
                    <TableHead>代际</TableHead>
                    <TableHead>账本版本</TableHead>
                    <TableHead>错误分类</TableHead>
                    <TableHead>下一次重试</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} data-delivery-id={row.id}>
                      <TableCell className="font-mono text-xs">{row.id}</TableCell>
                      <TableCell className="font-mono text-xs">{row.eventType || row.eventId || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'dead' ? 'destructive' : 'secondary'}>{row.status || '未知'}</Badge>
                      </TableCell>
                      <TableCell>{row.attemptCount}</TableCell>
                      <TableCell>{row.endpointGeneration}</TableCell>
                      <TableCell>{row.ledgerVersion}</TableCell>
                      <TableCell className="font-mono text-xs">{row.lastErrorClass || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.nextRetryAt || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
