/**
 * 组织邀请码二维码弹窗（GET/POST/DELETE /api/adm/organizations/:id/invite_code）。
 *
 * 契约要点：
 * - GET 无有效码时后端返回 code=404（业务空态而非故障）——经 client 拦截器
 *   reject 为 ApiError{code:404}，这里用 classifyOrgError(err).kind==='not_found'
 *   判定「暂无有效邀请码」并呈现生成入口（与既有错误码判定惯例同源）；
 * - 二维码内容 = `imboy://org/join?c=<code>`：deep link 契约与 APP 端
 *   `kOrgJoinQrPrefix` 一致，两端同步变更，禁止改格式；
 * - POST 生成/重新生成（重新生成 = 旧码立即失效，需二次确认）；
 *   DELETE 撤销后回空态；
 * - 写入口由父组件 canWrite 门控（本组件不重复做权限裁决，入口挂载即意味着
 *   当前管理员具备 organizations:write）。
 */
import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared'
import { t } from '@/i18n'
import {
  createOrganizationInviteCode,
  getOrganizationInviteCode,
  revokeOrganizationInviteCode,
  type OrganizationInviteCode,
  type OrganizationInviteCodeRole,
} from '../api/public'
import { classifyOrgError, formatEpochSeconds, orgRoleLabel, type OrganizationSummary } from '../api/pureFunctions'

/** 二维码渲染参数（与坐席扫码登录面板同规格：size 176 / level M / marginSize 4）。 */
const QR_SIZE = 176
const QR_MARGIN_SIZE = 4

/** 临期阈值：剩余有效期不足 10 分钟即按「即将过期」红色提示。 */
const NEAR_EXPIRY_THRESHOLD_MS = 10 * 60 * 1000

/** 角色下拉选项（只含邀请码可授予的两档，文案对齐成员页角色筛选风格）。 */
const INVITE_ROLE_OPTIONS: Array<{ value: OrganizationInviteCodeRole; label: string }> = [
  { value: 'member', label: 'member（普通成员）' },
  { value: 'admin', label: 'admin（管理员）' },
]

/** 二维码 deep link（⚠️ 契约：APP 端 kOrgJoinQrPrefix 同源，勿改格式）。 */
function inviteQrContent(code: string): string {
  return `imboy://org/join?c=${code}`
}

/** 过期态判定：'none' 正常 / 'near' 临期 / 'expired' 已过期（后两者红色提示）。 */
function expiryState(code: OrganizationInviteCode): 'none' | 'near' | 'expired' {
  if (code.expiresAt == null) return 'none'
  const remainingMs = code.expiresAt * 1000 - Date.now()
  if (remainingMs <= 0) return 'expired'
  if (remainingMs < NEAR_EXPIRY_THRESHOLD_MS) return 'near'
  return 'none'
}

interface OrganizationQrcodeDialogProps {
  /** 目标组织；null = 弹窗关闭（父组件以 qrcodeOrg!=null 驱动 open）。 */
  org: OrganizationSummary | null
  open: boolean
  onOpenChange: (_open: boolean) => void
}

export function OrganizationQrcodeDialog({ org, open, onOpenChange }: OrganizationQrcodeDialogProps) {
  const queryClient = useQueryClient()
  // 角色下拉作用于「下一次生成」；默认 member（最低权限档）。
  const [role, setRole] = useState<OrganizationInviteCodeRole>('member')
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false)
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false)

  const organizationId = org?.id ?? ''
  const queryKey = ['organization', 'invite-code', organizationId] as const

  const codeQuery = useQuery({
    queryKey,
    queryFn: () => getOrganizationInviteCode(organizationId),
    // 404（无有效码）是业务空态，不值得重试；其余失败由 UI 给手动重试入口。
    retry: false,
    enabled: open && organizationId.length > 0,
  })

  const inviteCode = codeQuery.data ?? null
  const notFound =
    codeQuery.isError && classifyOrgError(codeQuery.error).kind === 'not_found'
  const otherError =
    codeQuery.isError && classifyOrgError(codeQuery.error).kind !== 'not_found'
      ? classifyOrgError(codeQuery.error).message
      : null

  /** 生成/重新生成成功：直接写 query cache（同形状），避免额外一次 GET 往返。 */
  const createMutation = useMutation({
    mutationFn: () => createOrganizationInviteCode(organizationId, role),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result)
      setRegenConfirmOpen(false)
      toast.success(t('ent.orgQrcode.createToast'))
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const revokeMutation = useMutation({
    mutationFn: () => revokeOrganizationInviteCode(organizationId),
    onSuccess: () => {
      // 撤销后回空态：清掉 cache 数据（undefined → 渲染空态分支），不发多余 GET。
      queryClient.setQueryData(queryKey, undefined)
      setRevokeConfirmOpen(false)
      toast.success(t('ent.orgQrcode.revokeToast'))
    },
    onError: (err) => toast.error(classifyOrgError(err).message),
  })

  const handleCopy = useCallback(async () => {
    if (!inviteCode?.code) return
    try {
      await navigator.clipboard.writeText(inviteCode.code)
      toast.success(t('ent.orgQrcode.copyToast'))
    } catch {
      toast.error(t('ent.orgQrcode.copyFailToast'))
    }
  }, [inviteCode])

  const expiry = inviteCode ? expiryState(inviteCode) : 'none'
  const busy = createMutation.isPending || revokeMutation.isPending

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            // 关闭时复位会话态（角色档位回到默认，确认弹层一并收起）。
            setRole('member')
            setRegenConfirmOpen(false)
            setRevokeConfirmOpen(false)
          }
          onOpenChange(next)
        }}
      >
        <DialogContent data-testid="org-qrcode-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ent.orgQrcode.title', { name: org?.name ?? '' })}</DialogTitle>
            <DialogDescription>{t('ent.orgQrcode.description')}</DialogDescription>
          </DialogHeader>

          {codeQuery.isPending && codeQuery.fetchStatus !== 'idle' ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('ent.orgQrcode.loading')}</p>
          ) : otherError ? (
            <div className="space-y-3 py-2 text-center">
              <p className="text-sm text-destructive">{otherError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void codeQuery.refetch()}>
                {t('ent.orgQrcode.retry')}
              </Button>
            </div>
          ) : inviteCode && !notFound ? (
            renderCodePanel()
          ) : (
            renderEmptyPanel()
          )}
        </DialogContent>
      </Dialog>

      {/* 重新生成二次确认：旧二维码立即失效是外向副作用，必须显式确认 */}
      <ConfirmDialog
        open={regenConfirmOpen}
        onOpenChange={setRegenConfirmOpen}
        title={t('ent.orgQrcode.regenTitle')}
        description={t('ent.orgQrcode.regenDescription')}
        confirmText={t('ent.orgQrcode.regenConfirm')}
        variant="destructive"
        loading={createMutation.isPending}
        onConfirm={() => createMutation.mutate()}
      />

      {/* 撤销二次确认 */}
      <ConfirmDialog
        open={revokeConfirmOpen}
        onOpenChange={setRevokeConfirmOpen}
        title={t('ent.orgQrcode.revokeTitle')}
        description={t('ent.orgQrcode.revokeDescription')}
        confirmText={t('ent.orgQrcode.revokeConfirm')}
        variant="destructive"
        loading={revokeMutation.isPending}
        onConfirm={() => revokeMutation.mutate()}
      />
    </>
  )

  /** 有码面板：二维码 + 明码/角色/过期时间 + 重新生成/撤销。 */
  function renderCodePanel() {
    if (!inviteCode) return null
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <div
            className="flex items-center justify-center rounded border border-border bg-white p-2"
            data-testid="org-qrcode-canvas"
            data-qr-content={inviteQrContent(inviteCode.code)}
          >
            <QRCodeSVG
              value={inviteQrContent(inviteCode.code)}
              size={QR_SIZE}
              level="M"
              marginSize={QR_MARGIN_SIZE}
              title={t('ent.orgQrcode.qrTitle')}
            />
          </div>

          {expiry !== 'none' ? (
            <p className="text-xs text-destructive" role="alert" data-testid="org-qrcode-expiry-warning">
              {expiry === 'expired' ? t('ent.orgQrcode.expiredNotice') : t('ent.orgQrcode.nearExpiryNotice')}
            </p>
          ) : null}
        </div>

        <dl className="space-y-2 rounded-md border p-3 text-sm">
          <div className="flex items-center gap-2">
            <dt className="min-w-24 shrink-0 text-muted-foreground">{t('ent.orgQrcode.codeLabel')}</dt>
            <dd className="min-w-0 flex-1">
              <span className="break-all font-mono text-xs" data-testid="org-qrcode-code">
                {inviteCode.code}
              </span>
            </dd>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
              {t('ent.orgQrcode.copy')}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <dt className="min-w-24 shrink-0 text-muted-foreground">{t('ent.orgQrcode.roleLabel')}</dt>
            <dd>
              <Badge variant="secondary" data-testid="org-qrcode-role">
                {orgRoleLabel(inviteCode.role)}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="min-w-24 shrink-0 text-muted-foreground">{t('ent.orgQrcode.expiresAtLabel')}</dt>
            <dd className="font-mono text-xs">{formatEpochSeconds(inviteCode.expiresAt)}</dd>
          </div>
        </dl>

        <div className="space-y-1.5">
          <Label htmlFor="org-qrcode-role-select">{t('ent.orgQrcode.roleSelectLabel')}</Label>
          <Select
            id="org-qrcode-role-select"
            value={role}
            disabled={busy}
            onChange={(event) => setRole(event.target.value === 'admin' ? 'admin' : 'member')}
          >
            {INVITE_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{t('ent.orgQrcode.roleSelectHint')}</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => setRevokeConfirmOpen(true)}
          >
            {t('ent.orgQrcode.revoke')}
          </Button>
          <Button type="button" disabled={busy} onClick={() => setRegenConfirmOpen(true)}>
            {t('ent.orgQrcode.regen')}
          </Button>
        </div>
      </div>
    )
  }

  /** 空态面板（404 无有效码）：生成入口 + 角色档位选择。 */
  function renderEmptyPanel() {
    return (
      <div className="space-y-4" data-testid="org-qrcode-empty">
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t('ent.orgQrcode.empty')}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="org-qrcode-role-select-empty">{t('ent.orgQrcode.roleSelectLabel')}</Label>
          <Select
            id="org-qrcode-role-select-empty"
            value={role}
            disabled={createMutation.isPending}
            onChange={(event) => setRole(event.target.value === 'admin' ? 'admin' : 'member')}
          >
            {INVITE_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{t('ent.orgQrcode.roleSelectHint')}</p>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            data-testid="org-qrcode-create-btn"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? t('ent.orgQrcode.creating') : t('ent.orgQrcode.create')}
          </Button>
        </div>
      </div>
    )
  }
}
