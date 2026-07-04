import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LogOut, Smartphone, WifiOff, Monitor, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, LoadingState, ErrorState, StatusBadge } from '@/components/shared'
import {
  listUserDevicesPayload,
  kickDevice,
  forceLogoutUser,
} from '@/services/api/userDevices'
import { formatDate } from '@/lib/utils'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import { useState } from 'react'

interface UserDeviceListProps {
  userId: EntityId
}

export function UserDeviceList({ userId }: UserDeviceListProps) {
  const queryClient = useQueryClient()
  const [kickTarget, setKickTarget] = useState<string | null>(null)
  const [confirmForceLogout, setConfirmForceLogout] = useState(false)

  const {
    data: devicePage,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['user-devices', userId],
    queryFn: () => listUserDevicesPayload(userId),
    enabled: userId.length > 0,
  })

  const kickMutation = useMutation({
    mutationFn: (did: string) => kickDevice(userId, did),
    onSuccess: () => {
      toast.success('设备已强制下线')
      setKickTarget(null)
      queryClient.invalidateQueries({ queryKey: ['user-devices', userId] })
    },
    onError: (err: unknown) => toast.error(`踢出失败: ${getErrorMessage(err)}`),
  })

  const forceLogoutMutation = useMutation({
    mutationFn: () => forceLogoutUser(userId),
    onSuccess: () => {
      toast.success('已强制该用户全部下线')
      setConfirmForceLogout(false)
      queryClient.invalidateQueries({ queryKey: ['user-devices', userId] })
    },
    onError: (err: unknown) => toast.error(`操作失败: ${getErrorMessage(err)}`),
  })

  if (isLoading) return <LoadingState message="加载设备列表..." />
  if (error) return <ErrorState message="加载设备列表失败" onRetry={() => refetch()} />

  const deviceList = devicePage?.list ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">共 {deviceList.length} 个登录设备</p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirmForceLogout(true)}
          disabled={deviceList.length === 0 || forceLogoutMutation.isPending}
        >
          {forceLogoutMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" />
          )}
          全部下线
        </Button>
      </div>

      {deviceList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-muted-foreground">
            <Monitor className="mb-3 h-10 w-10 opacity-40" />
            <p>该用户暂无登录设备</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deviceList.map((device) => (
            <Card key={device.device_id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-base">
                        {device.device_name || '未知设备'}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs">
                        DID: {device.device_id}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={device.online ? 'online' : 'offline'}
                      labels={{ online: '在线', offline: '离线' }}
                      variants={{ online: 'success', offline: 'secondary' }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setKickTarget(device.device_id)}
                      disabled={kickMutation.isPending && kickTarget === device.device_id}
                    >
                      {kickMutation.isPending && kickTarget === device.device_id ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <WifiOff className="mr-2 h-3 w-3" />
                      )}
                      踢出
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="grid grid-cols-2 gap-2 text-muted-foreground md:grid-cols-3">
                  <div>
                    <p className="text-xs">设备类型</p>
                    <p className="font-medium text-foreground">{device.device_type || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs">版本</p>
                    <p className="font-medium text-foreground">{device.device_vsn || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs">最后活跃</p>
                    <p className="font-medium text-foreground">
                      {device.last_active_at ? formatDate(device.last_active_at) : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 踢出单设备确认 */}
      <ConfirmDialog
        open={kickTarget !== null}
        onOpenChange={(open) => {
          if (!open) setKickTarget(null)
        }}
        title="确认踢出设备"
        description="将强制该设备下线，用户需要重新登录。确认继续？"
        confirmText="踢出"
        variant="destructive"
        loading={kickMutation.isPending}
        onConfirm={() => {
          if (kickTarget) kickMutation.mutate(kickTarget)
        }}
      />

      {/* 全部下线确认 */}
      <ConfirmDialog
        open={confirmForceLogout}
        onOpenChange={(open) => {
          if (!open) setConfirmForceLogout(false)
        }}
        title="强制全部设备下线"
        description="将强制该用户所有设备同时下线，用户需要在每台设备重新登录。此操作不可撤销，确认继续？"
        confirmText="全部下线"
        variant="destructive"
        loading={forceLogoutMutation.isPending}
        onConfirm={() => forceLogoutMutation.mutate()}
      />
    </div>
  )
}
