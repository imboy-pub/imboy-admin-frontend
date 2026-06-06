import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Building2, Users, CheckCircle2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, LoadingState, ErrorState, ConfirmDialog } from '@/components/shared'
import {
  getBootstrapConfig,
  savePolicyChange,
  policyQueryKey,
  type Capabilities,
} from '@/services/api/policy'
import { getErrorMessage } from '@/lib/errorUtils'

type ProductProfile = 'community' | 'enterprise'

const PROFILE_META: Record<ProductProfile, { label: string; description: string; icon: typeof Users }> = {
  community: {
    label: '社区版',
    description: '适合小型团队与开源社区，E2EE 可选，消息保留 30 天，基础审计',
    icon: Users,
  },
  enterprise: {
    label: '企业版',
    description: '适合合规型企业，消息可搜索导出，完整审计，消息保留 365 天',
    icon: Building2,
  },
}

function CapabilityList({ caps }: { caps: Capabilities }) {
  const items: [string, string][] = [
    ['存储模式', caps.storage_mode === 'archived' ? '归档存储' : '安全加密存储'],
    ['端到端加密', caps.e2ee_mode === 'disabled' ? '禁用' : caps.e2ee_mode === 'optional' ? '可选' : caps.e2ee_mode === 'compliance' ? '合规模式' : '强制'],
    ['消息搜索', caps.message_search ? '开启' : '关闭'],
    ['消息导出', caps.message_export ? '开启' : '关闭'],
    ['审计模式', caps.audit_mode === 'none' ? '无审计' : caps.audit_mode === 'metadata' ? '元数据' : '全量审计'],
    ['数据保留', caps.retention_policy?.mode === 'rolling_days'
      ? `滚动 ${caps.retention_policy?.days ?? '-'} 天`
      : '永久保留'],
  ]
  return (
    <dl className="space-y-1.5 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium text-right">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ProfileSwitchPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pendingProfile, setPendingProfile] = useState<ProductProfile | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: policyQueryKey('bootstrap' as Parameters<typeof policyQueryKey>[0]),
    queryFn: () => getBootstrapConfig(),
  })

  const currentProfile: ProductProfile =
    (data?.effective?.profile as ProductProfile) ?? 'community'
  const supported: ProductProfile[] =
    (data?.meta?.profiles?.supported as ProductProfile[]) ?? ['community', 'enterprise']
  const defaults = data?.meta?.profiles?.defaults

  const switchMutation = useMutation({
    mutationFn: (profile: ProductProfile) => savePolicyChange({ profile }),
    onSuccess: () => {
      toast.success('产品套餐已切换')
      setPendingProfile(null)
      setConfirmOpen(false)
      queryClient.invalidateQueries({ queryKey: policyQueryKey() })
    },
    onError: (err: unknown) => {
      toast.error(`切换失败: ${getErrorMessage(err)}`)
    },
  })

  const handleSelect = useCallback((profile: ProductProfile) => {
    if (profile === currentProfile) return
    setPendingProfile(profile)
    setConfirmOpen(true)
  }, [currentProfile])

  const handleConfirmSwitch = useCallback(() => {
    if (!pendingProfile) return
    switchMutation.mutate(pendingProfile)
  }, [pendingProfile, switchMutation])

  if (isLoading) return <LoadingState message="加载套餐配置..." />
  if (error) return <ErrorState message="加载套餐配置失败" onRetry={() => refetch()} />

  const pendingLabel = pendingProfile ? PROFILE_META[pendingProfile]?.label : ''

  return (
    <div className="space-y-6">
      <PageHeader
        title="产品套餐"
        description="切换部署套餐档位。切换会将能力配置重置为目标套餐的默认值。"
      />

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate('/settings')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回设置
        </Button>
      </div>

      {/* 当前套餐状态 */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            当前套餐
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <div>
              <p className="text-lg font-semibold">
                {PROFILE_META[currentProfile]?.label ?? currentProfile}
              </p>
              <p className="text-sm text-muted-foreground">
                {PROFILE_META[currentProfile]?.description}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 套餐对比卡片 */}
      <div className="grid gap-4 md:grid-cols-2">
        {supported.map((profile) => {
          const meta = PROFILE_META[profile]
          const ProfileIcon = meta?.icon ?? Users
          const isActive = profile === currentProfile
          const profileDefaults = defaults?.[profile]
          const caps = profileDefaults?.capabilities

          return (
            <Card
              key={profile}
              className={`transition-all ${isActive
                ? 'border-primary ring-1 ring-primary'
                : 'hover:border-primary/50 hover:shadow-md cursor-pointer'
              }`}
              onClick={() => !isActive && handleSelect(profile)}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <ProfileIcon className="h-5 w-5" />
                    {meta?.label ?? profile}
                  </div>
                  {isActive ? (
                    <Badge variant="default" className="text-xs">当前</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); handleSelect(profile) }}
                      disabled={switchMutation.isPending}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      切换
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>{meta?.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-medium text-muted-foreground mb-2">默认能力配置</p>
                {caps ? (
                  <CapabilityList caps={caps} />
                ) : (
                  <p className="text-sm text-muted-foreground">暂无配置预览</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`切换到${pendingLabel}？`}
        description="切换套餐将把能力配置重置为目标套餐的默认值，已自定义的功能开关不受影响。此操作立即生效。"
        confirmText="确认切换"
        onConfirm={handleConfirmSwitch}
        loading={switchMutation.isPending}
      />
    </div>
  )
}
