import { useCallback } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/shared'
import { READ_PERMISSION, GOVERNANCE_BACKEND_WIRED } from '../api/contracts'
import { classifyGovernanceFailure, governanceFailureMessage, type ApiErrorLike } from '../api/pureFunctions'
import { getApplicationDetail, type GovernanceScope } from '../api/public'
import { ApplicationGovernanceCard } from '../components/ApplicationGovernanceCard'
import { AuditTrailPanel } from '../components/AuditTrailPanel'
import { CredentialPanel } from '../components/CredentialPanel'
import { GrantPanel } from '../components/GrantPanel'

function toApiError(err: unknown): ApiErrorLike | null {
  return err && typeof err === 'object' ? (err as ApiErrorLike) : null
}

/**
 * Admin 企业应用治理 — Application 详情（`/enterprise/applications/:id`）。
 *
 * 组织作用域从 URL 查询串取（`?org_id=`），避免把一个应用的治理页跨组织复用。
 * 组合：生命周期/scope → credential（secret 一次性）→ Grant（CAS）→ 审计（before/after）。
 */
export function EnterpriseApplicationDetailPage() {
  const params = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const applicationId = (params.id ?? '').trim()
  const organizationId = (searchParams.get('org_id') ?? '').trim()
  const scopeReady = applicationId.length > 0 && organizationId.length > 0
  const scope: GovernanceScope = { organizationId, applicationId }

  const query = useQuery({
    queryKey: ['enterprise_apps', 'application', organizationId, applicationId],
    queryFn: () => getApplicationDetail(scope),
    enabled: scopeReady,
  })

  const refetch = useCallback(() => {
    void query.refetch()
  }, [query])

  const detail = query.data
  const failureKind = query.error ? classifyGovernanceFailure(toApiError(query.error), { wired: GOVERNANCE_BACKEND_WIRED }) : null

  return (
    <div className="space-y-4" data-page="enterprise-application-detail">
      <PageHeader
        title="应用详情与治理"
        description={`读取权限 ${READ_PERMISSION}；写动作需 enterprise_business:write 且需二次确认。`}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          to={`/enterprise/applications?org_id=${encodeURIComponent(organizationId)}`}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回列表
        </Link>
        <span className="font-mono text-xs text-muted-foreground">organization_id={organizationId || '（缺失）'}</span>
        <span className="font-mono text-xs text-muted-foreground">application_id={applicationId || '（缺失）'}</span>
        <Link
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          to={`/enterprise/applications/${encodeURIComponent(applicationId)}/deliveries?org_id=${encodeURIComponent(organizationId)}`}
        >
          <Send className="mr-1 h-4 w-4" />
          投递与健康度
        </Link>
      </div>

      {!scopeReady ? (
        <EmptyState
          title="缺少组织作用域"
          description="详情页需要 URL 同时携带 application_id 与 org_id（?org_id=...）。"
        />
      ) : query.isLoading ? (
        <LoadingState message="加载应用详情..." />
      ) : failureKind !== null || detail === undefined ? (
        <ErrorState
          message={`加载应用详情失败：${governanceFailureMessage(failureKind ?? 'unknown')}`}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{detail.name || '(未命名应用)'}</CardTitle>
              <Badge variant={detail.status === 'active' ? 'secondary' : 'outline'}>
                {detail.status === 'active' ? '启用中' : detail.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <p className="font-mono">owner_application_key: {detail.ownerApplicationKey || '-'}</p>
              <p>{detail.description || '（无描述）'}</p>
              <p className="font-mono">created_at: {detail.createdAt || '-'}</p>
            </CardContent>
          </Card>

          <ApplicationGovernanceCard scope={scope} detail={detail} onRefresh={refetch} />
          <CredentialPanel scope={scope} applicationArchived={detail.status === 'archived'} />
          <GrantPanel
            scope={scope}
            applicationVersion={detail.version}
            applicationArchived={detail.status === 'archived'}
            applicationScopes={detail.scopes}
          />
          <AuditTrailPanel scope={scope} />
        </>
      )}
    </div>
  )
}
