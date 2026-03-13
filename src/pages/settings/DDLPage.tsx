import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Edit, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, LoadingState, ErrorState, StatusBadge, ConfirmDialog } from '@/components/shared'
import { getDDLListPayload, saveDDL, deleteDDL, DDL, DDLSaveParams } from '@/services/api/ddl'
import { formatDate } from '@/lib/utils'

export function DDLPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingDDL, setEditingDDL] = useState<DDL | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [formData, setFormData] = useState<DDLSaveParams>({
    ddl: '',
    down_ddl: '',
    old_vsn: 0,
    new_vsn: 0,
    status: 1,
  })

  // 获取 DDL 列表
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ddl'],
    queryFn: () => getDDLListPayload({ page: 1, size: 50 }),
  })

  // 保存 DDL
  const saveMutation = useMutation({
    mutationFn: saveDDL,
    onSuccess: () => {
      toast.success(editingDDL ? 'DDL 配置已更新' : 'DDL 配置已创建')
      queryClient.invalidateQueries({ queryKey: ['ddl'] })
      resetForm()
    },
    onError: (error: Error) => {
      toast.error(`保存失败: ${error.message}`)
    },
  })

  // 删除 DDL
  const deleteMutation = useMutation({
    mutationFn: deleteDDL,
    onSuccess: () => {
      toast.success('DDL 配置已删除')
      queryClient.invalidateQueries({ queryKey: ['ddl'] })
      setDeleteConfirm(null)
    },
    onError: (error: Error) => {
      toast.error(`删除失败: ${error.message}`)
    },
  })

  const resetForm = () => {
    setShowForm(false)
    setEditingDDL(null)
    setFormData({
      ddl: '',
      down_ddl: '',
      old_vsn: 0,
      new_vsn: 0,
      status: 1,
    })
  }

  const handleEdit = (ddl: DDL) => {
    setEditingDDL(ddl)
    setFormData({
      id: ddl.id,
      ddl: ddl.ddl,
      down_ddl: ddl.down_ddl,
      old_vsn: ddl.old_vsn,
      new_vsn: ddl.new_vsn,
      status: ddl.status,
    })
    setShowForm(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate(formData)
  }

  if (isLoading) {
    return <LoadingState message="加载 DDL 数据..." />
  }

  if (error) {
    return <ErrorState message="加载 DDL 数据失败" onRetry={() => refetch()} />
  }

  const ddlList = data?.items || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="DDL 管理"
        description="管理数据库 DDL 配置"
        actions={
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              新建 DDL
            </Button>
          )
        }
      />

      {/* DDL 表单 */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {editingDDL ? '编辑 DDL' : '新建 DDL'}
              <Button variant="ghost" size="icon" onClick={resetForm}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new_vsn">新版本号</Label>
                  <Input
                    id="new_vsn"
                    type="number"
                    placeholder="例如: 100"
                    value={formData.new_vsn}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, new_vsn: parseInt(e.target.value) || 0 }))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="old_vsn">旧版本号</Label>
                  <Input
                    id="old_vsn"
                    type="number"
                    placeholder="例如: 99"
                    value={formData.old_vsn}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, old_vsn: parseInt(e.target.value) || 0 }))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ddl">DDL 语句</Label>
                  <Input
                    id="ddl"
                    placeholder="DDL SQL 语句..."
                    value={formData.ddl}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, ddl: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="down_ddl">回滚 DDL</Label>
                  <Input
                    id="down_ddl"
                    placeholder="回滚 SQL 语句..."
                    value={formData.down_ddl}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, down_ddl: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">状态</Label>
                  <select
                    id="status"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.status}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, status: parseInt(e.target.value) }))
                    }
                  >
                    <option value={1}>启用</option>
                    <option value={0}>禁用</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  取消
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  保存
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* DDL 列表 */}
      <Card>
        <CardHeader>
          <CardTitle>DDL 列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ddlList.map((ddl: DDL) => (
              <div
                key={ddl.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">v{ddl.old_vsn} → v{ddl.new_vsn}</span>
                      <StatusBadge
                        status={ddl.status}
                        labels={{ 1: '启用', 0: '禁用' }}
                        variants={{ 1: 'success', 0: 'error' }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 font-mono truncate max-w-md">
                      {ddl.ddl || '无 DDL'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      更新时间: {formatDate(ddl.updated_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(ddl)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirm(ddl.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}

            {ddlList.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                暂无 DDL 记录，点击"新建 DDL"创建第一个配置
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => setDeleteConfirm(open ? deleteConfirm : null)}
        title="确认删除 DDL"
        description="确定要删除此 DDL 配置吗？此操作不可恢复。"
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => { if (deleteConfirm) deleteMutation.mutate(deleteConfirm) }}
      />
    </div>
  )
}
