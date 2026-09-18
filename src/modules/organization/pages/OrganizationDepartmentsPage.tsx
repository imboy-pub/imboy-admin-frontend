import { useMemo, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FolderTree } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ConfirmDialog, EmptyState, ErrorState, PageHeader } from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import {
  archiveDepartment,
  createDepartment,
  getOrganizationDetail,
  listDepartments,
  moveDepartment,
  renameDepartment,
} from '../api/public'
import {
  buildDepartmentTree,
  classifyOrgError,
  descendantIdsOf,
  isOrgWriteAllowed,
  suggestRefreshForCasMutation,
  type DepartmentRow,
  type DepartmentTreeNode,
} from '../api/pureFunctions'

const READ_PERMISSION = 'organizations:read'
const WRITE_PERMISSION = 'organizations:write'

type ListState = {
  status: string
}

function parseDeptStatusFilter(value: string): 'all' | 'active' | 'archived' {
  return value === 'active' || value === 'archived' ? value : 'all'
}

/**
 * 部门管理页（ORG-14 → ORG-ADMIN-ADM-WIRING 平台面，Core Contract C10/C15）。
 *
 * 契约（/api/adm/organizations/:id/departments）：GET 目录（read）+ POST 创建 /
 * :department_id/rename / move / archive（write）。rename/move 走 expected_version
 * CAS（409 = 版本/层级/归档冲突，提示刷新）；move body 的 parent_id=null 表示提为根；
 * archive 原子归档全部 active 后代（纯目录状态，不级联撤销任何权限）。
 *
 * 平台面合同未提供部门成员挂载域（列表 / 挂载 / 卸载 / 设部门管理员）——
 * 相应面板已随 App 面（v1）迁移移除；department_admin 局部目录角色不在 adm 面。
 */
export function OrganizationDepartmentsPage() {
  const params = useParams<{ organizationId: string }>()
  const organizationId = params.organizationId ?? ''
  const queryClient = useQueryClient()
  const { state, setState } = useListQueryState<ListState>({ status: 'all' })
  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createParent, setCreateParent] = useState('')
  const [renameTarget, setRenameTarget] = useState<DepartmentRow | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [moveTarget, setMoveTarget] = useState<DepartmentRow | null>(null)
  const [moveParent, setMoveParent] = useState('')
  const [archiveTarget, setArchiveTarget] = useState<DepartmentRow | null>(null)

  const detailQuery = useQuery({
    queryKey: ['organization', 'detail', organizationId],
    queryFn: () => getOrganizationDetail(organizationId),
    enabled: readReady && organizationId.length > 0,
  })

  const org = detailQuery.data
  const archived = org?.status === 'archived'
  const writeGate = canWrite && isOrgWriteAllowed(org?.status ?? 'unknown', 'update')

  const statusFilter = parseDeptStatusFilter(state.status)
  const departmentsQuery = useQuery({
    queryKey: ['organization', 'departments', organizationId, statusFilter],
    queryFn: () => listDepartments(organizationId, statusFilter),
    enabled: readReady && organizationId.length > 0 && detailQuery.isSuccess,
  })

  const rows = useMemo(() => departmentsQuery.data ?? [], [departmentsQuery.data])
  const tree = useMemo(() => buildDepartmentTree(rows), [rows])

  const invalidateDepartments = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', 'departments', organizationId] })
  }

  const conflictToast = (err: unknown) => {
    const failure = classifyOrgError(err)
    toast.error(failure.message, {
      action: failure.suggestRefresh
        ? {
            label: '刷新目录',
            onClick: () => void departmentsQuery.refetch(),
          }
        : undefined,
    })
  }

  /**
   * CAS mutation（rename/move 带 expected_version）专用失败提示：任何失败形态
   * （409 层级/归档冲突，或后端把版本冲突兜底映射成的 400）都提供「刷新目录」
   * 入口——重取服务端最新 version 后重试，失败如实呈现、不伪成功。
   */
  const casConflictToast = (err: unknown) => {
    const failure = classifyOrgError(err)
    toast.error(failure.message, {
      action: suggestRefreshForCasMutation(failure.kind)
        ? {
            label: '刷新目录',
            onClick: () => void departmentsQuery.refetch(),
          }
        : undefined,
    })
  }

  const createMutation = useMutation({
    mutationFn: () => createDepartment(organizationId, createName.trim(), createParent === '' ? null : createParent),
    onSuccess: (dept) => {
      toast.success(`部门「${dept.name}」已创建${dept.parentId ? '（挂载到选中父部门）' : '（根部门）'}`)
      setCreateOpen(false)
      setCreateName('')
      setCreateParent('')
      invalidateDepartments()
    },
    onError: conflictToast,
  })

  const renameMutation = useMutation({
    mutationFn: () => {
      if (!renameTarget) throw new Error('缺少目标部门')
      return renameDepartment(organizationId, renameTarget.id, renameValue.trim(), renameTarget.version)
    },
    onSuccess: (dept) => {
      toast.success(`部门已更名为「${dept.name}」`)
      setRenameTarget(null)
      invalidateDepartments()
    },
    onError: casConflictToast,
  })

  const moveMutation = useMutation({
    mutationFn: () => {
      if (!moveTarget) throw new Error('缺少目标部门')
      return moveDepartment(organizationId, moveTarget.id, moveParent === '' ? null : moveParent, moveTarget.version)
    },
    onSuccess: (dept) => {
      toast.success(`部门「${dept.name}」已移动（parent_id = ${dept.parentId ?? 'null（根）'}）`)
      setMoveTarget(null)
      invalidateDepartments()
    },
    onError: casConflictToast,
  })

  const archiveMutation = useMutation({
    mutationFn: (deptId: string) => archiveDepartment(organizationId, deptId),
    onSuccess: (dept) => {
      toast.success(`部门「${dept.name}」已归档（含全部 active 后代；纯目录状态，不撤销任何权限）`)
      setArchiveTarget(null)
      invalidateDepartments()
    },
    onError: conflictToast,
  })

  const activeParents = useMemo(() => rows.filter((row) => row.status === 'active'), [rows])

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderNode = (node: DepartmentTreeNode): ReactElement => (
    <li key={node.id} role="treeitem" aria-expanded={node.children.length > 0 ? !collapsed.has(node.id) : undefined}>
      <div className="flex items-center gap-1 rounded px-1 py-0.5">
        {node.children.length > 0 ? (
          <button type="button" className="text-muted-foreground" aria-label={collapsed.has(node.id) ? '展开' : '折叠'} onClick={() => toggleCollapse(node.id)}>
            {collapsed.has(node.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-block w-3.5" />
        )}
        <span className="flex items-center gap-1.5 rounded px-0.5 py-0.5 text-left text-sm">
          <span className="font-mono text-xs text-muted-foreground">{node.id}</span>
          <span>{node.name}</span>
          {node.status === 'archived' ? <Badge variant="destructive">已归档</Badge> : null}
          <span className="text-[10px] text-muted-foreground">v{node.version}</span>
        </span>
        {writeGate && node.status === 'active' ? (
          <span className="ml-1 flex items-center gap-0.5 opacity-80">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => {
                setRenameTarget(node)
                setRenameValue(node.name)
              }}
            >
              改名
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => {
                setMoveTarget(node)
                setMoveParent(node.parentId ?? '')
              }}
            >
              移动
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-destructive"
              data-testid="dept-archive-btn"
              onClick={() => setArchiveTarget(node)}
            >
              归档
            </Button>
          </span>
        ) : null}
      </div>
      {collapsed.has(node.id) ? null : node.children.length > 0 ? <ul>{node.children.map(renderNode)}</ul> : null}
    </li>
  )

  let body: ReactElement
  if (!readReady) {
    body = <EmptyState title="无查看权限" description={`进入组织治理面板需要 ${READ_PERMISSION} 权限。`} />
  } else if (detailQuery.error) {
    body = <ErrorState message={classifyOrgError(detailQuery.error).message} onRetry={() => void detailQuery.refetch()} />
  } else if (!detailQuery.isSuccess) {
    body = <EmptyState title="加载中…" description="正在读取组织事实。" />
  } else if (departmentsQuery.error) {
    body = <ErrorState message={classifyOrgError(departmentsQuery.error).message} onRetry={() => void departmentsQuery.refetch()} />
  } else {
    body =
      tree.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="h-8 w-8" />}
          title="暂无部门"
          description="创建第一个部门开始搭建组织目录（根部门 parent 为空）。"
        />
      ) : (
        <ul role="tree" className="space-y-0.5" data-testid="department-tree">
          {tree.map(renderNode)}
        </ul>
      )
  }

  return (
    <div className="space-y-4" data-page="organization-departments">
      <PageHeader
        title="部门管理"
        description="树形组织目录（C10）：部门是目录事实，不是权限边界；平台面只治理目录结构（创建 / 改名 / 移动 / 归档）。"
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            部门目录
            {org ? <span className="ml-2 text-xs font-normal text-muted-foreground">{org.name}</span> : null}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              aria-label="部门状态过滤"
              className="h-8 w-32 text-xs"
              value={state.status}
              onChange={(event) => setState({ status: event.target.value })}
            >
              <option value="all">全部</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </Select>
            {writeGate ? (
              <Button size="sm" data-testid="dept-create-btn" onClick={() => setCreateOpen(true)}>
                创建部门
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {archived ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800" data-testid="departments-archived-hint">
              组织已归档：部门写操作被服务端拒绝（409，C16 fail-closed）。
            </p>
          ) : null}
          {body}
          <p className="text-xs text-muted-foreground">
            改名 / 移动走 expected_version 乐观锁：并发修改会被服务端拒绝（层级/归档冲突 409；版本冲突经后端错误表兜底映射为
            400「请求参数非法」）。点击失败提示中的「刷新目录」取回服务端最新事实后重试。
            部门成员挂载域（成员列表 / 挂载 / 卸载 / 部门管理员）不在 adm 面合同内，请在 App 面操作。
            <Link className="ml-1 underline" to={`/organizations/${encodeURIComponent(organizationId)}`}>
              返回组织详情
            </Link>
          </p>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建部门</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dept-create-name">部门名称</Label>
              <Input id="dept-create-name" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="例如：研发部" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept-create-parent">父部门（可选；留空 = 根部门）</Label>
              <Select id="dept-create-parent" value={createParent} onChange={(event) => setCreateParent(event.target.value)}>
                <option value="">（根部门）</option>
                {activeParents.map((row) => (
                  <option key={row.id} value={row.id}>
                    {'　'.repeat(Math.min(rowDepth(rows, row.id), 6))}
                    {row.name}（{row.id}）
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              取消
            </Button>
            <Button
              data-testid="dept-create-submit"
              disabled={createMutation.isPending || createName.trim().length === 0}
              onClick={() => createMutation.mutate()}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget != null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>部门改名（expected_version = {renameTarget?.version ?? '-'}）</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dept-rename-input">新名称</Label>
            <Input id="dept-rename-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
            <p className="text-xs text-muted-foreground">
              以当前版本号 {renameTarget?.version ?? '-'} 提交 CAS；他人已改动时请求会被服务端拒绝（版本冲突经后端错误表兜底映射为
              400「请求参数非法」，层级/归档冲突为 409）。失败请点击提示中的「刷新目录」取回最新版本后重试。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)} disabled={renameMutation.isPending}>
              取消
            </Button>
            <Button disabled={renameMutation.isPending || renameValue.trim().length === 0} onClick={() => renameMutation.mutate()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={moveTarget != null}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移动部门「{moveTarget?.name ?? ''}」（expected_version = {moveTarget?.version ?? '-'}）</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dept-move-parent">目标父部门</Label>
            <Select id="dept-move-parent" value={moveParent} onChange={(event) => setMoveParent(event.target.value)}>
              <option value="">（提升为根：parent_id = null）</option>
              {activeParents
                .filter((row) => {
                  if (!moveTarget) return false
                  // 不能选自己或自己的后代（服务端成环守卫的前端镜像）
                  return row.id !== moveTarget.id && !descendantIdsOf(rows, moveTarget.id).includes(row.id)
                })
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}（{row.id}）
                  </option>
                ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              移动会原子校验层级（成环 / 目标父已归档 → 409；版本冲突经后端错误表兜底映射为 400）。任何失败点击提示中的「刷新目录」取回服务端事实后重试。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)} disabled={moveMutation.isPending}>
              取消
            </Button>
            <Button disabled={moveMutation.isPending} data-testid="dept-move-submit" onClick={() => moveMutation.mutate()}>
              移动
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={archiveTarget != null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null)
        }}
        title={`归档部门「${archiveTarget?.name ?? ''}」`}
        description={`归档是纯目录状态变更：自身与全部 active 后代（${
          archiveTarget ? descendantIdsOf(rows, archiveTarget.id).length : 0
        } 个子部门）原子归档；不级联撤销任何组织 / Workspace 权限，不动成员行。已归档部门禁新写。确认归档？`}
        confirmText="确认归档"
        variant="destructive"
        loading={archiveMutation.isPending}
        onConfirm={async () => {
          if (archiveTarget) await archiveMutation.mutateAsync(archiveTarget.id)
        }}
      />
    </div>
  )
}

function rowDepth(rows: DepartmentRow[], id: string): number {
  const byId = new Map(rows.map((row) => [row.id, row]))
  let depth = 0
  let cursor = byId.get(id)
  const seen = new Set<string>([id])
  while (cursor && cursor.parentId != null && !seen.has(cursor.parentId)) {
    seen.add(cursor.parentId)
    cursor = byId.get(cursor.parentId)
    depth += 1
    if (depth > 32) break
  }
  return depth
}
