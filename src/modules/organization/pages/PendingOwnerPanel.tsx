import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, RefreshCw, Repeat, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import type { EntityId } from '@/types/common'
import {
  getPendingOwnerStatus,
  reactivateOwner,
  replaceOwnerByPhone,
  resendOwnerActivationSms,
} from '../api/pendingOwnerApi'
import {
  formatTtl,
  inviteLabel,
  normalizeMobileInput,
  pendingOwnerErrorHintOf,
} from '../api/pendingOwnerPure'

const WRITE_PERMISSION = 'organizations:write'
const STATUS_QUERY_KEY = ['gzapp06', 'pending-owner-status'] as const

interface PendingOwnerPanelProps {
  organizationId: EntityId
}

/**
 * 待激活 Owner 状态卡（GZAPP-06 / J02 治理面板）。
 *
 * 展示与动作：
 * - 状态卡：状态标签（pending / sms_failed / activated / superseded + 过期派生）、
 *   脱敏手机号（mobile_masked，前3后4）、TTL 倒计时、重发次数、Owner 是否已激活；
 * - 重发（token 轮换 + resend_count++；旧链接即时失效）；
 * - 重新激活（30 天 TTL 到期不删除；刷新 TTL 回 pending）；
 * - 按手机号换 Owner（D13：恰一 active Owner 由服务端事务保证；
 *   目标已注册 → 直接转移，无邀请短信）。
 *
 * 注意：本组件是 GZAPP-06 交付的独立面板；接入组织详情页路由属 GZAPP-08。
 */
export function PendingOwnerPanel({ organizationId }: PendingOwnerPanelProps) {
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })
  const queryClient = useQueryClient()
  const [replaceMobile, setReplaceMobile] = useState('')
  const [rotatedToken, setRotatedToken] = useState<string | null>(null)

  const statusQuery = useQuery({
    queryKey: [...STATUS_QUERY_KEY, organizationId],
    queryFn: () => getPendingOwnerStatus(organizationId),
    enabled: typeof organizationId === 'string' && organizationId.trim().length > 0,
    retry: false,
  })

  const invite = statusQuery.data?.invite ?? null
  const hasLiveInvite = invite != null && (invite.status === 'pending' || invite.status === 'sms_failed')

  // TTL 展示：优先服务端谓词值（ttl_remaining_seconds，随状态查询刷新）；
  // render 内不取本地时钟（react-hooks/purity）——缺服务端值时按未知呈现。
  const ttlText = useMemo(() => (invite ? formatTtl(invite.ttlRemainingSeconds) : null), [invite])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...STATUS_QUERY_KEY, organizationId] })

  const resendMutation = useMutation({
    mutationFn: () => resendOwnerActivationSms(organizationId),
    onSuccess: (rotated) => {
      setRotatedToken(rotated.invite?.activationToken ?? null)
      if (rotated.smsSent) {
        toast.success('激活短信已重发（新链接生效，旧链接失效）')
      } else {
        toast.error('重发仍失败（邀请保持 sms_failed），可稍后再试或重新激活')
      }
      void invalidate()
    },
    onError: (err) => toast.error(pendingOwnerErrorHintOf(err)),
  })

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateOwner(organizationId),
    onSuccess: (rotated) => {
      setRotatedToken(rotated.invite?.activationToken ?? null)
      toast.success('已重新激活邀请（TTL 已重置 30 天）')
      void invalidate()
    },
    onError: (err) => toast.error(pendingOwnerErrorHintOf(err)),
  })

  const replaceMutation = useMutation({
    mutationFn: () => replaceOwnerByPhone(organizationId, replaceMobile),
    onSuccess: (result) => {
      if (result.mode === 'direct_transfer') {
        toast.success('Owner 已直接转移给该注册用户（无邀请短信）')
      } else {
        setRotatedToken(result.invite?.activationToken ?? null)
        toast.success(
          result.smsSent
            ? `Owner 已更换，激活短信已发送至 ${result.invite?.mobileMasked ?? '目标手机'}`
            : `Owner 已更换，但激活短信发送失败（可重发；转移不受影响）`
        )
      }
      setReplaceMobile('')
      void invalidate()
    },
    onError: (err) => toast.error(pendingOwnerErrorHintOf(err)),
  })

  const replaceMobileCheck = useMemo(() => normalizeMobileInput(replaceMobile), [replaceMobile])

  if (statusQuery.isPending) {
    return <p className="text-sm text-muted-foreground" data-testid="pending-owner-loading">加载待激活 Owner 状态…</p>
  }
  if (statusQuery.isError) {
    return (
      <p className="text-sm text-destructive" data-testid="pending-owner-error">
        {pendingOwnerErrorHintOf(statusQuery.error)}
      </p>
    )
  }

  const status = statusQuery.data

  return (
    <section className="space-y-3 rounded-md border p-4" data-testid="pending-owner-panel">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">待激活 Owner</h3>
        <div className="flex items-center gap-2">
          {status.ownerActivated ? (
            <Badge data-testid="owner-activated-badge">Owner 已激活</Badge>
          ) : (
            <Badge variant="secondary" data-testid="owner-pending-badge">Owner 未激活</Badge>
          )}
          <Badge variant="outline">组织 {status.organizationStatus || '-'}</Badge>
        </div>
      </header>

      {invite ? (
        <dl className="space-y-2 text-sm" data-testid="pending-owner-invite">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">状态</dt>
            <dd data-testid="invite-status-label">{inviteLabel(invite)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">手机号（脱敏）</dt>
            <dd className="font-mono" data-testid="invite-mobile-masked">
              {invite.mobileMasked}
            </dd>
          </div>
          {hasLiveInvite ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                TTL
              </dt>
              <dd data-testid="invite-ttl">{ttlText}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">重发次数</dt>
            <dd data-testid="invite-resend-count">{invite.resendCount}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="invite-none">
          无邀请记录（Owner 可能经已注册模式选定，或邀请已被消费/作废）。
        </p>
      )}

      {rotatedToken ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">一次性激活 token（只显示一次，最新一次操作）</summary>
          <Input data-testid="activation-token-once" readOnly value={rotatedToken} className="mt-1 font-mono text-xs" />
        </details>
      ) : null}

      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="resend-btn"
            disabled={!hasLiveInvite || resendMutation.isPending}
            onClick={() => resendMutation.mutate()}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            重发短信
          </Button>
          <Button
            type="button"
            size="sm"
            variant={invite?.expired ? 'default' : 'outline'}
            data-testid="reactivate-btn"
            disabled={!hasLiveInvite || reactivateMutation.isPending}
            onClick={() => reactivateMutation.mutate()}
          >
            <Repeat className="mr-1 h-3.5 w-3.5" />
            重新激活（重置 30 天）
          </Button>
        </div>
      ) : (
        <p className="text-xs text-destructive">当前管理员无 {WRITE_PERMISSION} 权限，仅可查看。</p>
      )}

      {canWrite ? (
        <div className="space-y-1.5 border-t pt-3">
          <Label htmlFor="replace-owner-mobile">按手机号更换 Owner（已注册用户直接转移；新号建待激活 Owner）</Label>
          <div className="flex items-end gap-2">
            <Input
              id="replace-owner-mobile"
              data-testid="replace-owner-mobile"
              value={replaceMobile}
              onChange={(event) => setReplaceMobile(event.target.value)}
              placeholder="例如：13900001234"
              inputMode="tel"
            />
            <Button
              type="button"
              size="sm"
              data-testid="replace-owner-btn"
              disabled={!replaceMobileCheck.ok || replaceMutation.isPending}
              onClick={() => replaceMutation.mutate()}
            >
              <UserCog className="mr-1 h-3.5 w-3.5" />
              更换 Owner
            </Button>
          </div>
          {replaceMobile.trim().length > 0 && !replaceMobileCheck.ok ? (
            <p className="text-xs text-destructive">{replaceMobileCheck.error}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            更换后旧邀请即时作废；恰一 active Owner 不变量由服务端单事务保证（D13）。
          </p>
        </div>
      ) : null}
    </section>
  )
}
