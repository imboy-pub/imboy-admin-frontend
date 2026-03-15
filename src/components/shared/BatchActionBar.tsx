import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { getMyRbacProfilePayload } from '@/services/api/rbac'
import { useAuthStore } from '@/stores/authStore'
import { trackUxEvent } from '@/lib/uxTelemetry'

export type BatchActionRiskLevel = 'low' | 'medium' | 'high'

export type BatchActionExecuteContext = {
  reason?: string
}

export type BatchActionItem = {
  key: string
  label: string
  description?: string
  variant?: ButtonProps['variant']
  permission?: string
  roles?: number[]
  hideWhenUnauthorized?: boolean
  riskLevel?: BatchActionRiskLevel
  requireReason?: boolean
  confirmKeyword?: string
  confirmText?: string
  disabled?: boolean
  loading?: boolean
  onExecute: (_context: BatchActionExecuteContext) => Promise<void> | void
}

interface BatchActionBarProps {
  selectedCount: number
  actions: BatchActionItem[]
  onClear: () => void
  className?: string
}

const riskBadgeClassMap: Record<BatchActionRiskLevel, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
}

const riskLabelMap: Record<BatchActionRiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
}

export function BatchActionBar({
  selectedCount,
  actions,
  onClear,
  className,
}: BatchActionBarProps) {
  if (selectedCount <= 0) return null

  return (
    <BatchActionBarContent
      selectedCount={selectedCount}
      actions={actions}
      onClear={onClear}
      className={className}
    />
  )
}

function BatchActionBarContent({
  selectedCount,
  actions,
  onClear,
  className,
}: BatchActionBarProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [keyword, setKeyword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const currentRoleId = useAuthStore((state) => Number(state.admin?.role_id || 0))

  const hasPermissionConstraints = useMemo(
    () =>
      actions.some((action) =>
        (typeof action.permission === 'string' && action.permission.trim().length > 0) ||
        (Array.isArray(action.roles) && action.roles.length > 0)
      ),
    [actions]
  )
  const shouldResolveAccessProfile = hasPermissionConstraints && selectedCount > 0

  const { data: profile } = useQuery({
    queryKey: ['rbac', 'me', 'batch-action-bar'],
    queryFn: () => getMyRbacProfilePayload(),
    enabled: shouldResolveAccessProfile,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const effectiveRoleIds = (() => {
    const roleIds = Array.isArray(profile?.role_ids) ? profile.role_ids : []
    if (roleIds.length > 0) return roleIds

    const roleId = Number(profile?.role_id || 0)
    if (Number.isFinite(roleId) && roleId > 0) return [roleId]

    if (Number.isFinite(currentRoleId) && currentRoleId > 0) return [currentRoleId]
    return []
  })()

  const visibleActions = useMemo(() => {
    const grantedPermissions = new Set(
      (profile?.permissions || []).map((item) => item.trim()).filter(Boolean)
    )

    return actions
      .map((action) => {
        const permission = action.permission?.trim()
        const hasPermissionRequirement = Boolean(permission)
        const hasRoleRequirement = Array.isArray(action.roles) && action.roles.length > 0

        const permissionAllowed = !hasPermissionRequirement ||
          grantedPermissions.size === 0 ||
          grantedPermissions.has(permission!)

        const roleAllowed = !hasRoleRequirement ||
          effectiveRoleIds.length === 0 ||
          action.roles!.some((roleId) => effectiveRoleIds.includes(roleId))

        const authorized = permissionAllowed && roleAllowed
        const hideWhenUnauthorized = action.hideWhenUnauthorized !== false

        if (!authorized && hideWhenUnauthorized) {
          return null
        }

        if (!authorized) {
          return {
            ...action,
            disabled: true,
          }
        }

        return action
      })
      .filter((action): action is BatchActionItem => action !== null)
  }, [actions, effectiveRoleIds, profile?.permissions])

  const pendingAction = useMemo(
    () => visibleActions.find((item) => item.key === pendingActionKey),
    [visibleActions, pendingActionKey]
  )

  const riskLevel = pendingAction?.riskLevel ?? 'low'
  const requiredKeyword = (pendingAction?.confirmKeyword || 'CONFIRM').trim()
  const requireReason = pendingAction
    ? (pendingAction.requireReason ?? riskLevel !== 'low')
    : false
  const requireKeyword = riskLevel === 'high'

  const canConfirm = Boolean(pendingAction) &&
    !submitting &&
    !pendingAction?.loading &&
    (!requireReason || reason.trim().length >= 2) &&
    (!requireKeyword || keyword.trim() === requiredKeyword)

  const resetDialogState = () => {
    setDialogOpen(false)
    setPendingActionKey(null)
    setReason('')
    setKeyword('')
    setSubmitting(false)
  }

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && submitting) return
    if (!open) {
      resetDialogState()
      return
    }
    setDialogOpen(true)
  }

  const handleActionClick = (action: BatchActionItem) => {
    if (action.disabled || action.loading) return
    const actionRisk = action.riskLevel ?? 'low'
    trackUxEvent('ux_batch_action_execute', {
      action_key: action.key,
      phase: 'open_confirm',
      selected_count: selectedCount,
      risk_level: actionRisk,
    })
    setPendingActionKey(action.key)
    setReason('')
    setKeyword('')
    setDialogOpen(true)
  }

  const handleConfirm = async () => {
    if (!pendingAction || !canConfirm) return

    setSubmitting(true)
    try {
      await pendingAction.onExecute({
        reason: reason.trim() || undefined,
      })
      trackUxEvent('ux_batch_action_execute', {
        action_key: pendingAction.key,
        phase: 'success',
        selected_count: selectedCount,
        risk_level: riskLevel,
      })
      if (riskLevel !== 'low') {
        trackUxEvent('ux_destructive_action_confirmed', {
          action_key: pendingAction.key,
          selected_count: selectedCount,
          risk_level: riskLevel,
        })
      }
      resetDialogState()
    } catch {
      trackUxEvent('ux_batch_action_execute', {
        action_key: pendingAction.key,
        phase: 'failed',
        selected_count: selectedCount,
        risk_level: riskLevel,
      })
      // Errors are handled by action caller (toast / logging). Keep dialog open for retry.
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        className={cn(
          'mb-4 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 md:flex-row md:items-center md:justify-between',
          className
        )}
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-amber-900">{selectedCount} 项已选中</span>
          <span className="text-amber-700">可执行批量操作</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {visibleActions.map((action) => {
            const actionRisk = action.riskLevel ?? 'low'
            return (
              <Button
                key={action.key}
                size="sm"
                variant={action.variant ?? 'outline'}
                disabled={action.disabled || action.loading || submitting}
                onClick={() => handleActionClick(action)}
              >
                {action.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {action.label}
                <span
                  className={cn(
                    'ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium',
                    riskBadgeClassMap[actionRisk]
                  )}
                >
                  {riskLabelMap[actionRisk]}
                </span>
              </Button>
            )
          })}
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            disabled={submitting}
          >
            清空选择
          </Button>
        </div>
      </div>

      <AlertDialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.confirmText || `确认执行「${pendingAction?.label || '批量操作'}」`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.description || '该操作将作用于当前选中的记录，请确认后继续。'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            {requireReason && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  请输入操作原因（至少 2 个字符）
                </p>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="请输入本次批量操作原因..."
                  className="min-h-[100px]"
                />
              </div>
            )}

            {requireKeyword && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  请输入确认关键字 <span className="font-mono">{requiredKeyword}</span>
                </p>
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder={`输入 ${requiredKeyword} 继续`}
                />
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={submitting || pendingAction?.loading}
            >
              取消
            </Button>
            <Button
              variant={riskLevel === 'high' ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {(submitting || pendingAction?.loading) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              确认执行
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
