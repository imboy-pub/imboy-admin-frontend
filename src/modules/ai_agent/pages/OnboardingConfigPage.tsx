import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared'
import { getErrorMessage } from '@/lib/errorUtils'
import {
  getOnboardingConfig,
  putOnboardingConfig,
  type OnboardingConfig,
} from '../api/public'

const QUERY_KEY = ['ai_agent', 'onboarding_config'] as const

// default_channels: string[] <-> 逗号分隔文本（表单友好）
function channelsToText(list: string[]): string {
  return Array.isArray(list) ? list.join(', ') : ''
}
function textToChannels(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// 表单主体：用 initial 派生初值（父组件用 key 重置状态，避免 effect setState）
function OnboardingForm({ initial }: { initial: OnboardingConfig }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<OnboardingConfig>(initial)
  const [channelsText, setChannelsText] = useState(channelsToText(initial.default_channels))

  const mutation = useMutation({
    mutationFn: (patch: Partial<OnboardingConfig>) => putOnboardingConfig(patch),
    onSuccess: () => {
      toast.success('新手引导配置已保存')
      // invalidate → 父组件 query 重新拉取 → key 变化 → 本组件重挂填最新值
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (err: unknown) => {
      toast.error(`保存失败: ${getErrorMessage(err)}`)
    },
  })

  const handleSave = useCallback(() => {
    mutation.mutate({
      enabled: form.enabled,
      welcome_agent_uid: form.welcome_agent_uid,
      default_channels: textToChannels(channelsText),
      welcome_template: form.welcome_template,
      welcome_llm_enabled: form.welcome_llm_enabled,
    })
  }, [form, channelsText, mutation])

  return (
    <div className="space-y-6">
      <PageHeader
        title="新手引导配置"
        description="新用户注册后自动：添加欢迎助手为好友、订阅默认频道、收到欢迎消息。关闭后完全不生效。"
      />

      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="flex items-start gap-2 pt-6 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <span>
            欢迎助手须为「AI 助手」账号（account_type=1）。欢迎文案支持
            <code className="mx-1 rounded bg-muted px-1">{'{{nickname}}'}</code>
            占位符，由后端渲染为用户昵称。开启 LLM 个性化后每条欢迎消息将消耗一次模型调用（过限流闸门）。
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">总开关与欢迎助手</CardTitle>
          <CardDescription>关闭后新用户注册不触发任何引导动作。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <span className="font-medium">启用新手引导</span>
              <p className="text-sm text-muted-foreground">注册三件套总开关</p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcome_agent_uid">欢迎助手 UID</Label>
            <Input
              id="welcome_agent_uid"
              value={form.welcome_agent_uid ?? ''}
              onChange={(e) => setForm({ ...form, welcome_agent_uid: e.target.value.trim() })}
              placeholder="AI 助手账号的 user_id（如 ai_welcome 人设的 uid）"
            />
            <p className="text-xs text-muted-foreground">
              可在「AI 助手管理」列表中复制目标助手的 UID。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_channels">默认订阅频道（逗号分隔）</Label>
            <Input
              id="default_channels"
              value={channelsText}
              onChange={(e) => setChannelsText(e.target.value)}
              placeholder="频道 id，多个用逗号分隔；留空则不订阅"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">欢迎消息</CardTitle>
          <CardDescription>首次注册收到的私聊文案。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="welcome_template">欢迎文案模板</Label>
            <Textarea
              id="welcome_template"
              rows={4}
              value={form.welcome_template}
              onChange={(e) => setForm({ ...form, welcome_template: e.target.value })}
              placeholder="嗨 {{nickname}}，欢迎来到 imboy……"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <span className="font-medium">LLM 个性化欢迎</span>
              <p className="text-sm text-muted-foreground">
                开启后用模型生成欢迎语（失败自动回退模板）；关闭则始终用上方模板，零成本。
              </p>
            </div>
            <Switch
              checked={form.welcome_llm_enabled}
              onCheckedChange={(v) => setForm({ ...form, welcome_llm_enabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? (
            '保存中...'
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              保存配置
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

export function OnboardingConfigPage() {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getOnboardingConfig(),
    // 失败立即进入错误态由「重试」按钮手动恢复，避免静默自动重试掩盖错误（与 RolePermissionPage 一致）
    retry: false,
  })

  if (isLoading) return <LoadingState message="加载新手引导配置..." />
  if (error || !data) {
    return <ErrorState message="加载新手引导配置失败" onRetry={() => refetch()} />
  }
  // key=dataUpdatedAt：保存后 invalidate 拉到新值 → 重挂表单填最新数据（无 effect setState）
  return <OnboardingForm key={dataUpdatedAt} initial={data} />
}
