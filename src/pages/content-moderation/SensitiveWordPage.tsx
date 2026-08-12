import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LegacyColumnDef, getCoreRowModel, useLegacyTable } from '@tanstack/react-table/legacy'
import { Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DataTable,
  DataTablePagination,
  LoadingState,
  ErrorState,
  PageHeader,
  StatusBadge,
  ConfirmDialog,
} from '@/components/shared'
import {
  getSensitiveWordListPayload,
  createSensitiveWord,
  deleteSensitiveWord,
  importSensitiveWords,
  type SensitiveWord,
} from '@/services/api/moderation'
import { formatDate } from '@/lib/utils'
import { useListQueryState } from '@/hooks/useListQueryState'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import { Select } from '@/components/ui/select'

type PageQuery = {
  page: number
  size: number
  keyword: string
  category: string
}

const SEVERITY_LABELS: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
}

const SEVERITY_VARIANTS: Record<string, 'success' | 'warning' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
}

const CATEGORY_OPTIONS = [
  { value: '', label: '全部分类' },
  { value: 'politics', label: '政治敏感' },
  { value: 'pornography', label: '色情低俗' },
  { value: 'violence', label: '暴力恐怖' },
  { value: 'spam', label: '广告垃圾' },
  { value: 'fraud', label: '诈骗欺诈' },
  { value: 'custom', label: '自定义' },
]

export function SensitiveWordPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { state: params, setState: setParams } = useListQueryState<PageQuery>({
    page: 1,
    size: 10,
    keyword: '',
    category: '',
  })

  const [showAddForm, setShowAddForm] = useState(false)
  const [newWord, setNewWord] = useState('')
  const [newCategory, setNewCategory] = useState('custom')
  const [newSeverity, setNewSeverity] = useState<SensitiveWord['severity']>('medium')
  const [deleteTarget, setDeleteTarget] = useState<EntityId | null>(null)

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['sensitive-words', params],
    queryFn: () => getSensitiveWordListPayload(params),
  })

  const createMutation = useMutation({
    mutationFn: createSensitiveWord,
    onSuccess: () => {
      toast.success('敏感词已添加')
      setNewWord('')
      setShowAddForm(false)
      queryClient.invalidateQueries({ queryKey: ['sensitive-words'] })
    },
    onError: (err: unknown) => toast.error(`添加失败: ${getErrorMessage(err)}`),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSensitiveWord,
    onSuccess: () => {
      toast.success('敏感词已删除')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['sensitive-words'] })
    },
    onError: (err: unknown) => toast.error(`删除失败: ${getErrorMessage(err)}`),
  })

  const importMutation = useMutation({
    mutationFn: importSensitiveWords,
    onSuccess: (res) => {
      const payload = res.payload
      if (payload) {
        toast.success(`导入完成：成功 ${payload.imported} 条，跳过 ${payload.skipped} 条`)
      } else {
        toast.success('CSV 导入完成')
      }
      queryClient.invalidateQueries({ queryKey: ['sensitive-words'] })
    },
    onError: (err: unknown) => toast.error(`导入失败: ${getErrorMessage(err)}`),
  })

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter((l) => l.trim())
      const words = lines
        .slice(1) // skip header row
        .map((line) => {
          const [word, category = 'custom', severity = 'medium'] = line.split(',').map((s) => s.trim())
          return {
            word,
            category,
            severity: (['low', 'medium', 'high'].includes(severity) ? severity : 'medium') as SensitiveWord['severity'],
          }
        })
        .filter((item) => item.word)

      importMutation.mutate(words)
    }
    reader.readAsText(file)
    // reset input so re-selecting same file triggers onChange
    event.target.value = ''
  }

  const columns: LegacyColumnDef<SensitiveWord>[] = [
    {
      accessorKey: 'word',
      header: '关键词',
      cell: ({ row }) => (
        <span className="font-mono font-medium">{row.original.word}</span>
      ),
    },
    {
      accessorKey: 'category',
      header: '分类',
      cell: ({ row }) => {
        const cat = CATEGORY_OPTIONS.find((o) => o.value === row.original.category)
        return <span className="text-sm">{cat?.label ?? row.original.category}</span>
      },
    },
    {
      accessorKey: 'severity',
      header: '风险等级',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.severity}
          labels={SEVERITY_LABELS}
          variants={SEVERITY_VARIANTS}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: '添加时间',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          title="删除"
          onClick={() => setDeleteTarget(row.original.id)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ]

  const table = useLegacyTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading && !data) return <LoadingState message="加载敏感词列表..." />
  if (error) return <ErrorState message="加载敏感词列表失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="敏感词黑名单"
        description="管理平台敏感词过滤规则，支持批量 CSV 导入"
        actions={
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileImport}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
            >
              <Upload className="mr-2 h-4 w-4" />
              导入 CSV
            </Button>
            <Button onClick={() => setShowAddForm((v) => !v)}>
              <Plus className="mr-2 h-4 w-4" />
              添加关键词
            </Button>
          </div>
        }
      />

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>添加敏感词</CardTitle>
            <CardDescription>CSV 格式要求：第一行为 word,category,severity（可跳过），数据行每列逗号分隔</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="new-word">关键词</Label>
                <Input
                  id="new-word"
                  placeholder="输入敏感词"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  className="w-48"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-category">分类</Label>
                <Select
                  id="new-category"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  {CATEGORY_OPTIONS.slice(1).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-severity">风险等级</Label>
                <Select
                  id="new-severity"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value as SensitiveWord['severity'])}
                >
                  <option value="low">低风险</option>
                  <option value="medium">中风险</option>
                  <option value="high">高风险</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    if (!newWord.trim()) { toast.error('请输入关键词'); return }
                    createMutation.mutate({ word: newWord.trim(), category: newCategory, severity: newSeverity })
                  }}
                  disabled={createMutation.isPending}
                >
                  添加
                </Button>
                <Button variant="outline" onClick={() => setShowAddForm(false)}>
                  取消
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="搜索关键词"
              value={params.keyword}
              onChange={(e) => setParams({ keyword: e.target.value, page: 1 })}
              className="max-w-xs"
            />
            <Select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={params.category}
              onChange={(e) => setParams({ category: e.target.value, page: 1 })}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable table={table} emptyMessage="暂无敏感词，请点击「添加关键词」或导入 CSV" />
          <DataTablePagination
            page={params.page}
            pageSize={params.size}
            total={data?.total ?? 0}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ size: s, page: 1 })}
            dataUpdatedAt={dataUpdatedAt}
            onRefresh={() => refetch()}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="确认删除"
        description="删除后该关键词将不再触发过滤，确认继续？"
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget)
        }}
      />
    </div>
  )
}
