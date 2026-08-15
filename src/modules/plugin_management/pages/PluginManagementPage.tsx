import { useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/errorUtils'
import {
  Puzzle,
  RefreshCw,
  Power,
  PowerOff,
  Trash2,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  ArrowUpCircle,
  FileSearch,
  Plus,
  Info,
  ShieldAlert,
} from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ConfirmDialog,
  EntityDrawer,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  getPluginList,
  getPluginDetail,
  getPluginState,
  getPluginHealth,
  installPlugin,
  enablePlugin,
  disablePlugin,
  uninstallPlugin,
  forceUninstallPlugin,
  resetPlugin,
  upgradePlugin,
  pluginKeys,
  type PluginInfo,
  type PluginState,
} from '../api/plugins'

// --- State badge ---

function StateBadge({ state }: { state: PluginState }) {
  return (() => {
    switch (state) {
      case 'enabled':
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            已启用
          </Badge>
        )
      case 'disabled':
        return (
          <Badge variant="secondary">
            <PowerOff className="mr-1 h-3 w-3" />
            已禁用
          </Badge>
        )
      case 'installed':
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
            <Wrench className="mr-1 h-3 w-3" />
            已安装
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            错误
          </Badge>
        )
      case 'installing':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            安装中
          </Badge>
        )
      case 'upgrading':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            升级中
          </Badge>
        )
    }
  })()
}

// --- Plugin card ---

function PluginCard({
  plugin,
  onAction,
  pendingAction,
}: {
  plugin: PluginInfo
  onAction: (_action: string, _plugin: PluginInfo) => void
  pendingAction: string | null
}) {
  const isPending = pendingAction !== null

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Puzzle className="h-4 w-4 text-muted-foreground" />
            {plugin.name}
          </CardTitle>
          <StateBadge state={plugin.state} />
        </div>
        {plugin.version && (
          <p className="text-xs text-muted-foreground font-mono">v{plugin.version}</p>
        )}
      </CardHeader>
      <CardContent>
        {plugin.description && (
          <p className="text-sm text-muted-foreground mb-3">{plugin.description}</p>
        )}

        {plugin.error_message && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 p-2 mb-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{plugin.error_message}</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction('detail', plugin)}
            disabled={isPending}
          >
            <Info className="mr-1 h-3 w-3" />
            详情
          </Button>

          {plugin.state === 'disabled' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction('enable', plugin)}
              disabled={isPending}
            >
              {pendingAction === 'enable' ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Power className="mr-1 h-3 w-3" />
              )}
              启用
            </Button>
          )}

          {plugin.state === 'enabled' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction('disable', plugin)}
              disabled={isPending}
            >
              {pendingAction === 'disable' ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <PowerOff className="mr-1 h-3 w-3" />
              )}
              禁用
            </Button>
          )}

          {(plugin.state === 'enabled' || plugin.state === 'installed') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction('upgrade', plugin)}
              disabled={isPending}
            >
              {pendingAction === 'upgrade' ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <ArrowUpCircle className="mr-1 h-3 w-3" />
              )}
              升级
            </Button>
          )}

          {plugin.state === 'error' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction('reset', plugin)}
              disabled={isPending}
            >
              {pendingAction === 'reset' ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3 w-3" />
              )}
              重置
            </Button>
          )}

          {plugin.state !== 'installing' && plugin.state !== 'upgrading' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onAction('uninstall', plugin)}
              disabled={isPending}
            >
              {pendingAction === 'uninstall' ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3 w-3" />
              )}
              卸载
            </Button>
          )}

          {plugin.state === 'error' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onAction('force_uninstall', plugin)}
              disabled={isPending}
            >
              {pendingAction === 'force_uninstall' ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <ShieldAlert className="mr-1 h-3 w-3" />
              )}
              强制卸载
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// --- Detail drawer body ---

/** 一行只读展示。 */
function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right break-all">{value ?? '-'}</span>
    </div>
  )
}

/**
 * 详情/状态/健康数据主体。以 key=name 挂载，三个查询各自命中对应端点。
 */
function PluginDetailBody({ name }: { name: string }) {
  const detailQuery = useQuery({
    queryKey: pluginKeys.detail(name),
    queryFn: () => getPluginDetail(name),
  })
  const stateQuery = useQuery({
    queryKey: pluginKeys.state(name),
    queryFn: () => getPluginState(name),
  })
  const healthQuery = useQuery({
    queryKey: pluginKeys.health(name),
    queryFn: () => getPluginHealth(name),
  })

  if (detailQuery.isLoading) {
    return <LoadingState message="加载插件详情..." />
  }

  const detail = detailQuery.data
  const state = stateQuery.data
  const health = healthQuery.data

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold">基本信息</h3>
        <DetailRow label="名称" value={detail?.name} />
        <DetailRow label="版本" value={detail?.version ? `v${detail.version}` : '-'} />
        <DetailRow label="描述" value={detail?.description || '-'} />
        <DetailRow label="安装时间" value={detail?.installed_at || '-'} />
        <DetailRow label="启用时间" value={detail?.enabled_at || '-'} />
        {detail?.error_message && (
          <DetailRow label="错误信息" value={<span className="text-red-600">{detail.error_message}</span>} />
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">运行状态</h3>
        {stateQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : state ? (
          <DetailRow label="当前状态" value={<StateBadge state={state.state} />} />
        ) : (
          <p className="text-sm text-muted-foreground">无法获取状态</p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">健康检查</h3>
        {healthQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : health ? (
          <>
            <DetailRow
              label="健康"
              value={
                health.healthy ? (
                  <span className="text-green-600">正常</span>
                ) : (
                  <span className="text-red-600">异常</span>
                )
              }
            />
            <DetailRow label="状态" value={health.status || '-'} />
            <DetailRow label="运行时长" value={`${health.uptime_seconds} 秒`} />
            {health.last_error && (
              <DetailRow label="最近错误" value={<span className="text-red-600">{health.last_error}</span>} />
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">无法获取健康信息</p>
        )}
      </section>
    </div>
  )
}

// --- Install dialog ---

function InstallPluginDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (_open: boolean) => void
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')

  const installMut = useMutation({
    mutationFn: () =>
      installPlugin({ name: name.trim(), path: path.trim() || undefined }),
    onSuccess: () => {
      toast.success('插件安装成功')
      setName('')
      setPath('')
      onOpenChange(false)
      onSuccess()
    },
    onError: (err: unknown) => {
      toast.error(`安装失败: ${getErrorMessage(err)}`)
    },
  })

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('请填写插件名称')
      return
    }
    installMut.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>安装插件</DialogTitle>
          <DialogDescription>填写插件名称，可选填插件包路径。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="plugin-install-name" className="font-medium">
              插件名称
            </Label>
            <Input
              id="plugin-install-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 my_plugin"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plugin-install-path" className="font-medium">
              插件路径（可选）
            </Label>
            <Input
              id="plugin-install-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="例如 /opt/plugins/my_plugin"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={installMut.isPending}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={installMut.isPending}>
            {installMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            安装
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Main page ---

export function PluginManagementPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [pendingMap, setPendingMap] = useState<Record<string, string>>({})
  const [uninstallTarget, setUninstallTarget] = useState<PluginInfo | null>(null)
  const [forceUninstallTarget, setForceUninstallTarget] = useState<PluginInfo | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ action: 'disable' | 'reset'; plugin: PluginInfo } | null>(null)
  const [detailTarget, setDetailTarget] = useState<PluginInfo | null>(null)
  const [installOpen, setInstallOpen] = useState(false)

  const { data: plugins, isLoading, error, refetch } = useQuery({
    queryKey: pluginKeys.list(),
    queryFn: () => getPluginList(),
  })

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: pluginKeys.all })
  }

  const enableMut = useMutation({
    mutationFn: (name: string) => enablePlugin(name),
    onSuccess: () => {
      toast.success('插件已启用')
      invalidateList()
    },
    onError: (err: unknown) => {
      toast.error(`启用失败: ${getErrorMessage(err)}`)
    },
  })

  const disableMut = useMutation({
    mutationFn: (name: string) => disablePlugin(name),
    onSuccess: () => {
      toast.success('插件已禁用')
      invalidateList()
    },
    onError: (err: unknown) => {
      toast.error(`禁用失败: ${getErrorMessage(err)}`)
    },
  })

  const uninstallMut = useMutation({
    mutationFn: (name: string) => uninstallPlugin({ name, mode: 'soft' }),
    onSuccess: () => {
      toast.success('插件已卸载')
      invalidateList()
    },
    onError: (err: unknown) => {
      toast.error(`卸载失败: ${getErrorMessage(err)}`)
    },
  })

  const forceUninstallMut = useMutation({
    mutationFn: (name: string) => forceUninstallPlugin({ name, mode: 'hard' }),
    onSuccess: () => {
      toast.success('插件已强制卸载')
      invalidateList()
    },
    onError: (err: unknown) => {
      toast.error(`强制卸载失败: ${getErrorMessage(err)}`)
    },
  })

  const resetMut = useMutation({
    mutationFn: (name: string) => resetPlugin({ name }),
    onSuccess: () => {
      toast.success('插件已重置')
      invalidateList()
    },
    onError: (err: unknown) => {
      toast.error(`重置失败: ${getErrorMessage(err)}`)
    },
  })

  const upgradeMut = useMutation({
    mutationFn: ({ name, version }: { name: string; version: string }) =>
      upgradePlugin({ name, version }),
    onSuccess: () => {
      toast.success('插件升级成功')
      invalidateList()
    },
    onError: (err: unknown) => {
      toast.error(`升级失败: ${getErrorMessage(err)}`)
    },
  })

  const executeAction = (action: string, plugin: PluginInfo) => {
    setPendingMap((prev) => ({ ...prev, [plugin.name]: action }))

    const mutPromise = (() => {
      switch (action) {
        case 'enable': return enableMut.mutateAsync(plugin.name)
        case 'disable': return disableMut.mutateAsync(plugin.name)
        case 'uninstall': return uninstallMut.mutateAsync(plugin.name)
        case 'force_uninstall': return forceUninstallMut.mutateAsync(plugin.name)
        case 'reset': return resetMut.mutateAsync(plugin.name)
        case 'upgrade': return upgradeMut.mutateAsync({ name: plugin.name, version: '' })
        default: return Promise.resolve()
      }
    })()

    // 每个 mutation 自带 onError 已负责用户提示，这里只需吞掉 rejection
    // 避免 unhandled promise rejection，不再重复弹一次通用错误提示
    mutPromise
      .catch(() => {})
      .finally(() => {
        setPendingMap((prev) => {
          const next = { ...prev }
          delete next[plugin.name]
          return next
        })
      })
  }

  const handleAction = (action: string, plugin: PluginInfo) => {
    // 只读查看：打开详情抽屉
    if (action === 'detail') {
      setDetailTarget(plugin)
      return
    }
    // 破坏性操作先二次确认：卸载、强制卸载、禁用、重置
    if (action === 'uninstall') {
      setUninstallTarget(plugin)
      return
    }
    if (action === 'force_uninstall') {
      setForceUninstallTarget(plugin)
      return
    }
    if (action === 'disable' || action === 'reset') {
      setConfirmTarget({ action, plugin })
      return
    }
    executeAction(action, plugin)
  }

  if (isLoading) {
    return <LoadingState message="加载插件列表..." />
  }

  if (error) {
    return (
      <ErrorState
        message="加载插件列表失败"
        onRetry={() => refetch()}
      />
    )
  }

  const items = plugins ?? []
  const enabledCount = items.filter((p) => p.state === 'enabled').length
  const errorCount = items.filter((p) => p.state === 'error').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="插件管理"
        description="管理应用插件的安装、启停和升级"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setInstallOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              安装插件
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/plugins/logs')}>
              <FileSearch className="mr-2 h-4 w-4" />
              操作日志
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          </div>
        }
      />

      {/* Summary stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已注册插件</p>
                <p className="text-2xl font-bold">{items.length}</p>
              </div>
              <Puzzle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已启用</p>
                <p className="text-2xl font-bold text-green-600">{enabledCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        {errorCount > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">异常</p>
                  <p className="text-2xl font-bold text-red-600">{errorCount}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Plugin list */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            暂无已注册的插件
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((plugin) => (
            <PluginCard
              key={plugin.name}
              plugin={plugin}
              onAction={handleAction}
              pendingAction={pendingMap[plugin.name] ?? null}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={uninstallTarget !== null}
        onOpenChange={(open) => { if (!open) setUninstallTarget(null) }}
        title="确认卸载插件"
        description={`确定要卸载插件 "${uninstallTarget?.name}"？此操作不可撤销。`}
        confirmText="卸载"
        onConfirm={() => {
          if (!uninstallTarget) return
          const name = uninstallTarget.name
          setUninstallTarget(null)
          setPendingMap((prev) => ({ ...prev, [name]: 'uninstall' }))
          uninstallMut
            .mutateAsync(name)
            .catch(() => {})
            .finally(() => {
              setPendingMap((prev) => {
                const next = { ...prev }
                delete next[name]
                return next
              })
            })
        }}
        variant="destructive"
        loading={uninstallMut.isPending}
      />

      <ConfirmDialog
        open={forceUninstallTarget !== null}
        onOpenChange={(open) => { if (!open) setForceUninstallTarget(null) }}
        title="确认强制卸载插件"
        description={`确定要强制卸载插件 "${forceUninstallTarget?.name}"？将无视错误状态直接移除，此操作不可撤销。`}
        confirmText="强制卸载"
        onConfirm={() => {
          if (!forceUninstallTarget) return
          const plugin = forceUninstallTarget
          setForceUninstallTarget(null)
          executeAction('force_uninstall', plugin)
        }}
        variant="destructive"
        loading={forceUninstallMut.isPending}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null) }}
        title={confirmTarget?.action === 'disable' ? '确认禁用插件' : '确认重置插件'}
        description={
          confirmTarget?.action === 'disable'
            ? `确定要禁用插件 "${confirmTarget?.plugin.name}"？禁用后其功能将立即停用。`
            : `确定要重置插件 "${confirmTarget?.plugin.name}"？该操作会清除插件运行状态，不可撤销。`
        }
        confirmText={confirmTarget?.action === 'disable' ? '禁用' : '重置'}
        variant="destructive"
        loading={disableMut.isPending || resetMut.isPending}
        onConfirm={() => {
          if (!confirmTarget) return
          const { action, plugin } = confirmTarget
          setConfirmTarget(null)
          executeAction(action, plugin)
        }}
      />

      <EntityDrawer
        open={detailTarget !== null}
        onOpenChange={(open) => { if (!open) setDetailTarget(null) }}
        title="插件详情"
        subtitle={detailTarget?.name}
      >
        {detailTarget && <PluginDetailBody key={detailTarget.name} name={detailTarget.name} />}
      </EntityDrawer>

      <InstallPluginDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onSuccess={invalidateList}
      />
    </div>
  )
}
