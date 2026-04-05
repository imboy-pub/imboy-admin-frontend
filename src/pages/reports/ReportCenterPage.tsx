import { useMemo } from 'react'
import { Camera, Radio, Users, UsersRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { PageHeader } from '@/components/shared'
import { FeatureDisabledPage } from '@/components/auth/FeatureRoute'
import { Card, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAdminFeatures } from '@/hooks/useAdminFeatures'
import { isAdminFeatureEnabled } from '@/services/api/features'
import {
  type ReportProcessStep,
  type ReportTargetType,
} from '@/modules/reports/contracts/reportPanelExtension'
import { reportPanelRegistry } from '@/modules/reports/registry/reportPanelRegistry'
import { MomentReportPage } from '@/modules/moments'
import { TargetReportPanel } from './TargetReportPanel'

type ReportTargetConfig = {
  type: ReportTargetType
  label: string
  description: string
  status: 'ready' | 'rolling'
  icon: typeof Camera
  governancePath: string
  governanceLabel: string
}

const REPORT_TARGETS: ReportTargetConfig[] = [
  {
    type: 'moment',
    label: '朋友圈',
    description: '已接入举报 API，可直接筛选、批量处理与联动删帖。',
    status: 'ready',
    icon: Camera,
    governancePath: '/moments',
    governanceLabel: '动态治理',
  },
  {
    type: 'group',
    label: '群组',
    description: '已接入群组举报 API，支持筛选、单条/批量处理与联动群治理。',
    status: 'ready',
    icon: UsersRound,
    governancePath: '/groups/context',
    governanceLabel: '群上下文入口',
  },
  {
    type: 'channel',
    label: '频道',
    description: '已接入频道举报 API，支持筛选、单条/批量处理与联动频道治理。',
    status: 'ready',
    icon: Radio,
    governancePath: '/channels',
    governanceLabel: '频道治理',
  },
  {
    type: 'user',
    label: '用户',
    description: '已接入用户举报 API，支持筛选、单条/批量处理与联动用户治理。',
    status: 'ready',
    icon: Users,
    governancePath: '/users',
    governanceLabel: '用户治理',
  },
]

const REPORT_PROCESS_STEPS: ReportProcessStep[] = [
  { title: '受理分拣', description: '按违规类型、风险等级与目标对象分桶，明确处理优先级。' },
  { title: '证据核验', description: '拉取上下文内容与历史行为，交叉验证举报事实。' },
  { title: '执行处置', description: '根据规则执行删帖、禁言、封禁、驳回等动作并留痕。' },
  { title: '结果回写', description: '回写处理结论、复核意见与操作人，支持后续审计追踪。' },
]

function isNonMomentTargetType(targetType: ReportTargetType): targetType is Exclude<ReportTargetType, 'moment'> {
  return targetType !== 'moment'
}

function normalizeTargetType(raw: string | null): ReportTargetType {
  if (raw === 'group' || raw === 'channel' || raw === 'user' || raw === 'moment') {
    return raw
  }
  return 'moment'
}

reportPanelRegistry.register({
  id: 'moment-panel',
  targetType: 'moment',
  render: () => <MomentReportPage showPageHeader={false} />,
})

reportPanelRegistry.register({
  id: 'default-target-panel',
  targetType: 'default',
  render: (context) => {
    if (!isNonMomentTargetType(context.targetType)) {
      return <MomentReportPage showPageHeader={false} />
    }

    return (
      <TargetReportPanel
        targetType={context.targetType}
        targetLabel={context.targetLabel}
        governancePath={context.governancePath}
        governanceLabel={context.governanceLabel}
        processSteps={context.processSteps}
      />
    )
  },
})

export function ReportCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: featureFlags } = useAdminFeatures()
  const activeTarget = normalizeTargetType(searchParams.get('target_type'))

  const activeConfig = useMemo(
    () => REPORT_TARGETS.find((item) => item.type === activeTarget) ?? REPORT_TARGETS[0],
    [activeTarget]
  )
  const readyCount = REPORT_TARGETS.filter((item) => item.status === 'ready').length
  const rollingCount = REPORT_TARGETS.length - readyCount

  const switchTarget = (target: ReportTargetType) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('target_type', target)
    setSearchParams(nextParams, { replace: true })
  }

  const activePanel = reportPanelRegistry.resolveForTarget(activeTarget)
  const activeFeature = activeTarget === 'moment'
    ? 'moment'
    : activeTarget === 'channel'
      ? 'channel'
      : null
  const activeFeatureEnabled = isAdminFeatureEnabled(featureFlags, activeFeature)

  return (
    <div className="space-y-6">
      <PageHeader
        title="举报中心"
        description={rollingCount > 0
          ? `统一承接朋友圈、群组、频道、用户举报工单。当前已联调 ${readyCount}/${REPORT_TARGETS.length} 类对象，其余 ${rollingCount} 类处于联调模式。`
          : '统一承接朋友圈、群组、频道、用户举报工单，支持筛选、单条/批量处理与联动治理。'}
      />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {REPORT_TARGETS.map((item) => {
              const Icon = item.icon
              const active = item.type === activeTarget
              return (
                <button
                  key={item.type}
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => switchTarget(item.type)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}举报</span>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[11px]',
                      item.status === 'ready'
                        ? 'bg-emerald-500/15 text-emerald-700'
                        : 'bg-amber-500/15 text-amber-700'
                    )}
                  >
                    {item.status === 'ready' ? '已接入' : '联调中'}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-sm text-muted-foreground">{activeConfig.description}</p>
        </CardHeader>
      </Card>

      {activeFeature && !activeFeatureEnabled
        ? <FeatureDisabledPage feature={activeFeature} />
        : activePanel?.render({
            targetType: activeTarget,
            targetLabel: activeConfig.label,
            governancePath: activeConfig.governancePath,
            governanceLabel: activeConfig.governanceLabel,
            processSteps: REPORT_PROCESS_STEPS,
          })}
    </div>
  )
}
