import { useState, useCallback, useMemo } from 'react'
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
  getPolicyMeta,
  previewPolicyChange,
  savePolicyChange,
  policyQueryKey,
  buildPolicyConfig,
  type PolicyConfig,
  type PolicyResponse,
  type FeatureName,
  type FeatureFlags,
} from '@/services/api/policy'
import { adminFeatureQueryKey } from '@/services/api/features'
import { getErrorMessage } from '@/lib/errorUtils'

type FeatureDisplay = {
  name: FeatureName
  label: string
  description: string
  group: string
  dependencies?: FeatureName[]
}

// 静态显示映射：labels/descriptions/groups 保留在前端（i18n）
const FEATURE_DISPLAY_MAP: Record<string, { label: string; description: string; group: string }> = {
  core: { label: '核心功能', description: '基础消息与账号体系', group: '基础' },
  e2ee: { label: '端到端加密', description: '消息端到端加密传输', group: '基础' },
  location: { label: '位置服务', description: '地理位置分享与附近的人', group: '基础' },
  channel: { label: '频道', description: '频道创建、订阅、管理', group: '频道' },
  channel_discover: { label: '频道发现', description: '频道搜索与推荐', group: '频道' },
  channel_invitation: { label: '频道邀请', description: '频道邀请链接与管理', group: '频道' },
  channel_order: { label: '频道排序', description: '频道自定义排序', group: '频道' },
  moment: { label: '朋友圈/动态', description: '用户动态发布与互动', group: '社交' },
  group_vote: { label: '群投票', description: '群组内发起投票', group: '群组增强' },
  group_schedule: { label: '群日程', description: '群组内日程管理', group: '群组增强' },
  group_task: { label: '群任务', description: '群组内任务分配与跟踪', group: '群组增强' },
}

// 分组描述
const GROUP_DESCRIPTIONS: Record<string, string> = {
  '基础': '核心通信与安全功能',
  '频道': '频道相关功能（依赖频道主开关）',
  '社交': '社交互动功能',
  '群组增强': '群组协作增强功能',
}

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
    queryKey: policyQueryKey('effective'),
    queryFn: () => getPolicyEffective(),
  })

  const { data: metaData } = useQuery({
    queryKey: policyQueryKey('meta'),
    queryFn: () => getPolicyMeta(),
    staleTime: 5 * 60 * 1000, // 元数据缓存 5 分钟
  })

  const effectiveFeatures: FeatureFlags = useMemo(
    () => policyData?.effective?.features ?? {},
    [policyData]
  )
  const displayFeatures = pendingFeatures ?? effectiveFeatures
  const hasChanges = pendingFeatures !== null

  // 从 meta 端点动态构建 feature 列表，fallback 到静态映射
  const catalog = useMemo<FeatureDisplay[]>(() => {
    const featureAll = metaData?.features?.all
    if (!featureAll || featureAll.length === 0) {
      // Fallback: 静态目录
      return Object.entries(FEATURE_DISPLAY_MAP).map(([name, display]) => ({
        name: name as FeatureName,
        ...display,
        dependencies: undefined,
      }))
    }
    return featureAll.map((name) => {
      const display = FEATURE_DISPLAY_MAP[name]
      const catalogEntry = metaData?.features?.catalog?.[name]
      const deps = catalogEntry?.dependencies ?? []
      return {
        name: name as FeatureName,
        label: display?.label ?? name,
        description: display?.description ?? '',
        group: display?.group ?? '其他',
        dependencies: deps.length > 0 ? deps : undefined,
      }
    })
  }, [metaData])

  const featureMutation = useMutation({
    mutationFn: (payload: PolicyConfig) => savePolicyChange(payload),
    onSuccess: () => {
      toast.success('功能开关已保存')
      setPendingFeatures(null)
      setPreviewData(null)
      setShowPreview(false)
      queryClient.invalidateQueries({ queryKey: policyQueryKey() })
      queryClient.invalidateQueries({ queryKey: adminFeatureQueryKey() })
    },
    onError: (err: unknown) => {
      toast.error(`保存失败: ${getErrorMessage(err)}`)
    },
  })

  const previewMutation = useMutation({
    mutationFn: (payload: PolicyConfig) => previewPolicyChange(payload),
    onSuccess: (data) => {
      setPreviewData(data)
      setShowPreview(true)
    },
    onError: (err: unknown) => {
      toast.error(`预览失败: ${getErrorMessage(err)}`)
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
    previewMutation.mutate(buildPolicyConfig(policyData?.effective, { features: pendingFeatures }))
  }, [pendingFeatures, policyData, previewMutation])

  const handleSave = useCallback(() => {
    if (!pendingFeatures) return
    featureMutation.mutate(buildPolicyConfig(policyData?.effective, { features: pendingFeatures }))
  }, [pendingFeatures, policyData, featureMutation])

  const handleDiscard = useCallback(() => {
    setPendingFeatures(null)
    setShowPreview(false)
    setPreviewData(null)
  }, [])

  if (isLoading) return <LoadingState message="加载功能配置..." />
  if (error) return <ErrorState message="加载功能配置失败" onRetry={() => refetch()} />

  const grouped = catalog.reduce<Record<string, FeatureDisplay[]>>((acc, f) => {
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
              {GROUP_DESCRIPTIONS[group] ?? group}
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
