import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader, ErrorState, LoadingState, ConfirmDialog } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  listMutedUsers,
  unmuteUser,
  mutedUsersQueryKey,
} from '@/services/api/mutedUsers'

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return '已到期'
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  if (hours < 24) return `${hours} 小时 ${remainMinutes} 分钟`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return `${days} 天 ${remainHours} 小时`
}

export function MutedUsersPage() {
  const queryClient = useQueryClient()
  const [confirmUid, setConfirmUid] = useState<string | null>(null)

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: mutedUsersQueryKey(),
    queryFn: listMutedUsers,
    refetchInterval: 30000,
  })

  const unmuteMutation = useMutation({
    mutationFn: unmuteUser,
    onSuccess: () => {
      toast.success('解禁成功')
      void queryClient.invalidateQueries({ queryKey: mutedUsersQueryKey() })
    },
    onError: (err: Error) => {
      toast.error(`解禁失败: ${err.message}`)
    },
    onSettled: () => {
      setConfirmUid(null)
    },
  })

  if (isLoading && !data) {
    return <LoadingState message="加载禁言用户列表..." />
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => void refetch()} />
  }

  const list = data?.list ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="禁言用户管理"
        description="查看当前被禁言的用户列表，支持手动解禁"
      />

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          当前无禁言用户
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户 ID</TableHead>
                <TableHead>禁言到期时间</TableHead>
                <TableHead>剩余时间</TableHead>
                <TableHead className="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((user) => (
                <TableRow key={user.uid}>
                  <TableCell className="font-mono text-sm">{user.uid}</TableCell>
                  <TableCell>
                    {new Date(user.mute_until * 1000).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell>{formatRemaining(user.remaining_seconds)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmUid(user.uid)}
                    >
                      解禁
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={confirmUid !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmUid(null)
        }}
        title="确认解禁"
        description={`确定要解除用户 ${confirmUid ?? ''} 的禁言吗？`}
        confirmText="解禁"
        onConfirm={() => {
          if (confirmUid) {
            return unmuteMutation.mutateAsync(confirmUid)
          }
        }}
        variant="destructive"
        loading={unmuteMutation.isPending}
      />
    </div>
  )
}
