import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Pencil, Trash2, Users, MessageSquare, Shield, FileText, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ConfirmDialog, ErrorState, LoadingState, PageHeader, StatusBadge } from '@/components/shared'
import { ChannelUpdateParams, ChannelPriceParams, deleteChannel, getChannelDetailPayload, getChannelStatsPayload, setChannelPrice, updateChannel } from '@/modules/channels/api'
import { formatDate } from '@/lib/utils'
import { fenToYuan, yuanToFen } from '@/lib/money'
import { useAdminFeatures, useAdminEntryEnabled } from '@/hooks/useAdminFeatures'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { isAdminFeatureEnabled } from '@/services/api/features'
import { getErrorMessage } from '@/lib/errorUtils'
import { Select } from '@/components/ui/select'

type ChannelForm = {
  name: string
  custom_id: string
  visibility: number
  status: number
  avatar: string
  description: string
}

type ChannelPriceForm = {
  price_yuan: string
  original_price_yuan: string
  currency: string
  subscription_type: number
  description: string
}

function toFormData(channel: {
  name: string
  custom_id: string | null
  visibility: number
  status: number
  avatar: string | null
  description: string | null
}): ChannelForm {
  return {
    name: channel.name || '',
    custom_id: channel.custom_id || '',
    visibility: channel.visibility,
    status: channel.status,
    avatar: channel.avatar || '',
    description: channel.description || '',
  }
}

/** 分转纯元字符串（无 ¥ 前缀），用于 type="number" 表单回填 */
function fenToYuanInput(fen?: number): string {
  return fen ? fenToYuan(fen).replace('¥', '') : ''
}

function toPriceFormData(channel: { price?: number; original_price?: number; currency?: string; subscription_type?: number }): ChannelPriceForm {
  return {
    price_yuan: fenToYuanInput(channel.price),
    original_price_yuan: fenToYuanInput(channel.original_price),
    currency: channel.currency ?? 'CNY',
    subscription_type: channel.subscription_type ?? 1,
    description: '',
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
  const [isPriceEditing, setIsPriceEditing] = useState(false)
  const [priceFormData, setPriceFormData] = useState<ChannelPriceForm | null>(null)
  const [activeTab, setActiveTab] = useState('messages')
  const { data: featureFlags } = useAdminFeatures()
  const channelEntryEnabled = useAdminEntryEnabled('channel')
  const { allowed: canUpdateChannel } = useAdminPermission({
    permission: 'channels:update',
    roles: ['1', '2'],
  })
  const { allowed: canDeleteChannel } = useAdminPermission({
    permission: 'channels:delete',
    roles: ['1', '2'],
  })

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
    onError: (err: unknown) => {
      toast.error(`删除失败: ${getErrorMessage(err)}`)
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
    onError: (err: unknown) => {
      toast.error(`更新失败: ${getErrorMessage(err)}`)
    },
  })

  const priceMutation = useMutation({
    mutationFn: (payload: ChannelPriceParams) => setChannelPrice(channelId, payload),
    onSuccess: () => {
      toast.success('频道价格已更新')
      queryClient.invalidateQueries({ queryKey: ['channel', channelId] })
      setPriceFormData(null)
      setIsPriceEditing(false)
      void refetch()
    },
    onError: (err: unknown) => {
      toast.error(`价格更新失败: ${getErrorMessage(err)}`)
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
    setActiveTab('messages')
  }

  const handleSave = () => {
    const name = resolvedFormData.name.trim()
    if (!name) {
      toast.error('频道名称不能为空')
      return
    }

    updateMutation.mutate({
      name,
      status: resolvedFormData.status,
      custom_id: resolvedFormData.custom_id.trim(),
      avatar: resolvedFormData.avatar.trim(),
      description: resolvedFormData.description,
    })
  }
  const orderEnabled = channelEntryEnabled && isAdminFeatureEnabled(featureFlags, 'channel_order')

  // 确定可用的 Tab 列表
  const tabs = [
    { key: 'messages', label: '消息', icon: MessageSquare },
    { key: 'overview', label: '概览', icon: FileText },
    { key: 'subscribers', label: '订阅者', icon: Users },
    { key: 'admins', label: '管理员', icon: Shield },
    ...(orderEnabled ? [{ key: 'orders', label: '订单', icon: DollarSign }] : []),
  ]

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
            {canUpdateChannel && !isEditing && channel.status !== -1 && (
              <Button
                variant="outline"
onClick={() => {
	                  setFormData(toFormData(channel))
	                  setIsEditing(true)
	                  setActiveTab('overview')
	                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                编辑频道
              </Button>
            )}
            {canDeleteChannel && !isEditing && channel.status === 1 && (
              <Button variant="destructive" onClick={() => setShowConfirm(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                删除频道
              </Button>
            )}
          </div>
        )}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              <tab.icon className="h-4 w-4 mr-1.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 消息 Tab */}
        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                频道消息
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">请在"概览"Tab 中编辑频道基本信息后，返回此页面管理消息。</p>
                  <Button variant="outline" onClick={() => setActiveTab('overview')}>
                    前往概览编辑
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    可在此管理频道消息，包括置顶、删除等操作。
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/channels/${channelId}/messages`)}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    进入消息治理
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 概览 Tab */}
        <TabsContent value="overview">
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
                        <Label htmlFor="channel-visibility">可见性</Label>
                        <Select
                          id="channel-visibility"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={String(resolvedFormData.visibility)}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...(prev ?? toFormData(channel)), visibility: Number(e.target.value) }))
                          }
                        >
                          <option value="0">公开</option>
                          <option value="1">私有</option>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="channel-status">状态</Label>
                        <Select
                          id="channel-status"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={String(resolvedFormData.status)}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...(prev ?? toFormData(channel)), status: Number(e.target.value) }))
                          }
                        >
                          <option value="1">正常</option>
                          <option value="0">禁用</option>
                        </Select>
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
                      <dt className="text-sm text-muted-foreground">可见性</dt>
                      <dd>
                        <div className="flex items-center gap-1">
                          <StatusBadge
                            status={channel.visibility}
                            labels={{ 0: '公开', 1: '私有' }}
                            variants={{ 0: 'success', 1: 'warning' }}
                          />
                          {channel.access_type === 1 && (
                            <StatusBadge
                              status={1}
                              labels={{ 1: '付费' }}
                              variants={{ 1: 'info' }}
                            />
                          )}
                        </div>
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

          {channel.access_type === 1 && (
            <Card className="mt-6">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  频道价格
                </CardTitle>
                {canUpdateChannel && !isPriceEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPriceFormData(toPriceFormData(channel))
                      setIsPriceEditing(true)
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    设置价格
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {isPriceEditing && priceFormData ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="price-yuan">价格（元）</Label>
                        <Input
                          id="price-yuan"
                          type="number"
                          min="0"
                          step="0.01"
                          value={priceFormData.price_yuan}
                          onChange={(e) => setPriceFormData((prev) => prev ? { ...prev, price_yuan: e.target.value } : prev)}
                          placeholder="例如 9.90"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="original-price-yuan">原价（元，可选）</Label>
                        <Input
                          id="original-price-yuan"
                          type="number"
                          min="0"
                          step="0.01"
                          value={priceFormData.original_price_yuan}
                          onChange={(e) => setPriceFormData((prev) => prev ? { ...prev, original_price_yuan: e.target.value } : prev)}
                          placeholder="例如 19.90"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="currency">货币</Label>
                        <Select
                          id="currency"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={priceFormData.currency}
                          onChange={(e) => setPriceFormData((prev) => prev ? { ...prev, currency: e.target.value } : prev)}
                        >
                          <option value="CNY">CNY 人民币</option>
                          <option value="USD">USD 美元</option>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="subscription-type">订阅类型</Label>
                        <Select
                          id="subscription-type"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={String(priceFormData.subscription_type)}
                          onChange={(e) => setPriceFormData((prev) => prev ? { ...prev, subscription_type: Number(e.target.value) } : prev)}
                        >
                          <option value="1">一次性</option>
                          <option value="2">月订阅</option>
                          <option value="3">年订阅</option>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => { setPriceFormData(null); setIsPriceEditing(false) }}
                        disabled={priceMutation.isPending}
                      >
                        取消
                      </Button>
                      <Button
                        onClick={() => {
                          const priceFen = yuanToFen(priceFormData.price_yuan || '0')
                          if (priceFen <= 0) { toast.error('价格必须大于 0'); return }
                          const originalFen = priceFormData.original_price_yuan
                            ? yuanToFen(priceFormData.original_price_yuan)
                            : undefined
                          priceMutation.mutate({
                            price_fen: priceFen,
                            original_price_fen: originalFen,
                            currency: priceFormData.currency,
                            subscription_type: priceFormData.subscription_type,
                            description: priceFormData.description,
                          })
                        }}
                        disabled={priceMutation.isPending}
                      >
                        {priceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        保存价格
                      </Button>
                    </div>
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-muted-foreground">当前价格</dt>
                      <dd className="font-medium">
                        {channel.price ? `${fenToYuan(channel.price)} ${channel.currency ?? 'CNY'}` : '未设置'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">原价</dt>
                      <dd>{channel.original_price ? `${fenToYuan(channel.original_price)} ${channel.currency ?? 'CNY'}` : '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">订阅类型</dt>
                      <dd>
                        {{ 1: '一次性', 2: '月订阅', 3: '年订阅' }[channel.subscription_type ?? 1] ?? '-'}
                      </dd>
                    </div>
                  </dl>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 订阅者 Tab */}
        <TabsContent value="subscribers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                订阅者管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => navigate(`/channels/${channelId}/subscribers`)}
              >
                <Users className="h-4 w-4 mr-2" />
                查看订阅者列表
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 管理员 Tab */}
        <TabsContent value="admins">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                管理员管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => navigate(`/channels/${channelId}/admins`)}
              >
                <Shield className="h-4 w-4 mr-2" />
                查看管理员列表
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 订单 Tab（条件显示） */}
        {orderEnabled && (
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  订单管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/channels/${channelId}/orders`)}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  查看订单列表
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <ConfirmDialog
        open={canDeleteChannel && showConfirm}
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