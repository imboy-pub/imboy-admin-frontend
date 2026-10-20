import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { getErrorMessage } from '@/lib/errorUtils'
import { APPLICATION_STATUS_LABELS, WRITE_PERMISSION, type ApplicationStatus, GOVERNANCE_BACKEND_WIRED } from '../api/contracts'
import {
  applicationStatusLabel,
  classifyGovernanceFailure,
  governanceFailureMessage,
  nextAllowedStatuses,
  type ApiErrorLike,
  type ApplicationDetail,
} from '../api/pureFunctions'
import { changeApplicationStatus, newIdempotencyKey, type GovernanceScope } from '../api/public'

type ApplicationGovernanceCardProps = {
  scope: GovernanceScope
  detail: ApplicationDetail
  onRefresh: () => void
}

type PendingChange = { kind: 'status'; target: ApplicationStatus }

function toApiError(err: unknown): ApiErrorLike | null {
  return err && typeof err === 'object' ? (err as ApiErrorLike) : null
}

/** Application 生命周期治理；CAS、审计及管理员写权限保持一致。 */
export function ApplicationGovernanceCard({ scope, detail, onRefresh }: ApplicationGovernanceCardProps) {
  const queryClient = useQueryClient()
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const archived = detail.status === 'archived'
  const writeDisabled = archived || !canWrite
  const transitions = useMemo(() => nextAllowedStatuses(detail.status), [detail.status])
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['enterprise_apps', 'application', scope.organizationId, scope.applicationId],
    })
    void queryClient.invalidateQueries({
      queryKey: ['enterprise_apps', 'audit', scope.organizationId, scope.applicationId],
    })
    onRefresh()
  }, [queryClient, scope.organizationId, scope.applicationId, onRefresh])

  const onError = useCallback((err: unknown) => {
    const kind = classifyGovernanceFailure(toApiError(err), { wired: GOVERNANCE_BACKEND_WIRED })
    setFeedback({ kind: 'error', text: `${governanceFailureMessage(kind)}（${getErrorMessage(err)}）` })
  }, [])

  const statusMutation = useMutation({
    mutationFn: async (target: ApplicationStatus) =>
      changeApplicationStatus(
        scope,
        { currentStatus: detail.status, target, expectedVersion: detail.version },
        { permissions: canWrite ? [WRITE_PERMISSION] : [], idempotencyKey: newIdempotencyKey() }
      ),
    onSuccess: () => {
      setFeedback({ kind: 'ok', text: '生命周期已变更（审计已记录 before/after）' })
      refresh()
    },
    onError,
    onSettled: () => setPending(null),
  })

  const confirmCopy = useMemo(() => {
    if (pending === null) return { title: '', description: '', destructive: false }

      return {
        title: `切换到「${APPLICATION_STATUS_LABELS[pending.target]}」`,
        description: `expected_version=${detail.version}。${
          pending.target === 'archived' ? '归档为终态，应用的全部写动作与凭证使用将停止。' : '状态变更对下一个请求生效，且会写入审计。'
        }`,
        destructive: pending.target === 'archived' || pending.target === 'disabled',
      }
  }, [pending, detail.version])

  return (
    <Card data-testid="application-governance-card">
      <CardHeader>
        <CardTitle className="text-base">生命周期 治理</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canWrite && (
          <p className="text-xs text-muted-foreground" data-testid="governance-readonly-hint">
            当前角色只有只读权限（缺少 {WRITE_PERMISSION}）：生命周期 写入口不可用。
          </p>
        )}
        {feedback !== null && (
          <p
            className={feedback.kind === 'ok' ? 'text-xs text-green-700' : 'text-xs text-destructive'}
            role={feedback.kind === 'error' ? 'alert' : undefined}
            data-testid="governance-feedback"
          >
            {feedback.text}
          </p>
        )}

        <div className="space-y-2" data-testid="lifecycle-block">
          <p className="text-sm font-medium">
            当前生命周期：
            <span data-testid="application-status">{applicationStatusLabel(detail.status)}</span>
            <span className="ml-2 text-xs text-muted-foreground">version={detail.version}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {transitions.length === 0 ? (
              <span className="text-xs text-muted-foreground" data-testid="lifecycle-terminal">
                当前状态无可用迁移（终态 / 未知状态 fail-closed）
              </span>
            ) : (
              transitions.map((target) => (
                <Button
                  key={target}
                  size="sm"
                  variant={target === 'archived' || target === 'disabled' ? 'destructive' : 'default'}
                  disabled={writeDisabled}
                  onClick={() => setPending({ kind: 'status', target })}
                  data-testid={`lifecycle-to-${target}`}
                >
                  <Workflow className="mr-1 h-3.5 w-3.5" />
                  切到{APPLICATION_STATUS_LABELS[target]}
                </Button>
              ))
            )}
          </div>
        </div>

      </CardContent>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmText="确认执行"
        variant={confirmCopy.destructive ? 'destructive' : 'default'}
        loading={statusMutation.isPending}
        onConfirm={() => {
          if (pending === null) return
          statusMutation.mutate(pending.target)
        }}
      />
    </Card>
  )
}
