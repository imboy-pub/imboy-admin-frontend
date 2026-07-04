import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LogOut, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared'
import { forceLogoutUser } from '@/services/api/userDevices'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import { useState } from 'react'

interface UserDeviceListProps {
  userId: EntityId
}

export function UserDeviceList({ userId }: UserDeviceListProps) {
  const [confirmForceLogout, setConfirmForceLogout] = useState(false)

  const forceLogoutMutation = useMutation({
    mutationFn: () => forceLogoutUser(userId),
    onSuccess: () => {
      toast.success('已强制该用户全部下线')
      setConfirmForceLogout(false)
    },
    onError: (err: unknown) => toast.error(`操作失败: ${getErrorMessage(err)}`),
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p className="text-sm text-muted-foreground">
            当前仅支持结束该用户在所有设备上的登录会话（强制下线）。逐设备查看与单独踢出功能待后端提供
            管理端接口后开放。
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmForceLogout(true)}
            disabled={forceLogoutMutation.isPending}
          >
            {forceLogoutMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" />
            )}
            强制该用户全部下线
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmForceLogout}
        onOpenChange={(open) => {
          if (!open) setConfirmForceLogout(false)
        }}
        title="强制全部设备下线"
        description="将强制该用户所有设备同时下线，用户需要在每台设备重新登录。此操作不可撤销，确认继续？"
        confirmText="强制全部下线"
        variant="destructive"
        loading={forceLogoutMutation.isPending}
        onConfirm={() => forceLogoutMutation.mutate()}
      />
    </div>
  )
}
