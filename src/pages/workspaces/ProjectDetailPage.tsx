import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  FolderKanban,
  ListTodo,
  UserCheck,
  Users,
  Flag,
  Radio,
  Layers,
  ShieldAlert,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader, LoadingState, ErrorState, StatusBadge, StatsCard, EmptyState, DataTablePagination } from '@/components/shared'
import {
  getProjectDetailPayload,
  projectDetailQueryKey,
  getProjectMembersPayload,
  projectMembersQueryKey,
  getProjectMilestonesPayload,
  projectMilestonesQueryKey,
  getProjectChannelsPayload,
  projectChannelsQueryKey,
  getProjectAggregationsPayload,
  projectAggregationsQueryKey,
  isForbiddenError,
  type ProjectAggregationType,
  type ProjectMilestoneStatusFilter,
} from '@/services/api/workspaces'
import { formatDate } from '@/lib/utils'
import { Select } from '@/components/ui/select'

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: '待办',
  doing: '进行中',
  review: '待评审',
  done: '已完成',
}

const PAGE_SIZE = 10

/** 面板 403 fail-closed 态：明确无权限文案 + 重试入口（不白屏） */
function ForbiddenPanel({
  message,
  retryTestId,
  onRetry,
}: {
  message: string
  retryTestId: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <ShieldAlert className="h-12 w-12 text-destructive" />
      <p className="mt-4 text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" data-testid={retryTestId} onClick={onRetry} className="mt-4">
        重试
      </Button>
    </div>
  )
}

/**
 * 治理面板骨架：loading / error（含 403）/ empty 三态 + 服务端分页。
 * 列表本体由 children 提供（只读，无写操作按钮）。
 */
function GovernancePanelFrame({
  loading,
  error,
  onRetry,
  loadingText,
  errorText,
  forbiddenText,
  forbiddenRetryTestId,
  emptyText,
  isEmpty,
  pagination,
  children,
}: {
  loading: boolean
  error: unknown
  onRetry: () => void
  loadingText: string
  errorText: string
  forbiddenText: string
  forbiddenRetryTestId: string
  emptyText: string
  isEmpty: boolean
  pagination?: {
    page: number
    pageSize: number
    total: number
    dataUpdatedAt: number
    onPageChange: (_page: number) => void
    onPageSizeChange: (_size: number) => void
    onRefresh: () => void
  }
  children: React.ReactNode
}) {
  if (loading) {
    return <LoadingState message={loadingText} />
  }

  if (error) {
    if (isForbiddenError(error)) {
      return (
        <ForbiddenPanel message={forbiddenText} retryTestId={forbiddenRetryTestId} onRetry={onRetry} />
      )
    }
    return <ErrorState message={errorText} onRetry={onRetry} />
  }

  if (isEmpty) {
    return <EmptyState title={emptyText} description="后端未返回任何记录" />
  }

  return (
    <div className="space-y-2">
      {children}
      {pagination && (
        <DataTablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          dataUpdatedAt={pagination.dataUpdatedAt}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
          onRefresh={pagination.onRefresh}
        />
      )}
    </div>
  )
}

/** 项目成员（只读分页） */
function ProjectMembersPanel({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(PAGE_SIZE)

  const params = { page, size }
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: projectMembersQueryKey(projectId, params),
    queryFn: () => getProjectMembersPayload(projectId, params),
    enabled: projectId.length > 0,
    placeholderData: (prev) => prev,
  })

  const rows = data?.items ?? []

  return (
    <GovernancePanelFrame
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      loadingText="加载项目成员..."
      errorText="加载项目成员失败"
      forbiddenText="暂无权限查看项目成员（workspaces:read）"
      forbiddenRetryTestId="members-forbidden-retry"
      emptyText="暂无项目成员"
      isEmpty={rows.length === 0}
      pagination={
        data
          ? {
              page: data.page,
              pageSize: data.size,
              total: data.total,
              dataUpdatedAt,
              onPageChange: setPage,
              onPageSizeChange: (s) => {
                setPage(1)
                setSize(s)
              },
              onRefresh: () => refetch(),
            }
          : undefined
      }
    >
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
          {rows.map((m) => (
            <tr key={m.user_id} className="border-b last:border-0">
              <td className="py-2 pr-4 font-mono text-xs">{m.user_id}</td>
              <td className="py-2 pr-4">{m.nickname || '—'}</td>
              <td className="py-2 pr-4">{m.account || '—'}</td>
              <td className="py-2 pr-4 font-mono text-xs">{m.role ?? '—'}</td>
              <td className="py-2 text-muted-foreground">{m.joined_at ? formatDate(m.joined_at) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GovernancePanelFrame>
  )
}

/** 项目里程碑（只读分页；status 筛选变化时 page 复位 1） */
function ProjectMilestonesPanel({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(PAGE_SIZE)
  const [status, setStatus] = useState<ProjectMilestoneStatusFilter>('all')

  const params = { page, size, status }
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: projectMilestonesQueryKey(projectId, params),
    queryFn: () => getProjectMilestonesPayload(projectId, params),
    enabled: projectId.length > 0,
    placeholderData: (prev) => prev,
  })

  const rows = data?.items ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">状态</span>
        <Select
          data-testid="milestone-status-filter"
          className="h-8 min-w-32 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => {
            // 筛选变化 → page 复位 1
            setStatus(e.target.value as ProjectMilestoneStatusFilter)
            setPage(1)
          }}
        >
          <option value="all">全部</option>
          <option value="planned">未达成</option>
          <option value="reached">已达成</option>
        </Select>
      </div>
      <GovernancePanelFrame
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        loadingText="加载里程碑..."
        errorText="加载里程碑失败"
        forbiddenText="暂无权限查看里程碑（workspaces:read）"
        forbiddenRetryTestId="milestones-forbidden-retry"
        emptyText="暂无里程碑"
        isEmpty={rows.length === 0}
        pagination={
          data
            ? {
                page: data.page,
                pageSize: data.size,
                total: data.total,
                dataUpdatedAt,
                onPageChange: setPage,
                onPageSizeChange: (s) => {
                  setPage(1)
                  setSize(s)
                },
                onRefresh: () => refetch(),
              }
            : undefined
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">ID</th>
              <th className="pb-2 pr-4 font-medium">名称</th>
              <th className="pb-2 pr-4 font-medium">状态</th>
              <th className="pb-2 pr-4 font-medium">计划时间</th>
              <th className="pb-2 font-medium">达成时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-2 pr-4 font-mono text-xs">{m.id}</td>
                <td className="py-2 pr-4">{m.name || m.title || '—'}</td>
                <td className="py-2 pr-4">
                  <StatusBadge
                    status={m.status}
                    labels={{ planned: '未达成', reached: '已达成' }}
                    variants={{ planned: 'info', reached: 'success' }}
                  />
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {m.planned_at ? formatDate(m.planned_at) : '—'}
                </td>
                <td className="py-2 text-muted-foreground">
                  {m.reached_at ? formatDate(m.reached_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GovernancePanelFrame>
    </div>
  )
}

/** 项目关联频道（只读分页） */
function ProjectChannelsPanel({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(PAGE_SIZE)

  const params = { page, size }
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: projectChannelsQueryKey(projectId, params),
    queryFn: () => getProjectChannelsPayload(projectId, params),
    enabled: projectId.length > 0,
    placeholderData: (prev) => prev,
  })

  const rows = data?.items ?? []

  return (
    <GovernancePanelFrame
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      loadingText="加载关联频道..."
      errorText="加载关联频道失败"
      forbiddenText="暂无权限查看关联频道（workspaces:read）"
      forbiddenRetryTestId="channels-forbidden-retry"
      emptyText="暂无关联频道"
      isEmpty={rows.length === 0}
      pagination={
        data
          ? {
              page: data.page,
              pageSize: data.size,
              total: data.total,
              dataUpdatedAt,
              onPageChange: setPage,
              onPageSizeChange: (s) => {
                setPage(1)
                setSize(s)
              },
              onRefresh: () => refetch(),
            }
          : undefined
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">频道 ID</th>
            <th className="pb-2 pr-4 font-medium">名称</th>
            <th className="pb-2 pr-4 font-medium">订阅数</th>
            <th className="pb-2 font-medium">创建时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b last:border-0">
              <td className="py-2 pr-4 font-mono text-xs">{c.id}</td>
              <td className="py-2 pr-4">{c.name || '—'}</td>
              <td className="py-2 pr-4 font-mono">{c.subscriber_count ?? 0}</td>
              <td className="py-2 text-muted-foreground">{c.created_at ? formatDate(c.created_at) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GovernancePanelFrame>
  )
}

const AGGREGATION_TYPE_LABELS: Record<ProjectAggregationType, string> = {
  pinned: '置顶',
  resources: '资源',
  activity: '动态',
  related_posts: '关联帖子',
}

/** 项目聚合（只读分页；type 筛选变化时 page 复位 1） */
function ProjectAggregationsPanel({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(PAGE_SIZE)
  const [type, setType] = useState<ProjectAggregationType>('pinned')

  const params = { page, size, type }
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: projectAggregationsQueryKey(projectId, params),
    queryFn: () => getProjectAggregationsPayload(projectId, params),
    enabled: projectId.length > 0,
    placeholderData: (prev) => prev,
  })

  const rows = data?.items ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">类型</span>
        <Select
          data-testid="aggregation-type-filter"
          className="h-8 min-w-32 rounded-md border border-input bg-background px-3 text-sm"
          value={type}
          onChange={(e) => {
            // 类型切换 → page 复位 1
            setType(e.target.value as ProjectAggregationType)
            setPage(1)
          }}
        >
          {(Object.keys(AGGREGATION_TYPE_LABELS) as ProjectAggregationType[]).map((t) => (
            <option key={t} value={t}>
              {AGGREGATION_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </div>
      <GovernancePanelFrame
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        loadingText="加载聚合记录..."
        errorText="加载聚合记录失败"
        forbiddenText="暂无权限查看聚合记录（workspaces:read）"
        forbiddenRetryTestId="aggregations-forbidden-retry"
        emptyText="暂无聚合记录"
        isEmpty={rows.length === 0}
        pagination={
          data
            ? {
                page: data.page,
                pageSize: data.size,
                total: data.total,
                dataUpdatedAt,
                onPageChange: setPage,
                onPageSizeChange: (s) => {
                  setPage(1)
                  setSize(s)
                },
                onRefresh: () => refetch(),
              }
            : undefined
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">ID</th>
              <th className="pb-2 pr-4 font-medium">类型</th>
              <th className="pb-2 pr-4 font-medium">标题</th>
              <th className="pb-2 pr-4 font-medium">关联对象</th>
              <th className="pb-2 font-medium">时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="py-2 pr-4 font-mono text-xs">{row.id}</td>
                <td className="py-2 pr-4">{AGGREGATION_TYPE_LABELS[row.type] ?? row.type}</td>
                <td className="py-2 pr-4">{row.title || '—'}</td>
                <td className="py-2 pr-4 font-mono text-xs">{row.target_id ?? '—'}</td>
                <td className="py-2 text-muted-foreground">{row.created_at ? formatDate(row.created_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GovernancePanelFrame>
    </div>
  )
}

/**
 * 项目详情（运营只读；双体验 v2.5.2 WP7/T11b + W2 治理面 ZC-07）
 * 概览：基本信息 + workspace 概要 + 任务状态分布 + assignee 概览。
 * W2 治理（只读）：项目成员 / 里程碑 / 关联频道 / 四类聚合。
 * 后端 Admin API 本轮只读——无成员移除等写入口（后端端点未冻结，不渲染假按钮）。
 */
export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projectId = id ?? ''
  const [activeTab, setActiveTab] = useState('members')

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
            任务负责人聚合（assignee 均来自工作区成员；治理写操作待后端端点冻结后开放）
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

      {/* W2 治理面（只读） */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="members">
            <Users className="mr-1 h-4 w-4" />
            成员
          </TabsTrigger>
          <TabsTrigger value="milestones">
            <Flag className="mr-1 h-4 w-4" />
            里程碑
          </TabsTrigger>
          <TabsTrigger value="channels">
            <Radio className="mr-1 h-4 w-4" />
            频道
          </TabsTrigger>
          <TabsTrigger value="aggregations">
            <Layers className="mr-1 h-4 w-4" />
            聚合
          </TabsTrigger>
        </TabsList>
        <TabsContent value="members">
          <ProjectMembersPanel projectId={projectId} />
        </TabsContent>
        <TabsContent value="milestones">
          <ProjectMilestonesPanel projectId={projectId} />
        </TabsContent>
        <TabsContent value="channels">
          <ProjectChannelsPanel projectId={projectId} />
        </TabsContent>
        <TabsContent value="aggregations">
          <ProjectAggregationsPanel projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
