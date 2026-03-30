import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Save, Eye, Info, AlertTriangle, ToggleLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared'
import {
  getPolicyEffective,
  previewPolicyChange,
  savePolicyChange,
  type PolicyConfig,
  type PolicyResponse,
  type FeatureName,
  type FeatureFlags,
} from '@/services/api/policy'
import { adminFeatureQueryKey } from '@/services/api/features'

type FeatureDisplay = {
  name: FeatureName
  label: string
  description: string
  group: string
  dependencies?: FeatureName[]
}

const FEATURE_CATALOG: FeatureDisplay[] = [
  { name: 'core', label: '核心功能', description: '基础消息与账号体系', group: '基础' },
  { name: 'e2ee', label: '端到端加密', description: '消息端到端加密传输', group: '基础' },
  { name: 'location', label: '位置服务', description: '地理位置分享与附近的人', group: '基础' },
  { name: 'channel', label: '频道', description: '频道创建、订阅、管理', group: '频道' },
  { name: 'channel_discover', label: '频道发现', description: '频道搜索与推荐', group: '频道', dependencies: ['channel'] },
  { name: 'channel_invitation', label: '频道邀请', description: '频道邀请链接与管理', group: '频道', dependencies: ['channel'] },
  { name: 'channel_order', label: '频道排序', description: '频道自定义排序', group: '频道', dependencies: ['channel'] },
  { name: 'moment', label: '朋友圈/动态', description: '用户动态发布与互动', group: '社交' },
  { name: 'group_vote', label: '群投票', description: '群组内发起投票', group: '群组增强' },
  { name: 'group_schedule', label: '群日程', description: '群组内日程管理', group: '群组增强' },
  { name: 'group_task', label: '群任务', description: '群组内任务分配与跟踪', group: '群组增强' },
]

function isDependencyBlocked(feature: FeatureDisplay, featureFlags: FeatureFlags): boolean {
  if (!feature.dependencies || feature.dependencies.length === 0) return false
  return feature.dependencies.some((dep) => !featureFlags[dep])
}

export function FeatureConfigPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pendingFeatures, setPendingFeatures] = useState<FeatureFlags | null>(null)
  const [previewData, setPreviewData] = useState<PolicyResponse | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const { data: policyData, isLoading, error, refetch } = useQuery({
    queryKey: ['policy', 'effective'],
    queryFn: () => getPolicyEffective(),
  })

  const effectiveFeatures: FeatureFlags = policyData?.effective?.features ?? {}
  const displayFeatures = pendingFeatures ?? effectiveFeatures
  const hasChanges = pendingFeatures !== null

  const featureMutation = useMutation({
    mutationFn: (payload: PolicyConfig) => savePolicyChange(payload),
    onSuccess: () => {
      toast.success('功能开关已保存')
      setPendingFeatures(null)
      setPreviewData(null)
      setShowPreview(false)
      queryClient.invalidateQueries({ queryKey: ['policy'] })
      queryClient.invalidateQueries({ queryKey: adminFeatureQueryKey() })
    },
    onError: (err: Error) => {
      toast.error(`保存失败: ${err.message}`)
    },
  })

  const previewMutation = useMutation({
    mutationFn: (payload: PolicyConfig) => previewPolicyChange(payload),
    onSuccess: (data) => {
      setPreviewData(data)
      setShowPreview(true)
    },
    onError: (err: Error) => {
      toast.error(`预览失败: ${err.message}`)
    },
  })

  const handleToggle = useCallback((name: FeatureName, checked: boolean) => {
    setPendingFeatures((prev) => {
      const base = prev ?? { ...effectiveFeatures }
      return { ...base, [name]: checked }
    })
    setShowPreview(false)
    setPreviewData(null)
  }, [effectiveFeatures])

  const handlePreview = useCallback(() => {
    if (!pendingFeatures) return
    const payload: PolicyConfig = {
      profile: policyData?.effective?.profile,
      capabilities: policyData?.effective?.capabilities,
      features: pendingFeatures,
    }
    previewMutation.mutate(payload)
  }, [pendingFeatures, policyData, previewMutation])

  const handleSave = useCallback(() => {
    if (!pendingFeatures) return
    const payload: PolicyConfig = {
      profile: policyData?.effective?.profile,
      capabilities: policyData?.effective?.capabilities,
      features: pendingFeatures,
    }
    featureMutation.mutate(payload)
  }, [pendingFeatures, policyData, featureMutation])

  const handleDiscard = useCallback(() => {
    setPendingFeatures(null)
    setShowPreview(false)
    setPreviewData(null)
  }, [])

  if (isLoading) return <LoadingState message="加载功能配置..." />
  if (error) return <ErrorState message="加载功能配置失败" onRetry={() => refetch()} />

  const grouped = FEATURE_CATALOG.reduce<Record<string, FeatureDisplay[]>>((acc, f) => {
    const g = f.group
    if (!acc[g]) acc[g] = []
    acc[g].push(f)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <PageHeader
        title="功能开关"
        description="管理系统功能模块的启用状态。修改后需要保存并刷新生效。"
      />

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate('/settings')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回设置
        </Button>
        <div className="flex gap-2">
          {hasChanges && (
            <>
              <Button variant="outline" onClick={handleDiscard}>
                放弃修改
              </Button>
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? '预览中...' : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    预览变更
                  </>
                )}
              </Button>
            </>
          )}
          <Button
            onClick={handleSave}
            disabled={!hasChanges || featureMutation.isPending}
          >
            {featureMutation.isPending ? '保存中...' : (
              <>
                <Save className="mr-2 h-4 w-4" />
                保存配置
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 预览面板 */}
      {showPreview && previewData && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-5 w-5 text-blue-600" />
              变更预览
            </CardTitle>
          </CardHeader>
          <CardContent>
            {previewData.adjustments?.features &&
              Object.keys(previewData.adjustments.features).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(previewData.adjustments.features).map(([key, adj]) => (
                  <div key={key} className="flex items-center gap-3 text-sm">
                    <Badge variant="outline">{key}</Badge>
                    <span className="text-muted-foreground">
                      已保存: {String(adj.saved)} → 生效: {String(adj.effective)}
                    </span>
                    {adj.reason && (
                      <Badge variant="secondary" className="text-xs">{adj.reason}</Badge>
                    )}
                    {adj.depends_on && adj.depends_on.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        (依赖: {adj.depends_on.join(', ')})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">无额外调整，配置将按预期生效。</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 功能分组展示 */}
      {Object.entries(grouped).map(([group, features]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ToggleLeft className="h-5 w-5" />
              {group}
            </CardTitle>
            <CardDescription>
              {group === '基础' && '核心通信与安全功能'}
              {group === '频道' && '频道相关功能（依赖频道主开关）'}
              {group === '社交' && '社交互动功能'}
              {group === '群组增强' && '群组协作增强功能'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {features.map((feature) => {
                const checked = Boolean(displayFeatures[feature.name])
                const blocked = isDependencyBlocked(feature, displayFeatures)
                const effectiveValue = effectiveFeatures[feature.name]
                const changed = pendingFeatures ? pendingFeatures[feature.name] !== effectiveValue : false

                return (
                  <div
                    key={feature.name}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{feature.label}</span>
                        {changed && (
                          <Badge variant="secondary" className="text-xs">已修改</Badge>
                        )}
                        {blocked && (
                          <Badge variant="destructive" className="text-xs flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            依赖未开启
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                      {feature.dependencies && feature.dependencies.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          依赖: {feature.dependencies.join(', ')}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={blocked ? false : checked}
                      onCheckedChange={(val) => handleToggle(feature.name, val)}
                      disabled={blocked}
                    />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
