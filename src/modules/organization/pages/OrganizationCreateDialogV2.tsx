import { useCallback, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Search, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { searchUsersPayload } from '@/modules/identity/api/users'
import type { EntityId } from '@/types/common'
import type { User } from '@/types/user'
import { createOrganization } from '../api/public'
import { classifyCreateOutcome, classifyOrgError, createOrgErrorHint, isUserSelectableForOwner } from '../api/pureFunctions'
import {
  createOrganizationWithPendingOwner,
  resendOwnerActivationSms,
} from '../api/pendingOwnerApi'
import {
  normalizeMobileInput,
  pendingOwnerErrorHintOf,
  type CreatePendingOwnerResult,
  type PendingOwnerMode,
} from '../api/pendingOwnerPure'

const WRITE_PERMISSION = 'organizations:write'

type Step = 'form' | 'confirm' | 'sms-warning'

interface OrganizationCreateDialogV2Props {
  open: boolean
  onOpenChange: (_open: boolean) => void
  /**
   * 创建成功（真实新建 / 幂等命中 / 短信失败但企业已建）后回调。
   * 第四参 activation 仅 pending_phone 模式携带（sms_failed 警示态时父级
   * 可选择停留或跳转；本组件默认停留在警示态供重发）。
   */
  onCreated: (
    _organizationId: EntityId,
    _workspaceId: EntityId,
    _created: boolean,
    _activation?: CreatePendingOwnerResult['ownerActivation']
  ) => void
}

/**
 * 创建组织对话框 V2（GZAPP-06 / D11）——双模式：
 * - registered：复用 EADM-01 已注册模式（搜索选 active Human，行为同 V1）；
 * - pending_phone：输入手机号建待激活 Owner（预创建不可登录 Human + 激活邀请，
 *   首次自动尝试发激活短信）。
 *
 * 成功分叉（D12）：
 * - 短信发送成功 → 常规成功（toast + onCreated + 关闭）；
 * - 短信发送失败（sms_failed）→ 警示态：企业已建成（非错误），展示脱敏手机号
 *   与重发按钮；重发成功后仍停留在完成态，可关闭（onCreated 已在提交成功时
 *   发出——企业创建是既成事实，不因短信失败而阻止导航）。
 */
export function OrganizationCreateDialogV2({ open, onOpenChange, onCreated }: OrganizationCreateDialogV2Props) {
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [step, setStep] = useState<Step>('form')
  const [mode, setMode] = useState<PendingOwnerMode>('registered')
  const [name, setName] = useState('')
  const [owner, setOwner] = useState<User | null>(null)
  const [ownerMobile, setOwnerMobile] = useState('')
  const [defaultWorkspaceName, setDefaultWorkspaceName] = useState('')
  const [wsTouched, setWsTouched] = useState(false)
  const [pendingResult, setPendingResult] = useState<CreatePendingOwnerResult | null>(null)

  const [ownerKeyword, setOwnerKeyword] = useState('')
  const [ownerResults, setOwnerResults] = useState<User[]>([])
  const [ownerSearching, setOwnerSearching] = useState(false)
  const [ownerSearchError, setOwnerSearchError] = useState<string | null>(null)

  const [submitError, setSubmitError] = useState<string | null>(null)

  const resetState = useCallback(() => {
    setStep('form')
    setMode('registered')
    setName('')
    setOwner(null)
    setOwnerMobile('')
    setDefaultWorkspaceName('')
    setWsTouched(false)
    setPendingResult(null)
    setOwnerKeyword('')
    setOwnerResults([])
    setOwnerSearchError(null)
    setSubmitError(null)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetState()
      onOpenChange(next)
    },
    [onOpenChange, resetState]
  )

  const derivedWsName = useMemo(() => {
    if (wsTouched) return defaultWorkspaceName
    return name.trim()
  }, [wsTouched, defaultWorkspaceName, name])

  const onNameChange = (value: string) => {
    setName(value)
    if (!wsTouched) setDefaultWorkspaceName(value.trim())
  }

  const onWsChange = (value: string) => {
    setWsTouched(true)
    setDefaultWorkspaceName(value)
  }

  const mobileCheck = useMemo(() => normalizeMobileInput(ownerMobile), [ownerMobile])

  const runOwnerSearch = useCallback(async () => {
    const keyword = ownerKeyword.trim()
    if (keyword.length === 0) {
      setOwnerResults([])
      return
    }
    setOwnerSearching(true)
    setOwnerSearchError(null)
    try {
      const page = await searchUsersPayload(keyword, 1, 20)
      setOwnerResults(Array.isArray(page?.items) ? page.items : [])
    } catch (err) {
      setOwnerSearchError(classifyOrgError(err).message)
      setOwnerResults([])
    } finally {
      setOwnerSearching(false)
    }
  }, [ownerKeyword])

  const canSubmit =
    canWrite &&
    name.trim().length > 0 &&
    derivedWsName.trim().length > 0 &&
    (mode === 'registered' ? owner != null : mobileCheck.ok)

  const registeredMutation = useMutation({
    mutationFn: () =>
      createOrganization({
        name: name.trim(),
        ownerUserId: owner!.id,
        defaultWorkspaceName: derivedWsName.trim(),
      }),
    onSuccess: (result) => {
      const outcome = classifyCreateOutcome(result)
      if (outcome.kind === 'created') {
        toast.success(`组织「${result.organization.name}」创建成功（Owner=${owner?.account ?? owner?.id}）`)
      } else {
        toast.success(`已存在同名组织，已为你打开既有组织（幂等命中，非失败）`)
      }
      onCreated(outcome.organizationId, outcome.workspaceId, result.created)
      handleOpenChange(false)
    },
    onError: (err) => {
      const hint = createOrgErrorHint(classifyOrgError(err))
      setSubmitError(hint)
      toast.error(hint)
    },
  })

  const pendingMutation = useMutation({
    mutationFn: () =>
      createOrganizationWithPendingOwner({
        name: name.trim(),
        ownerMobile: ownerMobile,
        defaultWorkspaceName: derivedWsName.trim(),
      }),
    onSuccess: (result) => {
      // 企业已建成是既成事实（D12 短信失败不回滚）：先通知父级。
      onCreated(result.organizationId, result.workspaceId, result.created, result.ownerActivation)
      if (result.smsSent) {
        toast.success(
          `组织「${result.organizationName}」创建成功，激活短信已发送至 ${result.ownerActivation?.mobileMasked ?? '目标手机'}`
        )
        handleOpenChange(false)
      } else {
        // 成功分叉：org 已建 + 短信失败 → 警示态（可重发，非错误态）
        toast.warning(`组织「${result.organizationName}」已创建，但激活短信发送失败（可重发，企业不受影响）`)
        setPendingResult(result)
        setStep('sms-warning')
      }
    },
    onError: (err) => {
      const hint = pendingOwnerErrorHintOf(err)
      setSubmitError(hint)
      toast.error(hint)
    },
  })

  const resendMutation = useMutation({
    mutationFn: () => resendOwnerActivationSms(pendingResult?.organizationId ?? ''),
    onSuccess: (rotated) => {
      if (rotated.smsSent) {
        toast.success('激活短信已重发（新链接生效，旧链接失效）')
        setPendingResult((prev) =>
          prev && prev.ownerActivation
            ? {
                ...prev,
                smsSent: true,
                ownerActivation: { ...prev.ownerActivation, status: 'pending', activationToken: rotated.invite?.activationToken ?? null },
              }
            : prev
        )
      } else {
        toast.error('重发仍失败（邀请保持 sms_failed，可稍后再试或重新激活）')
      }
    },
    onError: (err) => toast.error(pendingOwnerErrorHintOf(err)),
  })

  // -------------------------------------------------------------------------
  // 表单步骤
  // -------------------------------------------------------------------------
  const renderForm = () => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Owner 模式（D11）</Label>
        <div className="flex gap-2" data-testid="owner-mode-switch">
          <Button
            type="button"
            size="sm"
            variant={mode === 'registered' ? 'default' : 'outline'}
            data-testid="mode-registered"
            onClick={() => setMode('registered')}
          >
            已注册用户（搜索选择）
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'pending_phone' ? 'default' : 'outline'}
            data-testid="mode-pending-phone"
            onClick={() => setMode('pending_phone')}
          >
            手机号建待激活 Owner
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-create2-name">组织名称</Label>
        <Input
          id="org-create2-name"
          data-testid="org-create2-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="例如：广州企业"
        />
      </div>

      {mode === 'registered' ? (
        <div className="space-y-1.5">
          <Label htmlFor="org-create2-owner-search">Owner（搜索选择，禁止手填 TSID）</Label>
          <div className="flex items-end gap-2">
            <Input
              id="org-create2-owner-search"
              data-testid="owner-search-input"
              value={ownerKeyword}
              onChange={(event) => setOwnerKeyword(event.target.value)}
              placeholder="按账号 / 昵称搜索用户"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void runOwnerSearch()
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => void runOwnerSearch()} disabled={ownerSearching}>
              <Search className="mr-1 h-4 w-4" />
              搜索
            </Button>
          </div>

          {ownerSearchError ? <p className="text-xs text-destructive">{ownerSearchError}</p> : null}

          {!owner && ownerResults.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-auto rounded-md border p-1" data-testid="owner-results">
              {ownerResults.map((u) => {
                const selectable = isUserSelectableForOwner(u)
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      data-testid="owner-option"
                      disabled={!selectable}
                      onClick={() => setOwner(u)}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="truncate">
                        <span className="font-medium">{u.nickname || '-'}</span>
                        {u.account ? <span className="ml-1 text-muted-foreground">({u.account})</span> : null}
                      </span>
                      {selectable ? <Badge variant="default">active</Badge> : <Badge variant="secondary">非活跃·不可选</Badge>}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {owner ? (
            <div className="rounded-md border bg-muted/40 p-3" data-testid="owner-selected">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm">
                  <UserCheck className="h-4 w-4 text-primary" />
                  <span className="font-medium">{owner.nickname || '-'}</span>
                  {owner.account ? <span className="text-muted-foreground">({owner.account})</span> : null}
                  <Badge variant="default">active</Badge>
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOwner(null)}>
                  重选
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="org-create2-mobile">Owner 手机号（创建待激活 Owner，激活短信将发送至此）</Label>
          <Input
            id="org-create2-mobile"
            data-testid="org-create2-mobile"
            value={ownerMobile}
            onChange={(event) => setOwnerMobile(event.target.value)}
            placeholder="例如：13800001234（支持 +86 前缀）"
            inputMode="tel"
          />
          {ownerMobile.trim().length > 0 && !mobileCheck.ok ? (
            <p className="text-xs text-destructive" data-testid="mobile-invalid-hint">
              {mobileCheck.error}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            该手机号若已是注册活跃用户，请改用「已注册用户」模式选择（服务端 409 引导）。
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="org-create2-ws">默认 Workspace 名称</Label>
        <Input
          id="org-create2-ws"
          data-testid="org-create2-ws"
          value={derivedWsName}
          onChange={(event) => onWsChange(event.target.value)}
          placeholder="默认与组织名相同"
        />
      </div>

      {!canWrite ? (
        <p className="text-xs text-destructive">当前管理员无 {WRITE_PERMISSION} 权限，无法创建组织（服务端 fail-closed）。</p>
      ) : null}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
          取消
        </Button>
        <Button
          type="button"
          data-testid="org-create2-next"
          disabled={
            !canWrite ||
            name.trim().length === 0 ||
            (mode === 'registered' ? owner == null : !mobileCheck.ok)
          }
          onClick={() => setStep('confirm')}
        >
          下一步：预览
        </Button>
      </DialogFooter>
    </div>
  )

  // -------------------------------------------------------------------------
  // 二次确认步骤
  // -------------------------------------------------------------------------
  const renderConfirm = () => (
    <div className="space-y-4">
      <DialogDescription>
        {mode === 'registered'
          ? '提交后将创建组织并生成默认 Workspace（单事务）；Owner 仅可为 active 用户，非 human 将被服务端拒绝。'
          : '提交后将创建组织 + 默认 Workspace，并为该手机号预创建「待激活 Owner」（不可登录的真实 Human 账号）并尝试发送激活短信（30 天有效期）。'}
      </DialogDescription>
      <dl className="space-y-2 rounded-md border p-3 text-sm" data-testid="create-summary">
        <div className="flex gap-2">
          <dt className="min-w-32 shrink-0 text-muted-foreground">组织名称</dt>
          <dd className="break-all font-medium">{name.trim()}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-32 shrink-0 text-muted-foreground">Owner</dt>
          <dd className="break-all">
            {mode === 'registered' ? (
              <>
                <span className="font-medium">{owner?.nickname || '-'}</span>
                {owner?.account ? <span className="ml-1 text-muted-foreground">({owner.account})</span> : null}
                <span className="ml-1 font-mono text-xs text-muted-foreground">{owner?.id}</span>
              </>
            ) : (
              <>
                <span className="font-medium">{mobileCheck.ok ? mobileCheck.mobile : ownerMobile}</span>
                <Badge className="ml-1" variant="secondary">
                  待激活（短信邀请）
                </Badge>
              </>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-32 shrink-0 text-muted-foreground">默认 Workspace</dt>
          <dd className="break-all font-medium">{derivedWsName.trim()}</dd>
        </div>
      </dl>

      {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={() => setStep('form')} disabled={registeredMutation.isPending || pendingMutation.isPending}>
          返回修改
        </Button>
        <Button
          type="button"
          data-testid="org-create2-confirm"
          disabled={!canSubmit || registeredMutation.isPending || pendingMutation.isPending}
          onClick={() => {
            if (mode === 'registered') registeredMutation.mutate()
            else pendingMutation.mutate()
          }}
        >
          {registeredMutation.isPending || pendingMutation.isPending ? '提交中…' : '确认创建'}
        </Button>
      </DialogFooter>
    </div>
  )

  // -------------------------------------------------------------------------
  // 短信失败警示态（D12：org 已建 + 短信失败 + 重发按钮）
  // -------------------------------------------------------------------------
  const renderSmsWarning = () => (
    <div className="space-y-4" data-testid="pending-sms-warning">
      <div className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">组织已创建成功，但激活短信发送失败</p>
          <p className="text-muted-foreground">
            企业与待激活 Owner（{pendingResult?.ownerActivation?.mobileMasked ?? '****'}
            ）均已落库，不受短信失败影响（D12：失败不回滚）。可在下方重发，或稍后在组织详情的
            「待激活 Owner」面板处理。
          </p>
        </div>
      </div>

      {pendingResult?.ownerActivation?.activationToken ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">一次性激活 token（只显示一次）</summary>
          <Input data-testid="activation-token-once" readOnly value={pendingResult.ownerActivation.activationToken} className="mt-1 font-mono text-xs" />
        </details>
      ) : null}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
          稍后处理
        </Button>
        <Button
          type="button"
          data-testid="resend-sms-btn"
          disabled={resendMutation.isPending}
          onClick={() => resendMutation.mutate()}
        >
          {resendMutation.isPending ? '重发中…' : '重发激活短信'}
        </Button>
      </DialogFooter>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="org-create2-dialog" className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'confirm' ? '确认创建组织' : step === 'sms-warning' ? '创建完成（短信待处理）' : '创建组织'}
          </DialogTitle>
          <DialogDescription>
            双模式：已注册用户（搜索选择）｜手机号建待激活 Owner（D11；短信失败不回滚企业，D12）。
          </DialogDescription>
        </DialogHeader>
        {step === 'form' ? renderForm() : step === 'confirm' ? renderConfirm() : renderSmsWarning()}
      </DialogContent>
    </Dialog>
  )
}
