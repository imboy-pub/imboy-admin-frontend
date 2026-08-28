import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Info, MonitorSmartphone, Building2, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared'
import {
  getProductExperienceConfig,
  productExperienceQueryKey,
} from '@/services/api/workspaces'

/**
 * Product Experience 安装级配置只读页（双体验 v2.5.2 WP7/T11）
 *
 * 展示：当前有效体验（chat/workspace 徽标）、配置来源（部署环境变量 → 安装级）、
 * config_version、受控变更指引。
 *
 * 本页面无任何写按钮/表单提交——不调用 application:set_env、不写 config_ds、
 * 不落 DB；修改部署配置（IMBOY_PRODUCT_EXPERIENCE）并受控重启后生效，
 * 属于 Release 阶段人工运维动作。
 */
export function ProductExperiencePage() {
  const navigate = useNavigate()

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: productExperienceQueryKey(),
    queryFn: getProductExperienceConfig,
  })

  // TanStack Query v5：出错时 isLoading=false 且 data=undefined，error 判断必须在前，
  // 否则错误态被 Loading 分支（!data 恒真）吞掉，ErrorState 永不可达。
  if (error) return <ErrorState message="加载产品体验配置失败" onRetry={() => refetch()} />
  if (isLoading || !data) return <LoadingState message="加载产品体验配置..." />

  const isWorkspace = data.effective_product_experience === 'workspace'
  const failSafeTriggered = data.configured_raw !== data.effective_product_experience

  return (
    <div className="space-y-6">
      <PageHeader
        title="产品体验（Product Experience）"
        description="安装级配置，决定客户端呈现经典 IM（chat）还是协作工作台（workspace）形态。"
      />

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate('/settings')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回设置
        </Button>
        {dataUpdatedAt > 0 && (
          <span className="text-xs text-muted-foreground">
            数据更新于 {new Date(dataUpdatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* 当前有效值 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorSmartphone className="h-5 w-5" />
            当前有效体验
          </CardTitle>
          <CardDescription>全部客户端按此值呈现（服务端唯一真相源，/api/v1/init 同步下发）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {isWorkspace ? (
              <>
                <Building2 className="h-8 w-8 text-blue-600" />
                <div>
                  <Badge className="text-sm" variant="default">workspace</Badge>
                  <span className="ml-2 text-sm text-muted-foreground">协作工作台形态</span>
                </div>
              </>
            ) : (
              <>
                <MonitorSmartphone className="h-8 w-8 text-green-600" />
                <div>
                  <Badge className="text-sm" variant="secondary">chat</Badge>
                  <span className="ml-2 text-sm text-muted-foreground">经典 IM 形态</span>
                </div>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">config_version</div>
              <div className="mt-1 break-all font-mono text-sm" data-testid="config-version">
                {data.config_version}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                有效体验或后端发布版本任一变化必变化；客户端启动时据此失效缓存
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">配置来源</div>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline">安装级（install）</Badge>
                <span className="text-sm">部署环境变量 IMBOY_PRODUCT_EXPERIENCE</span>
              </div>
            </div>
          </div>

          {failSafeTriggered && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                部署配置值 <code className="rounded bg-amber-100 px-1">{data.configured_raw}</code>
                不可识别，已按 fail-safe 规则降级为
                <Badge variant="secondary" className="mx-1">{data.effective_product_experience}</Badge>
                。请修正部署配置后重启。
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 受控变更指引 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-5 w-5 text-blue-600" />
            如何变更
          </CardTitle>
          <CardDescription>本页面只读，无运行时切换按钮</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>修改部署配置：环境变量 <code className="rounded bg-muted px-1">IMBOY_PRODUCT_EXPERIENCE</code>（可选值 chat / workspace；缺失或非法值按 fail-safe 降级为 chat）。</li>
            <li>受控重启服务：配置为安装级注入，仅在启动时读取一次（Release 阶段人工运维动作）。</li>
            <li>重启后回到本页与客户端启动端点 /api/v1/init 核对新的有效值与 config_version。</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
