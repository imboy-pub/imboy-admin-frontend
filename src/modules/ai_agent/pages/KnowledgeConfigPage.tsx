import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared'
import { getErrorMessage } from '@/lib/errorUtils'
import {
  getKnowledgeConfig,
  putKnowledgeConfig,
  type KnowledgeConfig,
} from '../api/public'

const QUERY_KEY = ['ai_agent', 'knowledge_config'] as const

// 表单主体：用 initial 派生初值（父组件用 key 重置状态，避免 effect setState）
function KnowledgeForm({ initial }: { initial: KnowledgeConfig }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<KnowledgeConfig>(initial)

  const mutation = useMutation({
    mutationFn: (patch: Partial<KnowledgeConfig>) => putKnowledgeConfig(patch),
    onSuccess: () => {
      toast.success('知识库配置已保存')
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
      group_rule: form.group_rule,
      faq: form.faq,
    })
  }, [form, mutation])

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 知识库配置"
        description="运营者粘贴群规与常见问答，@管家 在群里答疑时将其作为上下文注入，让回复贴合本社群规则。"
      />

      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="flex items-start gap-2 pt-6 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <span>
            知识库仅注入到 <strong>非端到端加密</strong> 的 @管家 回复；E2EE 会话不会接触知识库内容。
            单段文本上限 8000 字节，超出后端将整体拒绝保存（任一字段非法则零写入）。
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">总开关</CardTitle>
          <CardDescription>关闭后 @管家 回复不再注入任何知识库上下文。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <span className="font-medium">启用知识库注入</span>
              <p className="text-sm text-muted-foreground">群规 + FAQ 注入总开关</p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">群规</CardTitle>
          <CardDescription>本社群的规则、红线、礼仪，@管家 会据此约束回答。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="group_rule" className="sr-only">
            群规
          </Label>
          <Textarea
            id="group_rule"
            rows={8}
            value={form.group_rule}
            onChange={(e) => setForm({ ...form, group_rule: e.target.value })}
            placeholder={'例如：\n1. 禁止人身攻击与广告刷屏\n2. 技术问题优先 @管家\n3. ……'}
          />
          <p className="text-xs text-muted-foreground">支持多行；上限 8000 字节。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">常见问答（FAQ）</CardTitle>
          <CardDescription>高频问题与标准答案，@管家 会优先据此作答。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="faq" className="sr-only">
            常见问答
          </Label>
          <Textarea
            id="faq"
            rows={8}
            value={form.faq}
            onChange={(e) => setForm({ ...form, faq: e.target.value })}
            placeholder={'例如：\nQ：怎么修改昵称？\nA：我的-设置-资料-昵称\n\nQ：……\nA：……'}
          />
          <p className="text-xs text-muted-foreground">支持多行；上限 8000 字节。</p>
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

export function KnowledgeConfigPage() {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getKnowledgeConfig(),
    // 失败立即进入错误态由「重试」按钮手动恢复，避免静默自动重试掩盖错误（与 OnboardingConfigPage 一致）
    retry: false,
  })

  if (isLoading) return <LoadingState message="加载知识库配置..." />
  if (error || !data) {
    return <ErrorState message="加载知识库配置失败" onRetry={() => refetch()} />
  }
  // key=dataUpdatedAt：保存后 invalidate 拉到新值 → 重挂表单填最新数据（无 effect setState）
  return <KnowledgeForm key={dataUpdatedAt} initial={data} />
}
