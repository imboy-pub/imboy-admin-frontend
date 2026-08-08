// AI 角色模板管理：分页查看，保存草稿，显式发布后才影响绑定助手。
import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useReactTable, getCoreRowModel, type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Plus, Pencil, Power, Send, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  PageHeader,
  LoadingState,
  ErrorState,
  DataTable,
  DataTablePagination,
  ConfirmDialog,
  FilterBar,
} from '@/components/shared'
import { useListQueryState } from '@/hooks/useListQueryState'
import { getErrorMessage } from '@/lib/errorUtils'
import {
  getAiRolePage,
  getAiRoleDetail,
  createAiRole,
  saveAiRoleDraft,
  publishAiRole,
  setAiRoleStatus,
  getAiRoles,
  saveAiRole,
  deleteAiRole,
  type AiRoleCapabilityPolicy,
  type AiRoleDetail,
  type AiRoleListItem,
} from '../api/public'

const ROLES_KEY = 'ai_agent_roles'

interface RoleRow extends AiRoleListItem {
  prompt: string
  legacy: boolean
}

interface RolePage {
  items: RoleRow[]
  total: number
  page: number
  size: number
  legacy: boolean
}

interface RoleForm {
  code: string
  name: string
  description: string
  prompt: string
  knowledgeMode: 'off' | 'on_demand' | 'required'
  knowledgeSource: 'all' | 'faq' | 'group_rule'
  maxContextBytes: number
  groupReplyMode: 'off' | 'mention_only'
  proactiveMode: 'off' | 'welcome_only'
}

const EMPTY_FORM: RoleForm = {
  code: '',
  name: '',
  description: '',
  prompt: '',
  knowledgeMode: 'on_demand',
  knowledgeSource: 'all',
  maxContextBytes: 2400,
  groupReplyMode: 'off',
  proactiveMode: 'off',
}

function legacyPage(roles: Record<string, string>): RolePage {
  return {
    items: Object.entries(roles).map(([code, prompt]) => ({
      code,
      name: code,
      description: '',
      status: 1,
      active_version: 0,
      prompt,
      legacy: true,
    })),
    total: Object.keys(roles).length,
    page: 1,
    size: 10,
    legacy: true,
  }
}

function policyFromForm(form: RoleForm): AiRoleCapabilityPolicy {
  return {
    knowledge: {
      mode: form.knowledgeMode,
      source: form.knowledgeSource,
      max_context_bytes: form.maxContextBytes,
    },
    group_reply: { mode: form.groupReplyMode },
    proactive: { mode: form.proactiveMode, daily_limit: 0 },
  }
}

function capabilitiesFromForm(form: RoleForm): Record<string, boolean> {
  return {
    knowledge: form.knowledgeMode !== 'off',
    group_reply: form.groupReplyMode !== 'off',
    proactive: form.proactiveMode !== 'off',
  }
}

export function AiRolesPage() {
  const queryClient = useQueryClient()
  const { state: params, setState: setParams } = useListQueryState<{
    page: number
    size: number
    keyword: string
    status?: 0 | 1
  }>({ page: 1, size: 10, keyword: '' })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM)
  const [draftVersion, setDraftVersion] = useState<number | null>(null)
  const [statusTarget, setStatusTarget] = useState<RoleRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null)
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)

  const requestParams = {
    page: params.page,
    size: params.size,
    keyword: params.keyword || undefined,
    status: params.status,
  }

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: [ROLES_KEY, requestParams],
    queryFn: async (): Promise<RolePage> => {
      try {
        const page = await getAiRolePage(requestParams)
        return {
          items: page.items.map((item) => ({ ...item, prompt: '', legacy: false })),
          total: page.total,
          page: page.page,
          size: page.size,
          legacy: false,
        }
      } catch {
        return legacyPage(await getAiRoles())
      }
    },
  })

  const rows = useMemo(() => data?.items ?? [], [data])

  const openCreate = useCallback(() => {
    setEditing(null)
    setDraftVersion(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback(async (row: RoleRow) => {
    setEditing(row)
    setDraftVersion(null)
    if (row.legacy) {
      setForm({ ...EMPTY_FORM, code: row.code, name: row.name, prompt: row.prompt })
      setDialogOpen(true)
      return
    }
    try {
      const detail: AiRoleDetail = await getAiRoleDetail(row.code)
      const policy = detail.knowledge_policy ?? {}
      setForm({
        code: row.code,
        name: row.name,
        description: row.description,
        prompt: detail.system_prompt ?? '',
        knowledgeMode: policy.knowledge?.mode ?? 'on_demand',
        knowledgeSource: policy.knowledge?.source ?? 'all',
        maxContextBytes: policy.knowledge?.max_context_bytes ?? 2400,
        groupReplyMode: policy.group_reply?.mode ?? 'off',
        proactiveMode: policy.proactive?.mode ?? 'off',
      })
      setDialogOpen(true)
    } catch (err) {
      toast.error('加载角色详情失败: ' + getErrorMessage(err))
    }
  }, [])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (data?.legacy) return saveAiRole(form.code.trim(), form.prompt.trim())
      let code = form.code.trim()
      let version = draftVersion ?? ((editing?.active_version ?? 0) + 1)
      if (!editing) {
        const created = await createAiRole({
          code,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
        })
        code = created.code
        version = 1
      }
      await saveAiRoleDraft(code, {
        version,
        name: form.name.trim() || code,
        description: form.description.trim() || undefined,
        system_prompt: form.prompt.trim(),
        capabilities: capabilitiesFromForm(form),
        knowledge_policy: policyFromForm(form),
      })
      return { code, version }
    },
    onSuccess: (result) => {
      if (data?.legacy) {
        toast.success(editing ? '角色已更新' : '角色已创建')
        setDialogOpen(false)
      } else {
        const draft = result as { code: string; version: number }
        setEditing((prev) => prev ?? {
          code: draft.code,
          name: form.name,
          description: form.description,
          status: 1,
          active_version: 0,
          prompt: form.prompt,
          legacy: false,
        })
        setDraftVersion(draft.version)
        toast.success('草稿已保存，请发布后才会影响助手')
      }
      void queryClient.invalidateQueries({ queryKey: [ROLES_KEY] })
    },
    onError: (err: unknown) => toast.error('保存失败: ' + getErrorMessage(err)),
  })

  const publishMutation = useMutation({
    mutationFn: () => publishAiRole(form.code.trim(), draftVersion as number),
    onSuccess: () => {
      toast.success('角色已发布')
      setDraftVersion(null)
      setPublishConfirmOpen(false)
      setDialogOpen(false)
      void queryClient.invalidateQueries({ queryKey: [ROLES_KEY] })
    },
    onError: (err: unknown) => toast.error('发布失败: ' + getErrorMessage(err)),
  })

  const statusMutation = useMutation({
    mutationFn: (row: RoleRow) => setAiRoleStatus(row.code, row.status === 1 ? 0 : 1),
    onSuccess: () => {
      toast.success('角色状态已更新')
      setStatusTarget(null)
      void queryClient.invalidateQueries({ queryKey: [ROLES_KEY] })
    },
    onError: (err: unknown) => toast.error('操作失败: ' + getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (code: string) => deleteAiRole(code),
    onSuccess: () => {
      toast.success('角色已删除')
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: [ROLES_KEY] })
    },
    onError: (err: unknown) => toast.error('删除失败: ' + getErrorMessage(err)),
  })

  const columns = useMemo<ColumnDef<RoleRow>[]>(
    () => [
      {
        header: '角色',
        accessorKey: 'code',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.name || row.original.code}</span>
            <span className="text-xs text-muted-foreground">{row.original.code}</span>
          </div>
        ),
      },
      {
        header: '状态',
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Badge variant={row.original.status === 1 ? 'default' : 'destructive'}>
              {row.original.status === 1 ? '启用' : '停用'}
            </Badge>
            <Badge variant="secondary">
              {row.original.legacy
                ? '兼容模式'
                : 'v' + (row.original.active_version || '草稿')}
            </Badge>
          </div>
        ),
      },
      {
        header: '绑定助手',
        accessorKey: 'bound_agent_count',
        cell: ({ row }) => <span>{row.original.bound_agent_count ?? 0} 个</span>,
      },
      {
        header: '提示词',
        cell: ({ row }) => (
          <span title={row.original.prompt} className="line-clamp-2 text-sm text-muted-foreground">
            {row.original.prompt || '编辑查看当前版本'}
          </span>
        ),
      },
      {
        header: '操作',
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => void openEdit(row.original)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              编辑
            </Button>
            {!row.original.legacy && (
              <Button variant="ghost" size="sm" onClick={() => setStatusTarget(row.original)}>
                <Power className="mr-1 h-3.5 w-3.5" />
                {row.original.status === 1 ? '停用' : '启用'}
              </Button>
            )}
            {row.original.legacy && (
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row.original)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                删除
              </Button>
            )}
          </div>
        ),
      },
    ],
    [openEdit]
  )

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  if (isLoading) return <LoadingState message="加载 AI 角色..." />
  if (error) return <ErrorState message="加载 AI 角色失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 角色模板"
        description="角色统一管理提示词、能力门控和知识库成本策略；助手绑定角色后继承已发布版本。"
      />
      <FilterBar
        onReset={
          params.keyword || params.status !== undefined
            ? () => setParams({ page: 1, keyword: '', status: undefined })
            : undefined
        }
        extraActions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            新建角色
          </Button>
        }
      >
        <Input
          data-testid="role-keyword-filter"
          className="max-w-xs"
          value={params.keyword}
          placeholder="搜索角色编码或名称"
          onChange={(event) => setParams({ page: 1, keyword: event.target.value })}
        />
        <select
          data-testid="role-status-filter"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={params.status === undefined ? '' : String(params.status)}
          onChange={(event) =>
            setParams({
              page: 1,
              status:
                event.target.value === '' ? undefined : (Number(event.target.value) as 0 | 1),
            })
          }
        >
          <option value="">全部状态</option>
          <option value="1">启用</option>
          <option value="0">停用</option>
        </select>
      </FilterBar>
      <DataTable table={table} emptyMessage="暂无角色" />
      <DataTablePagination
        page={params.page}
        pageSize={params.size}
        total={data?.total ?? 0}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(size) => setParams({ page: 1, size })}
        dataUpdatedAt={dataUpdatedAt}
        onRefresh={() => refetch()}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑角色草稿' : '新建角色草稿'}</DialogTitle>
            <DialogDescription>
              保存只产生草稿；当前绑定助手 {editing?.bound_agent_count ?? 0} 个。确认提示词和能力策略后点击发布，已绑定助手才会继承新版本。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="f_role_id">角色编码（code）</Label>
                <Input
                  id="f_role_id"
                  data-testid="role-id-input"
                  value={form.code}
                  readOnly={editing !== null}
                  onChange={(event) => setForm({ ...form, code: event.target.value })}
                  placeholder="如 doctor / support"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f_role_name">角色名称</Label>
                <Input
                  id="f_role_name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f_role_prompt">系统提示词（system_prompt）</Label>
              <Textarea
                id="f_role_prompt"
                data-testid="role-prompt-input"
                rows={7}
                value={form.prompt}
                onChange={(event) => setForm({ ...form, prompt: event.target.value })}
                placeholder="定义角色目标、边界、输出格式和安全要求"
              />
            </div>
            {!data?.legacy && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>知识库模式</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.knowledgeMode}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          knowledgeMode: event.target.value as RoleForm['knowledgeMode'],
                        })
                      }
                    >
                      <option value="off">关闭</option>
                      <option value="on_demand">按需命中（推荐）</option>
                      <option value="required">必需（截断注入）</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>知识库来源</Label>
                    <select
                      data-testid="role-knowledge-source"
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.knowledgeSource}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          knowledgeSource: event.target.value as RoleForm['knowledgeSource'],
                        })
                      }
                    >
                      <option value="all">FAQ + 群规</option>
                      <option value="faq">仅 FAQ</option>
                      <option value="group_rule">仅群规</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="f_role_context_bytes">最大上下文（字节）</Label>
                    <Input
                      id="f_role_context_bytes"
                      data-testid="role-context-bytes"
                      type="number"
                      min={0}
                      max={8000}
                      step={100}
                      value={String(form.maxContextBytes)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          maxContextBytes: Number.parseInt(event.target.value, 10) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>群聊能力</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.groupReplyMode}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          groupReplyMode: event.target.value as RoleForm['groupReplyMode'],
                        })
                      }
                    >
                      <option value="off">关闭</option>
                      <option value="mention_only">仅被 @ 时回复</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>主动能力</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.proactiveMode}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          proactiveMode: event.target.value as RoleForm['proactiveMode'],
                        })
                      }
                    >
                      <option value="off">关闭</option>
                      <option value="welcome_only">仅新用户欢迎</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  成本建议：按需命中只截取相关片段，默认最多注入 2400 字节；“必需”会在每次请求注入截断后的知识库。
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (
                  !form.code.trim() ||
                  !form.prompt.trim() ||
                  (!data?.legacy && !form.name.trim())
                ) {
                  toast.error('角色编码、名称和提示词不能为空')
                  return
                }
                saveMutation.mutate()
              }}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? '保存中...' : data?.legacy ? '保存' : '保存草稿'}
            </Button>
            {!data?.legacy && draftVersion !== null && (
              <Button
                onClick={() => setPublishConfirmOpen(true)}
                disabled={publishMutation.isPending}
              >
                <Send className="mr-1 h-4 w-4" />
                {publishMutation.isPending ? '发布中...' : '发布 v' + draftVersion}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={publishConfirmOpen}
        onOpenChange={setPublishConfirmOpen}
        title={'发布角色 v' + draftVersion}
        description={
          '将把「' +
          (editing?.name || form.name || form.code) +
          '」的新版本发布给当前绑定的 ' +
          (editing?.bound_agent_count ?? 0) +
          ' 个助手；发布后这些助手会继承新的提示词和能力策略。'
        }
        loading={publishMutation.isPending}
        onConfirm={() => publishMutation.mutate()}
      />
      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={statusTarget?.status === 1 ? '停用 AI 角色' : '启用 AI 角色'}
        description={
          '变更「' +
          (statusTarget?.name || statusTarget?.code) +
          '」状态后，绑定助手将按角色状态执行。'
        }
        loading={statusMutation.isPending}
        onConfirm={() => {
          if (statusTarget) statusMutation.mutate(statusTarget)
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除角色"
        description={'删除「' + (deleteTarget?.name || deleteTarget?.code) + '」后将移除旧兼容角色。'}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.code)
        }}
      />
    </div>
  )
}
