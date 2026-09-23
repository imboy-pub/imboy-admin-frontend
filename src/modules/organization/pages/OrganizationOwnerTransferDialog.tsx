import { useCallback, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import type { EntityId } from '@/types/common'
import type { User } from '@/types/user'
import { transferOrganizationOwner } from '../api/public'
import { classifyOrgError, ownerTransferErrorHint } from '../api/pureFunctions'
import { UserSearchSelect } from '../components/UserSearchSelect'

const WRITE_PERMISSION = 'organizations:write'

type Step = 'select' | 'confirm'

interface OrganizationOwnerTransferDialogProps {
  open: boolean
  onOpenChange: (_open: boolean) => void
  organizationId: EntityId
  organizationName: string
  /** 当前 Owner（organization.owner_id 投影）：选中同一人时 UI 拦截（自转移服务端为 400）。 */
  currentOwnerId: EntityId
  /** 转移成功后回调，由父级刷新服务端事实（detail / list / members）。 */
  onChanged?: () => void
}

/**
 * 修改组织 Owner 对话框（平台面 POST /api/adm/organizations/:id/owner-transfer）。
 *
 * 设计要点：
 * - 新 Owner **必须**经用户搜索（/user/search，按账号/昵称/邮箱/手机号）选择，
 *   禁止手填裸 TSID（搜索选择器复用 UserSearchSelect，与创建组织同约定）；
 * - 服务端裁决链（前端不重复造判定，只做可行动提示）：目标须是本组织 active
 *   成员（409）、须为 human（409）、组织须 active（409）、自转移 400；
 *   前端只拦「与当前 Owner 同一人」这一条无歧义约束；
 * - 单事务语义：旧 Owner 降级为 admin → 新 Owner 升级 → organization.owner_id
 *   投影同步；成功后由后端写平台审计（adm_operation_log，含新旧 Owner）；
 * - 提交前两步确认（选择 → 摘要），与创建组织对话框同构。
 */
export function OrganizationOwnerTransferDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  currentOwnerId,
  onChanged,
}: OrganizationOwnerTransferDialogProps) {
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [step, setStep] = useState<Step>('select')
  const [owner, setOwner] = useState<User | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const resetState = useCallback(() => {
    setStep('select')
    setOwner(null)
    setSubmitError(null)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetState()
      onOpenChange(next)
    },
    [onOpenChange, resetState]
  )

  const isCurrentOwner = owner != null && owner.id === currentOwnerId
  const canSubmit = canWrite && owner != null && !isCurrentOwner

  const transferMutation = useMutation({
    mutationFn: () => transferOrganizationOwner(organizationId, owner!.id),
    onSuccess: () => {
      toast.success(
        `组织「${organizationName}」Owner 已转移：旧 Owner 降级为 admin，新 Owner 升级；操作已写入平台审计日志（adm_operation_log）`
      )
      onChanged?.()
      handleOpenChange(false)
    },
    onError: (err) => {
      const hint = ownerTransferErrorHint(classifyOrgError(err))
      setSubmitError(hint)
      toast.error(hint)
    },
  })

  const renderSelect = () => (
    <div className="space-y-4">
      <UserSearchSelect
        id="owner-transfer-search"
        testIdPrefix="owner-transfer"
        label="新 Owner（搜索选择，禁止手填 TSID）"
        value={owner}
        onChange={setOwner}
        hint={
          isCurrentOwner ? (
            <p className="text-xs text-destructive" data-testid="owner-transfer-self-hint">
              该用户是当前 Owner：自转移会被服务端拒绝（400），请重选其他用户。
            </p>
          ) : owner ? (
            <p className="text-xs text-muted-foreground">
              仅本组织的 active 成员可被服务端接受为新 Owner；非成员提交会被 409 拒绝并如实提示。
            </p>
          ) : null
        }
      />

      {!canWrite ? (
        <p className="text-xs text-destructive">
          当前管理员无 {WRITE_PERMISSION} 权限，无法转移 Owner（授权由服务端 fail-closed 判定）。
        </p>
      ) : null}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
          取消
        </Button>
        <Button type="button" data-testid="owner-transfer-next" disabled={!canSubmit} onClick={() => setStep('confirm')}>
          下一步：预览
        </Button>
      </DialogFooter>
    </div>
  )

  const renderConfirm = () => (
    <div className="space-y-4">
      <DialogDescription>
        提交后单事务执行：旧 Owner 降级为 admin，新 Owner 升级为 Owner，organization.owner_id 投影同步。
        该动作改变组织控制权归属，且会写入平台操作日志（操作人 / 新旧 Owner / IP）。
      </DialogDescription>
      <dl className="space-y-2 rounded-md border p-3 text-sm" data-testid="owner-transfer-summary">
        <div className="flex gap-2">
          <dt className="min-w-32 shrink-0 text-muted-foreground">组织</dt>
          <dd className="break-all font-medium">{organizationName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-32 shrink-0 text-muted-foreground">当前 Owner</dt>
          <dd className="break-all font-mono text-xs">{currentOwnerId || '-'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-32 shrink-0 text-muted-foreground">新 Owner</dt>
          <dd className="break-all">
            {owner ? (
              <>
                <span className="font-medium">{owner.nickname || '-'}</span>
                {owner.account ? <span className="ml-1 text-muted-foreground">({owner.account})</span> : null}
                <span className="ml-1 font-mono text-xs text-muted-foreground">{owner.id}</span>
              </>
            ) : (
              '-'
            )}
          </dd>
        </div>
      </dl>

      {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}

      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            // 清掉上次提交的错误残留，避免「返回修改→再进预览」显示过期失败信息。
            setSubmitError(null)
            setStep('select')
          }}
          disabled={transferMutation.isPending}
        >
          返回修改
        </Button>
        <Button
          type="button"
          variant="destructive"
          data-testid="owner-transfer-confirm"
          disabled={!canSubmit || transferMutation.isPending}
          onClick={() => transferMutation.mutate()}
        >
          {transferMutation.isPending ? '提交中…' : '确认转移'}
        </Button>
      </DialogFooter>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="owner-transfer-dialog" className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{step === 'confirm' ? '确认转移组织 Owner' : '修改组织 Owner（危险动作）'}</DialogTitle>
          <DialogDescription>
            复用平台面 POST /api/adm/organizations/:id/owner-transfer；新 Owner 必须经用户搜索选择，服务端 fail-closed 校验成员资格。
          </DialogDescription>
        </DialogHeader>
        {step === 'select' ? renderSelect() : renderConfirm()}
      </DialogContent>
    </Dialog>
  )
}
