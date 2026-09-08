import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import {
  fetchMcpPending,
  fetchDeadDeliveries,
  fetchBotCount,
} from '@/modules/agent-hub/api'

interface SignalCard {
  label: string
  value: number | null
  to: string
  loading: boolean
  error: unknown
}

function SignalCardView({ card }: { card: SignalCard }) {
  if (card.loading) return <Card><CardContent className="p-6">加载中…</CardContent></Card>
  if (card.error) return <Card><CardContent className="p-6">加载失败</CardContent></Card>
  return (
    <Card>
      <CardHeader>
        <Link to={card.to} className="text-sm text-muted-foreground hover:underline">
          {card.label}
        </Link>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold" data-testid={`signal-value`}>
          {card.value ?? '-'}
        </div>
      </CardContent>
    </Card>
  )
}

/** AI 协作总览：聚合 Agent/MCP/Bot/交付 的可操作信号（ADM-01-A01）。 */
export function AiHubOverviewPage() {
  const { allowed: canRead } = useAdminPermission({
    permission: 'mcp_clients:approve',
    roles: ['1', '2'],
  })

  const mcp = useQuery({ queryKey: ['aihub', 'mcp-pending'], queryFn: fetchMcpPending })
  const dead = useQuery({ queryKey: ['aihub', 'dead-deliveries'], queryFn: fetchDeadDeliveries })
  const bots = useQuery({ queryKey: ['aihub', 'bots'], queryFn: fetchBotCount })

  if (!canRead) {
    return <ErrorState message="无访问权限" />
  }
  if (mcp.isLoading || dead.isLoading || bots.isLoading) {
    return <LoadingState />
  }
  if (mcp.error || dead.error || bots.error) {
    return <ErrorState message="信号加载失败" />
  }

  const cards: SignalCard[] = [
    { label: '待批 MCP Client', value: mcp.data ?? 0, to: '/mcp-governance', loading: false, error: false },
    { label: '死信交付', value: dead.data ?? 0, to: '/ai-hub/deliveries', loading: false, error: false },
    { label: 'Bot 数量', value: bots.data ?? 0, to: '/bots', loading: false, error: false },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="AI 协作总览" description="Agent / MCP / Bot / 交付 信号一览" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="aihub-signals">
        {cards.map((c) => (
          <SignalCardView key={c.label} card={c} />
        ))}
      </div>
    </div>
  )
}

export default AiHubOverviewPage
