import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Smartphone, Monitor, Tablet, Search } from 'lucide-react'
import { PageHeader, ErrorState, LoadingState, DataTablePagination } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listPushTokens, pushTokenQueryKey } from '@/services/api/pushToken'
import type { PushToken } from '@/services/api/pushToken'

function truncateToken(token: string, maxLen = 20): string {
  if (token.length <= maxLen) return token
  return `${token.slice(0, maxLen)}...`
}

/** 统计卡片组件 */
function StatsCard({ title, value, icon, description }: {
  title: string
  value: number | string
  icon: React.ReactNode
  description?: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold">{value}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
    </div>
  )
}

/** 从列表数据计算统计信息 */
function useTokenStats(list: PushToken[], total: number) {
  return useMemo(() => {
    const platforms = new Map<string, number>()
    for (const item of list) {
      const p = item.platform || 'unknown'
      platforms.set(p, (platforms.get(p) ?? 0) + 1)
    }
    return {
      total,
      android: platforms.get('android') ?? 0,
      ios: platforms.get('ios') ?? 0,
      other: total - (platforms.get('android') ?? 0) - (platforms.get('ios') ?? 0),
      platformEntries: [...platforms.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [list, total])
}

export function PushTokenListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [searchText, setSearchText] = useState('')

  const {
    data,
    isLoading,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: pushTokenQueryKey(page, size),
    queryFn: () => listPushTokens(page, size),
  })

  const rawList = data?.list ?? []
  const total = data?.total ?? 0
  const stats = useTokenStats(rawList, total)

  // 客户端搜索过滤（按用户 ID、设备类型、平台）
  const list = useMemo(() => {
    if (!searchText.trim()) return rawList
    const q = searchText.trim().toLowerCase()
    return rawList.filter((item) =>
      item.user_id?.toLowerCase().includes(q) ||
      item.device_type?.toLowerCase().includes(q) ||
      item.platform?.toLowerCase().includes(q)
    )
  }, [rawList, searchText])

  if (isLoading && !data) {
    return <LoadingState message="加载推送 Token 列表..." />
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => void refetch()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="推送 Token 管理"
        description="查看各平台推送 Token 注册信息"
        actions={
          <Button variant="outline" onClick={() => navigate('/settings')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回设置
          </Button>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Token 总数"
          value={stats.total}
          icon={<Monitor className="h-5 w-5" />}
          description="所有已注册设备"
        />
        <StatsCard
          title="Android"
          value={stats.android}
          icon={<Smartphone className="h-5 w-5" />}
          description="FCM 推送"
        />
        <StatsCard
          title="iOS"
          value={stats.ios}
          icon={<Tablet className="h-5 w-5" />}
          description="APNs 推送"
        />
        <StatsCard
          title="其他平台"
          value={stats.other}
          icon={<Monitor className="h-5 w-5" />}
          description="其他推送渠道"
        />
      </div>

      {/* 搜索过滤 */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索用户 ID、设备类型、平台..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户 ID</TableHead>
              <TableHead>设备类型</TableHead>
              <TableHead>平台</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length > 0 ? (
              list.map((item) => (
                <TableRow key={`${item.user_id}-${item.device_id}`}>
                  <TableCell className="font-mono text-sm">{item.user_id}</TableCell>
                  <TableCell>{item.device_type}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.platform === 'android'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : item.platform === 'ios'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {item.platform}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm" title={item.token}>
                    {truncateToken(item.token)}
                  </TableCell>
                  <TableCell>{item.updated_at}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  暂无推送 Token 数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        page={page}
        pageSize={size}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setSize(newSize)
          setPage(1)
        }}
        dataUpdatedAt={dataUpdatedAt}
        onRefresh={() => void refetch()}
      />
    </div>
  )
}
