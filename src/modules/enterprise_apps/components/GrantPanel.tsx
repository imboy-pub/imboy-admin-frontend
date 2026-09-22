import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, ShieldOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { getErrorMessage } from '@/lib/errorUtils'
import { GRANT_WORKSPACE_SCOPE_LABELS, WRITE_PERMISSION, type EnterpriseScope, type GrantWorkspaceScopeKind, GOVERNANCE_BACKEND_WIRED } from '../api/contracts'
import {
  classifyGovernanceFailure,
  governanceFailureMessage,
  type ApiErrorLike,
  type GrantView,
} from '../api/pureFunctions'
import { issueGrant, listGrants, newIdempotencyKey, patchGrant, type GovernanceScope } from '../api/public'
import { ScopeEditor } from './ScopeEditor'

export type GrantPanelProps = {
  scope: GovernanceScope
  /** Application 当前版本（新增 Grant 的 CAS 期望值）。 */
  applicationVersion: number
  applicationArchived: boolean
  /** Application 当前 scopes（新 Grant 的 scope 上限提示）。 */
  applicationScopes: readonly EnterpriseScope[]
}

function splitIds(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function toApiError(err: unknown): ApiErrorLike | null {
  return err && typeof err === 'object' ? (err as ApiErrorLike) : null
}

/**
 * Organization / Workspace Grant 治理面板（对接 FULL-01 的 Grant 治理面）。
 *
 * CAS 语义（migration 139 + enterprise_internal_ops）：
 * - 新增 Grant 的 `expected_version` = Application 版本；
 * - 变更/撤销既有 Grant 的 `expected_version` = 该 Grant 自己的 `version`（只增不回退）；
 * - 冲突（409 + stale_version）→ 页面提示刷新后按最新 version 重试，不静默重试。
 */
export function GrantPanel({
  scope,
  applicationVersion,
  applicationArchived,
  applicationScopes,
}: GrantPanelProps) {
  const queryClient = useQueryClient()
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })
  const queryKey = useMemo(
    () => ['enterprise_apps', 'grants', scope.organizationId, scope.applicationId],
    [scope.organizationId, scope.applicationId]
  )
  const query = useQuery({ queryKey, queryFn: () => listGrants(scope) })

  const [draftScopes, setDraftScopes] = useState<EnterpriseScope[]>([])
  const [draftKind, setDraftKind] = useState<GrantWorkspaceScopeKind>('explicit')
  const [draftWorkspaces, setDraftWorkspaces] = useState('')
  const [draftValidTo, setDraftValidTo] = useState('')
  const [editing, setEditing] = useState<{ grant: GrantView; scopes: EnterpriseScope[] } | null>(null)
  const [revoking, setRevoking] = useState<GrantView | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey })
    void queryClient.invalidateQueries({
      queryKey: ['enterprise_apps', 'audit', scope.organizationId, scope.applicationId],
    })
  }, [queryClient, queryKey, scope.organizationId, scope.applicationId])

  const onError = useCallback((err: unknown) => {
    const kind = classifyGovernanceFailure(toApiError(err), { wired: GOVERNANCE_BACKEND_WIRED })
    setFeedback({ kind: 'error', text: `${governanceFailureMessage(kind)}（${getErrorMessage(err)}）` })
  }, [])

  const createMutation = useMutation({
    mutationFn: async () =>
      issueGrant(
        scope,
        {
          scopes: draftScopes,
          workspaceScopeKind: draftKind,
          workspaceIds: splitIds(draftWorkspaces),
          validTo: draftValidTo.trim().length > 0 ? draftValidTo.trim() : undefined,
          expectedVersion: applicationVersion,
        },
        { permissions: canWrite ? [WRITE_PERMISSION] : [], idempotencyKey: newIdempotencyKey() }
      ),
    onSuccess: () => {
      setFeedback({ kind: 'ok', text: '授权已新增（审计已记录 before/after）' })
      setDraftScopes([])
      setDraftWorkspaces('')
      setDraftValidTo('')
      refresh()
    },
    onError,
  })

  const patchMutation = useMutation({
    mutationFn: async (input: { grant: GrantView; scopes: EnterpriseScope[] }) =>
      patchGrant(
        scope,
        input.grant.id,
        { expectedVersion: input.grant.version, scopes: input.scopes },
        { permissions: canWrite ? [WRITE_PERMISSION] : [], idempotencyKey: newIdempotencyKey() }
      ),
    onSuccess: () => {
      setFeedback({ kind: 'ok', text: '授权 scope 已按 CAS 更新' })
      setEditing(null)
      refresh()
    },
    onError,
  })

  const revokeMutation = useMutation({
    mutationFn: async (grant: GrantView) =>
      patchGrant(
        scope,
        grant.id,
        { expectedVersion: grant.version, revoke: true },
        { permissions: canWrite ? [WRITE_PERMISSION] : [], idempotencyKey: newIdempotencyKey() }
      ),
    onSuccess: () => {
      setFeedback({ kind: 'ok', text: '授权已撤销（下一请求即生效）' })
      refresh()
    },
    onError,
    onSettled: () => setRevoking(null),
  })

  const grants = useMemo(() => query.data ?? [], [query.data])
  const failureKind = query.error ? classifyGovernanceFailure(toApiError(query.error), { wired: GOVERNANCE_BACKEND_WIRED }) : null
  const writeDisabled = applicationArchived || !canWrite

  return (
    <Card data-testid="grant-panel">
      <CardHeader>
        <CardTitle className="text-base">授权（Organization / Workspace Grant）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback !== null && (
          <p
            className={feedback.kind === 'ok' ? 'text-xs text-green-700' : 'text-xs text-destructive'}
            role={feedback.kind === 'error' ? 'alert' : undefined}
            data-testid="grant-feedback"
          >
            {feedback.text}
          </p>
        )}

        {failureKind !== null ? (
          <ErrorState
            message={`加载授权失败：${governanceFailureMessage(failureKind)}`}
            onRetry={() => void query.refetch()}
          />
        ) : query.isLoading ? (
          <LoadingState message="加载授权列表..." />
        ) : grants.length === 0 ? (
          <EmptyState title="暂无授权" description="该应用还没有 Grant。未授予任何 Grant 时，internal 面只放行 application:read 自身上下文。" />
        ) : (
          <div className="space-y-2">
            {grants.map((grant) => (
              <div key={grant.id} className="rounded-md border p-3" data-grant-id={grant.id} data-version={grant.version}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono">{grant.id}</span>
                  <Badge variant={grant.status === 'active' ? 'secondary' : 'destructive'}>
                    {grant.status === 'active' ? '生效' : grant.status === 'revoked' ? '已撤销' : '未知状态（fail-safe）'}
                  </Badge>
                  <Badge variant="outline">
                    {grant.workspaceScopeKind === 'unknown'
                      ? '范围未知（fail-safe）'
                      : GRANT_WORKSPACE_SCOPE_LABELS[grant.workspaceScopeKind]}
                  </Badge>
                  <span className="text-muted-foreground">version={grant.version}</span>
                  <span className="text-muted-foreground">有效期 {grant.validFrom || '—'} → {grant.validTo || '长期'}</span>
                </div>
                <p className="mt-1 font-mono text-xs">scopes: {grant.scopes.join(', ') || '（空）'}</p>
                <p className="font-mono text-xs">workspaces: {grant.workspaceIds.join(', ') || '（全域）'}</p>
                <div className="mt-2 space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={writeDisabled || grant.status !== 'active'}
                    onClick={() => setEditing({ grant, scopes: [...grant.scopes] })}
                    data-testid={`grant-edit-${grant.id}`}
                  >
                    编辑 scope（CAS）
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={writeDisabled || grant.status !== 'active'}
                    onClick={() => setRevoking(grant)}
                    data-testid={`grant-revoke-${grant.id}`}
                  >
                    <ShieldOff className="mr-1 h-3.5 w-3.5" />
                    撤销授权
                  </Button>
                </div>
                {editing?.grant.id === grant.id && (
                  <div className="mt-3 space-y-2 rounded border bg-muted/30 p-3">
                    <ScopeEditor
                      idPrefix={`grant-edit-${grant.id}`}
                      value={editing.scopes}
                      baseline={grant.scopes}
                      onChange={(next) => setEditing({ grant, scopes: next })}
                      disabled={writeDisabled}
                    />
                    <div className="space-x-2">
                      <Button
                        size="sm"
                        disabled={editing.scopes.length === 0 || patchMutation.isPending}
                        onClick={() => patchMutation.mutate({ grant, scopes: editing.scopes })}
                        data-testid={`grant-save-${grant.id}`}
                      >
                        <RefreshCw className="mr-1 h-3.5 w-3.5" />
                        保存（expected_version={grant.version}）
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 rounded-md border p-3" data-testid="grant-create-form">
          <p className="text-sm font-medium">新增授权</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="grant-kind">授权范围</Label>
              <Select
                id="grant-kind"
                value={draftKind}
                disabled={writeDisabled}
                onChange={(event) => setDraftKind(event.target.value as GrantWorkspaceScopeKind)}
              >
                <option value="explicit">Workspace Grant（显式工作区）</option>
                <option value="none">Organization Grant（组织全域）</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-workspaces">工作区 ID（逗号/空格分隔）</Label>
              <Input
                id="grant-workspaces"
                value={draftWorkspaces}
                disabled={writeDisabled || draftKind === 'none'}
                onChange={(event) => setDraftWorkspaces(event.target.value)}
                placeholder="TSID，可多个"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-valid-to">有效期至（可空）</Label>
              <Input
                id="grant-valid-to"
                value={draftValidTo}
                disabled={writeDisabled}
                onChange={(event) => setDraftValidTo(event.target.value)}
                placeholder="ISO8601，例如 2026-12-31T00:00:00Z"
              />
            </div>
          </div>
          <ScopeEditor
            idPrefix="grant-create"
            value={draftScopes}
            baseline={[]}
            onChange={setDraftScopes}
            disabled={writeDisabled}
          />
          {applicationScopes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              提示：Grant scope 与 Application scope 取**交集**后逐请求判定；当前 Application scopes：
              {applicationScopes.join(', ')}
            </p>
          )}
          <Button
            disabled={writeDisabled || draftScopes.length === 0 || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            data-testid="grant-create-submit"
          >
            <Plus className="mr-1 h-4 w-4" />
            新增授权（expected_version={applicationVersion}）
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title="撤销授权"
        description={
          revoking === null
            ? ''
            : `撤销后该 Grant 的授权对下一个请求立即失效（CAS expected_version=${revoking.version}）。`
        }
        confirmText="确认撤销"
        variant="destructive"
        loading={revokeMutation.isPending}
        onConfirm={() => {
          if (revoking !== null) revokeMutation.mutate(revoking)
        }}
      />
    </Card>
  )
}
