import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared'
import { auditActionLabel, GOVERNANCE_BACKEND_WIRED } from '../api/contracts'
import { classifyGovernanceFailure, governanceFailureMessage, type ApiErrorLike, type AuditEntry } from '../api/pureFunctions'
import { listAuditLogs, type GovernanceScope } from '../api/public'

export type AuditTrailPanelProps = {
  scope: GovernanceScope
}

function toApiError(err: unknown): ApiErrorLike | null {
  return err && typeof err === 'object' ? (err as ApiErrorLike) : null
}

function changedSummary(entry: AuditEntry): string {
  if (entry.changed.length === 0) return '（无字段变化 / 未提供 before-after）'
  return entry.changed.map((item) => item.field).join(', ')
}

/**
 * 审计轨迹（before/after）。
 *
 * 只渲染 `AUDIT_DIFF_FIELDS` 白名单字段的差异；响应过 secret / payload 熔断，
 * 因此审计里不可能出现明文 secret 或消息正文。
 */
export function AuditTrailPanel({ scope }: AuditTrailPanelProps) {
  const query = useQuery({
    queryKey: ['enterprise_apps', 'audit', scope.organizationId, scope.applicationId],
    queryFn: () => listAuditLogs(scope, { page: 1, size: 20 }),
    refetchOnWindowFocus: false,
  })

  const failureKind = query.error ? classifyGovernanceFailure(toApiError(query.error), { wired: GOVERNANCE_BACKEND_WIRED }) : null
  const entries = query.data ?? []

  return (
    <Card data-testid="audit-trail-panel">
      <CardHeader>
        <CardTitle className="text-base">审计轨迹（before / after）</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <LoadingState message="加载审计..." />
        ) : failureKind !== null ? (
          <ErrorState
            message={`加载审计失败：${governanceFailureMessage(failureKind)}`}
            onRetry={() => void query.refetch()}
          />
        ) : entries.length === 0 ? (
          <EmptyState title="暂无审计记录" description="该应用尚无治理动作记录。" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>动作</TableHead>
                <TableHead>操作者</TableHead>
                <TableHead>变更字段</TableHead>
                <TableHead>before → after</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} data-audit-action={entry.action}>
                  <TableCell className="font-mono text-xs">{entry.createdAt || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" data-testid={`audit-action-${entry.action}`}>
                      {auditActionLabel(entry.action)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.actorAccount || '-'}</TableCell>
                  <TableCell className="text-xs">{changedSummary(entry)}</TableCell>
                  <TableCell className="space-y-1 text-xs">
                    {entry.changed.map((item) => (
                      <div key={item.field} className="font-mono">
                        <span className="text-muted-foreground">{item.field}</span>
                        {': '}
                        <span data-testid={`audit-before-${item.field}`}>{item.before}</span>
                        {' → '}
                        <span data-testid={`audit-after-${item.field}`}>{item.after}</span>
                      </div>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
