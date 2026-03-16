import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Edit, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, LoadingState, ErrorState, StatusBadge, ConfirmDialog } from '@/components/shared'
import {
  AppVersion,
  deleteVersion,
  getVersionListPayload,
  saveVersion,
  VersionSaveParams,
} from '@/modules/ops_governance/api'
import { formatDate } from '@/lib/utils'

export function VersionPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingVersion, setEditingVersion] = useState<AppVersion | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [formData, setFormData] = useState<VersionSaveParams>({
    version: '',
    platform: 'android',
    download_url: '',
    force_update: false,
    description: '',
  })

  // 获取版本列表
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['versions'],
    queryFn: () => getVersionListPayload({ page: 1, size: 50 }),
  })

  // 保存版本
  const saveMutation = useMutation({
    mutationFn: saveVersion,
    onSuccess: () => {
      toast.success(editingVersion ? '版本已更新' : '版本已创建')
      queryClient.invalidateQueries({ queryKey: ['versions'] })
      resetForm()
    },
    onError: (error: Error) => {
      toast.error(`保存失败: ${error.message}`)
    },
  })

  // 删除版本
  const deleteMutation = useMutation({
    mutationFn: deleteVersion,
    onSuccess: () => {
      toast.success('版本已删除')
      queryClient.invalidateQueries({ queryKey: ['versions'] })
      setDeleteConfirm(null)
    },
    onError: (error: Error) => {
      toast.error(`删除失败: ${error.message}`)
    },
  })

  const resetForm = () => {
    setShowForm(false)
    setEditingVersion(null)
    setFormData({
      version: '',
      platform: 'android',
      download_url: '',
      force_update: false,
      description: '',
    })
  }

  const handleEdit = (version: AppVersion) => {
    setEditingVersion(version)
    setFormData({
      id: version.id,
      version: version.version,
      platform: version.platform,
      download_url: version.download_url,
      force_update: version.force_update,
      description: version.description,
    })
    setShowForm(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate(formData)
  }

  const platforms = [
    { value: 'android', label: 'Android' },
    { value: 'ios', label: 'iOS' },
    { value: 'windows', label: 'Windows' },
    { value: 'mac', label: 'macOS' },
  ]

  if (isLoading) {
    return <LoadingState message="加载版本数据..." />
  }

  if (error) {
    return <ErrorState message="加载版本数据失败" onRetry={() => refetch()} />
  }

  const versions = data?.items || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="版本管理"
        description="管理应用版本发布"
        actions={
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              新建版本
            </Button>
          )
        }
      />

      {/* 版本表单 */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {editingVersion ? '编辑版本' : '新建版本'}
              <Button variant="ghost" size="icon" onClick={resetForm}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="version">版本号</Label>
                  <Input
                    id="version"
                    placeholder="例如: 1.0.0"
                    value={formData.version}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, version: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform">平台</Label>
                  <select
                    id="platform"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.platform}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, platform: e.target.value }))
                    }
                  >
                    {platforms.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="download_url">下载地址</Label>
                  <Input
                    id="download_url"
                    placeholder="https://..."
                    value={formData.download_url}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, download_url: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>强制更新</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="force_update"
                      checked={formData.force_update}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, force_update: e.target.checked }))
                      }
                      className="h-4 w-4"
                    />
                    <label htmlFor="force_update" className="text-sm">
                      启用强制更新
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">更新说明</Label>
                <Textarea
                  id="description"
                  placeholder="描述本次更新的内容..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  取消
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  保存
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* 版本列表 */}
      <Card>
        <CardHeader>
          <CardTitle>版本列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {versions.map((version) => (
              <div
                key={version.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{version.version}</span>
                      <StatusBadge
                        status={version.platform}
                        labels={{
                          android: 'Android',
                          ios: 'iOS',
                          windows: 'Windows',
                          mac: 'macOS',
                        }}
                        variants={{
                          android: 'info',
                          ios: 'info',
                          windows: 'secondary',
                          mac: 'secondary',
                        }}
                      />
                      {version.force_update && (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                          强制更新
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {version.description || '无更新说明'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      发布时间: {formatDate(version.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(version)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirm(version.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}

            {versions.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                暂无版本记录，点击"新建版本"创建第一个版本
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => setDeleteConfirm(open ? deleteConfirm : null)}
        title="确认删除版本"
        description="确定要删除此版本吗？此操作不可恢复。"
        confirmText="删除"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => { if (deleteConfirm) deleteMutation.mutate(deleteConfirm) }}
      />
    </div>
  )
}
