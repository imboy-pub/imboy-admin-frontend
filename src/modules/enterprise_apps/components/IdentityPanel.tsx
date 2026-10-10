import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserRoundCog } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { getErrorMessage } from '@/lib/errorUtils'
import { WRITE_PERMISSION, GOVERNANCE_BACKEND_WIRED } from '../api/contracts'
import {
  classifyGovernanceFailure,
  governanceFailureMessage,
  type ApiErrorLike,
  type IdentityView,
} from '../api/pureFunctions'
import {
  bindIdentity,
  listIdentities,
  newIdempotencyKey,
  unbindIdentity,
  type GovernanceScope,
} from '../api/public'

function toApiError(err: unknown): ApiErrorLike | null {
  return err && typeof err === 'object' ? (err as ApiErrorLike) : null
}

/**
 * 身份映射面板（A-16..A-18）：external_user_id <-> IMBoy user 的绑定治理。
 *
 * 这是 OA 免登的前提配置：工作台条目可见性与 code 签发都要求当前用户存在
 * active 映射。绑定是幂等 upsert（同 external_user_id 重绑即换绑并复活）；
 * 解绑是软删（removed 行保留历史）。写面统一 enterprise_business:write。
 */
export function IdentityPanel({
  scope,
  applicationArchived,
}: {
  scope: GovernanceScope
  applicationArchived: boolean
}) {
  const queryClient = useQueryClient()
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })
  const [externalUserId, setExternalUserId] = useState('')
  const [userId, setUserId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingUnbind, setPendingUnbind] = useState<IdentityView | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const queryKey = useMemo(
    () => ['enterprise_apps', 'identities', scope.organizationId, scope.applicationId],
    [scope.organizationId, scope.applicationId]
  )
  const query = useQuery({
    queryKey,
    queryFn: () => listIdentities(scope),
  })

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey })
    void queryClient.invalidateQueries({
      queryKey: ['enterprise_apps', 'audit', scope.organizationId, scope.applicationId],
    })
  }, [queryClient, queryKey, scope.organizationId, scope.applicationId])

  const bindMutation = useMutation({
    mutationFn: async () => {
      const result = await bindIdentity(
        scope,
        { externalUserId, userId },
        { permissions: canWrite ? [WRITE_PERMISSION] : [], idempotencyKey: newIdempotencyKey() }
      )
      return result
    },
    onSuccess: () => {
      setFormError(null)
      setExternalUserId('')
      setUserId('')
      refresh()
    },
    onError: (err: unknown) => {
      setFormError(getErrorMessage(err))
    },
  })

  const unbindMutation = useMutation({
    mutationFn: async (identity: IdentityView) => {
      await unbindIdentity(
        scope,
        identity.externalUserId,
        { permissions: canWrite ? [WRITE_PERMISSION] : [], idempotencyKey: newIdempotencyKey() }
      )
    },
    onSuccess: () => {
      setActionError(null)
      refresh()
    },
    onError: (err: unknown) => {
      const kind = classifyGovernanceFailure(toApiError(err), { wired: GOVERNANCE_BACKEND_WIRED })
      setActionError(`${governanceFailureMessage(kind)}（${getErrorMessage(err)}）`)
    },
    onSettled: () => setPendingUnbind(null),
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  const failureKind = query.error ? classifyGovernanceFailure(toApiError(query.error), { wired: GOVERNANCE_BACKEND_WIRED }) : null
  const writeDisabled = applicationArchived || !canWrite

  const submitBind = () => {
    if (externalUserId.trim().length === 0) {
      setFormError('请填写 external_user_id（OA 侧工号等唯一标识）')
      return
    }
    if (!/^[1-9][0-9]{0,18}$/.test(userId.trim())) {
      setFormError('请填写成员的纯数字 user_id')
      return
    }
    bindMutation.mutate()
  }

  return (
    <Card data-testid="identity-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRoundCog className="h-4 w-4" />
          身份映射（external_user_id ↔ 成员）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && <LoadingState message="加载身份映射…" />}
        {failureKind !== null && (
          <ErrorState
            message={`加载身份映射失败：${governanceFailureMessage(failureKind)}`}
            onRetry={() => void query.refetch()}
          />
        )}
        {!query.isLoading && failureKind === null && rows.length === 0 && (
          <EmptyState
            icon={<UserRoundCog className="h-8 w-8" />}
            title="暂无身份映射"
            description="没有映射的成员无法在工作台看到该应用，也无法经按需免登取码。"
          />
        )}
        {rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>external_user_id</TableHead>
                <TableHead>user_id</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((identity) => (
                <TableRow key={identity.id}>
                  <TableCell className="font-mono text-xs">{identity.externalUserId}</TableCell>
                  <TableCell className="font-mono text-xs">{identity.userId}</TableCell>
                  <TableCell>
                    <Badge variant={identity.status === 'active' ? 'secondary' : 'outline'}>
                      {identity.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{identity.updatedAt || '-'}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={writeDisabled || identity.status !== 'active' || unbindMutation.isPending}
                      onClick={() => setPendingUnbind(identity)}
                    >
                      解绑
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="identity-external">external_user_id（OA 侧唯一标识）</Label>
            <Input
              id="identity-external"
              value={externalUserId}
              onChange={(event) => setExternalUserId(event.target.value)}
              placeholder="例如 E10001"
              disabled={writeDisabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="identity-user">成员 user_id（纯数字）</Label>
            <Input
              id="identity-user"
              value={userId}
              inputMode="numeric"
              onChange={(event) => setUserId(event.target.value)}
              placeholder="TSID，例如 1234567890123456789"
              disabled={writeDisabled}
            />
          </div>
          <Button disabled={writeDisabled || bindMutation.isPending} onClick={submitBind}>
            {bindMutation.isPending ? '绑定中…' : '绑定'}
          </Button>
        </div>
        {formError !== null && <p className="text-sm text-destructive">{formError}</p>}
        {actionError !== null && <p className="text-sm text-destructive">{actionError}</p>}
        {writeDisabled && !applicationArchived && (
          <p className="text-sm text-muted-foreground">
            绑定/解绑需要 {'enterprise_business:write'} 权限。
          </p>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingUnbind !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUnbind(null)
        }}
        title="解绑该身份映射？"
        description={`解绑后 ${pendingUnbind?.externalUserId ?? ''} 将立即失去工作台入口与免登取码能力（软删，可重新绑定）。`}
        confirmText="解绑"
        variant="destructive"
        onConfirm={() => {
          if (pendingUnbind !== null) unbindMutation.mutate(pendingUnbind)
        }}
      />
    </Card>
  )
}
