import { ReactElement } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/shared'
import { useAdminFeatures } from '@/hooks/useAdminFeatures'
import { featureKeyForAdminPath, isAdminFeatureEnabled } from '@/services/api/features'
import { Lock, Settings } from 'lucide-react'

type FeatureRouteProps = {
  children: ReactElement
  feature?: string
}

export function FeatureDisabledPage({ feature }: { feature: string }) {
  const navigate = useNavigate()
  const featureLabels: Record<string, string> = {
    channel: '频道管理',
    moment: '朋友圈',
    group_vote: '群投票',
    group_schedule: '群日程',
    group_task: '群任务',
    channel_invitation: '频道邀请',
    channel_order: '频道排序',
    channel_discover: '频道发现',
  }

  const label = featureLabels[feature] ?? feature

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg">功能未开启</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            「{label}」功能当前未开启。请前往系统设置中的功能开关页面开启此功能。
          </p>
          <Button onClick={() => navigate('/settings/features')} className="w-full">
            <Settings className="mr-2 h-4 w-4" />
            前往开启
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function FeatureRoute({ children, feature }: FeatureRouteProps) {
  const location = useLocation()
  const { data: featureFlags, isLoading } = useAdminFeatures()
  const effectiveFeature = feature ?? featureKeyForAdminPath(location.pathname)

  if (isLoading && featureFlags === undefined) {
    return <LoadingState message="校验功能开关..." />
  }

  if (!isAdminFeatureEnabled(featureFlags, effectiveFeature)) {
    return <FeatureDisabledPage feature={effectiveFeature ?? '未知'} />
  }

  return children
}
