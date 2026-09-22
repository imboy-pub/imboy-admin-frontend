import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/shared'
import { parseOrgWorkspaceQuery } from '@/components/shared/orgWorkspaceQuery'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { getErrorMessage } from '@/lib/errorUtils'
import { getCsSession } from '../api/public'
import { classifyListFailure, csSessionListStatusLabel, listFailureMessage } from '../api/pureFunctions'

const READ_PERMISSION = 'customer_service:read'

/**
 * 平台 CS 会话详情页（占位路由升级为真详情）。
 *
 * 数据走既有平台端点 GET /api/adm/customer-service/organizations/:org_id/sessions/:id
 * （customer_service:read；workspace_id 必填）。列表页点击行携带
 * org_id / workspace_id 查询参数跳入本页。
 * 详情为既有投影（含 conversation_id / close_reason）；密钥摘要、cipher 等敏感键
 * 永不渲染（CS-03-A05，投影函数熔断兜底）。
 */
export function CsSessionDetailPage() {
  const { sessionId = '' } = useParams()
  const [searchParams] = useSearchParams()
  // 租户范围统一从 URL 的 org/ws 恢复（EADM-06 共享 codec）
  const { org, ws } = parseOrgWorkspaceQuery(searchParams)
  const organizationId = org ?? ''
  const workspaceId = ws ?? ''
  const scopeReady = organizationId.length > 0 && workspaceId.length > 0 && sessionId.length > 0

  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  const query = useQuery({
    queryKey: ['customer_service', 'session-detail', organizationId, workspaceId, sessionId],
    queryFn: () => getCsSession({ organizationId, workspaceId, sessionId }),
    enabled: scopeReady && readReady,
  })

  const listLink = `/customer-service/sessions?org=${encodeURIComponent(organizationId)}&ws=${encodeURIComponent(workspaceId)}`

  const summary = useMemo(() => query.data ?? null, [query.data])

  return (
    <div className="space-y-4" data-page="cs-session-detail">
      <PageHeader
        title="客服会话详情"
        description="平台 CS 会话详情（customer_service:read）。白名单投影：密钥摘要、cipher、object key 等敏感字段永不渲染（CS-03-A05）。"
      />

      <p className="text-xs text-muted-foreground">
        <span className="font-mono">组织 {organizationId || '-'} · 工作区 {workspaceId || '-'}</span>
        （只读；租户范围来自 URL 的 org/ws 参数，不可手填）
      </p>

      <div>
        <Link to={listLink} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="cs-session-back">
          <ArrowLeft className="h-4 w-4" />
          返回会话列表
        </Link>
      </div>

      {!scopeReady ? (
        <EmptyState
          title="缺少租户参数"
          description="本页需要 org_id 与 workspace_id（从会话列表进入会自动携带），且路径必须有会话 ID。"
        />
      ) : !readReady ? (
        <EmptyState title="无查看权限" description="查看会话详情需要 customer_service:read 权限。" />
      ) : query.isLoading ? (
        <LoadingState message="加载会话详情..." />
      ) : query.error ? (
        <ErrorState
          message={`会话详情加载失败：${listFailureMessage(classifyListFailure(query.error))}（${getErrorMessage(query.error)}）`}
          onRetry={() => void query.refetch()}
        />
      ) : summary ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              会话 <span className="font-mono text-xs">{summary.id}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm" data-testid="cs-session-detail-summary">
              <dt className="text-muted-foreground">会话 ID</dt>
              <dd className="font-mono text-xs">{summary.id}</dd>
              <dt className="text-muted-foreground">状态</dt>
              <dd>
                <Badge data-status={summary.status}>{csSessionListStatusLabel(summary.status)}</Badge>
              </dd>
              <dt className="text-muted-foreground">客户（contact）</dt>
              <dd className="font-mono text-xs">{summary.contact_id || '-'}</dd>
              <dt className="text-muted-foreground">会话（conversation）</dt>
              <dd className="font-mono text-xs">{summary.conversation_id || '-'}</dd>
              <dt className="text-muted-foreground">当前经办坐席</dt>
              <dd className="font-mono text-xs">{summary.business_identity_id ?? '未接单'}</dd>
              <dt className="text-muted-foreground">评分</dt>
              <dd>{summary.rating ?? '-'}</dd>
              <dt className="text-muted-foreground">排队/接单/关闭时间（秒级时间戳）</dt>
              <dd className="font-mono text-xs">
                {[summary.queued_at, summary.claimed_at, summary.closed_at]
                  .map((value) => (value === null ? '-' : String(value)))
                  .join(' / ')}
              </dd>
              <dt className="text-muted-foreground">关闭原因</dt>
              <dd>{summary.close_reason ?? '-'}</dd>
              <dt className="text-muted-foreground">版本（expected_version）</dt>
              <dd className="font-mono text-xs">{summary.version}</dd>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              转接 / 关闭等写操作请回到「客服运营」页按 ID 查询后执行（需 customer_service:write）。
            </p>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="未找到会话" description="请确认会话 ID 与租户范围是否正确。" />
      )}
    </div>
  )
}
