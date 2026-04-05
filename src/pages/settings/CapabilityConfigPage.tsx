import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Save, Settings2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared'
import {
  getPolicyEffective,
  savePolicyChange,
  policyQueryKey,
  buildPolicyConfig,
  DEFAULT_CAPABILITIES,
  type PolicyConfig,
  type Capabilities,
  type StorageMode,
  type E2eeMode,
  type AuditMode,
  type RetentionPolicyMode,
} from '@/services/api/policy'
import { Switch } from '@/components/ui/switch'

type SelectOption<T extends string> = {
  value: T
  label: string
  description: string
}

const STORAGE_MODE_OPTIONS: SelectOption<StorageMode>[] = [
  { value: 'archived', label: '归档存储', description: '消息归档存储在服务器' },
  { value: 'secure_e2ee', label: '安全存储', description: '端到端加密安全存储' },
]

const E2EE_MODE_OPTIONS: SelectOption<E2eeMode>[] = [
  { value: 'disabled', label: '禁用', description: '不启用端到端加密' },
  { value: 'optional', label: '可选', description: '用户可选择是否加密' },
  { value: 'required', label: '强制', description: '所有会话强制加密' },
]

const AUDIT_MODE_OPTIONS: SelectOption<AuditMode>[] = [
  { value: 'none', label: '关闭', description: '不记录审计数据' },
  { value: 'metadata', label: '元数据', description: '仅记录消息元数据' },
  { value: 'full', label: '完整', description: '记录完整消息内容' },
]

const RETENTION_MODE_OPTIONS: SelectOption<RetentionPolicyMode>[] = [
  { value: 'rolling_days', label: '滚动天数', description: '保留指定天数的数据' },
  { value: 'infinite', label: '永久保留', description: '数据永久保留' },
]

export function CapabilityConfigPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pendingCapabilities, setPendingCapabilities] = useState<Capabilities | null>(null)

  const { data: policyData, isLoading, error, refetch } = useQuery({
    queryKey: policyQueryKey('effective'),
    queryFn: () => getPolicyEffective(),
  })

  const effectiveCapabilities: Capabilities = policyData?.effective?.capabilities ?? {}
  const displayCapabilities = pendingCapabilities ?? effectiveCapabilities
  const hasChanges = pendingCapabilities !== null

  const capabilityMutation = useMutation({
    mutationFn: (payload: PolicyConfig) => savePolicyChange(payload),
    onSuccess: () => {
      toast.success('能力配置已保存')
      setPendingCapabilities(null)
      queryClient.invalidateQueries({ queryKey: policyQueryKey() })
    },
    onError: (err: Error) => {
      toast.error(`保存失败: ${err.message}`)
    },
  })

  const updateField = useCallback(<K extends keyof Capabilities>(key: K, value: Capabilities[K]) => {
    setPendingCapabilities((prev) => {
      const base = prev ?? { ...effectiveCapabilities }
      return { ...base, [key]: value }
    })
  }, [effectiveCapabilities])

  const handleSave = useCallback(() => {
    if (!pendingCapabilities) return
    capabilityMutation.mutate(buildPolicyConfig(policyData?.effective, { capabilities: pendingCapabilities }))
  }, [pendingCapabilities, policyData, capabilityMutation])

  const handleDiscard = useCallback(() => {
    setPendingCapabilities(null)
  }, [])

  if (isLoading) return <LoadingState message="加载能力配置..." />
  if (error) return <ErrorState message="加载能力配置失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="能力配置"
        description="配置系统的核心能力参数，包括存储策略、加密模式、审计级别等。"
      />

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate('/settings')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回设置
        </Button>
        <div className="flex gap-2">
          {hasChanges && (
            <Button variant="outline" onClick={handleDiscard}>
              放弃修改
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={!hasChanges || capabilityMutation.isPending}
          >
            {capabilityMutation.isPending ? '保存中...' : (
              <>
                <Save className="mr-2 h-4 w-4" />
                保存配置
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 存储模式 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-5 w-5" />
            存储与加密
          </CardTitle>
          <CardDescription>配置消息存储策略和加密模式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <OptionGroup
            label="存储模式"
            options={STORAGE_MODE_OPTIONS}
            value={displayCapabilities.storage_mode ?? DEFAULT_CAPABILITIES.storage_mode!}
            onChange={(v) => updateField('storage_mode', v as StorageMode)}
          />
          <OptionGroup
            label="端到端加密模式"
            options={E2EE_MODE_OPTIONS}
            value={displayCapabilities.e2ee_mode ?? DEFAULT_CAPABILITIES.e2ee_mode!}
            onChange={(v) => updateField('e2ee_mode', v as E2eeMode)}
          />
        </CardContent>
      </Card>

      {/* 消息功能 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-5 w-5" />
            消息功能
          </CardTitle>
          <CardDescription>消息搜索、导出能力控制</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">消息搜索</Label>
              <p className="text-sm text-muted-foreground">允许用户搜索历史消息</p>
            </div>
            <Switch
              checked={displayCapabilities.message_search ?? false}
              onCheckedChange={(v) => updateField('message_search', v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">消息导出</Label>
              <p className="text-sm text-muted-foreground">允许用户导出聊天记录</p>
            </div>
            <Switch
              checked={displayCapabilities.message_export ?? false}
              onCheckedChange={(v) => updateField('message_export', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 审计与保留 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-5 w-5" />
            审计与数据保留
          </CardTitle>
          <CardDescription>审计级别和数据保留策略</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <OptionGroup
            label="审计模式"
            options={AUDIT_MODE_OPTIONS}
            value={displayCapabilities.audit_mode ?? DEFAULT_CAPABILITIES.audit_mode!}
            onChange={(v) => updateField('audit_mode', v as AuditMode)}
          />
          <OptionGroup
            label="数据保留策略"
            options={RETENTION_MODE_OPTIONS}
            value={displayCapabilities.retention_policy?.mode ?? DEFAULT_CAPABILITIES.retention_policy!.mode}
            onChange={(v) => {
              updateField('retention_policy', {
                mode: v as RetentionPolicyMode,
                days: v === 'rolling_days' ? (displayCapabilities.retention_policy?.days ?? DEFAULT_CAPABILITIES.retention_policy?.days ?? 365) : undefined,
              })
            }}
          />
          {displayCapabilities.retention_policy?.mode === 'rolling_days' && (
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <Label className="font-medium shrink-0">保留天数</Label>
              <input
                type="number"
                min={1}
                max={3650}
                value={displayCapabilities.retention_policy?.days ?? DEFAULT_CAPABILITIES.retention_policy?.days ?? 365}
                onChange={(e) => {
                  const days = Math.max(1, Math.min(3650, Number(e.target.value) || 1))
                  updateField('retention_policy', {
                    ...displayCapabilities.retention_policy,
                    mode: 'rolling_days',
                    days,
                  })
                }}
                className="h-9 w-24 rounded-md border px-3 text-sm"
              />
              <span className="text-sm text-muted-foreground">天</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// --- 可复用的选项组组件 ---

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: SelectOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="font-medium">{label}</Label>
      <div className="grid gap-2 md:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
              value === option.value
                ? 'border-primary bg-primary/5'
                : 'hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full border-2 ${
                  value === option.value
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/30'
                }`}
              />
              <span className="font-medium text-sm">{option.label}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground pl-5">{option.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
