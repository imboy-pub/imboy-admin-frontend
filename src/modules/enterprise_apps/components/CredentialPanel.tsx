import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, RefreshCw, ShieldOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  credentialExpiryLabel,
  credentialExpiryState,
  governanceFailureMessage,
  lastUsedLabel,
  type ApiErrorLike,
  type CredentialMeta,
} from '../api/pureFunctions'
import {
  issueCredential,
  listCredentials,
  newIdempotencyKey,
  revokeCredential,
  rotateCredential,
  type GovernanceScope,
} from '../api/public'
import { readOnce } from '../api/secretOnetime'
import { SecretOncePanel } from './SecretOncePanel'

type PendingAction =
  | { kind: 'issue' }
  | { kind: 'rotate'; credential: CredentialMeta }
  | { kind: 'revoke'; credential: CredentialMeta }

const FAILURE_WIRED = { wired: GOVERNANCE_BACKEND_WIRED }

function toApiError(err: unknown): ApiErrorLike | null {
  return err && typeof err === 'object' ? (err as ApiErrorLike) : null
}

export type CredentialPanelProps = {
  scope: GovernanceScope
  /** Application 当前生命周期（archived 时禁写）。 */
  applicationArchived: boolean
}

/**
 * credential 治理面板：签发 / 轮换 / 撤销 / 到期 / last-used。
 *
 * - secret **只**经 SecretOncePanel 展示一次（来自内存仓，不来自任何读面）；
 * - 全部写动作要求 `enterprise_business:write` + 二次确认 + 幂等键；
 * - 列表面永不出现明文 secret / digest（服务层熔断 + 白名单投影）。
 */
export function CredentialPanel({ scope, applicationArchived }: CredentialPanelProps) {
  const queryClient = useQueryClient()
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [activeWindow, setActiveWindow] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const queryKey = useMemo(
    () => ['enterprise_apps', 'credentials', scope.organizationId, scope.applicationId],
    [scope.organizationId, scope.applicationId]
  )
  const query = useQuery({
    queryKey,
    queryFn: () => listCredentials(scope),
  })

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey })
    void queryClient.invalidateQueries({
      queryKey: ['enterprise_apps', 'audit', scope.organizationId, scope.applicationId],
    })
  }, [queryClient, queryKey, scope.organizationId, scope.applicationId])

  const mutation = useMutation({
    mutationFn: async (action: PendingAction) => {
      const options = { permissions: canWrite ? [WRITE_PERMISSION] : [], idempotencyKey: newIdempotencyKey() }
      if (action.kind === 'issue') {
        const result = await issueCredential(scope, {}, options)
        return result.credential.id
      }
      if (action.kind === 'rotate') {
        const result = await rotateCredential(scope, action.credential.id, options)
        return result.credential.id
      }
      await revokeCredential(scope, action.credential.id, options)
      return null
    },
    onSuccess: (credentialId) => {
      setActionError(null)
      if (credentialId !== null) setActiveWindow(credentialId)
      refresh()
    },
    onError: (err: unknown) => {
      const kind = classifyGovernanceFailure(toApiError(err), FAILURE_WIRED)
      setActionError(`${governanceFailureMessage(kind)}（${getErrorMessage(err)}）`)
    },
    onSettled: () => setPending(null),
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  const failureKind = query.error ? classifyGovernanceFailure(toApiError(query.error), FAILURE_WIRED) : null
  const writeDisabled = applicationArchived || !canWrite

  const confirmCopy = useMemo(() => {
    if (pending === null) return { title: '', description: '' }
    if (pending.kind === 'issue') {
      return {
        title: '签发新凭证',
        description: '将生成一次新的 application credential；明文 secret 只会显示一次，请准备好密钥管理系统。',
      }
    }
    if (pending.kind === 'rotate') {
      return {
        title: '轮换凭证',
        description: `轮换后旧 secret 立即失效（无并行窗口）。凭证前缀：${pending.credential.prefix || '(未知)'}`,
      }
    }
    return {
      title: '撤销凭证',
      description: `撤销后使用该凭证的请求下一个请求即失败（不可逆）。凭证前缀：${pending.credential.prefix || '(未知)'}`,
    }
  }, [pending])

  let body
  if (query.isLoading) {
    body = <LoadingState message="加载凭证列表..." />
  } else if (failureKind !== null) {
    body = (
      <ErrorState
        message={`加载凭证列表失败：${governanceFailureMessage(failureKind)}`}
        onRetry={() => void query.refetch()}
      />
    )
  } else if (rows.length === 0) {
    body = <EmptyState title="暂无凭证" description="该应用还没有任何 credential。签发后明文只显示一次。" />
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>前缀</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>到期</TableHead>
            <TableHead>最近使用</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const expiry = credentialExpiryState(row)
            const revokedOrExpired = expiry === 'revoked' || expiry === 'expired' || expiry === 'unknown'
            return (
              <TableRow key={row.id} data-credential-id={row.id}>
                <TableCell className="font-mono text-xs">{row.prefix || '-'}</TableCell>
                <TableCell>
                  <Badge
                    variant={expiry === 'active' || expiry === 'noExpiry' ? 'secondary' : 'destructive'}
                    data-testid={`credential-expiry-${row.id}`}
                  >
                    {credentialExpiryLabel(expiry)}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.expiresAt || '无'}</TableCell>
                <TableCell className="font-mono text-xs">{lastUsedLabel(row.lastUsedAt)}</TableCell>
                <TableCell className="font-mono text-xs">{row.createdAt || '-'}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={writeDisabled}
                    onClick={() => setPending({ kind: 'rotate', credential: row })}
                    data-testid={`credential-rotate-${row.id}`}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    轮换
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={writeDisabled || revokedOrExpired}
                    onClick={() => setPending({ kind: 'revoke', credential: row })}
                    data-testid={`credential-revoke-${row.id}`}
                  >
                    <ShieldOff className="mr-1 h-3.5 w-3.5" />
                    撤销
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )
  }

  return (
    <Card data-testid="credential-panel">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">凭证（credential）</CardTitle>
        <Button
          size="sm"
          disabled={writeDisabled || mutation.isPending}
          onClick={() => setPending({ kind: 'issue' })}
          data-testid="credential-issue"
        >
          <KeyRound className="mr-1 h-4 w-4" />
          签发凭证
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!canWrite && (
          <p className="text-xs text-muted-foreground" data-testid="credential-readonly-hint">
            当前角色只有只读权限（缺少 {WRITE_PERMISSION}）：签发/轮换/撤销入口不可用。
          </p>
        )}
        {applicationArchived && (
          <p className="text-xs text-destructive" data-testid="credential-archived-hint">
            应用已归档：全部写动作关闭。
          </p>
        )}
        {actionError !== null && (
          <p className="text-xs text-destructive" role="alert" data-testid="credential-action-error">
            {actionError}
          </p>
        )}
        {activeWindow !== null && (
          <SecretOncePanel
            credentialId={activeWindow}
            onDismissed={() => {
              if (readOnce(activeWindow) === null) setActiveWindow(null)
            }}
          />
        )}
        {body}
      </CardContent>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmText="确认执行"
        variant={pending?.kind === 'revoke' ? 'destructive' : 'default'}
        loading={mutation.isPending}
        onConfirm={() => {
          if (pending !== null) mutation.mutate(pending)
        }}
      />
    </Card>
  )
}
