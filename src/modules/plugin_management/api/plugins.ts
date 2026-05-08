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
  const response = await client.get('/plugin/list', { params })
  const payload = requireApiPayload<Record<string, unknown>[] | { items: Record<string, unknown>[] }>(
    response.data as ApiResponse<Record<string, unknown>[]>,
    '/plugin/list'
  )
  const items = Array.isArray(payload)
    ? payload
    : (payload as Record<string, unknown>).items ?? []
  return items.map((item) =>
    typeof item === 'object' && item !== null
      ? normalizePlugin(item as Record<string, unknown>)
      : (item as PluginInfo)
  )
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
  action: PluginAction
  operator: string
  result: 'success' | 'failure'
  detail: string
  created_at: string
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
  const response = await client.get('/plugin/logs', { params })
  const payload = requireApiPayload<{
    items: Record<string, unknown>[]
    page: number
    size: number
    total: number
    total_pages: number
  }>(
    response.data as ApiResponse<Record<string, unknown>>,
    '/plugin/logs'
  )

  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const items = rawItems.map((item) => ({
    id: String(item.id ?? ''),
    plugin_name: String(item.plugin_name ?? ''),
    action: (item.action as PluginAction) ?? 'enable',
    operator: String(item.operator ?? ''),
    result: (item.result as 'success' | 'failure') ?? 'success',
    detail: String(item.detail ?? ''),
    created_at: String(item.created_at ?? ''),
  }))

  return {
    items,
    page: payload.page ?? params?.page ?? 1,
    size: payload.size ?? params?.size ?? 10,
    total: payload.total ?? 0,
    total_pages: payload.total_pages ?? 0,
  }
}
