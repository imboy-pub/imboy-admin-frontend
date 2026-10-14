import { OrganizationWorkspacePicker } from '@/components/shared/OrganizationWorkspacePicker'
/**
 * AI 客服配置页（v4 P0-10 / 03-G 页面 1）。
 * G-1：权限 fail-closed（useAdminPermission）；G-2：无硬编码菜单。
 */
import { useEffect, useState, type ReactElement } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared'
import { getErrorMessage } from '@/lib/errorUtils'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useOrgWorkspaceScope } from './useOrgWorkspaceScope'
import { getAiConfig, setAiConfig, type AiAutoReplyMode, type AiConfig } from '../api/aiAdmin'

const MODES: AiAutoReplyMode[] = ['disabled', 'observe', 'canary', 'enabled']

export function AiConfigPage(): ReactElement {
  const scope = useOrgWorkspaceScope()
  const { organizationId } = scope
  const { allowed: canRead, loading: permLoading } = useAdminPermission({
    permission: 'customer_service:read',
  })
  const { allowed: canWrite } = useAdminPermission({ permission: 'customer_service:write' })
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Partial<AiConfig>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const enabled = organizationId != null && canRead && !permLoading
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cs-ai-config', organizationId],
    queryFn: () => getAiConfig(organizationId as string),
    enabled,
  })

  useEffect(() => {
    if (data) setDraft(data)
  }, [data])

  if (!permLoading && !canRead) {
    return <EmptyState title="无权限" description="缺少 customer_service:read 权限。" />
  }
  if (permLoading || (enabled && isLoading)) return <LoadingState />
  if (isError) return <ErrorState message={getErrorMessage(error)} />

  return (
    <div className="space-y-4 p-4">
            <div className="space-y-1.5">
        <Label>组织 / 工作区</Label>
        <OrganizationWorkspacePicker
          organizationId={scope.organizationId}
          workspaceId={scope.workspaceId}
          organizations={scope.organizations}
          workspaces={scope.workspaces}
          loading={scope.loading}
          onChange={scope.onChange}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI 客服配置
          </CardTitle>
          <CardDescription>
            {data?.configured
              ? `配置版本 v${data.config_version ?? '-'}`
              : '该企业尚未配置（保存后创建）'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ai-name">名称</Label>
              <Input
                id="ai-name"
                value={draft.name ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                disabled={!canWrite}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-mode">自动应答模式</Label>
              <select
                id="ai-mode"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={draft.auto_reply_mode ?? 'disabled'}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, auto_reply_mode: e.target.value as AiAutoReplyMode }))
                }
                disabled={!canWrite}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-provider">Provider</Label>
              <Input
                id="ai-provider"
                value={draft.provider ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, provider: e.target.value }))}
                disabled={!canWrite}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-model">Model</Label>
              <Input
                id="ai-model"
                value={draft.model ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                disabled={!canWrite}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-max-unresolved">未解决轮数上限</Label>
              <Input
                id="ai-max-unresolved"
                type="number"
                value={draft.max_unresolved_turns ?? 2}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, max_unresolved_turns: Number(e.target.value) }))
                }
                disabled={!canWrite}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="ai-require-hit"
                type="checkbox"
                checked={draft.faq_require_hit ?? true}
                onChange={(e) => setDraft((d) => ({ ...d, faq_require_hit: e.target.checked }))}
                disabled={!canWrite}
              />
              <Label htmlFor="ai-require-hit">必须有 FAQ 引用才自动应答（faq_require_hit）</Label>
            </div>
          </div>
          {saveError != null && <p className="text-sm text-red-600">{saveError}</p>}
          {saved && <p className="text-sm text-green-600">已保存</p>}
          <Button
            disabled={!canWrite || saving || organizationId == null}
            onClick={async () => {
              if (organizationId == null) return
              setSaving(true)
              setSaveError(null)
              setSaved(false)
              try {
                const next = await setAiConfig(organizationId, draft)
                setDraft(next)
                setSaved(true)
                await queryClient.invalidateQueries({ queryKey: ['cs-ai-config', organizationId] })
              } catch (e) {
                setSaveError(getErrorMessage(e))
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? '保存中…' : '保存'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
