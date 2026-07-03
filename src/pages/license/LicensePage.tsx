import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, BadgeX, Users, Server, Calendar, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog, ErrorState, LoadingState, PageHeader, StatsCard } from '@/components/shared'
import { getLicenseStatus, applyLicense } from '@/services/api/stats'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/errorUtils'
import { toast } from 'sonner'

const EDITION_LABELS: Record<string, string> = {
  community: '社区版',
  professional: '专业版',
  enterprise: '企业版',
}

const STATUS_LABELS: Record<string, string> = {
  community: '社区版',
  valid: '有效',
  expired: '已过期',
  invalid: '无效',
}

function QuotaBar({ current, max }: { current: number; max: number }) {
  if (max === 0) return <span className="text-sm text-muted-foreground">无限制</span>
  const pct = Math.min(100, Math.round((current / max) * 100))
  const danger = pct >= 90
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{current.toLocaleString()} / {max.toLocaleString()}</span>
        <span className={danger ? 'text-destructive font-medium' : 'text-muted-foreground'}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={cn('h-2 rounded-full transition-all', danger ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function formatExpiry(ts: number): string {
  if (!ts) return '永久有效'
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

function daysRemaining(ts: number): string {
  if (!ts) return '永久'
  const diff = Math.ceil((ts * 1000 - Date.now()) / 86400000)
  if (diff < 0) return '已过期'
  if (diff === 0) return '今天到期'
  return `还有 ${diff} 天`
}

export function LicensePage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [licenseText, setLicenseText] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['license-status'],
    queryFn: getLicenseStatus,
    staleTime: 60_000,
  })

  const { mutate, isPending, error: applyError } = useMutation({
    mutationFn: applyLicense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-status'] })
      setConfirmOpen(false)
      setOpen(false)
      setLicenseText('')
      toast.success('授权已生效')
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  if (isLoading) return <LoadingState message="加载授权信息..." />
  if (error || !data) return <ErrorState message="加载授权信息失败" onRetry={() => refetch()} />

  const editionLabel = EDITION_LABELS[data.edition] ?? data.edition
  const statusLabel = STATUS_LABELS[data.status] ?? data.status
  const isValid = data.valid

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <PageHeader
          title="授权状态"
          description="查看当前 IMBoy 实例的授权版本与配额使用情况"
        />
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          更新 License
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>更新 License</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="粘贴 License 文本（格式：base64payload.base64signature）"
            rows={6}
            value={licenseText}
            onChange={(e) => setLicenseText(e.target.value)}
            className="font-mono text-xs"
          />
          {applyError && (
            <p className="text-sm text-destructive">
              {applyError instanceof Error ? applyError.message : '应用 License 失败'}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button
              disabled={!licenseText.trim() || isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {isPending ? '应用中...' : '应用'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="确认更新 License？"
        description="此操作将覆盖现有授权，可能影响在线用户与可用功能（如降级配额或变更可用功能）。请确认 License 内容无误后继续。"
        confirmText="确认更新"
        cancelText="取消"
        variant="destructive"
        loading={isPending}
        onConfirm={() => mutate(licenseText.trim())}
      />

      <div className="flex items-center gap-3">
        {isValid ? (
          <BadgeCheck className="h-6 w-6 text-green-500" />
        ) : (
          <BadgeX className="h-6 w-6 text-destructive" />
        )}
        <span className="text-lg font-semibold">{editionLabel}</span>
        <Badge variant={isValid ? 'default' : 'destructive'}>{statusLabel}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="当前用户数"
          value={data.current_users.toLocaleString()}
          description={data.max_users ? `上限 ${data.max_users.toLocaleString()}` : '无限制'}
          icon={Users}
        />
        <StatsCard
          title="当前节点数"
          value={data.current_nodes}
          description={`上限 ${data.max_nodes} 节点`}
          icon={Server}
        />
        <StatsCard
          title="授权到期"
          value={formatExpiry(data.expires_at)}
          description={daysRemaining(data.expires_at)}
          icon={Calendar}
        />
        <StatsCard
          title="被授权方"
          value={data.licensee || '社区版用户'}
          icon={BadgeCheck}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">用户配额</CardTitle>
          </CardHeader>
          <CardContent>
            <QuotaBar current={data.current_users} max={data.max_users} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">节点配额</CardTitle>
          </CardHeader>
          <CardContent>
            <QuotaBar current={data.current_nodes} max={data.max_nodes} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
