import { OrganizationWorkspacePicker } from '@/components/shared/OrganizationWorkspacePicker'
import { Label } from '@/components/ui/label'
/**
 * AI 会话与对话记录页（v4 P0-10 / 03-G 页面 3）：会话列表 + turn 详情。
 * 消息来源徽标：turn.action/delivery 由 AI 产生时显示 AI 标记（03-G #6）。
 */
import { useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessagesSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared'
import { getErrorMessage } from '@/lib/errorUtils'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useOrgWorkspaceScope } from './useOrgWorkspaceScope'
import { getAiSessionTurns, getAiSessions, type AiTurn } from '../api/aiAdmin'

type SessionRow = {
  id?: string
  session_id?: string
  status?: string
  current_intent?: string
  unresolved_turns?: number
}

function asSessionRows(payload: Record<string, unknown>): SessionRow[] {
  const rows = (payload.sessions ?? payload.rows ?? []) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: (r.session_id ?? r.id) as string | undefined,
    session_id: (r.session_id ?? r.id) as string | undefined,
    status: r.status as string | undefined,
    current_intent: (r.current_intent ?? r.intent) as string | undefined,
    unresolved_turns: r.unresolved_turns as number | undefined,
  }))
}

/** AI 来源徽标（03-G #6：origin_kind='ai_product' 语义的管理面呈现）。 */
export function AiOriginBadge(): ReactElement {
  return (
    <Badge variant="secondary" className="ml-2">
      AI
    </Badge>
  )
}

export function AiSessionsPage(): ReactElement {
  const scope = useOrgWorkspaceScope()
  const { organizationId } = scope
  const { allowed: canRead, loading: permLoading } = useAdminPermission({
    permission: 'customer_service:read',
  })
  const [selected, setSelected] = useState<string | null>(null)

  const enabled = organizationId != null && canRead && !permLoading
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cs-ai-sessions', organizationId],
    queryFn: () => getAiSessions(organizationId as string, { limit: 100 }),
    enabled,
  })
  const rows = asSessionRows(data ?? {})

  const { data: turns, isLoading: turnsLoading } = useQuery({
    queryKey: ['cs-ai-turns', organizationId, selected],
    queryFn: () => getAiSessionTurns(organizationId as string, selected as string, {}),
    enabled: enabled && selected != null,
  })

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
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessagesSquare className="h-5 w-5" /> AI 会话
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState title="暂无 AI 会话" />
            ) : (
              <ul className="divide-y text-sm">
                {rows.map((s, i) => (
                  <li key={s.session_id ?? String(i)} className="py-2">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setSelected(s.session_id ?? null)}
                    >
                      <span className="font-mono text-xs">
                        {(s.session_id ?? s.id ?? '-').slice(-8)}
                      </span>
                      <Badge variant="outline" className="ml-2">
                        {s.status ?? '-'}
                      </Badge>
                      <span className="ml-2 text-muted-foreground">
                        {s.current_intent ?? '-'} / 未解决 {s.unresolved_turns ?? 0}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>对话记录{selected != null ? '' : '（选择左侧会话）'}</CardTitle>
          </CardHeader>
          <CardContent>
            {selected == null ? (
              <EmptyState title="未选择会话" />
            ) : turnsLoading ? (
              <LoadingState />
            ) : (
              <ul className="space-y-2 text-sm">
                {(turns ?? []).map((t: AiTurn) => (
                  <li key={t.seq} className="border-t pt-2 first:border-0 first:pt-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{t.seq}</span>
                      {t.direction === 'outbound' && <AiOriginBadge />}
                      <Badge variant="outline">{t.action || '-'}</Badge>
                      <span className="text-muted-foreground">{t.intent ?? '-'}</span>
                    </div>
                    {t.reply_text != null && t.reply_text !== '' && (
                      <p className="mt-1 whitespace-pre-wrap">{t.reply_text}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
