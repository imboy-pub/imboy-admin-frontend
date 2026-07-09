import { useQuery } from '@tanstack/react-query'
import { EntityDrawer } from '@/components/shared'
import { getClientGrants, McpClient } from '@/services/api/mcpGovernance'
import { getErrorMessage } from '@/lib/errorUtils'

interface McpClientGrantsDrawerProps {
  client: McpClient | null
  onClose: () => void
}

function GrantPill({ enabled, label, desc }: { enabled: boolean; label: string; desc?: string }) {
  return (
    <li className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="min-w-0">
        <span className="font-mono text-sm">{label}</span>
        {desc && <p className="truncate text-xs text-muted-foreground">{desc}</p>}
      </div>
      <span
        className={
          enabled
            ? 'shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
            : 'shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
        }
      >
        {enabled ? '已授权' : '未授权'}
      </span>
    </li>
  )
}

export function McpClientGrantsDrawer({ client, onClose }: McpClientGrantsDrawerProps) {
  const open = client !== null
  const { data, isLoading, error } = useQuery({
    queryKey: ['mcp-grants', client?.client_id],
    queryFn: () => getClientGrants(client!.client_id),
    enabled: open,
  })

  return (
    <EntityDrawer
      open={open}
      onOpenChange={(next) => { if (!next) onClose() }}
      title={client?.name ?? 'MCP 客户端'}
      subtitle={client ? `client_id: ${client.client_id}` : undefined}
      loading={isLoading}
      error={error ? getErrorMessage(error) : undefined}
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">授权 Scope</h3>
          {data && data.scopes.length > 0 ? (
            <ul className="space-y-2">
              {data.scopes.map((s) => (
                <GrantPill key={s.scope} enabled={s.enabled} label={s.scope} desc={s.description} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">暂无 scope 授权</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">授权 Tool</h3>
          {data && data.tools.length > 0 ? (
            <ul className="space-y-2">
              {data.tools.map((t) => (
                <GrantPill key={t.name} enabled={t.enabled} label={t.name} desc={t.description} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">暂无 tool 授权</p>
          )}
        </section>
      </div>
    </EntityDrawer>
  )
}
