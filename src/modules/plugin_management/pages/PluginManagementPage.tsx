import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import {
  getPluginList,
  enablePlugin,
  disablePlugin,
  uninstallPlugin,
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
        </div>
      </CardContent>
    </Card>
  )
}

// --- Main page ---

export function PluginManagementPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [pendingMap, setPendingMap] = useState<Record<string, string>>({})
  const [uninstallTarget, setUninstallTarget] = useState<PluginInfo | null>(null)

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
      toast.error(`启用失败: ${err instanceof Error ? err.message : String(err)}`)
    },
  })

  const disableMut = useMutation({
    mutationFn: (name: string) => disablePlugin(name),
    onSuccess: () => {
      toast.success('插件已禁用')
      invalidateList()
    },
    onError: (err: unknown) => {
      toast.error(`禁用失败: ${err instanceof Error ? err.message : String(err)}`)
    },
  })

  const uninstallMut = useMutation({
    mutationFn: (name: string) => uninstallPlugin({ name, mode: 'soft' }),
    onSuccess: () => {
      toast.success('插件已卸载')
      invalidateList()
    },
    onError: (err: unknown) => {
      toast.error(`卸载失败: ${err instanceof Error ? err.message : String(err)}`)
    },
  })

  const resetMut = useMutation({
    mutationFn: (name: string) => resetPlugin({ name }),
    onSuccess: () => {
      toast.success('插件已重置')
      invalidateList()
    },
    onError: (err: unknown) => {
      toast.error(`重置失败: ${err instanceof Error ? err.message : String(err)}`)
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
      toast.error(`升级失败: ${err instanceof Error ? err.message : String(err)}`)
    },
  })

  const handleAction = (action: string, plugin: PluginInfo) => {
    if (action === 'uninstall') {
      setUninstallTarget(plugin)
      return
    }
    setPendingMap((prev) => ({ ...prev, [plugin.name]: action }))

    const mutPromise = (() => {
      switch (action) {
        case 'enable': return enableMut.mutateAsync(plugin.name)
        case 'disable': return disableMut.mutateAsync(plugin.name)
        case 'uninstall': return uninstallMut.mutateAsync(plugin.name)
        case 'reset': return resetMut.mutateAsync(plugin.name)
        case 'upgrade': return upgradeMut.mutateAsync({ name: plugin.name, version: '' })
        default: return Promise.resolve()
      }
    })()

    mutPromise.finally(() => {
      setPendingMap((prev) => {
        const next = { ...prev }
        delete next[plugin.name]
        return next
      })
    })
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
          uninstallMut.mutateAsync(name).finally(() => {
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
    </div>
  )
}
