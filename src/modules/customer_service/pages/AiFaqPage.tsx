import { OrganizationWorkspacePicker } from '@/components/shared/OrganizationWorkspacePicker'
/**
 * AI FAQ 知识库页（v4 P0-10 / 03-G 页面 2）：列表 + 状态机
 * （draft→published→paused→retired，只允许沿该序推进/回退由后端裁决）。
 */
import { useState, type ReactElement } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared'
import { getErrorMessage } from '@/lib/errorUtils'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { useOrgWorkspaceScope } from './useOrgWorkspaceScope'
import {
  deleteAiFaq,
  getAiFaqList,
  upsertAiFaq,
  type AiFaq,
  type AiFaqUpsertInput,
} from '../api/aiAdmin'

const STATUSES = ['draft', 'published', 'paused', 'retired'] as const

export function AiFaqPage(): ReactElement {
  const scope = useOrgWorkspaceScope()
  const { organizationId } = scope
  const { allowed: canRead, loading: permLoading } = useAdminPermission({
    permission: 'customer_service:read',
  })
  const { allowed: canWrite } = useAdminPermission({ permission: 'customer_service:write' })
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Partial<AiFaqUpsertInput>>({})
  const [error, setError] = useState<string | null>(null)

  const enabled = organizationId != null && canRead && !permLoading
  const { data, isLoading, isError, error: listError } = useQuery({
    queryKey: ['cs-ai-faq', organizationId],
    queryFn: () => getAiFaqList(organizationId as string, { limit: 200 }),
    enabled,
  })

  if (!permLoading && !canRead) {
    return <EmptyState title="无权限" description="缺少 customer_service:read 权限。" />
  }
  if (permLoading || (enabled && isLoading)) return <LoadingState />
  if (isError) return <ErrorState message={getErrorMessage(listError)} />

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['cs-ai-faq', organizationId] })
  }

  return (
    <div className="space-y-4 p-4">
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
      </div>
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> 新建 / 编辑 FAQ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="faq-q">问题（必填）</Label>
                <Input
                  id="faq-q"
                  value={form.question ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="faq-status">状态</Label>
                <select
                  id="faq-status"
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  value={form.status ?? 'draft'}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as AiFaq['status'] }))
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="faq-a">答案</Label>
                <Input
                  id="faq-a"
                  value={form.answer ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                />
              </div>
            </div>
            {error != null && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button
                disabled={!form.question}
                onClick={async () => {
                  if (organizationId == null || !form.question) return
                  setError(null)
                  try {
                    await upsertAiFaq(organizationId, form as AiFaqUpsertInput)
                    setForm({})
                    invalidate()
                  } catch (e) {
                    setError(getErrorMessage(e))
                  }
                }}
              >
                保存
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>FAQ 列表</CardTitle>
        </CardHeader>
        <CardContent>
          {(data ?? []).length === 0 ? (
            <EmptyState title="暂无 FAQ" description="保存第一条知识库条目后在此显示。" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2">问题</th>
                  <th className="py-2">意图</th>
                  <th className="py-2">状态</th>
                  <th className="py-2">命中</th>
                  <th className="py-2">已向量化</th>
                  {canWrite && <th className="py-2" />}
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((row: AiFaq) => (
                  <tr key={String(row.id)} className="border-t">
                    <td className="py-2">{row.question}</td>
                    <td className="py-2">{row.intent ?? '-'}</td>
                    <td className="py-2">
                      <Badge variant="outline">{row.status ?? 'draft'}</Badge>
                    </td>
                    <td className="py-2">{row.hit_count ?? 0}</td>
                    <td className="py-2">{row.embedded ? '是' : '否'}</td>
                    {canWrite && (
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (organizationId == null) return
                            setError(null)
                            try {
                              await deleteAiFaq(organizationId, row.id)
                              invalidate()
                            } catch (e) {
                              setError(getErrorMessage(e))
                            }
                          }}
                        >
                          删除
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
