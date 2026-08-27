import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FolderKanban, ListTodo, UserCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState, StatusBadge, StatsCard } from '@/components/shared'
import { getProjectDetailPayload, projectDetailQueryKey } from '@/services/api/workspaces'
import { formatDate } from '@/lib/utils'

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: '待办',
  doing: '进行中',
  review: '待评审',
  done: '已完成',
}

/**
 * 项目详情（运营只读；双体验 v2.5.2 WP7/T11b）
 * 展示：基本信息 + workspace 概要 + 任务状态分布 + assignee 概览。
 * W0 无 project member——不展示成员表，Admin 不提供成员读写。
 */
export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projectId = id ?? ''

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: projectDetailQueryKey(projectId),
    queryFn: () => getProjectDetailPayload(projectId),
    enabled: projectId.length > 0,
  })

  if (isLoading) {
    return <LoadingState message="加载项目详情..." />
  }

  if (error || !data) {
    return <ErrorState message="加载项目详情失败" onRetry={() => refetch()} />
  }

  const totalTasks = Object.values(data.task_stats ?? {}).reduce((a, b) => a + b, 0)
  const doneTasks = data.task_stats?.done ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title={`项目「${data.name}」`}
        description={`运营只读视图（ID: ${data.id}）；编辑与状态流转请在用户端完成`}
        actions={
          <Button variant="outline" onClick={() => navigate('/projects')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回列表
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatsCard title="任务总数" value={totalTasks} />
        <StatsCard title="已完成" value={doneTasks} />
        <StatsCard title="assignee 数" value={data.assignees?.length ?? 0} />
        <StatsCard
          title="完成率"
          value={totalTasks > 0 ? `${Math.round((doneTasks / totalTasks) * 100)}%` : '—'}
        />
      </div>

      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderKanban className="h-5 w-5" />
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
                  labels={{ active: '进行中', done: '已完成' }}
                  variants={{ active: 'info', done: 'success' }}
                />
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">所属工作区</dt>
              <dd>
                {data.workspace?.name || '—'}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{data.workspace_id}</span>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">项目 Owner</dt>
              <dd>
                {data.owner?.nickname || data.owner?.account || data.owner_nickname || '—'}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{data.owner_id}</span>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">创建时间</dt>
              <dd>{formatDate(data.created_at)}</dd>
            </div>
            <div className="col-span-full">
              <dt className="text-muted-foreground">描述</dt>
              <dd className="mt-1 whitespace-pre-wrap">{data.description || '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 任务状态分布 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTodo className="h-5 w-5" />
            任务状态分布
          </CardTitle>
          <CardDescription>轻量执行实体：仅 title/assignee/status（todo / doing / review / done）</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['todo', 'doing', 'review', 'done'] as const).map((s) => (
            <div key={s} className="rounded-lg border p-3" data-testid={`task-stat-${s}`}>
              <div className="text-xs text-muted-foreground">{TASK_STATUS_LABELS[s]}</div>
              <div className="mt-1 font-mono text-xl">{data.task_stats?.[s] ?? 0}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* assignee 概览 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-5 w-5" />
            Assignee 概览
          </CardTitle>
          <CardDescription>
            任务负责人聚合（W0 无 project member——assignee 均来自工作区成员；Admin 不提供成员写操作）
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(data.assignees ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无已指派任务</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Assignee ID</th>
                  <th className="pb-2 pr-4 font-medium">昵称</th>
                  <th className="pb-2 pr-4 font-medium">账号</th>
                  <th className="pb-2 font-medium">任务（完成/总数）</th>
                </tr>
              </thead>
              <tbody>
                {(data.assignees ?? []).map((a) => (
                  <tr key={a.assignee_id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{a.assignee_id}</td>
                    <td className="py-2 pr-4">{a.nickname || '—'}</td>
                    <td className="py-2 pr-4">{a.account || '—'}</td>
                    <td className="py-2 font-mono">
                      {a.done} / {a.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
