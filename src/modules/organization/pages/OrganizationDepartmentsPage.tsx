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
  addDepartmentMember,
  archiveDepartment,
  createDepartment,
  getOrganizationDetail,
  listDepartmentMembers,
  listDepartments,
  moveDepartment,
  removeDepartmentMember,
  renameDepartment,
  setDepartmentMemberAdmin,
} from '../api/public'
import {
  buildDepartmentTree,
  canWriteDepartments,
  classifyOrgError,
  descendantIdsOf,
  departmentStatusLabel,
  isOrgWriteAllowed,
  orgRoleLabel,
  suggestRefreshForCasMutation,
  type DepartmentRow,
  type DepartmentTreeNode,
} from '../api/pureFunctions'

const READ_PERMISSION = 'workspaces:read'

type ListState = {
  status: string
}

function parseDeptStatusFilter(value: string): 'all' | 'active' | 'archived' {
  return value === 'active' || value === 'archived' ? value : 'all'
}

/**
 * 部门管理页（ORG-14，Core Contract C10/C15）。
 *
 * 契约：GET/POST /organizations/:id/departments（写基线 = 本 Org active 成员）；
 * PATCH 改名与 POST move 均走 expected_version CAS（409 = 版本/层级冲突，提示刷新）；
 * move body 的 parent_id=null 表示提为根；archive 原子归档全部 active 后代（纯目录状态，
 * 不级联撤销任何权限）；部门成员挂载/卸载/设管理员（is_admin 是局部目录角色，非权限）。
 */
export function OrganizationDepartmentsPage() {
  const params = useParams<{ organizationId: string }>()
  const organizationId = params.organizationId ?? ''
  const queryClient = useQueryClient()
  const { state, setState } = useListQueryState<ListState>({ status: 'all' })
  const { allowed: canRead, loading: permLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const readReady = canRead && !permLoading

  const [selectedId, setSelectedId] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createParent, setCreateParent] = useState('')
  const [renameTarget, setRenameTarget] = useState<DepartmentRow | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [moveTarget, setMoveTarget] = useState<DepartmentRow | null>(null)
  const [moveParent, setMoveParent] = useState('')
  const [archiveTarget, setArchiveTarget] = useState<DepartmentRow | null>(null)
  const [addMemberValue, setAddMemberValue] = useState('')

  const detailQuery = useQuery({
    queryKey: ['organization', 'detail', organizationId],
    queryFn: () => getOrganizationDetail(organizationId),
    enabled: readReady && organizationId.length > 0,
  })

  const org = detailQuery.data
  const myRole = org?.memberRole ?? null
  const canWrite = canWriteDepartments(myRole)
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
  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId])

  const membersQuery = useQuery({
    queryKey: ['organization', 'department-members', organizationId, selectedId],
    queryFn: () => listDepartmentMembers(organizationId, selectedId),
    enabled: readReady && selectedId.length > 0,
  })

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

  const addMemberMutation = useMutation({
    mutationFn: () => addDepartmentMember(organizationId, selectedId, addMemberValue.trim()),
    onSuccess: (member) => {
      toast.success(`成员 ${member.userId} 已挂载到部门（幂等：已在部门时返回当前行）`)
      setAddMemberValue('')
      void queryClient.invalidateQueries({ queryKey: ['organization', 'department-members', organizationId, selectedId] })
    },
    onError: conflictToast,
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeDepartmentMember(organizationId, selectedId, userId),
    onSuccess: () => {
      toast.success('成员已从部门卸载')
      void queryClient.invalidateQueries({ queryKey: ['organization', 'department-members', organizationId, selectedId] })
    },
    onError: conflictToast,
  })

  const adminMutation = useMutation({
    mutationFn: (input: { userId: string; admin: boolean }) =>
      setDepartmentMemberAdmin(organizationId, selectedId, input.userId, input.admin),
    onSuccess: (_data, input) => {
      toast.success(`成员 ${input.userId} 的部门管理员标记已${input.admin ? '设置' : '取消'}（局部目录角色，不产生任何权限）`)
      void queryClient.invalidateQueries({ queryKey: ['organization', 'department-members', organizationId, selectedId] })
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
      <div
        className={`flex items-center gap-1 rounded px-1 py-0.5 ${node.id === selectedId ? 'bg-accent' : ''}`}
        style={{ paddingLeft: `${node.depth * 16}px` }}
      >
        {node.children.length > 0 ? (
          <button type="button" className="text-muted-foreground" aria-label={collapsed.has(node.id) ? '展开' : '折叠'} onClick={() => toggleCollapse(node.id)}>
            {collapsed.has(node.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-block w-3.5" />
        )}
        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm hover:bg-muted"
          data-department-id={node.id}
          onClick={() => setSelectedId(node.id)}
        >
          <span className="font-mono text-xs text-muted-foreground">{node.id}</span>
          <span>{node.name}</span>
          {node.status === 'archived' ? <Badge variant="destructive">已归档</Badge> : null}
          <span className="text-[10px] text-muted-foreground">v{node.version}</span>
        </button>
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
    body = <EmptyState title="加载中…" description="正在读取组织事实（部门治理裁决依据）。" />
  } else if (!canWriteDepartments(myRole)) {
    body = (
      <EmptyState
        title="需要组织成员资格"
        description={`部门目录读写基线是本组织 active 成员（服务端口径）。当前角色：${orgRoleLabel(myRole)}。`}
      />
    )
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
        description="树形组织目录（C10）：部门是目录事实，不是权限边界；department_admin 是局部目录角色（C15），不产生任何 Workspace/CS/Agent 权限。"
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
              组织已归档：部门写操作被服务端拒绝（409，C16 fail-closed）；archived 部门的成员卸载仍放行（清理事）。
            </p>
          ) : null}
          {body}
          <p className="text-xs text-muted-foreground">
            改名 / 移动走 expected_version 乐观锁：并发修改会被服务端拒绝（层级/归档冲突 409；版本冲突经后端错误表兜底映射为
            400「请求参数非法」）。点击失败提示中的「刷新目录」取回服务端最新事实后重试。
            <Link className="ml-1 underline" to={`/organizations/${encodeURIComponent(organizationId)}`}>
              返回组织详情
            </Link>
          </p>
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              部门成员：{selected.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {selected.id} · {departmentStatusLabel(selected.status)} · v{selected.version}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {membersQuery.error ? (
              <ErrorState message={classifyOrgError(membersQuery.error).message} onRetry={() => void membersQuery.refetch()} />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="department-member-table">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-1 pr-3">用户 ID</th>
                        <th className="py-1 pr-3">部门管理员（is_admin）</th>
                        <th className="py-1 pr-3">挂载时间</th>
                        <th className="py-1">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(membersQuery.data ?? []).map((member) => (
                        <tr key={member.userId} className="border-b last:border-0">
                          <td className="py-1 pr-3 font-mono">{member.userId}</td>
                          <td className="py-1 pr-3">{member.isAdmin ? <Badge>管理员</Badge> : <span className="text-muted-foreground">-</span>}</td>
                          <td className="py-1 pr-3 font-mono">{member.createdAt || '-'}</td>
                          <td className="py-1">
                            {writeGate || selected.status === 'archived' ? (
                              <span className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-xs"
                                  disabled={!writeGate}
                                  onClick={() => adminMutation.mutate({ userId: member.userId, admin: !member.isAdmin })}
                                >
                                  {member.isAdmin ? '取消管理员' : '设为管理员'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-xs text-destructive"
                                  onClick={() => removeMemberMutation.mutate(member.userId)}
                                >
                                  卸载
                                </Button>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(membersQuery.data ?? []).length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">该部门暂无成员（一人可属多部门，兼职挂载）。</p>
                  ) : null}
                </div>
                {writeGate ? (
                  <div className="flex items-end gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="dept-add-member">挂载成员（本组织 active 成员的用户 ID）</Label>
                      <Input
                        id="dept-add-member"
                        className="w-72"
                        value={addMemberValue}
                        inputMode="numeric"
                        onChange={(event) => setAddMemberValue(event.target.value)}
                        placeholder="TSID，例如 1234567890123456789"
                      />
                    </div>
                    <Button
                      size="sm"
                      data-testid="dept-add-member-btn"
                      disabled={addMemberMutation.isPending || addMemberValue.trim().length === 0 || selected.status === 'archived'}
                      onClick={() => addMemberMutation.mutate()}
                    >
                      挂载
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

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
        } 个子部门）原子归档；不级联撤销任何组织 / Workspace 权限，不动成员行。已归档部门禁新写（成员卸载仍放行）。确认归档？`}
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
