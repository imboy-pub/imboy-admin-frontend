import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { toast } from 'sonner'
import { ArrowLeft, Download, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ConfirmDialog,
  DataTable,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  deleteGroupTag,
  getGroupTagsPayload,
  GroupTag,
} from '@/services/api/groupEnhancements'
import { formatOptionalDate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import { useAdminPermission } from '@/hooks/useAdminPermission'

export function GroupTagManagePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const gid = id ?? ''

  const [confirmDeleteTagName, setConfirmDeleteTagName] = useState('')
  const { allowed: canDeleteTag } = useAdminPermission({
    permission: 'groups:tag:delete',
    roles: [1, 2],
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['group-tags', gid],
    queryFn: () => getGroupTagsPayload(gid),
    enabled: gid.length > 0,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGroupTag,
    onSuccess: async () => {
      toast.success('标签已删除')
      setConfirmDeleteTagName('')
      await queryClient.invalidateQueries({ queryKey: ['group-tags', gid] })
    },
    onError: (err: Error) => {
      toast.error(`删除标签失败: ${err.message}`)
    },
  })

  const columns: ColumnDef<GroupTag>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.id ?? '-')}</span>,
      },
      {
        accessorKey: 'tag_name',
        header: '标签名',
        cell: ({ row }) => <span className="font-medium">{row.original.tag_name}</span>,
      },
      {
        accessorKey: 'created_by',
        header: '创建者',
        cell: ({ row }) => <span className="font-mono">{String(row.original.created_by ?? '-')}</span>,
      },
      {
        accessorKey: 'created_at',
        header: '创建时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatOptionalDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {canDeleteTag && (
              <Button
                variant="ghost"
                size="icon"
                title="删除标签"
                onClick={() => setConfirmDeleteTagName(row.original.tag_name)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canDeleteTag]
  )

  const tags = data?.items || []

  const handleExportCsv = () => {
    const csvColumns: CsvColumn<GroupTag>[] = [
      { header: 'ID', accessor: (row) => String(row.id ?? '-') },
      { header: '标签名', accessor: (row) => row.tag_name || '-' },
      { header: '创建者ID', accessor: (row) => String(row.created_by ?? '-') },
      { header: '创建时间', accessor: (row) => formatOptionalDate(row.created_at) },
    ]
    exportCsv(csvColumns, tags, 'group_tags')
    toast.success(`已导出 ${tags.length} 条数据`)
  }
  const table = useReactTable({
    data: tags,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载群标签数据..." />
  }

  if (error) {
    return <ErrorState message="加载群标签数据失败" onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群标签管理"
        description={`群组 ${gid} 的标签列表与治理操作`}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={tags.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
            <Button variant="outline" onClick={() => navigate(`/groups/${gid}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回群详情
          </Button>
          </>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>标签列表（共 {data?.total ?? tags.length} 项）</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable table={table} />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={canDeleteTag && confirmDeleteTagName.length > 0}
        onOpenChange={(open) => setConfirmDeleteTagName(open ? confirmDeleteTagName : '')}
        title="确认删除标签"
        description={`确定要删除标签 ${confirmDeleteTagName} 吗？`}
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() =>
          deleteMutation.mutate({
            gid,
            tag_name: confirmDeleteTagName,
          })
        }
      />
    </div>
  )
}
