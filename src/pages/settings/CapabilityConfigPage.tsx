import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Save, Settings2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PageHeader, LoadingState, ErrorState, ConfirmDialog } from '@/components/shared'
import {
  getPolicyEffective,
  savePolicyChange,
  policyQueryKey,
  buildPolicyConfig,
  DEFAULT_CAPABILITIES,
  ENCRYPTION_TIERS,
  deriveEncryptionTier,
  type EncryptionTierId,
  type PolicyConfig,
  type Capabilities,
  type AuditMode,
  type RetentionPolicyMode,
} from '@/services/api/policy'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/errorUtils'

type SelectOption<T extends string> = {
  value: T
  label: string
  description: string
}

// 加密档位选项（label/description 真源在 policy.ts ENCRYPTION_TIERS，
// 本页只负责把它渲染成单选组）。
const ENCRYPTION_TIER_OPTIONS: SelectOption<EncryptionTierId>[] = ENCRYPTION_TIERS.map(
  (tier) => ({ value: tier.id, label: tier.label, description: tier.description }),
)

const AUDIT_MODE_OPTIONS: SelectOption<AuditMode>[] = [
  { value: 'none', label: '关闭', description: '不记录审计数据' },
  { value: 'metadata', label: '元数据', description: '仅记录消息元数据' },
  { value: 'full', label: '完整', description: '记录完整消息内容' },
]

const RETENTION_MODE_OPTIONS: SelectOption<RetentionPolicyMode>[] = [
  { value: 'rolling_days', label: '滚动天数', description: '保留指定天数的数据' },
  { value: 'infinite', label: '永久保留', description: '数据永久保留' },
]

// --- 核心安全能力「档位强度」排序 ---
// 数值越大表示安全能力越强；新值强度 < 旧值强度即视为「降级」。
// 仅对在此明确列出的档位判定，无法判定的值一律不阻断（避免误伤）。
const STORAGE_MODE_RANK: Record<string, number> = {
  disabled: -1, // E2EE 整档关闭（低于明文归档：同时关闭密钥面）
  archived: 0, // 明文归档（最弱）
  compliance_e2ee: 1,
  secure_e2ee: 2, // 端到端加密（最强）
}
const E2EE_MODE_RANK: Record<string, number> = {
  disabled: 0,
  optional: 1,
  compliance: 2,
  required: 3,
}
const AUDIT_MODE_RANK: Record<string, number> = {
  none: 0,
  metadata: 1,
  full: 2,
}

/** 判断 from -> to 是否为「降级」：仅当两端档位均可识别且 to 强度更低时返回 true。 */
function isRankDowngrade(
  rank: Record<string, number>,
  from: string | undefined,
  to: string | undefined
): boolean {
  if (from === undefined || to === undefined) return false
  const fromRank = rank[from]
  const toRank = rank[to]
  if (fromRank === undefined || toRank === undefined) return false
  return toRank < fromRank
}

/** 收集本次变更中削弱核心安全能力的降级项（e2ee_mode / audit_mode / storage_mode）。 */
function collectSecurityDowngrades(
  current: Capabilities,
  pending: Capabilities
): string[] {
  const downgrades: string[] = []
  if (isRankDowngrade(E2EE_MODE_RANK, current.e2ee_mode, pending.e2ee_mode)) {
    downgrades.push('端到端加密模式')
  }
  if (isRankDowngrade(AUDIT_MODE_RANK, current.audit_mode, pending.audit_mode)) {
    downgrades.push('审计模式')
  }
  if (isRankDowngrade(STORAGE_MODE_RANK, current.storage_mode, pending.storage_mode)) {
    downgrades.push('存储模式')
  }
  return downgrades
}

export function CapabilityConfigPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pendingCapabilities, setPendingCapabilities] = useState<Capabilities | null>(null)
  // 降级二次确认：非空数组表示存在削弱核心安全能力的变更，需弹框确认
  const [downgradeConfirm, setDowngradeConfirm] = useState<string[] | null>(null)

  const { data: policyData, isLoading, error, refetch } = useQuery({
    queryKey: policyQueryKey('effective'),
    queryFn: () => getPolicyEffective(),
  })

  const effectiveCapabilities: Capabilities = useMemo(
    () => policyData?.effective?.capabilities ?? {},
    [policyData]
  )
  const displayCapabilities = pendingCapabilities ?? effectiveCapabilities
  const hasChanges = pendingCapabilities !== null

  const capabilityMutation = useMutation({
    mutationFn: (payload: PolicyConfig) => savePolicyChange(payload),
    onSuccess: () => {
      toast.success('能力配置已保存')
      setPendingCapabilities(null)
      queryClient.invalidateQueries({ queryKey: policyQueryKey() })
    },
    onError: (err: unknown) => {
      toast.error(`保存失败: ${getErrorMessage(err)}`)
    },
  })

  const updateField = useCallback(<K extends keyof Capabilities>(key: K, value: Capabilities[K]) => {
    setPendingCapabilities((prev) => {
      const base = prev ?? { ...effectiveCapabilities }
      return { ...base, [key]: value }
    })
  }, [effectiveCapabilities])

  // 加密档位：一次选择同时套用 e2ee_mode + storage_mode（映射真源见 policy.ts
  // ENCRYPTION_TIERS）。两个字段底层保留，客户端契约与审计联动不受影响。
  const displayTier = useMemo(() => deriveEncryptionTier(displayCapabilities), [displayCapabilities])
  const applyTier = useCallback((tierId: EncryptionTierId) => {
    const tier = ENCRYPTION_TIERS.find((t) => t.id === tierId)
    if (!tier) return
    setPendingCapabilities((prev) => {
      const base = prev ?? { ...effectiveCapabilities }
      return { ...base, e2ee_mode: tier.e2eeMode, storage_mode: tier.storageMode }
    })
  }, [effectiveCapabilities])

  const persistCapabilities = useCallback(() => {
    if (!pendingCapabilities) return
    capabilityMutation.mutate(buildPolicyConfig(policyData?.effective, { capabilities: pendingCapabilities }))
  }, [pendingCapabilities, policyData, capabilityMutation])

  const handleSave = useCallback(() => {
    if (!pendingCapabilities) return
    const downgrades = collectSecurityDowngrades(effectiveCapabilities, pendingCapabilities)
    if (downgrades.length > 0) {
      setDowngradeConfirm(downgrades)
      return
    }
    persistCapabilities()
  }, [pendingCapabilities, effectiveCapabilities, persistCapabilities])

  const handleConfirmDowngrade = useCallback(() => {
    setDowngradeConfirm(null)
    persistCapabilities()
  }, [persistCapabilities])

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

      {/* 加密档位：e2ee_mode（客户端加密规矩）+ storage_mode（服务端存储/审计姿态）
          的单一选择入口。两字段底层保留（客户端契约/审计联动不动），对应关系由
          policy.ts ENCRYPTION_TIERS 唯一定义；概念说明见 imboy/docs/concepts/e2ee.md §加密档位。 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-5 w-5" />
            加密档位
          </CardTitle>
          <CardDescription>
            选择一个档位，系统会同时设定客户端加密规矩（e2ee_mode）与服务端存储姿态（storage_mode）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <OptionGroup
            label="加密档位"
            options={ENCRYPTION_TIER_OPTIONS}
            value={(displayTier?.id ?? '') as EncryptionTierId}
            onChange={(id) => applyTier(id)}
          />
          {!displayTier && (displayCapabilities.e2ee_mode || displayCapabilities.storage_mode) && (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              当前为非标准组合（e2ee_mode={displayCapabilities.e2ee_mode ?? '—'} / storage_mode={displayCapabilities.storage_mode ?? '—'}）。
              选择上方任一档位后，两项取值会被同时套用，组合随之标准化。
            </p>
          )}
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

      <ConfirmDialog
        open={downgradeConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDowngradeConfirm(null)
        }}
        title="确认削弱核心安全能力？"
        description={`本次变更将削弱或关闭以下核心安全能力：${(downgradeConfirm ?? []).join('、')}。这可能影响全站加密 / 审计能力，存在合规与数据安全风险。确认继续保存？`}
        confirmText="仍要保存"
        variant="destructive"
        loading={capabilityMutation.isPending}
        onConfirm={handleConfirmDowngrade}
      />
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
  onChange: (_value: T) => void
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
