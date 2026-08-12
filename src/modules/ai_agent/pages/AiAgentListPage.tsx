import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { toast } from 'sonner'
import { Plus, Pencil, Power, Copy, Upload } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
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
import type { EntityId } from '@/types/common'
import {
  getAiAgentList,
  getAiAgentDetail,
  createAiAgent,
  updateAiAgent,
  setAiAgentStatus,
  uploadAgentAvatar,
  getAiRolePage,
  type AiAgentListItem,
  type AiAgentUpsertInput,
  type AiRoleListItem,
} from '../api/public'

const LIST_KEY = 'ai_agent'

interface AgentForm {
  user_id?: EntityId
  account: string
  nickname: string
  avatar: string
  provider: string
  model: string
  description: string
  visibility: 0 | 1
  category: string
  voice_id: string
  greeting: string
  role_id: string
  temperature: number
}

const EMPTY_FORM: AgentForm = {
  account: '',
  nickname: '',
  avatar: '',
  provider: 'qianfan',
  model: '',
  description: '',
  visibility: 1,
  category: '',
  voice_id: '',
  greeting: '',
  role_id: '',
  temperature: 0.7,
}

export function AiAgentListPage() {
  const queryClient = useQueryClient()
  const { state: params, setState: setParams } = useListQueryState<{
    page: number
    size: number
    category: string
  }>({
    page: 1,
    size: 10,
    category: '',
  })
  const [categoryInput, setCategoryInput] = useState(params.category)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<AgentForm>(EMPTY_FORM)
  const [statusConfirm, setStatusConfirm] = useState<AiAgentListItem | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const { data: roleOptions = [] } = useQuery({
    queryKey: ['ai_agent_role_options'],
    queryFn: async (): Promise<AiRoleListItem[]> => {
      try {
        const page = await getAiRolePage({ page: 1, size: 100, status: 1 })
        return page.items
      } catch {
        return []
      }
    },
    staleTime: 30_000,
  })

  const requestParams = {
    page: params.page,
    size: params.size,
    category: params.category || undefined,
  }

  useEffect(() => {
    if (categoryInput === params.category) return
    const timer = window.setTimeout(() => {
      setParams({ page: 1, category: categoryInput })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [categoryInput, params.category, setParams])

  useEffect(() => {
    setCategoryInput(params.category)
  }, [params.category])

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: [LIST_KEY, requestParams],
    queryFn: () => getAiAgentList(requestParams),
  })

  const rows = useMemo(() => data?.items ?? [], [data])

  const upsertMutation = useMutation({
    mutationFn: (input: AiAgentUpsertInput) =>
      input.user_id ? updateAiAgent(input) : createAiAgent(input),
    onSuccess: () => {
      toast.success(dialogMode === 'create' ? 'AI 助手已创建' : 'AI 助手已更新')
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      setDialogOpen(false)
    },
    onError: (err: unknown) => toast.error(`保存失败: ${getErrorMessage(err)}`),
  })

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: EntityId; status: 0 | 1 }) =>
      setAiAgentStatus(userId, status),
    onSuccess: () => {
      toast.success('状态已更新')
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      setStatusConfirm(null)
    },
    onError: (err: unknown) => toast.error(`操作失败: ${getErrorMessage(err)}`),
  })

  const openCreate = useCallback(() => {
    setDialogMode('create')
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback(async (row: AiAgentListItem) => {
    setDialogMode('edit')
    // 列表无 system_prompt 长文本，编辑前拉详情
    try {
      const detail = await getAiAgentDetail(row.user_id)
      setForm({
        user_id: row.user_id,
        account: '',
        nickname: row.nickname,
        avatar: row.avatar || '',
        provider: detail.provider,
        model: detail.model,
        description: detail.description,
        visibility: detail.visibility,
        category: detail.category ?? '',
        voice_id: detail.voice_id ?? '',
        greeting: detail.greeting ?? '',
        role_id: detail.role_id ?? '',
        temperature: detail.temperature ?? 0.7,
      })
      setDialogOpen(true)
    } catch (err) {
      toast.error(`加载助手详情失败: ${getErrorMessage(err)}`)
    }
  }, [])

  const handleAvatarChange = useCallback(async (file: File | undefined) => {
    if (!file) return
    setAvatarUploading(true)
    try {
      const { url } = await uploadAgentAvatar(file)
      setForm((prev) => ({ ...prev, avatar: url }))
      toast.success('头像已上传，保存后生效')
    } catch (err) {
      toast.error(`头像上传失败: ${getErrorMessage(err)}`)
    } finally {
      setAvatarUploading(false)
    }
  }, [])

  const handleSubmit = useCallback(() => {
    if (!form.provider.trim()) {
      toast.error('provider 不能为空')
      return
    }
    if (dialogMode === 'create' && !form.nickname.trim()) {
      toast.error('昵称不能为空')
      return
    }
    const input: AiAgentUpsertInput = {
      user_id: form.user_id,
      nickname: form.nickname.trim() || undefined,
      account: dialogMode === 'create' ? form.account.trim() || undefined : undefined,
      avatar: form.avatar || undefined,
      provider: form.provider.trim(),
      role_id: form.role_id.trim() || undefined,
      model: form.model.trim() || undefined,
      description: form.description,
      visibility: form.visibility,
      category: form.category.trim() || undefined,
      voice_id: form.voice_id.trim() || undefined,
      greeting: form.greeting,
      temperature: form.temperature,
    }
    upsertMutation.mutate(input)
  }, [form, dialogMode, upsertMutation])

  const columns = useMemo<LegacyColumnDef<AiAgentListItem>[]>(
    () => [
      {
        header: '助手',
        accessorKey: 'nickname',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.nickname || '(未命名)'}</span>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(row.original.user_id)
                toast.success('UID 已复制')
              }}
            >
              <Copy className="h-3 w-3" />
              {row.original.user_id}
            </button>
          </div>
        ),
      },
      {
        header: '模型',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.provider}
            {row.original.model ? ` / ${row.original.model}` : ''}
          </span>
        ),
      },
      {
        header: '角色',
        cell: ({ row }) => (
          <div className="flex flex-col text-sm">
            <span>{row.original.role_name || row.original.role_id || '未绑定'}</span>
            {row.original.role_version ? (
              <span className="text-xs text-muted-foreground">
                已发布 v{row.original.role_version}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        header: '可见性',
        cell: ({ row }) =>
          row.original.visibility === 1 ? (
            <Badge variant="default">公开</Badge>
          ) : (
            <Badge variant="secondary">私有</Badge>
          ),
      },
      {
        header: '状态',
        cell: ({ row }) =>
          row.original.status === 1 ? (
            <Badge variant="default">启用</Badge>
          ) : (
            <Badge variant="destructive">停用</Badge>
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
            <Button variant="ghost" size="sm" onClick={() => setStatusConfirm(row.original)}>
              <Power className="mr-1 h-3.5 w-3.5" />
              {row.original.status === 1 ? '停用' : '启用'}
            </Button>
          </div>
        ),
      },
    ],
    [openEdit]
  )

  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) return <LoadingState message="加载 AI 助手列表..." />
  if (error) return <ErrorState message="加载 AI 助手列表失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 助手管理"
        description="管理透明 AI 助手（account_type=1）。公开助手进入客户端助手广场；停用后不再回复也不可发现。"
      />

      <FilterBar
        onReset={categoryInput ? () => {
          setCategoryInput('')
          setParams({ page: 1, category: '' })
        } : undefined}
        extraActions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            新建助手
          </Button>
        }
      >
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">分类</span>
          <Input
            data-testid="category-filter"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={categoryInput}
            placeholder="输入分类筛选"
            onChange={(e) => setCategoryInput(e.target.value)}
          />
        </label>
      </FilterBar>

      <DataTable table={table} />
      <DataTablePagination
        page={params.page}
        pageSize={params.size}
        total={data?.total ?? 0}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(size) => setParams({ page: 1, size })}
        dataUpdatedAt={dataUpdatedAt}
        onRefresh={() => refetch()}
      />

      {/* 新建/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? '新建 AI 助手' : '编辑 AI 助手'}</DialogTitle>
            <DialogDescription>
              角色模板统一维护提示词、能力和知识库策略；此处只管理助手身份与运行参数。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {dialogMode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="f_account">账号（account，可留空自动生成）</Label>
                <Input
                  id="f_account"
                  value={form.account}
                  onChange={(e) => setForm({ ...form, account: e.target.value })}
                  placeholder="如 ai_chat_pal"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="f_nickname">昵称</Label>
                <Input
                  id="f_nickname"
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f_provider">Provider</Label>
                <Input
                  id="f_provider"
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  placeholder="qianfan / openai"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f_role_id">角色模板（行为配置继承自已发布角色）</Label>
              <select
                id="f_role_id"
                data-testid="f-role-id"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
              >
                <option value="">未绑定（仅兼容历史助手）</option>
                {form.role_id &&
                !roleOptions.some((role) => role.code === form.role_id) ? (
                  <option value={form.role_id}>当前角色：{form.role_id}（已停用或不可用）</option>
                ) : null}
                {roleOptions.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.name}（{role.code}，v{role.active_version || '草稿'}）
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                绑定角色后，提示词、知识库和群/主动能力以角色发布版本为准。
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f_model">模型（可选，留空用 provider 默认）</Label>
              <Input
                id="f_model"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="如 deepseek-chat"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f_desc">简介（description，助手广场展示）</Label>
              <Input
                id="f_desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-4 rounded-lg border p-4">
              {form.avatar ? (
                <img
                  data-testid="avatar-preview"
                  src={form.avatar}
                  alt="头像"
                  className="h-14 w-14 rounded-full border object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                  无头像
                </div>
              )}
              <div className="space-y-1">
                <span className="font-medium">头像</span>
                <p className="text-xs text-muted-foreground">上传后保存到 Garage，随用户资料展示</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={avatarUploading}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  {avatarUploading ? '上传中...' : '上传头像'}
                </Button>
                <input
                  ref={avatarInputRef}
                  data-testid="avatar-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    void handleAvatarChange(file)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="f_category">分类（category，助手广场分组展示）</Label>
                <Input
                  id="f_category"
                  data-testid="f-category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="如 medical / legal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f_voice">语音音色（voice_id）</Label>
                <Input
                  id="f_voice"
                  data-testid="f-voice"
                  value={form.voice_id}
                  onChange={(e) => setForm({ ...form, voice_id: e.target.value })}
                  placeholder="如 xiaoyan / zh-CN-XiaoxiaoNeural"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f_greeting">欢迎语（greeting，会话开场白）</Label>
              <Input
                id="f_greeting"
                data-testid="f-greeting"
                value={form.greeting}
                onChange={(e) => setForm({ ...form, greeting: e.target.value })}
                placeholder="您好，我是您的专属助手……"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="f_temperature">温度（temperature，0-1）</Label>
                <Input
                  id="f_temperature"
                  data-testid="f-temperature"
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={String(form.temperature)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      temperature: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              提示词和能力由角色模板统一维护。助手页只负责身份、模型、可见性与角色绑定；
              未绑定角色的历史助手继续由后端兼容字段运行，但新页面不会再覆盖这些字段。
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <span className="font-medium">公开可发现</span>
                <p className="text-sm text-muted-foreground">开启后进入客户端助手广场</p>
              </div>
              <Switch
                checked={form.visibility === 1}
                onCheckedChange={(v) => setForm({ ...form, visibility: v ? 1 : 0 })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 启停确认 */}
      <ConfirmDialog
        open={Boolean(statusConfirm)}
        onOpenChange={(open) => !open && setStatusConfirm(null)}
        title={statusConfirm?.status === 1 ? '停用 AI 助手' : '启用 AI 助手'}
        description={
          statusConfirm?.status === 1
            ? `停用「${statusConfirm?.nickname}」后将不再回复消息，也不会出现在助手广场。`
            : `启用「${statusConfirm?.nickname}」后将恢复回复并可被发现。`
        }
        loading={statusMutation.isPending}
        onConfirm={() => {
          if (statusConfirm) {
            statusMutation.mutate({
              userId: statusConfirm.user_id,
              status: statusConfirm.status === 1 ? 0 : 1,
            })
          }
        }}
      />
    </div>
  )
}
