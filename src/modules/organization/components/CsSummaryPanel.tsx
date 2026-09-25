/**
 * 组织客服摘要面板（CS-ADM-01 / CS-GOV-02A）。
 *
 * 挂载面：组织详情页（card 形态）与组织列表档案 Drawer（inline 形态，
 * Drawer 打开才挂载 → 打开才发请求）。只读摘要 + 直达既有 Customer
 * Service 治理面链接（/customer-service* 既有路由，不新建页面簇）。
 *
 * 四态齐备（CS-GOV-02A）：
 * - 权限态：无 customer_service:read 时 fail-closed——不发请求、不渲染
 *   事实，只说明权限边界（/api/adm/customer-service/* 对无权限账号恒 403）；
 * - 加载态 / 错误态（409/advisory lock 类并发冲突有明确行动指引 + 重试）/
 *   空态（组织尚无坐席事实）/ 数据态。
 *
 * 数据源纪律：只走 Admin Cookie /api/adm 域（getOrgCsSummary），
 * seat_limit 额度事实平台域不投影 → 如实标注，不推导（见
 * CS_SEAT_LIMIT_PLATFORM_EVIDENCE）。TSID 全程 string（EntityId）。
 */
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared'
import { serializeOrgWorkspaceQuery } from '@/components/shared/orgWorkspaceQuery'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { cn } from '@/lib/utils'
import type { EntityId } from '@/types/common'
import { getOrgCsSummary, SEAT_PAGE_LIMIT, SEAT_PAGE_MAX } from '../api/csSummary'
import {
  classifyCsSummaryError,
  CS_SEAT_LIMIT_PLATFORM_EVIDENCE,
  type OrgCsSummary,
} from '../api/csSummaryPure'

const CS_READ_PERMISSION = 'customer_service:read'
const CS_WRITE_PERMISSION = 'customer_service:write'

export type CsSummaryPanelProps = {
  organizationId: EntityId
  /** 可选 ws 成立事实（详情页 URL 上下文）；有则随链接携带，无则如实省略。 */
  workspaceId?: EntityId | null
  /** card = 详情页独立卡片；inline = Drawer 内嵌分区（无 Card 壳）。 */
  variant?: 'card' | 'inline'
}

export function CsSummaryPanel({
  organizationId,
  workspaceId = null,
  variant = 'card',
}: CsSummaryPanelProps) {
  const { allowed: canRead, loading: permLoading } = useAdminPermission({
    permission: CS_READ_PERMISSION,
  })
  const { allowed: canWrite } = useAdminPermission({ permission: CS_WRITE_PERMISSION })

  const orgId = typeof organizationId === 'string' ? organizationId.trim() : ''
  const readReady = canRead && !permLoading && orgId.length > 0

  const summaryQuery = useQuery({
    queryKey: ['organization', 'cs-summary', orgId],
    queryFn: () => getOrgCsSummary(orgId),
    enabled: readReady,
  })

  const scopedSearch = serializeOrgWorkspaceQuery({ org: orgId, ws: workspaceId })
  const withScope = (path: string) =>
    scopedSearch.length > 0 ? `${path}?${scopedSearch}` : path

  const body = (
    <CsSummaryBody
      permLoading={permLoading}
      readReady={readReady}
      summary={summaryQuery.data ?? null}
      loading={summaryQuery.isLoading}
      error={summaryQuery.error ?? null}
      canWrite={canWrite}
      withScope={withScope}
      onRefresh={() => void summaryQuery.refetch()}
      onRetry={() => void summaryQuery.refetch()}
      dataUpdatedAt={summaryQuery.dataUpdatedAt}
      variant={variant}
    />
  )

  if (variant === 'inline') {
    return (
      <div className="space-y-2" data-testid="org-cs-summary">
        {body}
      </div>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">客服摘要（组织级事实，/api/adm/customer-service）</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}

type CsSummaryBodyProps = {
  permLoading: boolean
  readReady: boolean
  summary: OrgCsSummary | null
  loading: boolean
  error: unknown
  canWrite: boolean
  withScope: (_path: string) => string
  onRefresh: () => void
  onRetry: () => void
  dataUpdatedAt: number
  variant: 'card' | 'inline'
}

function CsSummaryBody({
  permLoading,
  readReady,
  summary,
  loading,
  error,
  canWrite,
  withScope,
  onRefresh,
  onRetry,
  dataUpdatedAt,
  variant,
}: CsSummaryBodyProps) {
  if (!readReady) {
    if (permLoading) {
      return (
        <p className="text-sm text-muted-foreground" data-testid="org-cs-summary-perm-checking">
          正在核对客服治理面权限（{CS_READ_PERMISSION}）…
        </p>
      )
    }
    return (
      <div data-testid="org-cs-summary-perm">
        <EmptyState
          title="客服摘要不可见（fail-closed）"
          description={`读取组织客服事实需要 ${CS_READ_PERMISSION} 权限（/api/adm/customer-service/* 对无权限账号恒 403）。本面板不发请求、不渲染事实。`}
        />
      </div>
    )
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="org-cs-summary-loading">
        正在读取组织客服事实（坐席 / 会话现算计数）…
      </p>
    )
  }

  if (error != null) {
    const failure = classifyCsSummaryError(error)
    return (
      <div className="space-y-2" data-testid="org-cs-summary-error">
        <p className={cn('text-sm', failure.concurrencyConflict ? 'text-destructive font-medium' : 'text-destructive')}>
          {failure.message}
        </p>
        {failure.concurrencyConflict ? (
          <p className="text-xs text-muted-foreground" data-testid="org-cs-summary-conflict-hint">
            并发冲突反馈：摘要读取与坐席治理/额度变更并发时可能出现 409 或 advisory
            lock 类瞬时错误；这不是数据损坏，刷新服务端事实后重试即可。
          </p>
        ) : null}
        <Button variant="outline" size="sm" data-testid="org-cs-summary-retry" onClick={onRetry}>
          重试
        </Button>
      </div>
    )
  }

  if (summary == null) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="org-cs-summary-loading">
        正在读取组织客服事实…
      </p>
    )
  }

  if (summary.seatTotal === 0) {
    return (
      <div className="space-y-2" data-testid="org-cs-summary-empty">
        <p className="text-sm text-muted-foreground">
          该组织尚无客服坐席事实（GET /customer-service/seats 按 organization_id
          过滤返回空）——客服能力未开通或坐席已全部清理。
        </p>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Link
              to={withScope('/customer-service/provisioning')}
              data-testid="org-cs-summary-link-provisioning"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              去开通（客服开通向导）
            </Link>
          ) : null}
          <Link
            to={withScope('/customer-service')}
            data-testid="org-cs-summary-link-home"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            在线客服治理面
          </Link>
        </div>
        {!canWrite ? (
          <p className="text-xs text-muted-foreground">
            开通向导入口需要 {CS_WRITE_PERMISSION}（adm_acl 分权；无权限不渲染入口）。
          </p>
        ) : null}
      </div>
    )
  }

  const updatedAtText = dataUpdatedAt > 0 ? new Date(dataUpdatedAt).toLocaleTimeString('zh-CN') : '-'
  return (
    <div className="space-y-3" data-testid="org-cs-summary-data">
      <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        <div className="flex gap-2">
          <dt className="min-w-40 shrink-0 text-muted-foreground">坐席 used（enabled 现算）</dt>
          <dd className="font-mono text-xs" data-testid="org-cs-summary-used">
            {summary.seatUsed} / {summary.seatTotal}（总，含停用）
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-40 shrink-0 text-muted-foreground">额度 seat_limit</dt>
          <dd className="font-mono text-xs" data-testid="org-cs-summary-limit">
            平台域不投影（见下方依据）
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-40 shrink-0 text-muted-foreground">enabled 状态</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <Badge
              variant={summary.seatUsed > 0 ? 'default' : 'secondary'}
              data-testid="org-cs-summary-enabled"
            >
              {summary.seatUsed > 0 ? `已启用 ${summary.seatUsed}` : '无启用坐席'}
            </Badge>
            {summary.seatTotal - summary.seatUsed > 0 ? (
              <Badge variant="outline">停用 {summary.seatTotal - summary.seatUsed}</Badge>
            ) : null}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-40 shrink-0 text-muted-foreground">active sessions（现算）</dt>
          <dd className="font-mono text-xs" data-testid="org-cs-summary-active-sessions">
            {summary.activeSessions}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-40 shrink-0 text-muted-foreground">并发上限合计（enabled）</dt>
          <dd className="font-mono text-xs" data-testid="org-cs-summary-max-concurrent">
            {summary.maxConcurrentTotal}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-40 shrink-0 text-muted-foreground">坐席明细（business_identity_id）</dt>
          <dd className="break-all font-mono text-xs" data-testid="org-cs-summary-seat-ids">
            {summary.seats.length > 0
              ? summary.seats
                  .map(
                    (seat) =>
                      `${seat.displayName ? `${seat.displayName} ` : ''}#${seat.businessIdentityId}${
                        seat.enabled ? '' : '（停用）'
                      }`
                  )
                  .join('、')
              : '（空）'}
            {summary.truncated ? ' …（截断）' : ''}
          </dd>
        </div>
      </dl>

      {summary.truncated ? (
        <p className="text-xs text-destructive" data-testid="org-cs-summary-truncated">
          坐席事实超出摘要安全读取上限（{SEAT_PAGE_LIMIT * SEAT_PAGE_MAX} 行）：以上为截断视图，完整名单见在线客服治理面。
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={withScope('/customer-service')}
          data-testid="org-cs-summary-link-home"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          在线客服治理面
        </Link>
        <Link
          to={withScope('/customer-service/sessions')}
          data-testid="org-cs-summary-link-sessions"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          平台会话列表
        </Link>
        {canWrite ? (
          <Link
            to={withScope('/customer-service/provisioning')}
            data-testid="org-cs-summary-link-provisioning"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            开通 / 修复坐席
          </Link>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          data-testid="org-cs-summary-refresh"
          onClick={onRefresh}
          title="额度 / 坐席事实变化后手动刷新（服务端现算，无缓存计数）"
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新摘要
        </Button>
        <span className="text-xs text-muted-foreground" data-testid="org-cs-summary-updated-at">
          最后读取：{updatedAtText}
        </span>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="org-cs-summary-limit-evidence">
        {CS_SEAT_LIMIT_PLATFORM_EVIDENCE}
      </p>
      {variant === 'inline' ? null : (
        <p className="text-xs text-muted-foreground">
          事实口径：used = enabled 坐席现算计数（CS-BE-06 同口径）；active sessions =
          Σ active_count（会话 status='active' 同语句现算）；数据面
          GET /api/adm/customer-service/seats（Admin Cookie 会话，键集分页聚合）。
        </p>
      )}
    </div>
  )
}
