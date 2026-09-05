import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gavel, Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/errorUtils'
import {
  executeReportAction,
  getReportActions,
  reverseReportAction,
  type ReportActionRow,
  type ReportActionType,
  type ReportTicket,
} from '@/modules/ops_governance/api'

type ReportActionPanelProps = {
  ticket: ReportTicket | null
  canHandleReports: boolean
  onClose: () => void
}

/** MVP 动作集（后端 fail-closed：content_removal/account_restrict 暂不支持） */
const ACTION_OPTIONS: Array<{
  value: ReportActionType
  label: string
  needsGid: boolean
  needsDuration: boolean
}> = [
  { value: 'warning', label: '警告通知', needsGid: false, needsDuration: false },
  { value: 'group_mute', label: '群禁言', needsGid: true, needsDuration: true },
  { value: 'group_kick', label: '移出群聊', needsGid: true, needsDuration: false },
  { value: 'reject', label: '驳回（不处置）', needsGid: false, needsDuration: false },
]

/** 行状态徽标文案（executed/failed/reversed/expired）。 */
export function actionStatusText(status: ReportActionRow['status']): string {
  switch (status) {
    case 'executed':
      return '已执行'
    case 'failed':
      return '执行失败'
    case 'reversed':
      return '已撤销'
    case 'expired':
      return '已到期'
    default:
      return status
  }
}

/** 群禁言/踢出需要群 scope；message 举报的 scope 取工单的 target_scope_id。 */
export function defaultGidForTicket(ticket: ReportTicket): EntityIdGid {
  return ticket.target_scope_id
}
type EntityIdGid = ReportTicket['target_scope_id']

export function ReportActionPanel({ ticket, canHandleReports, onClose }: ReportActionPanelProps) {
  const queryClient = useQueryClient()
  const [action, setAction] = useState<ReportActionType>('warning')
  const [reason, setReason] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [reverseTarget, setReverseTarget] = useState<ReportActionRow | null>(null)
  const [reverseReason, setReverseReason] = useState('')

  const actionOption = useMemo(
    () => ACTION_OPTIONS.find((item) => item.value === action) ?? ACTION_OPTIONS[0],
    [action]
  )
  const gid = ticket?.target_scope_id ?? ''

  const actionsQuery = useQuery({
    queryKey: ['report-actions', ticket?.id],
    enabled: ticket !== null,
    queryFn: () => getReportActions(ticket!.id),
  })

  const executeMutation = useMutation({
    mutationFn: executeReportAction,
    onSuccess: (response) => {
      if (response.code === 0) {
        toast.success('处置动作已执行')
        setReason('')
        void queryClient.invalidateQueries({ queryKey: ['report-actions', ticket?.id] })
      } else {
        toast.error(response.msg || '处置动作被拒绝')
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })

  const reverseMutation = useMutation({
    mutationFn: (input: { actionId: ReportActionRow['id']; reason: string }) =>
      reverseReportAction(input.actionId, input.reason),
    onSuccess: (response) => {
      if (response.code === 0) {
        toast.success('动作已撤销')
        setReverseTarget(null)
        void queryClient.invalidateQueries({ queryKey: ['report-actions', ticket?.id] })
      } else {
        toast.error(response.msg || '撤销被拒绝')
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
  })

  const canExecute =
    canHandleReports && ticket !== null && reason.trim().length > 0 && !executeMutation.isPending

  const handleExecute = () => {
    if (ticket === null) return
    void executeMutation.mutateAsync({
      case_id: ticket.id,
      action,
      target_uid: ticket.target_author_id,
      reason: reason.trim(),
      gid: actionOption.needsGid ? gid : undefined,
      duration_minutes: actionOption.needsDuration ? durationMinutes : undefined,
      target_type: ticket.target_type,
      target_id: ticket.target_id,
    })
  }

  return (
    <Dialog open={ticket !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-4 w-4" /> 处置动作
          </DialogTitle>
          <DialogDescription>
            工单 #{String(ticket?.id ?? '')} · 被处置人 {String(ticket?.target_author_id ?? '')}；
            所有动作都会记入审计，失败同样留痕。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="report-action-type">动作</Label>
              <select
                id="report-action-type"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                value={action}
                onChange={(event) => setAction(event.target.value as ReportActionType)}
              >
                {ACTION_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            {actionOption.needsDuration && (
              <div className="space-y-1">
                <Label htmlFor="report-action-duration">禁言时长（分钟）</Label>
                <Input
                  id="report-action-duration"
                  type="number"
                  min={1}
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(Number(event.target.value) || 0)}
                />
              </div>
            )}
          </div>

          {actionOption.needsGid && (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              生效群：{String(gid)}（取自工单 target_scope_id；管理员需具备该群内处置权限，
              否则动作将失败留痕）
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="report-action-reason">处置理由（必填，写入审计）</Label>
            <Textarea
              id="report-action-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="填写处置理由，将随审计行落库并出现在目标用户通知中"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">动作历史</Label>
            <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-md border p-2">
              {(actionsQuery.data ?? []).length === 0 ? (
                <div className="py-2 text-center text-xs text-muted-foreground">暂无动作记录</div>
              ) : (
                (actionsQuery.data ?? []).map((row) => (
                  <div
                    key={String(row.id)}
                    className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs"
                  >
                    <span className="font-mono">{row.action}</span>
                    <span>{actionStatusText(row.status)}</span>
                    {row.status === 'executed' && canHandleReports && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="撤销该动作"
                        onClick={() => setReverseTarget(row)}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
          <Button disabled={!canExecute} onClick={handleExecute}>
            {executeMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            执行动作
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={reverseTarget !== null} onOpenChange={(open) => { if (!open) setReverseTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>撤销动作 {String(reverseTarget?.id ?? '')}</DialogTitle>
            <DialogDescription>
              撤销会把审计行翻转为已撤销；group_mute 会同步解除禁言。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="report-action-reverse-reason">撤销理由（必填）</Label>
            <Textarea
              id="report-action-reverse-reason"
              rows={2}
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseTarget(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={reverseReason.trim().length === 0 || reverseMutation.isPending}
              onClick={() => {
                if (reverseTarget === null) return
                void reverseMutation.mutateAsync({
                  actionId: reverseTarget.id,
                  reason: reverseReason.trim(),
                })
              }}
            >
              {reverseMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              确认撤销
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
