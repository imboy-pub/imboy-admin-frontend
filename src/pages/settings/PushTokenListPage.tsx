import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, ErrorState, LoadingState, DataTablePagination } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listPushTokens, pushTokenQueryKey } from '@/services/api/pushToken'

function truncateToken(token: string, maxLen = 20): string {
  if (token.length <= maxLen) return token
  return `${token.slice(0, maxLen)}...`
}

export function PushTokenListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

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

  if (isLoading && !data) {
    return <LoadingState message="加载推送 Token 列表..." />
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => void refetch()} />
  }

  const list = data?.list ?? []
  const total = data?.total ?? 0

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
                  <TableCell>{item.platform}</TableCell>
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
