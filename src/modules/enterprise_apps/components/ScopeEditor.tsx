import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  NEVER_IMPLIED_SCOPES,
  SCOPE_CATALOG,
  SCOPE_LABELS,
  type EnterpriseScope,
} from '../api/contracts'
import { diffScopes, requiresExplicitConfirmation } from '../api/pureFunctions'

export type ScopeEditorProps = {
  /** 当前选中的 scope（受控）。 */
  value: readonly EnterpriseScope[]
  onChange: (_next: EnterpriseScope[]) => void
  /** 权威基线（= 服务端当前值），用于计算「新增/降级」并展示 diff。 */
  baseline: readonly EnterpriseScope[]
  disabled?: boolean
  idPrefix: string
  /** 校验错误（由父组件调用 validateScopeSelection 得到）。 */
  error?: string | null
}

function toggle(list: readonly EnterpriseScope[], scope: EnterpriseScope): EnterpriseScope[] {
  return list.includes(scope) ? list.filter((item) => item !== scope) : [...list, scope]
}

/**
 * scope 授予 / 降级编辑器。
 *
 * 目录来源 = 后端冻结 10 值枚举（contracts.SCOPE_CATALOG），**不含 wildcard**；
 * 三个高危 scope 带显式提示（INV-4：不被 messages:send 隐含）。
 * 变更 diff（新增/降级）实时可见，提交前由父组件做二次确认。
 */
export function ScopeEditor({
  value,
  onChange,
  baseline,
  disabled = false,
  idPrefix,
  error = null,
}: ScopeEditorProps) {
  const diff = useMemo(() => diffScopes(baseline, value), [baseline, value])
  const needsStrongConfirm = useMemo(() => requiresExplicitConfirmation(diff.added), [diff.added])

  return (
    <div className="space-y-3" data-testid="scope-editor">
      <div className="grid gap-2 md:grid-cols-2">
        {SCOPE_CATALOG.map((scope) => {
          const checked = value.includes(scope)
          const risky = NEVER_IMPLIED_SCOPES.includes(scope)
          const id = `${idPrefix}-${scope}`
          return (
            <div key={scope} className="flex items-start gap-2 rounded-md border p-2">
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={() => onChange(toggle(value, scope))}
                aria-label={`授予 scope ${scope}`}
                data-scope={scope}
              />
              <div className="space-y-0.5">
                <Label htmlFor={id} className="font-mono text-xs">
                  {scope}
                </Label>
                <p className="text-xs text-muted-foreground">{SCOPE_LABELS[scope]}</p>
                {risky && (
                  <Badge variant="destructive" data-testid={`scope-risky-${scope}`}>
                    需显式授予（不被 messages:send 隐含）
                  </Badge>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {diff.added.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="scope-diff-added">
          新增：{diff.added.join(', ')}
          {needsStrongConfirm ? '（含高危 scope，提交时会要求二次确认）' : ''}
        </p>
      )}
      {diff.removed.length > 0 && (
        <p className="text-xs text-destructive" data-testid="scope-diff-removed">
          降级移除：{diff.removed.join(', ')}（撤权对下一个请求立即生效）
        </p>
      )}
      {error !== null && (
        <p className="text-xs text-destructive" role="alert" data-testid="scope-error">
          {error}
        </p>
      )}
    </div>
  )
}
