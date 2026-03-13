import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AppWindow,
  ArrowRight,
  DatabaseZap,
  FileSearch,
  KeyRound,
  Settings,
  Shield,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader, ErrorState, LoadingState, StatsCard } from '@/components/shared'
import { getOverviewStatsPayload } from '@/services/api/stats'
import { getCurrentAdminPayload } from '@/services/api/auth'

type SettingsModule = {
  title: string
  description: string
  path: string
  icon: typeof Settings
}

const modules: SettingsModule[] = [
  {
    title: '版本管理',
    description: '管理各平台发布版本、更新说明和强制更新策略。',
    path: '/settings/versions',
    icon: AppWindow,
  },
  {
    title: 'DDL 管理',
    description: '维护数据库结构变更脚本和版本演进记录。',
    path: '/settings/ddl',
    icon: DatabaseZap,
  },
  {
    title: '角色权限',
    description: '查看不同管理角色的功能授权范围。',
    path: '/roles',
    icon: KeyRound,
  },
  {
    title: '管理员中心',
    description: '查看当前管理员会话信息和安全状态。',
    path: '/admins',
    icon: Shield,
  },
  {
    title: '审计日志',
    description: '追踪消息行为与账号注销等审计事件。',
    path: '/logs',
    icon: FileSearch,
  },
]

function roleLabel(roleId?: number): string {
  switch (roleId) {
    case 1:
      return '超级管理员'
    case 2:
      return '运营管理员'
    case 3:
      return '审计管理员'
    default:
      return `角色 #${roleId ?? 0}`
  }
}

export function SettingsHomePage() {
  const navigate = useNavigate()

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['settings', 'overview'],
    queryFn: () => getOverviewStatsPayload(),
  })

  const {
    data: currentAdmin,
    isLoading: adminLoading,
    error: adminError,
    refetch: refetchAdmin,
  } = useQuery({
    queryKey: ['settings', 'current-admin'],
    queryFn: () => getCurrentAdminPayload(),
  })

  if ((overviewLoading && !overview) || (adminLoading && !currentAdmin)) {
    return <LoadingState message="加载系统配置概览..." />
  }

  if (overviewError || adminError) {
    return (
      <ErrorState
        message="加载系统配置失败"
        onRetry={() => {
          void refetchOverview()
          void refetchAdmin()
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="系统设置"
        description="统一管理系统配置、发布策略与审计能力"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="在线用户"
          value={overview?.online_users || 0}
          description={`在线设备 ${overview?.online_devices || 0}`}
          icon={Settings}
        />
        <StatsCard
          title="总用户数"
          value={overview?.total_users || 0}
          description={`今日新增 ${overview?.today_users || 0}`}
          icon={Shield}
        />
        <StatsCard
          title="当前管理员"
          value={currentAdmin?.nickname || '未知'}
          description={roleLabel(currentAdmin?.role_id)}
          icon={KeyRound}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <Card key={item.path} className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <item.icon className="h-5 w-5 text-primary" />
                {item.title}
              </CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => navigate(item.path)}
              >
                进入
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
