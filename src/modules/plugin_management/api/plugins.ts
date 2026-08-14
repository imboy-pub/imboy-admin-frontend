import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse } from '@/types/api'

// --- Types ---

export type PluginState = 'installed' | 'enabled' | 'disabled' | 'error' | 'installing' | 'upgrading'

export interface PluginInfo {
  name: string
  version: string
  description: string
  state: PluginState
  installed_at: string | null
  enabled_at: string | null
  error_message: string | null
  config: Record<string, unknown> | null
}

export interface PluginHealth {
  name: string
  healthy: boolean
  status: string
  uptime_seconds: number
  last_error: string | null
}

export interface PluginListParams {
  state?: PluginState
}

export interface PluginInstallPayload {
  name: string
  path?: string
}

export interface PluginUpgradePayload {
  name: string
  version: string
}

export interface PluginUninstallPayload {
  name: string
  mode?: 'soft' | 'hard'
}

export interface PluginResetPayload {
  name: string
}

// --- Query key factory ---

export const pluginKeys = {
  all: ['plugins'] as const,
  list: (params?: PluginListParams) => [...pluginKeys.all, 'list', params] as const,
  detail: (name: string) => [...pluginKeys.all, 'detail', name] as const,
  state: (name: string) => [...pluginKeys.all, 'state', name] as const,
  health: (name: string) => [...pluginKeys.all, 'health', name] as const,
}

// --- Normalizers ---

function normalizePlugin(raw: Record<string, unknown>): PluginInfo {
  return {
    name: String(raw.name ?? ''),
    version: String(raw.version ?? ''),
    description: String(raw.description ?? ''),
    state: (raw.state as PluginState) ?? 'disabled',
    installed_at: typeof raw.installed_at === 'string' ? raw.installed_at : null,
    enabled_at: typeof raw.enabled_at === 'string' ? raw.enabled_at : null,
    error_message: typeof raw.error_message === 'string' ? raw.error_message : null,
    config: raw.config != null ? (raw.config as Record<string, unknown>) : null,
  }
}

function normalizeHealth(raw: Record<string, unknown>): PluginHealth {
  return {
    name: String(raw.name ?? ''),
    healthy: Boolean(raw.healthy),
    status: String(raw.status ?? ''),
    uptime_seconds: Number(raw.uptime_seconds ?? 0),
    last_error: typeof raw.last_error === 'string' ? raw.last_error : null,
  }
}

// --- API functions ---

export async function getPluginList(params?: PluginListParams): Promise<PluginInfo[]> {
  type ListPayload = Record<string, unknown>[] | { items: Record<string, unknown>[] }
  const response = await client.get('/plugin/list', { params })
  const payload = requireApiPayload<ListPayload>(
    response.data as ApiResponse<ListPayload>,
    '/plugin/list'
  )
  const items: Record<string, unknown>[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.items) ? payload.items : []
  return items.map((item) => normalizePlugin(item))
}

export async function getPluginDetail(name: string): Promise<PluginInfo> {
  const response = await client.get('/plugin/detail', { params: { name } })
  const payload = requireApiPayload<Record<string, unknown>>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/plugin/detail'
  )
  return normalizePlugin(payload)
}

export async function getPluginState(name: string): Promise<PluginInfo> {
  const response = await client.get('/plugin/state', { params: { name } })
  const payload = requireApiPayload<Record<string, unknown>>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/plugin/state'
  )
  return normalizePlugin(payload)
}

export async function getPluginHealth(name: string): Promise<PluginHealth> {
  const response = await client.get('/plugin/health', { params: { name } })
  const payload = requireApiPayload<Record<string, unknown>>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/plugin/health'
  )
  return normalizeHealth(payload)
}

export async function installPlugin(data: PluginInstallPayload): Promise<PluginInfo> {
  const response = await client.post('/plugin/install', data)
  const payload = requireApiPayload<Record<string, unknown>>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/plugin/install'
  )
  return normalizePlugin(payload)
}

export async function enablePlugin(name: string): Promise<PluginInfo> {
  const response = await client.post('/plugin/enable', { name })
  const payload = requireApiPayload<Record<string, unknown>>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/plugin/enable'
  )
  return normalizePlugin(payload)
}

export async function disablePlugin(name: string): Promise<PluginInfo> {
  const response = await client.post('/plugin/disable', { name })
  const payload = requireApiPayload<Record<string, unknown>>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/plugin/disable'
  )
  return normalizePlugin(payload)
}

export async function upgradePlugin(data: PluginUpgradePayload): Promise<PluginInfo> {
  const response = await client.post('/plugin/upgrade', data)
  const payload = requireApiPayload<Record<string, unknown>>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/plugin/upgrade'
  )
  return normalizePlugin(payload)
}

export async function uninstallPlugin(data: PluginUninstallPayload): Promise<void> {
  await client.post('/plugin/uninstall', data)
}

export async function resetPlugin(data: PluginResetPayload): Promise<PluginInfo> {
  const response = await client.post('/plugin/reset', data)
  const payload = requireApiPayload<Record<string, unknown>>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/plugin/reset'
  )
  return normalizePlugin(payload)
}

export async function forceUninstallPlugin(data: PluginUninstallPayload): Promise<void> {
  await client.post('/plugin/force_uninstall', data)
}

// --- Plugin audit log ---

export type PluginAction = 'install' | 'enable' | 'disable' | 'upgrade' | 'uninstall' | 'reset' | 'force_uninstall'

export interface PluginLogEntry {
  id: string
  plugin_name: string
  /** 真实操作（来自 metadata.action）；缺失时为原始 event（如 state_transition）。 */
  action: string
  operator: string
  result: 'success' | 'failure'
  detail: string
  /** 后端序列化为毫秒数字；保留 number 以便 formatDate 走 new Date(ms)。 */
  created_at: string | number
}

export interface PluginLogListParams {
  page?: number
  size?: number
  plugin_name?: string
  action?: PluginAction
  result?: 'success' | 'failure'
}

export const pluginLogKeys = {
  all: ['plugin-logs'] as const,
  list: (params?: PluginLogListParams) => [...pluginLogKeys.all, 'list', params] as const,
}

export async function getPluginLogList(params?: PluginLogListParams): Promise<{
  items: PluginLogEntry[]
  page: number
  size: number
  total: number
  total_pages: number
}> {
  type LogListPayload = {
    items: Record<string, unknown>[]
    page: number
    size: number
    total: number
    total_pages: number
  }
  const response = await client.get('/plugin/logs', { params })
  const payload = requireApiPayload<LogListPayload>(
    response.data as ApiResponse<LogListPayload>,
    '/plugin/logs'
  )

  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray((payload as Record<string, unknown>).list)
      ? ((payload as Record<string, unknown>).list as Record<string, unknown>[])
      : []
  const items = rawItems.map((item) => {
    // 后端审计行真实字段为 event/result/error_detail/metadata(jsonb)，
    // 无顶层 action/detail；操作类型藏在 metadata.action（可能缺失）。
    // metadata 经 jsonb→binary→JSON 后可能是字符串，需容错解析。
    let metadata: Record<string, unknown> = {}
    if (item.metadata && typeof item.metadata === 'object') {
      metadata = item.metadata as Record<string, unknown>
    } else if (typeof item.metadata === 'string' && item.metadata.length > 0) {
      try {
        metadata = JSON.parse(item.metadata) as Record<string, unknown>
      } catch {
        metadata = {}
      }
    }
    const metaAction = typeof metadata.action === 'string' ? metadata.action : ''
    return {
      id: String(item.id ?? ''),
      plugin_name: String(item.plugin_name ?? ''),
      action: metaAction || String(item.event ?? ''),
      operator: String(item.operator ?? ''),
      result: (String(item.result ?? '') === 'ok' ? 'success' : 'failure') as
        | 'success'
        | 'failure',
      detail: String(item.error_detail ?? ''),
      created_at:
        typeof item.created_at === 'number'
          ? item.created_at
          : String(item.created_at ?? ''),
    }
  })

  return {
    items,
    page: payload.page ?? params?.page ?? 1,
    size: payload.size ?? params?.size ?? 10,
    total: payload.total ?? 0,
    total_pages: payload.total_pages ?? 0,
  }
}
