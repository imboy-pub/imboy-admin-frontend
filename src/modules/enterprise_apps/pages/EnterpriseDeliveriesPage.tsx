import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState, PageHeader } from '@/components/shared'
import { READ_PERMISSION } from '../api/contracts'
import { DeliveryHealthPanel } from '../components/DeliveryHealthPanel'

/**
 * Admin 企业应用治理 — 投递与健康度（`/enterprise/applications/:id/deliveries`）。
 *
 * 纯只读：成功率 / 重试 / 死信 + 投递元数据列表。
 * **响应与页面均不含 payload / secret**（服务层双熔断 + 元数据白名单投影）。
 */
export function EnterpriseDeliveriesPage() {
  const params = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const applicationId = (params.id ?? '').trim()
  const organizationId = (searchParams.get('org_id') ?? '').trim()
  const scopeReady = applicationId.length > 0 && organizationId.length > 0

  return (
    <div className="space-y-4" data-page="enterprise-deliveries">
      <PageHeader
        title="投递与健康度"
        description={`Webhook 投递成功率 / 重试 / 死信与投递元数据（只读，${READ_PERMISSION}）。不含 payload 与 secret。`}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          to={`/enterprise/applications/${encodeURIComponent(applicationId)}?org_id=${encodeURIComponent(organizationId)}`}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回应用详情
        </Link>
        <span className="font-mono text-xs text-muted-foreground">application_id={applicationId || '（缺失）'}</span>
        <span className="font-mono text-xs text-muted-foreground">organization_id={organizationId || '（缺失）'}</span>
      </div>

      {!scopeReady ? (
        <EmptyState
          title="缺少组织作用域"
          description="投递面需要 URL 同时携带 application_id 与 org_id（?org_id=...）。"
        />
      ) : (
        <DeliveryHealthPanel scope={{ organizationId, applicationId }} />
      )}
    </div>
  )
}
