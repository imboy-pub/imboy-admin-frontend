import { OrganizationWorkspacePicker } from '@/components/shared/OrganizationWorkspacePicker'
import { Label } from '@/components/ui/label'
/**
 * AI 满意度统计页（v4 P0-10 / 03-G 页面 4）：org 级统计只读。
 * 数值与 API 响应逐项相等（不聚合、不填默认值，CsStatsPanel 同纪律）。
 */
import { type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared'
import { getErrorMessage } from '@/lib/errorUtils'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useOrgWorkspaceScope } from './useOrgWorkspaceScope'
import { getAiStats } from '../api/aiAdmin'

function asEntries(stats: Record<string, unknown>): [string, unknown][] {
  return Object.entries(stats).filter(([, v]) => v != null && typeof v !== 'object')
}

export function AiMetricsPage(): ReactElement {
  const scope = useOrgWorkspaceScope()
  const { organizationId } = scope
  const { allowed: canRead, loading: permLoading } = useAdminPermission({
    permission: 'customer_service:read',
  })

  const enabled = organizationId != null && canRead && !permLoading
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cs-ai-stats', organizationId],
    queryFn: () => getAiStats(organizationId as string, {}),
    enabled,
  })

  if (!permLoading && !canRead) {
    return <EmptyState title="无权限" description="缺少 customer_service:read 权限。" />
  }
  if (permLoading || (enabled && isLoading)) return <LoadingState />
  if (isError) return <ErrorState message={getErrorMessage(error)} />

  const entries = asEntries(data ?? {})

  return (
    <div className="space-y-4 p-4">
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
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5" /> AI 满意度统计
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <EmptyState title="暂无统计数据" description="该企业尚无会话评分样本。" />
          ) : (
            <dl className="grid gap-3 md:grid-cols-3">
              {entries.map(([k, v]) => (
                <div key={k} className="rounded-md border p-3">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-lg font-semibold">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
