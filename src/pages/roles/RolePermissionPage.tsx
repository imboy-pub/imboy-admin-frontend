import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Circle, Plus, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EntityDrawer, ErrorState, LoadingState, PageHeader } from '@/components/shared'
import { cn } from '@/lib/utils'
import { getCurrentAdminPayload } from '@/modules/identity/api'
import { getMyRbacProfilePayload } from '@/services/api/rbac'
import { fetchSidebarMenuConfig, type PermissionCatalogItem, type RoleTemplateConfig } from '@/services/api/adminConfig'
import { createRole, getRoleListPayload, updateRolePermissions } from '@/modules/identity/api'

type PermissionItem = PermissionCatalogItem
type RoleTemplate = RoleTemplateConfig

const defaultPermissions: PermissionItem[] = [
  { key: 'dashboard:view', name: '查看仪表盘', module: '仪表盘', path: '/dashboard' },
  { key: 'users:read', name: '查看用户资料', module: '用户管理', path: '/users' },
  { key: 'groups:read', name: '查看群资料', module: '群组管理', path: '/groups' },
  { key: 'groups:delete', name: '删除群资料', module: '群组管理', path: '/groups' },
  { key: 'groups:vote:read', name: '查看群投票治理页', module: '群组管理', path: '/groups/:id/votes' },
  { key: 'groups:vote:close', name: '结束群投票', module: '群组管理', path: '/groups/:id/votes' },
  { key: 'groups:notice:read', name: '查看群公告治理页', module: '群组管理', path: '/groups/:id/notices' },
  { key: 'groups:notice:delete', name: '删除群公告', module: '群组管理', path: '/groups/:id/notices' },
  { key: 'groups:category:read', name: '查看群分组分类治理页', module: '群组管理', path: '/groups/:id/categories' },
  { key: 'groups:category:delete', name: '删除群分组分类', module: '群组管理', path: '/groups/:id/categories' },
  { key: 'groups:tag:read', name: '查看群标签治理页', module: '群组管理', path: '/groups/:id/tags' },
  { key: 'groups:tag:delete', name: '删除群标签', module: '群组管理', path: '/groups/:id/tags' },
  { key: 'groups:file:read', name: '查看群文件治理页', module: '群组管理', path: '/groups/:id/files' },
  { key: 'groups:file:delete', name: '删除群文件', module: '群组管理', path: '/groups/:id/files' },
  { key: 'groups:album:read', name: '查看群相册治理页', module: '群组管理', path: '/groups/:id/albums' },
  { key: 'groups:album:delete', name: '删除群相册', module: '群组管理', path: '/groups/:id/albums' },
  { key: 'groups:schedule:read', name: '查看群日程治理页', module: '群组管理', path: '/groups/:id/schedules' },
  { key: 'groups:schedule:cancel', name: '取消群日程', module: '群组管理', path: '/groups/:id/schedules' },
  { key: 'groups:schedule:restore', name: '恢复群日程', module: '群组管理', path: '/groups/:id/schedules' },
  { key: 'groups:task:read', name: '查看群任务治理页', module: '群组管理', path: '/groups/:id/tasks' },
  { key: 'groups:task:review', name: '批改群任务提交', module: '群组管理', path: '/groups/:id/tasks' },
  { key: 'groups:task:close', name: '强制结束群任务', module: '群组管理', path: '/groups/:id/tasks' },
  { key: 'groups:task:delete', name: '删除群任务', module: '群组管理', path: '/groups/:id/tasks' },
  { key: 'groups:task:restore', name: '恢复群任务', module: '群组管理', path: '/groups/:id/tasks' },
  { key: 'channels:read', name: '查看频道资料', module: '频道管理', path: '/channels' },
  { key: 'channels:update', name: '编辑频道资料', module: '频道管理', path: '/channels' },
  { key: 'channels:delete', name: '删除频道资料', module: '频道管理', path: '/channels' },
  { key: 'moments:read', name: '查看动态内容', module: '朋友圈治理', path: '/moments' },
  { key: 'moments:delete', name: '删除动态内容', module: '朋友圈治理', path: '/moments' },
  { key: 'moments:report:read', name: '查看动态举报', module: '朋友圈治理', path: '/reports' },
  { key: 'moments:report:handle', name: '处理动态举报', module: '朋友圈治理', path: '/reports' },
  { key: 'reports:read', name: '查看举报中心', module: '举报中心', path: '/reports' },
  { key: 'reports:handle', name: '处理举报工单', module: '举报中心', path: '/reports' },
  { key: 'messages:read', name: '查看消息记录（只读）', module: '消息管理', path: '/messages' },
  { key: 'logout_applications:read', name: '查看注销申请（只读）', module: '注销申请', path: '/logout-applications' },
  { key: 'feedback:read', name: '查看反馈', module: '反馈管理', path: '/feedback' },
  { key: 'feedback:reply', name: '回复反馈', module: '反馈管理', path: '/feedback' },
  { key: 'settings:view', name: '查看系统设置', module: '系统设置', path: '/settings' },
  { key: 'settings:version:read', name: '查看版本策略', module: '系统设置', path: '/settings/versions' },
  { key: 'settings:version:update', name: '修改版本策略', module: '系统设置', path: '/settings/versions' },
  { key: 'settings:ddl:read', name: '查看DDL策略', module: '系统设置', path: '/settings/ddl' },
  { key: 'settings:ddl:update', name: '修改DDL策略', module: '系统设置', path: '/settings/ddl' },
  { key: 'admins:read', name: '查看管理员信息', module: '管理员', path: '/admins' },
  { key: 'admins:create', name: '新增管理员', module: '管理员', path: '/admins' },
  { key: 'admins:assign_role', name: '分配管理员角色', module: '管理员', path: '/admins' },
  { key: 'roles:view', name: '查看角色权限', module: '角色权限', path: '/roles' },
  { key: 'roles:create', name: '新增角色', module: '角色权限', path: '/roles' },
  { key: 'roles:update', name: '编辑角色权限', module: '角色权限', path: '/roles' },
  { key: 'logs:view', name: '查看审计日志（只读）', module: '日志审计', path: '/logs' },
]

const defaultRoleTemplates: RoleTemplate[] = [
  {
    id: 1,
    name: '超级管理员',
    description: '拥有全部管理能力，负责策略制定与安全管控。',
    permissions: defaultPermissions.map((item) => item.key),
  },
  {
    id: 2,
    name: '运营管理员',
    description: '负责用户、群组、频道和反馈等业务运营事务。',
    permissions: [
      'dashboard:view',
      'users:read',
      'groups:read', 'groups:delete',
      'groups:vote:read', 'groups:vote:close', 'groups:notice:read', 'groups:notice:delete', 'groups:category:read', 'groups:category:delete', 'groups:tag:read', 'groups:tag:delete', 'groups:file:read', 'groups:file:delete', 'groups:album:read', 'groups:album:delete', 'groups:schedule:read', 'groups:schedule:cancel', 'groups:schedule:restore',
      'groups:task:read', 'groups:task:review', 'groups:task:close', 'groups:task:delete', 'groups:task:restore',
      'channels:read', 'channels:update', 'channels:delete',
      'moments:read', 'moments:delete', 'moments:report:read', 'moments:report:handle',
      'reports:read', 'reports:handle',
      'messages:read',
      'logout_applications:read',
      'feedback:read',
      'feedback:reply',
    ],
  },
  {
    id: 3,
    name: '审计管理员',
    description: '聚焦日志审计、消息检查和数据留痕，不执行配置变更。',
    permissions: [
      'dashboard:view',
      'messages:read',
      'logout_applications:read',
      'logs:view',
      'roles:view',
    ],
  },
]

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (!error || typeof error !== 'object') return String(error)
  const record = error as { msg?: string; message?: string }
  if (typeof record.msg === 'string' && record.msg.length > 0) return record.msg
  if (typeof record.message === 'string' && record.message.length > 0) return record.message
  return String(error)
}

function parsePermissionKeys(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;\s]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  )
}

function normalizeRoleIds(value: unknown): number[] {
  const values = Array.isArray(value) ? value : [value]
  return Array.from(
    new Set(
      values
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  )
}

export function RolePermissionPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null)
  const [draftPermissionsByRole, setDraftPermissionsByRole] = useState<Record<number, string[]>>({})
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [createRoleName, setCreateRoleName] = useState('')
  const [createRoleDescription, setCreateRoleDescription] = useState('')
  const [createRolePermissions, setCreateRolePermissions] = useState('')
  const [moduleFilter, setModuleFilter] = useState('全部')
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)

  const { data: currentAdmin, isLoading, error, refetch } = useQuery({
    queryKey: ['roles', 'current-admin'],
    queryFn: () => getCurrentAdminPayload(),
  })
  const { data: sidebarConfig } = useQuery({
    queryKey: ['roles', 'sidebar-config'],
    queryFn: () => fetchSidebarMenuConfig(),
    retry: false,
  })
  const { data: currentRbac } = useQuery({
    queryKey: ['roles', 'rbac-me'],
    queryFn: () => getMyRbacProfilePayload(),
    retry: false,
  })
  const { data: roleListData } = useQuery({
    queryKey: ['roles', 'list'],
    queryFn: () => getRoleListPayload(),
    retry: false,
  })

  const createRoleMutation = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      toast.success('角色创建成功')
      setCreateDrawerOpen(false)
      setCreateRoleName('')
      setCreateRoleDescription('')
      setCreateRolePermissions('')
      queryClient.invalidateQueries({ queryKey: ['roles', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['roles', 'sidebar-config'] })
    },
    onError: (mutationError) => {
      toast.error(`创建角色失败: ${getErrorMessage(mutationError)}`)
    },
  })

  const updatePermissionMutation = useMutation({
    mutationFn: ({ roleId, permissions }: { roleId: number; permissions: string[] }) =>
      updateRolePermissions(roleId, permissions),
    onSuccess: () => {
      toast.success('角色权限已保存')
      queryClient.invalidateQueries({ queryKey: ['roles', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['roles', 'sidebar-config'] })
      queryClient.invalidateQueries({ queryKey: ['roles', 'rbac-me'] })
    },
    onError: (mutationError) => {
      toast.error(`权限保存失败: ${getErrorMessage(mutationError)}`)
    },
  })

  const permissions = useMemo(() => {
    const configured = sidebarConfig?.rbac?.permissions
    if (Array.isArray(configured) && configured.length > 0) {
      return configured
    }
    return defaultPermissions
  }, [sidebarConfig?.rbac?.permissions])

  const roleTemplates = useMemo<RoleTemplate[]>(() => {
    const sortByNewest = (items: RoleTemplate[]) =>
      [...items].sort((a, b) => Number(b.id || 0) - Number(a.id || 0))

    const fromApi = roleListData?.items
    if (Array.isArray(fromApi) && fromApi.length > 0) {
      return sortByNewest(fromApi.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        permissions: item.permissions || [],
      })))
    }

    const configured = sidebarConfig?.rbac?.roles
    if (Array.isArray(configured) && configured.length > 0) {
      return sortByNewest(configured)
    }

    return sortByNewest(defaultRoleTemplates)
  }, [roleListData?.items, sidebarConfig?.rbac?.roles])

  const effectiveEditingRoleId = useMemo<number | null>(() => {
    if (editingRoleId !== null && roleTemplates.some((item) => item.id === editingRoleId)) {
      return editingRoleId
    }
    return null
  }, [roleTemplates, editingRoleId])

  const selectedRole = useMemo(() => {
    if (effectiveEditingRoleId === null) return undefined
    return roleTemplates.find((item) => item.id === effectiveEditingRoleId)
  }, [effectiveEditingRoleId, roleTemplates])

  const permissionKeySet = useMemo(() => new Set(permissions.map((item) => item.key)), [permissions])

  const currentRolePermissions = useMemo(() => {
    if (currentRbac?.permissions && currentRbac.permissions.length > 0) {
      return new Set(currentRbac.permissions)
    }
    const adminRoleIds = normalizeRoleIds((currentAdmin as { role_id?: unknown } | undefined)?.role_id)
    const permissions = roleTemplates
      .filter((item) => adminRoleIds.includes(item.id))
      .flatMap((item) => item.permissions || [])
    return new Set(permissions)
  }, [currentRbac, currentAdmin, roleTemplates])

  const effectiveCurrentRoleIds = useMemo(() => {
    if (Array.isArray(currentRbac?.role_ids) && currentRbac.role_ids.length > 0) {
      return normalizeRoleIds(currentRbac.role_ids)
    }
    return normalizeRoleIds((currentAdmin as { role_id?: unknown } | undefined)?.role_id)
  }, [currentRbac, currentAdmin])

  const draftPermissions = useMemo(() => {
    if (!selectedRole) return []
    const cached = draftPermissionsByRole[selectedRole.id]
    return Array.isArray(cached) ? cached : (selectedRole.permissions || [])
  }, [selectedRole, draftPermissionsByRole])

  const permissionDirty = useMemo(() => {
    if (!selectedRole) return false
    const current = new Set(draftPermissions)
    const source = new Set(selectedRole.permissions || [])
    if (current.size !== source.size) return true
    for (const key of current) {
      if (!source.has(key)) return true
    }
    return false
  }, [draftPermissions, selectedRole])

  const draftPermissionSet = useMemo(() => new Set(draftPermissions), [draftPermissions])
  const selectedPermissionCount = useMemo(
    () => draftPermissions.filter((key) => permissionKeySet.has(key)).length,
    [draftPermissions, permissionKeySet]
  )
  const moduleOptions = useMemo(
    () => ['全部', ...Array.from(new Set(permissions.map((item) => item.module))).sort((a, b) => a.localeCompare(b))],
    [permissions]
  )
  const filteredPermissions = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return permissions.filter((item) => {
      if (moduleFilter !== '全部' && item.module !== moduleFilter) return false
      if (showSelectedOnly && !draftPermissionSet.has(item.key)) return false
      if (!normalized) return true
      return (
        item.name.toLowerCase().includes(normalized) ||
        item.module.toLowerCase().includes(normalized) ||
        item.path.toLowerCase().includes(normalized) ||
        item.key.toLowerCase().includes(normalized)
      )
    })
  }, [keyword, permissions, moduleFilter, showSelectedOnly, draftPermissionSet])
  const selectedVisiblePermissionCount = useMemo(
    () => filteredPermissions.filter((item) => draftPermissionSet.has(item.key)).length,
    [filteredPermissions, draftPermissionSet]
  )
  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionItem[]>()
    for (const item of filteredPermissions) {
      const list = groups.get(item.module) || []
      list.push(item)
      groups.set(item.module, list)
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([module, items]) => {
        const selectedCount = items.filter((item) => draftPermissionSet.has(item.key)).length
        return {
          module,
          items,
          selectedCount,
          allSelected: items.length > 0 && selectedCount === items.length,
        }
      })
  }, [filteredPermissions, draftPermissionSet])
  const rolePermissionSets = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (const role of roleTemplates) {
      const draftPermissionsForRole = draftPermissionsByRole[role.id]
      const source = Array.isArray(draftPermissionsForRole) ? draftPermissionsForRole : (role.permissions || [])
      map.set(role.id, new Set(source))
    }
    return map
  }, [roleTemplates, draftPermissionsByRole])
  const canCreateRole = currentRolePermissions.has('roles:create')
  const canUpdateRole = currentRolePermissions.has('roles:update')

  const togglePermission = (permissionKey: string) => {
    if (!canUpdateRole) return
    if (!selectedRole) return
    setDraftPermissionsByRole((prev) => {
      const current = Array.isArray(prev[selectedRole.id]) ? prev[selectedRole.id] : (selectedRole.permissions || [])
      const next = new Set(current)
      if (next.has(permissionKey)) {
        next.delete(permissionKey)
      } else {
        next.add(permissionKey)
      }
      return {
        ...prev,
        [selectedRole.id]: Array.from(next),
      }
    })
  }

  const applyPermissionBatch = (permissionKeys: string[], checked: boolean) => {
    if (!canUpdateRole) return
    if (!selectedRole) return
    if (permissionKeys.length === 0) return
    setDraftPermissionsByRole((prev) => {
      const current = Array.isArray(prev[selectedRole.id]) ? prev[selectedRole.id] : (selectedRole.permissions || [])
      const next = new Set(current)
      for (const key of permissionKeys) {
        if (checked) {
          next.add(key)
        } else {
          next.delete(key)
        }
      }
      return {
        ...prev,
        [selectedRole.id]: Array.from(next),
      }
    })
  }

  const handleSelectAllVisible = () => {
    applyPermissionBatch(filteredPermissions.map((item) => item.key), true)
  }

  const handleClearVisible = () => {
    applyPermissionBatch(filteredPermissions.map((item) => item.key), false)
  }

  const handleCloseEditor = () => {
    setEditingRoleId(null)
    setShowSelectedOnly(false)
    setModuleFilter('全部')
    setKeyword('')
  }

  const handleToggleRoleEditor = (roleId: number) => {
    setEditingRoleId((prev) => {
      if (prev === roleId) {
        return null
      }
      return roleId
    })
  }

  const handleResetPermissions = () => {
    if (!selectedRole) return
    setDraftPermissionsByRole((prev) => ({
      ...prev,
      [selectedRole.id]: selectedRole.permissions || [],
    }))
  }

  const handleSavePermissions = () => {
    if (!selectedRole) {
      toast.error('请选择一个角色')
      return
    }
    updatePermissionMutation.mutate({
      roleId: selectedRole.id,
      permissions: draftPermissions,
    })
  }

  const handleCreateRole = () => {
    const roleName = createRoleName.trim()
    if (roleName.length < 2) {
      toast.error('角色名至少 2 个字符')
      return
    }

    createRoleMutation.mutate({
      name: roleName,
      description: createRoleDescription.trim(),
      permissions: parsePermissionKeys(createRolePermissions),
      status: 1,
    })
  }

  if (isLoading) {
    return <LoadingState message="加载角色权限配置..." />
  }

  if (error) {
    return <ErrorState message="加载角色权限配置失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="角色权限"
        description="统一查看并管理后台角色授权矩阵，支持快速筛选、批量编辑与即时生效"
        actions={canCreateRole ? (
          <Button onClick={() => setCreateDrawerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            新增角色
          </Button>
        ) : undefined}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">角色总数</p>
            <p className="mt-1 text-2xl font-semibold">{roleTemplates.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">当前编辑角色</p>
            <p className="mt-1 text-base font-semibold">{selectedRole?.name || '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">已勾选权限</p>
            <p className="mt-1 text-2xl font-semibold">{selectedRole ? selectedPermissionCount : '-'}</p>
          </CardContent>
        </Card>
        <Card className={permissionDirty ? 'border-amber-400/70 bg-amber-50/30' : ''}>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">保存状态</p>
            <p className="mt-1 text-base font-semibold">{permissionDirty ? '有未保存变更' : '已同步'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {roleTemplates.map((role) => {
          const isCurrent = effectiveCurrentRoleIds.includes(role.id)
          const isEditing = effectiveEditingRoleId === role.id
          const isSystemRole = role.id <= 3
          const rolePermissionSet = rolePermissionSets.get(role.id) || new Set<string>()
          const grantedCount = permissions.filter((item) => rolePermissionSet.has(item.key)).length
          const hasDraftPermissions = Array.isArray(draftPermissionsByRole[role.id])
          return (
            <Card
              key={role.id}
              data-role-id={role.id}
              data-role-name={role.name}
              className={isEditing ? 'border-primary shadow-sm' : (isCurrent ? 'border-primary/60' : '')}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="truncate">{role.name}</span>
                  <div className="flex items-center gap-2">
                    {isCurrent && (
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        当前角色
                      </span>
                    )}
                    <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                      {isSystemRole ? '系统角色' : `自定义 #${role.id}`}
                    </span>
                    {hasDraftPermissions && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        草稿
                      </span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{role.description || '无描述'}</p>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">已授权 {grantedCount} 项能力</p>
                  <div className="h-1.5 w-full rounded bg-muted">
                    <div
                      className="h-1.5 rounded bg-primary transition-all"
                      style={{ width: `${Math.min(100, Math.round((grantedCount / Math.max(1, permissions.length)) * 100))}%` }}
                    />
                  </div>
                </div>
                <Button
                  variant={isEditing ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleToggleRoleEditor(role.id)}
                >
                  {isEditing ? '收起编辑器' : (canUpdateRole ? '编辑权限' : '查看权限')}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {selectedRole ? (
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5" />
                权限编辑器
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={String(effectiveEditingRoleId || '')}
                  onChange={(event) => {
                    const nextRoleId = Number(event.target.value)
                    setEditingRoleId(Number.isFinite(nextRoleId) && nextRoleId > 0 ? nextRoleId : null)
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {roleTemplates.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  onClick={handleCloseEditor}
                  disabled={updatePermissionMutation.isPending}
                >
                  收起编辑器
                </Button>
                <Button
                  variant="outline"
                  onClick={handleResetPermissions}
                  disabled={!canUpdateRole || updatePermissionMutation.isPending}
                >
                  重置
                </Button>
                <Button
                  onClick={handleSavePermissions}
                  disabled={!canUpdateRole || !permissionDirty || updatePermissionMutation.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {updatePermissionMutation.isPending ? '保存中...' : '保存权限'}
                </Button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                placeholder="搜索权限名 / 模块 / 路径 / 键名"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="w-full"
              />
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={showSelectedOnly}
                  onChange={(event) => setShowSelectedOnly(event.target.checked)}
                />
                仅看已选
              </label>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                模块筛选
              </div>
              <div className="flex flex-wrap gap-2">
                {moduleOptions.map((module) => (
                  <button
                    key={module}
                    type="button"
                    onClick={() => setModuleFilter(module)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition',
                      moduleFilter === module
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {module}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectAllVisible}
                  disabled={!canUpdateRole || filteredPermissions.length === 0 || updatePermissionMutation.isPending}
                >
                  当前筛选全选
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClearVisible}
                  disabled={!canUpdateRole || filteredPermissions.length === 0 || updatePermissionMutation.isPending}
                >
                  当前筛选清空
                </Button>
                <span className="text-xs text-muted-foreground">
                  可见 {filteredPermissions.length} 项，已选 {selectedVisiblePermissionCount} 项
                </span>
              </div>
            </div>
            {!canUpdateRole && (
              <p className="text-sm text-muted-foreground">当前角色仅支持查看权限，不可编辑。</p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {groupedPermissions.map((group) => (
              <div key={group.module} className="rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{group.module}</p>
                    <p className="text-xs text-muted-foreground">
                      已选 {group.selectedCount} / {group.items.length}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={group.allSelected ? 'secondary' : 'outline'}
                      onClick={() => applyPermissionBatch(group.items.map((item) => item.key), true)}
                      disabled={!canUpdateRole || updatePermissionMutation.isPending}
                    >
                      全选
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => applyPermissionBatch(group.items.map((item) => item.key), false)}
                      disabled={!canUpdateRole || updatePermissionMutation.isPending}
                    >
                      清空
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 p-3 md:grid-cols-2">
                  {group.items.map((item) => {
                    const checked = draftPermissionSet.has(item.key)
                    return (
                      <label
                        key={item.key}
                        data-permission-key={item.key}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors',
                          checked ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40'
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-input"
                          checked={checked}
                          disabled={!canUpdateRole}
                          onChange={() => togglePermission(item.key)}
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">{item.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{item.key}</p>
                          <p className="font-mono text-xs text-muted-foreground">{item.path}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}

            {filteredPermissions.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">未找到匹配的权限项</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" />
              权限编辑器
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              点击上方角色卡片的“编辑权限”后再展开编辑器，避免页面默认过长。
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {roleTemplates.slice(0, 6).map((role) => (
              <Button key={role.id} size="sm" variant="outline" onClick={() => setEditingRoleId(role.id)}>
                打开 {role.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>权限矩阵（审阅）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left">权限</th>
                  <th className="px-3 py-2 text-left">模块</th>
                  <th className="px-3 py-2 text-left">路径</th>
                  {roleTemplates.map((role) => (
                    <th key={role.id} className="px-3 py-2 text-center">
                      {role.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPermissions.map((item) => (
                  <tr key={item.key} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{item.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.module}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.path}</td>
                    {roleTemplates.map((role) => {
                      const allowed = rolePermissionSets.get(role.id)?.has(item.key) || false
                      return (
                        <td key={`${item.key}-${role.id}`} className="px-3 py-2 text-center">
                          {allowed ? (
                            <Check className="mx-auto h-4 w-4 text-green-600" />
                          ) : (
                            <Circle className="mx-auto h-4 w-4 text-muted-foreground/40" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <EntityDrawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        title="新增角色"
        subtitle="创建新角色并设置初始权限集合（可留空后续编辑）"
        actions={(
          <>
            <Button
              variant="outline"
              onClick={() => setCreateDrawerOpen(false)}
              disabled={createRoleMutation.isPending}
            >
              取消
            </Button>
            <Button onClick={handleCreateRole} disabled={createRoleMutation.isPending}>
              {createRoleMutation.isPending ? '创建中...' : '确认创建'}
            </Button>
          </>
        )}
      >
        <div className="grid gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">角色名 *</label>
            <Input
              placeholder="例如：内容巡检管理员"
              value={createRoleName}
              onChange={(event) => setCreateRoleName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">角色描述</label>
            <Textarea
              placeholder="可选"
              value={createRoleDescription}
              onChange={(event) => setCreateRoleDescription(event.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">初始权限键（可选）</label>
            <Textarea
              placeholder="支持逗号、空格或换行分隔，例如：reports:read, reports:handle"
              value={createRolePermissions}
              onChange={(event) => setCreateRolePermissions(event.target.value)}
              rows={4}
            />
          </div>
        </div>
      </EntityDrawer>
    </div>
  )
}
