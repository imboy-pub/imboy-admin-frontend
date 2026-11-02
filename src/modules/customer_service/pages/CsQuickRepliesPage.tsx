/**
 * 客服快捷回复管理页（V3-27 快捷回复子能力）。
 *
 * 合同真源：.task-state/imboy-garage-direct-v1/v3/specs/cs-quick-reply.md
 * - read（customer_service:read）：分页列表 + 搜索（title 包含匹配，服务端裁决）；
 * - write（customer_service:write）：新建 / 编辑 / 删除（软删）；
 * - 分页 DataTablePagination 约定：默认 size:10，分页/筛选变化重置 page=1；
 * - 防重复提交（合同 §5）：提交 pending 期间按钮禁用，不产生第二个写请求；
 * - 权限门 fail-closed：无 read 权限整页只呈现「无权访问」，不发起列表请求。
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageSquareText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { OrganizationWorkspacePicker } from '@/components/shared/OrganizationWorkspacePicker'
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useListQueryState } from '@/hooks/useListQueryState'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import { useOrgWorkspaceScope } from './useOrgWorkspaceScope'
import {
  QUICK_REPLY_CONTENT_MAX,
  QUICK_REPLY_TITLE_MAX,
  hasQuickReplyFormErrors,
  validateQuickReplyInput,
  type QuickReply,
} from '../api/quickRepliesPure'
import {
  QUICK_REPLY_DEFAULT_PAGE_SIZE,
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  updateQuickReply,
} from '../api/quickReplies'

const READ_PERMISSION = 'customer_service:read'
const WRITE_PERMISSION = 'customer_service:write'

type QuickReplyFormValues = {
  title: string
  content: string
  sort: string
}

const EMPTY_FORM: QuickReplyFormValues = { title: '', content: '', sort: '0' }

/** sort 输入 → 安全整数（非法 → null，表单预拒）。 */
function parseSortInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^-?\d{1,9}$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isSafeInteger(value) ? value : null
}

export function CsQuickRepliesPage() {
  const { state, setState } = useListQueryState<{
    page: number
    size: number
    search: string
  }>({ page: 1, size: QUICK_REPLY_DEFAULT_PAGE_SIZE, search: '' })
  const scope = useOrgWorkspaceScope()
  const organizationId = scope.organizationId ?? ''
  const workspaceId = scope.workspaceId ?? ''
  const scopeReady = organizationId.length > 0 && workspaceId.length > 0
  const search = state.search.trim()

  const { allowed: canRead, loading: readPermLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const listQuery = useQuery({
    queryKey: ['customer_service', 'quick_replies', organizationId, workspaceId, state.page, state.size, search],
    queryFn: () =>
      listQuickReplies({
        organizationId,
        workspaceId,
        page: state.page,
        size: state.size,
        search,
      }),
    enabled: scopeReady && canRead && !readPermLoading,
  })

  const queryClient = useQueryClient()
  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: ['customer_service', 'quick_replies'] })
  }

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<QuickReply | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<QuickReply | null>(null)

  const createMutation = useMutation({
    mutationFn: (input: { title: string; content: string; sort: number }) =>
      createQuickReply({ organizationId, workspaceId, title: input.title, content: input.content, sort: input.sort }),
    onSuccess: () => {
      toast.success('快捷回复已创建')
      setCreateOpen(false)
      invalidateList()
    },
    onError: (error) => toast.error(`创建失败：${getErrorMessage(error)}`),
  })

  const updateMutation = useMutation({
    mutationFn: (input: { quickReplyId: EntityId; title: string; content: string; sort: number }) =>
      updateQuickReply(input.quickReplyId, {
        organizationId,
        workspaceId,
        title: input.title,
        content: input.content,
        sort: input.sort,
      }),
    onSuccess: () => {
      toast.success('快捷回复已更新')
      setEditTarget(null)
      invalidateList()
    },
    onError: (error) => toast.error(`更新失败：${getErrorMessage(error)}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (row: QuickReply) =>
      deleteQuickReply({ organizationId, workspaceId, quickReplyId: row.id }),
    onSuccess: () => {
      toast.success('快捷回复已删除')
      setDeleteTarget(null)
      invalidateList()
    },
    onError: (error) => toast.error(`删除失败：${getErrorMessage(error)}`),
  })

  const pageData = listQuery.data ?? null
  const rows = useMemo(() => pageData?.list ?? [], [pageData])

  return (
    <div className="space-y-4" data-page="cs-quick-replies">
      <PageHeader
        title="快捷回复"
        description="管理坐席工作台可一键插入的快捷回复（按工作区隔离）。"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">租户范围（必填）</CardTitle>
          <Button
            size="sm"
            disabled={!canWrite || !scopeReady || createMutation.isPending}
            title={canWrite ? undefined : '需要 customer_service:write 权限'}
            onClick={() => setCreateOpen(true)}
            data-testid="csqr-create-open"
          >
            新建快捷回复
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>组织 / 工作区</Label>
            <OrganizationWorkspacePicker
              organizationId={scope.organizationId}
              workspaceId={scope.workspaceId}
              organizations={scope.organizations}
              workspaces={scope.workspaces}
              loading={scope.loading}
              onChange={scope.onChange}
            />
            <p className="text-xs text-muted-foreground">
              快捷回复归属工作区；组织/工作区来自共享选择器，上下文写入 URL（org/ws），禁止手填 TSID。
            </p>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="csqr-search">搜索标题</Label>
            <Input
              id="csqr-search"
              value={state.search}
              placeholder="按标题搜索"
              data-testid="csqr-search"
              onChange={(event) => setState({ page: 1, search: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">搜索条件变化时分页重置到第 1 页。</p>
          </div>
        </CardContent>
      </Card>

      {!scopeReady ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<MessageSquareText className="h-10 w-10" />}
              title="请先填写组织与工作区"
              description="快捷回复归属工作区；管理接口要求显式提供 org 与 workspace。"
            />
          </CardContent>
        </Card>
      ) : !canRead || readPermLoading ? (
        <Card>
          <CardContent className="py-8" data-testid="csqr-permission-denied">
            {readPermLoading ? (
              <LoadingState message="校验权限…" />
            ) : (
              <EmptyState
                icon={<MessageSquareText className="h-10 w-10" />}
                title="无权访问"
                description="需要 customer_service:read 权限。"
              />
            )}
          </CardContent>
        </Card>
      ) : listQuery.isLoading ? (
        <Card>
          <CardContent className="py-8">
            <LoadingState message="加载快捷回复…" />
          </CardContent>
        </Card>
      ) : listQuery.error !== null && listQuery.error !== undefined ? (
        <Card>
          <CardContent className="py-8">
            <ErrorState
              message={`加载快捷回复失败：${getErrorMessage(listQuery.error)}`}
              onRetry={() => void listQuery.refetch()}
            />
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<MessageSquareText className="h-10 w-10" />}
              title={search.length > 0 ? '没有匹配的快捷回复' : '暂无快捷回复'}
              description={search.length > 0 ? '调整搜索关键词后重试。' : '点击「新建快捷回复」创建第一条。'}
            />
          </CardContent>
        </Card>
      ) : (
        <QuickReplyTable
          rows={rows}
          page={pageData?.page ?? state.page}
          size={pageData?.size ?? state.size}
          total={pageData?.total ?? rows.length}
          canWrite={canWrite}
          onPageChange={(page) => setState({ page })}
          onPageSizeChange={(size) => setState({ page: 1, size })}
          onRefresh={() => void listQuery.refetch()}
          onEdit={setEditTarget}
          onDelete={setDeleteTarget}
        />
      )}

      <QuickReplyFormDialog
        key={createOpen ? 'create-open' : 'create-closed'}
        open={createOpen}
        pending={createMutation.isPending}
        title="新建快捷回复"
        description="创建后坐席工作台立即可用（按当前工作区隔离）。"
        initial={EMPTY_FORM}
        onOpenChange={setCreateOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        submitLabel="创建"
      />

      <QuickReplyFormDialog
        key={editTarget === null ? 'edit-closed' : `edit-${editTarget.id}`}
        open={editTarget !== null}
        pending={updateMutation.isPending}
        title="编辑快捷回复"
        description="保存后立即生效；排序值小的排在前面。"
        initial={
          editTarget === null
            ? EMPTY_FORM
            : { title: editTarget.title, content: editTarget.content, sort: String(editTarget.sort) }
        }
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        onSubmit={(values) => {
          if (editTarget === null) return
          updateMutation.mutate({ quickReplyId: editTarget.id, ...values })
        }}
        submitLabel="保存"
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="删除快捷回复"
        description="删除后坐席工作台不再显示该条快捷回复（软删，可由数据库管理员恢复）。"
        confirmText="删除"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget)
        }}
      />
    </div>
  )
}

function QuickReplyTable({
  rows,
  page,
  size,
  total,
  canWrite,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  onEdit,
  onDelete,
}: {
  rows: QuickReply[]
  page: number
  size: number
  total: number
  canWrite: boolean
  onPageChange: (_page: number) => void
  onPageSizeChange: (_size: number) => void
  onRefresh: () => void
  onEdit: (_row: QuickReply) => void
  onDelete: (_row: QuickReply) => void
}) {
  const columns = useMemo<LegacyColumnDef<QuickReply>[]>(
    () => [
      { header: '排序', accessorKey: 'sort' },
      {
        header: '标题',
        cell: ({ row }) => (
          <span className="font-medium" data-testid="csqr-row-title">
            {row.original.title}
          </span>
        ),
      },
      {
        header: '内容',
        cell: ({ row }) => (
          <span className="block max-w-[280px] truncate text-xs" title={row.original.content}>
            {row.original.content}
          </span>
        ),
      },
      {
        header: '状态',
        cell: () => <Badge className="bg-green-100 text-green-800">启用</Badge>,
      },
      {
        header: '操作',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canWrite}
              title={canWrite ? undefined : '需要 customer_service:write 权限'}
              onClick={() => onEdit(row.original)}
            >
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={!canWrite}
              title={canWrite ? undefined : '需要 customer_service:write 权限'}
              onClick={() => onDelete(row.original)}
            >
              删除
            </Button>
          </div>
        ),
      },
    ],
    [canWrite, onEdit, onDelete]
  )
  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <Card>
      <CardContent className="space-y-3">
        <DataTable table={table} loading={false} emptyMessage="暂无快捷回复" />
        <DataTablePagination
          page={page}
          pageSize={size}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          onRefresh={onRefresh}
        />
      </CardContent>
    </Card>
  )
}

/** 创建/编辑共用表单弹窗（pending 门防重复提交，合同 §5）。 */
function QuickReplyFormDialog(props: {
  open: boolean
  pending: boolean
  title: string
  description: string
  initial: QuickReplyFormValues
  onOpenChange: (_open: boolean) => void
  onSubmit: (_values: { title: string; content: string; sort: number }) => void
  submitLabel: string
}) {
  const [values, setValues] = useState(props.initial)
  const [touched, setTouched] = useState(false)
  const sortValue = parseSortInput(values.sort)
  const errors = validateQuickReplyInput({
    title: values.title,
    content: values.content,
    sort: sortValue ?? Number.NaN,
  })
  const submitDisabled = props.pending || !touched || hasQuickReplyFormErrors(errors) || sortValue === null

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onOpenChange(false)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="csqr-form-title">标题（{QUICK_REPLY_TITLE_MAX} 字符内）</Label>
            <Input
              id="csqr-form-title"
              maxLength={QUICK_REPLY_TITLE_MAX + 10}
              value={values.title}
              data-testid="csqr-form-title"
              onChange={(event) => {
                setTouched(true)
                setValues((prev) => ({ ...prev, title: event.target.value }))
              }}
              placeholder="例如：问候语"
            />
            {touched && errors.title !== null && (
              <p className="text-xs text-destructive" data-testid="csqr-form-title-error">
                {errors.title}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csqr-form-content">内容（{QUICK_REPLY_CONTENT_MAX} 字符内）</Label>
            <Textarea
              id="csqr-form-content"
              rows={4}
              value={values.content}
              data-testid="csqr-form-content"
              onChange={(event) => {
                setTouched(true)
                setValues((prev) => ({ ...prev, content: event.target.value }))
              }}
              placeholder="您好，很高兴为您服务…"
            />
            {touched && errors.content !== null && (
              <p className="text-xs text-destructive" data-testid="csqr-form-content-error">
                {errors.content}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csqr-form-sort">排序（整数，小值在前）</Label>
            <Input
              id="csqr-form-sort"
              value={values.sort}
              data-testid="csqr-form-sort"
              onChange={(event) => {
                setTouched(true)
                setValues((prev) => ({ ...prev, sort: event.target.value }))
              }}
              placeholder="0"
            />
            {touched && sortValue === null && (
              <p className="text-xs text-destructive" data-testid="csqr-form-sort-error">
                排序必须为整数
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={submitDisabled}
            aria-disabled={submitDisabled}
            data-testid="csqr-form-submit"
            onClick={() => props.onSubmit({ title: values.title, content: values.content, sort: sortValue ?? 0 })}
          >
            {props.pending ? '提交中…' : props.submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
