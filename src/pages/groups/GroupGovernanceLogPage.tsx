import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowLeft, Search, ShieldCheck, Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  DataTable,
  DataTablePagination,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  getGroupGovernanceLogsPayload,
  GroupGovernanceLog,
  GroupGovernanceLogListParams,
} from '@/modules/groups/api/enhancements'
import { formatOptionalDate, truncate } from '@/lib/utils'
import { exportCsv, type CsvColumn } from '@/lib/csvExport'
import { toast } from 'sonner'
import { useListQueryState } from '@/hooks/useListQueryState'

function normalizeTimestamp(value: string): string | undefined {
  const normalized = value.trim()
  if (!normalized) return undefined
  if (/^\d+$/.test(normalized)) return normalized

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString()
}

function summarizeExtra(extra?: Record<string, unknown>): string {
  if (!extra || typeof extra !== 'object') return '-'
  const entries = Object.entries(extra)
  if (entries.length === 0) return '-'
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(' | ')
}

type GroupGovernanceLogQuery = {
  page: number
  size: number
  uidFilter: string
  actionFilter: string
  targetIdFilter: string
  keywordFilter: string
  fromTsFilter: string
  toTsFilter: string
}

export function GroupGovernanceLogPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const gid = id ?? ''

  const { state: params, setState: setParams } = useListQueryState<GroupGovernanceLogQuery>({
    page: 1,
    size: 10,
    uidFilter: '',
    actionFilter: '',
    targetIdFilter: '',
    keywordFilter: '',
    fromTsFilter: '',
    toTsFilter: '',
  })

  const [selectedBody, setSelectedBody] = useState('')

  const [uidInput, setUidInput] = useState(params.uidFilter || '')
  const [actionInput, setActionInput] = useState(params.actionFilter || '')
  const [targetIdInput, setTargetIdInput] = useState(params.targetIdFilter || '')
  const [keywordInput, setKeywordInput] = useState(params.keywordFilter || '')
  const [fromTsInput, setFromTsInput] = useState(params.fromTsFilter || '')
  const [toTsInput, setToTsInput] = useState(params.toTsFilter || '')

  const queryParams = useMemo<GroupGovernanceLogListParams>(() => {
    const p: GroupGovernanceLogListParams = {
      page: params.page,
      size: params.size,
      group_id: gid,
    }
    if (params.uidFilter) {
      p.uid = params.uidFilter
    }
    if (params.actionFilter) p.action = params.actionFilter
    if (params.targetIdFilter) p.target_id = params.targetIdFilter
    if (params.keywordFilter) p.keyword = params.keywordFilter

    const fromTs = normalizeTimestamp(params.fromTsFilter)
    if (fromTs) p.from_ts = fromTs
    const toTs = normalizeTimestamp(params.toTsFilter)
    if (toTs) p.to_ts = toTs

    return p
  }, [params.actionFilter, params.fromTsFilter, gid, params.keywordFilter, params.page, params.size, params.targetIdFilter, params.toTsFilter, params.uidFilter])

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['group-governance-logs', queryParams],
    queryFn: () => getGroupGovernanceLogsPayload(queryParams),
    enabled: gid.length > 0,
  })

  const columns: ColumnDef<GroupGovernanceLog>[] = useMemo(
    () => [
      {
        accessorKey: 'occurred_at',
        header: '发生时间',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatOptionalDate(row.original.occurred_at || row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'action',
        header: '治理动作',
        cell: ({ row }) => (
          <span className="rounded bg-muted px-2 py-1 font-mono text-xs">{row.original.action || '-'}</span>
        ),
      },
      {
        accessorKey: 'uid',
        header: '操作人',
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-mono text-xs">{String(row.original.operator_uid ?? row.original.uid)}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.nickname || row.original.account || '-'}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'target_id',
        header: '目标ID',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{String(row.original.target_id ?? '-')}</span>
        ),
      },
      {
        accessorKey: 'extra',
        header: '附加信息',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {truncate(summarizeExtra(row.original.extra), 120)}
          </span>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: data?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return <LoadingState message="加载群治理日志..." />
  }

  if (error) {
    return <ErrorState message="加载群治理日志失败" onRetry={() => refetch()} />
  }

  const logs = data?.items || []

  const handleExportCsv = () => {
    const csvColumns: CsvColumn<GroupGovernanceLog>[] = [
      { header: '发生时间', accessor: (row) => formatOptionalDate(row.occurred_at || row.created_at) },
      { header: '治理动作', accessor: 'action' },
      { header: '操作人UID', accessor: (row) => String(row.operator_uid ?? row.uid ?? '-') },
      { header: '账号', accessor: (row) => row.account || '-' },
      { header: '昵称', accessor: (row) => row.nickname || '-' },
      { header: '目标ID', accessor: (row) => String(row.target_id ?? '-') },
      { header: '群组ID', accessor: (row) => String(row.group_id ?? '-') },
      { header: '附加信息', accessor: (row) => summarizeExtra(row.extra) },
    ]
    exportCsv(csvColumns, logs, 'group_governance_logs')
    toast.success(`已导出 ${logs.length} 条治理日志`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群治理审计日志"
        description={`群组 ${gid} 的治理动作审计记录`}
        actions={(
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={logs.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
            <Button variant="outline" onClick={() => navigate(`/groups/context?gid=${gid}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回群上下文入口
            </Button>
          </div>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            检索条件
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="操作人 UID（可选）"
              value={uidInput}
              onChange={(event) => setUidInput(event.target.value)}
            />
            <Input
              placeholder="治理动作（如 close_task）"
              value={actionInput}
              onChange={(event) => setActionInput(event.target.value)}
            />
            <Input
              placeholder="目标 ID（可选）"
              value={targetIdInput}
              onChange={(event) => setTargetIdInput(event.target.value)}
            />
            <Input
              placeholder="关键字（账号/昵称/body）"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
            />
            <Input
              placeholder="起始时间（ISO 或时间戳）"
              value={fromTsInput}
              onChange={(event) => setFromTsInput(event.target.value)}
            />
            <Input
              placeholder="结束时间（ISO 或时间戳）"
              value={toTsInput}
              onChange={(event) => setToTsInput(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setParams({
                  uidFilter: uidInput.trim(),
                  actionFilter: actionInput.trim(),
                  targetIdFilter: targetIdInput.trim(),
                  keywordFilter: keywordInput.trim(),
                  fromTsFilter: fromTsInput.trim(),
                  toTsFilter: toTsInput.trim(),
                  page: 1,
                })
              }}
            >
              <Search className="mr-2 h-4 w-4" />
              查询
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setUidInput('')
                setActionInput('')
                setTargetIdInput('')
                setKeywordInput('')
                setFromTsInput('')
                setToTsInput('')
                setParams({
                  uidFilter: '',
                  actionFilter: '',
                  targetIdFilter: '',
                  keywordFilter: '',
                  fromTsFilter: '',
                  toTsFilter: '',
                  page: 1,
                })
              }}
            >
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>日志列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable
            table={table}
            onRowClick={(row) => setSelectedBody(row.body || '')}
          />

          {data && (
            <DataTablePagination
              page={params.page}
              pageSize={params.size}
              total={data.total}
              onPageChange={(p) => setParams({ page: p })}
              onPageSizeChange={(s) => setParams({ size: s, page: 1 })}
              dataUpdatedAt={dataUpdatedAt}
              onRefresh={() => void refetch()}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>原始审计体</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs leading-5">
            {selectedBody || '点击日志行可查看完整 body'}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
