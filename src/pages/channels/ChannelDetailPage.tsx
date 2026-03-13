import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Pencil, Trash2, Users, MessageSquare, Shield, Mail, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog, ErrorState, LoadingState, PageHeader, StatusBadge } from '@/components/shared'
import { ChannelUpdateParams, deleteChannel, getChannelDetailPayload, getChannelStatsPayload, updateChannel } from '@/services/api/channels'
import { formatDate } from '@/lib/utils'
import { useAdminFeatures } from '@/hooks/useAdminFeatures'
import { isAdminFeatureEnabled } from '@/services/api/features'

type ChannelForm = {
  name: string
  custom_id: string
  type: number
  status: number
  avatar: string
  description: string
}

function toFormData(channel: {
  name: string
  custom_id: string | null
  type: number
  status: number
  avatar: string | null
  description: string | null
}): ChannelForm {
  return {
    name: channel.name || '',
    custom_id: channel.custom_id || '',
    type: channel.type,
    status: channel.status,
    avatar: channel.avatar || '',
    description: channel.description || '',
  }
}

export function ChannelDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const channelId = id ?? ''
  const [showConfirm, setShowConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(() => searchParams.get('edit') === '1')
  const [formData, setFormData] = useState<ChannelForm | null>(null)
  const { data: featureFlags } = useAdminFeatures()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => getChannelDetailPayload(channelId),
    enabled: channelId.length > 0,
  })
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['channel-stats', channelId],
    queryFn: () => getChannelStatsPayload(channelId),
    enabled: channelId.length > 0,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChannel,
    onSuccess: () => {
      toast.success('频道已删除')
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      navigate('/channels')
    },
    onError: (err: Error) => {
      toast.error(`删除失败: ${err.message}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: ChannelUpdateParams) => updateChannel(channelId, payload),
    onSuccess: () => {
      toast.success('频道已更新')
      queryClient.invalidateQueries({ queryKey: ['channel', channelId] })
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      setFormData(null)
      setIsEditing(false)
      void refetch()
    },
    onError: (err: Error) => {
      toast.error(`更新失败: ${err.message}`)
    },
  })

  if (isLoading) {
    return <LoadingState message="加载频道详情..." />
  }

  const channel = data

  if (error || !channel) {
    return <ErrorState message="加载频道详情失败" onRetry={() => refetch()} />
  }

  const resolvedFormData = formData ?? toFormData(channel)

  const handleCancelEdit = () => {
    setFormData(null)
    setIsEditing(false)
  }

  const handleSave = () => {
    const name = resolvedFormData.name.trim()
    if (!name) {
      toast.error('频道名称不能为空')
      return
    }

    updateMutation.mutate({
      name,
      type: resolvedFormData.type,
      status: resolvedFormData.status,
      custom_id: resolvedFormData.custom_id.trim(),
      avatar: resolvedFormData.avatar.trim(),
      description: resolvedFormData.description,
    })
  }
  const invitationEnabled = isAdminFeatureEnabled(featureFlags, 'channel_invitation')
  const orderEnabled = isAdminFeatureEnabled(featureFlags, 'channel_order')

  const statsCards = [
    { label: '订阅数', value: stats?.subscriber_count ?? channel.subscriber_count ?? 0 },
    { label: '消息数', value: stats?.total_messages ?? 0 },
    { label: '阅读数', value: stats?.total_views ?? 0 },
    { label: '互动数', value: stats?.total_reactions ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="频道详情"
        description={`查看频道「${channel.name}」的详细信息`}
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/channels')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回列表
            </Button>
            <Button variant="outline" onClick={() => navigate(`/channels/${channelId}/messages`)}>
              <MessageSquare className="h-4 w-4 mr-2" />
              消息治理
            </Button>
            <Button variant="outline" onClick={() => navigate(`/channels/${channelId}/subscribers`)}>
              <Users className="h-4 w-4 mr-2" />
              订阅者
            </Button>
            <Button variant="outline" onClick={() => navigate(`/channels/${channelId}/admins`)}>
              <Shield className="h-4 w-4 mr-2" />
              管理员
            </Button>
            {invitationEnabled && (
              <Button variant="outline" onClick={() => navigate(`/channels/${channelId}/invitations`)}>
                <Mail className="h-4 w-4 mr-2" />
                邀请
              </Button>
            )}
            {orderEnabled && (
              <Button variant="outline" onClick={() => navigate(`/channels/${channelId}/orders`)}>
                <FileText className="h-4 w-4 mr-2" />
                订单
              </Button>
            )}
            {!isEditing && channel.status !== -1 && (
              <Button
                variant="outline"
                onClick={() => {
                  setFormData(toFormData(channel))
                  setIsEditing(true)
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                编辑频道
              </Button>
            )}
            {!isEditing && channel.status === 1 && (
              <Button variant="destructive" onClick={() => setShowConfirm(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                删除频道
              </Button>
            )}
          </div>
        )}
      />

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="channel-name">频道名称</Label>
                    <Input
                      id="channel-name"
                      value={resolvedFormData.name}
                      onChange={(e) => setFormData((prev) => ({ ...(prev ?? toFormData(channel)), name: e.target.value }))}
                      placeholder="请输入频道名称"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="channel-custom-id">自定义 ID</Label>
                    <Input
                      id="channel-custom-id"
                      value={resolvedFormData.custom_id}
                      onChange={(e) => setFormData((prev) => ({ ...(prev ?? toFormData(channel)), custom_id: e.target.value }))}
                      placeholder="可选，例如 tech_news"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="channel-type">类型</Label>
                    <select
                      id="channel-type"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={String(resolvedFormData.type)}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...(prev ?? toFormData(channel)), type: Number(e.target.value) }))
                      }
                    >
                      <option value="0">公开</option>
                      <option value="1">私有</option>
                      <option value="2">付费</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="channel-status">状态</Label>
                    <select
                      id="channel-status"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={String(resolvedFormData.status)}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...(prev ?? toFormData(channel)), status: Number(e.target.value) }))
                      }
                    >
                      <option value="1">正常</option>
                      <option value="0">禁用</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="channel-avatar">头像 URL</Label>
                    <Input
                      id="channel-avatar"
                      value={resolvedFormData.avatar}
                      onChange={(e) => setFormData((prev) => ({ ...(prev ?? toFormData(channel)), avatar: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="channel-description">描述</Label>
                  <Textarea
                    id="channel-description"
                    value={resolvedFormData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...(prev ?? toFormData(channel)), description: e.target.value }))
                    }
                    rows={4}
                    placeholder="请输入频道描述"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={handleCancelEdit} disabled={updateMutation.isPending}>
                    取消
                  </Button>
                  <Button onClick={handleSave} disabled={updateMutation.isPending}>
                    {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    保存修改
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">频道 ID</dt>
                  <dd className="font-mono">{channel.id}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">频道名称</dt>
                  <dd className="font-medium">{channel.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">创建者 ID</dt>
                  <dd className="font-mono">{channel.owner_id}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">自定义 ID</dt>
                  <dd>{channel.custom_id || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">类型</dt>
                  <dd>
                    <StatusBadge
                      status={channel.type}
                      labels={{ 0: '公开', 1: '私有', 2: '付费' }}
                      variants={{ 0: 'success', 1: 'warning', 2: 'info' }}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">状态</dt>
                  <dd>
                    <StatusBadge
                      status={channel.status}
                      labels={{ 1: '正常', 0: '禁用', '-1': '已删除' }}
                      variants={{ 1: 'success', 0: 'error', '-1': 'secondary' }}
                    />
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-sm text-muted-foreground">描述</dt>
                  <dd>{channel.description || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">创建时间</dt>
                  <dd>{formatDate(channel.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">更新时间</dt>
                  <dd>{formatDate(channel.updated_at)}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              频道统计
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isStatsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>加载统计中...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {statsCards.map((item) => (
                  <div key={item.label} className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className="mt-1 text-xl font-semibold">{item.value}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="确认删除频道"
        description={`确定要删除频道「${channel.name}」吗？此操作不可恢复。`}
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(channelId)}
      />
    </div>
  )
}
