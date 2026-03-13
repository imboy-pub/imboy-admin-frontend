import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Link2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/shared'

type GroupJumpTarget = {
  key: string
  label: string
  suffix: string
}

const targets: GroupJumpTarget[] = [
  { key: 'detail', label: '群详情', suffix: '' },
  { key: 'votes', label: '投票治理', suffix: '/votes' },
  { key: 'notices', label: '公告治理', suffix: '/notices' },
  { key: 'categories', label: '分类治理', suffix: '/categories' },
  { key: 'tags', label: '标签治理', suffix: '/tags' },
  { key: 'files', label: '文件治理', suffix: '/files' },
  { key: 'albums', label: '相册治理', suffix: '/albums' },
  { key: 'schedules', label: '日程治理', suffix: '/schedules' },
  { key: 'tasks', label: '任务治理', suffix: '/tasks' },
  { key: 'governance_logs', label: '治理日志', suffix: '/governance-logs' },
]

export function GroupContextGatewayPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialGid = (searchParams.get('gid') || '').trim()
  const [gidInput, setGidInput] = useState(initialGid)
  const gid = gidInput.trim()

  const tips = useMemo(
    () => (
      gid
        ? `当前群上下文：${gid}`
        : '输入群 ID 后，可一键跳转到对应治理页面。'
    ),
    [gid]
  )

  const navigateToTarget = (suffix: string) => {
    if (!gid) return
    const encodedGid = encodeURIComponent(gid)
    navigate(`/groups/${encodedGid}${suffix}?from=context`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="群上下文入口"
        description="为群治理提供按群 ID 的统一直达入口"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            选择群上下文
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              data-testid="group-context-gid-input"
              placeholder="请输入群 ID（例如 1001）"
              value={gidInput}
              onChange={(event) => setGidInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  navigateToTarget('/governance-logs')
                }
              }}
            />
            <Button
              data-testid="group-context-open-governance"
              onClick={() => navigateToTarget('/governance-logs')}
              disabled={!gid}
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              进入治理日志
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{tips}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>快捷入口</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {targets.map((target) => (
              <Button
                key={target.key}
                variant="outline"
                data-testid={`group-context-target-${target.key}`}
                onClick={() => navigateToTarget(target.suffix)}
                disabled={!gid}
              >
                {target.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
