import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useReactTable, getCoreRowModel, type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Plus, Pencil, Power, Copy } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import {
  PageHeader,
  LoadingState,
  ErrorState,
  DataTable,
  DataTablePagination,
  ConfirmDialog,
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
  type AiAgentListItem,
  type AiAgentUpsertInput,
} from '../api/public'

const LIST_KEY = 'ai_agent'

interface AgentForm {
  user_id?: EntityId
  account: string
  nickname: string
  provider: string
  model: string
  system_prompt: string
  description: string
  visibility: 0 | 1
}

const EMPTY_FORM: AgentForm = {
  account: '',
  nickname: '',
  provider: 'qianfan',
  model: '',
  system_prompt: '',
  description: '',
  visibility: 1,
}

export function AiAgentListPage() {
  const queryClient = useQueryClient()
  const { state: params, setState: setParams } = useListQueryState<{ page: number; size: number }>({
    page: 1,
    size: 10,
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<AgentForm>(EMPTY_FORM)
  const [statusConfirm, setStatusConfirm] = useState<AiAgentListItem | null>(null)

  const requestParams = { page: params.page, size: params.size }

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
        provider: detail.provider,
        model: detail.model,
        system_prompt: detail.system_prompt,
        description: detail.description,
        visibility: detail.visibility,
      })
      setDialogOpen(true)
    } catch (err) {
      toast.error(`加载助手详情失败: ${getErrorMessage(err)}`)
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
      provider: form.provider.trim(),
      model: form.model.trim() || undefined,
      system_prompt: form.system_prompt,
      description: form.description,
      visibility: form.visibility,
    }
    upsertMutation.mutate(input)
  }, [form, dialogMode, upsertMutation])

  const columns = useMemo<ColumnDef<AiAgentListItem>[]>(
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

  const table = useReactTable({
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

      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新建助手
        </Button>
      </div>

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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? '新建 AI 助手' : '编辑 AI 助手'}</DialogTitle>
            <DialogDescription>
              角色提示词（system_prompt）定义助手人设，须明确声明 AI 身份。
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
            <div className="space-y-2">
              <Label htmlFor="f_prompt">角色提示词（system_prompt）</Label>
              <Textarea
                id="f_prompt"
                rows={6}
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="你是 imboy 的 AI 助手……（须明确声明 AI 身份）"
              />
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
