import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Building2, Users, FolderKanban, UsersRound, Radio } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, LoadingState, ErrorState, StatusBadge, StatsCard } from '@/components/shared'
import {
  getWorkspaceDetailPayload,
  workspaceDetailQueryKey,
  type WorkspaceMemberRow,
  type WorkspaceResourceRow,
} from '@/services/api/workspaces'
import { formatDate } from '@/lib/utils'

/** 工作区成员角色徽标（全称命名：Workspace Members = 工作区成员） */
function MemberRoleBadge({ role }: { role: WorkspaceMemberRow['role'] }) {
  const map: Record<WorkspaceMemberRow['role'], { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    owner: { label: 'Owner', variant: 'default' },
    member: { label: 'Member', variant: 'secondary' },
    guest: { label: 'Guest', variant: 'outline' },
  }
  const { label, variant: badgeVariant } = map[role] ?? { label: role, variant: 'outline' }
  return <Badge variant={badgeVariant}>{label}</Badge>
}

function ResourceTable({
  title,
  icon: Icon,
  rows,
  nameKey,
  countKey,
}: {
  title: string
  icon: typeof Radio
  rows: WorkspaceResourceRow[]
  nameKey: 'name' | 'title'
  countKey?: 'member_count' | 'subscriber_count'
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>归属本工作区的资源清单（前 20 条）</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无数据</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">ID</th>
                <th className="pb-2 pr-4 font-medium">名称</th>
                {countKey && <th className="pb-2 pr-4 font-medium">{countKey === 'member_count' ? '成员数' : '订阅数'}</th>}
                <th className="pb-2 pr-4 font-medium">状态</th>
                <th className="pb-2 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{row.id}</td>
                  <td className="py-2 pr-4">{row[nameKey] ?? '—'}</td>
                  {countKey && <td className="py-2 pr-4 font-mono">{row[countKey] ?? 0}</td>}
                  <td className="py-2 pr-4">{String(row.status)}</td>
                  <td className="py-2 text-muted-foreground">{formatDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * 工作区详情（运营只读 + 生命周期信息）
 * 展示：基本信息 + Branding + 工作区成员（Workspace Members 全称，role 徽标）+ 资源清单。
 */
export function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wsId = id ?? ''

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: workspaceDetailQueryKey(wsId),
    queryFn: () => getWorkspaceDetailPayload(wsId),
    enabled: wsId.length > 0,
  })

  if (isLoading) {
    return <LoadingState message="加载工作区详情..." />
  }

  if (error || !data) {
    return <ErrorState message="加载工作区详情失败" onRetry={() => refetch()} />
  }

  const branding = (data.branding ?? {}) as Record<string, unknown>
  const members = data.members?.items ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title={`工作区「${data.name}」`}
        description={`查看工作区详情、工作区成员与归属资源（ID: ${data.id}）`}
        actions={
          <Button variant="outline" onClick={() => navigate('/workspaces')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回列表
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatsCard title="项目数" value={data.project_count ?? 0} />
        <StatsCard title="群组数" value={data.group_count ?? 0} />
        <StatsCard title="频道数" value={data.channel_count ?? 0} />
        <StatsCard title="工作区成员数" value={data.member_count ?? 0} />
      </div>

      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5" />
            基本信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">状态</dt>
              <dd>
                <StatusBadge
                  status={data.status}
                  labels={{ active: '正常', archived: '已归档' }}
                  variants={{ active: 'success', archived: 'warning' }}
                />
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">主 Owner</dt>
              <dd>
                {data.owner_nickname || data.owner_account || '—'}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{data.owner_id}</span>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">创建时间</dt>
              <dd>{formatDate(data.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">归档时间</dt>
              <dd>{data.archived_at ? formatDate(data.archived_at) : '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Branding（只读展示） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branding（Workspace 视图作用域）</CardTitle>
          <CardDescription>仅在该工作区视图内生效；离开即还原</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">名称</span>
            <span>{String(branding.name ?? data.name)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Logo</span>
            <span className="truncate">{String(branding.logo ?? '—') || '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">主色</span>
            <span className="font-mono">{String(branding.primaryColor ?? '—')}</span>
          </div>
        </CardContent>
      </Card>

      {/* 工作区成员 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            工作区成员
          </CardTitle>
          <CardDescription>
            工作区成员（Workspace Members）：Owner / Member / Guest 三角色；Group Member 与
            Channel Subscriber 均来自工作区成员
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无工作区成员</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">用户 ID</th>
                  <th className="pb-2 pr-4 font-medium">昵称</th>
                  <th className="pb-2 pr-4 font-medium">账号</th>
                  <th className="pb-2 pr-4 font-medium">角色</th>
                  <th className="pb-2 font-medium">加入时间</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{m.user_id}</td>
                    <td className="py-2 pr-4">{m.nickname || '—'}</td>
                    <td className="py-2 pr-4">{m.account || '—'}</td>
                    <td className="py-2 pr-4">
                      <MemberRoleBadge role={m.role} />
                    </td>
                    <td className="py-2 text-muted-foreground">{formatDate(m.joined_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* 资源清单 */}
      <ResourceTable
        title="项目"
        icon={FolderKanban}
        rows={data.projects ?? []}
        nameKey="name"
      />
      <ResourceTable
        title="工作区群组"
        icon={UsersRound}
        rows={data.groups ?? []}
        nameKey="title"
        countKey="member_count"
      />
      <ResourceTable
        title="工作区频道"
        icon={Radio}
        rows={data.channels ?? []}
        nameKey="name"
        countKey="subscriber_count"
      />
    </div>
  )
}
