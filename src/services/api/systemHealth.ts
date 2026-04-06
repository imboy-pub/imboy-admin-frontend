import client from './client'
import { ApiResponse } from '@/types/api'
import { SystemMetrics, SystemHealthStats } from '@/types/systemHealth'
import { requireApiPayload } from './responseAdapter'

/**
 * /metrics 端点不走 /adm 前缀，需要显式指定完整路径。
 * 从 VITE_API_BASE_URL 推导出 API 根路径，确保生产环境路由正确。
 */
const METRICS_BASE_URL = (() => {
  const base = import.meta.env.VITE_API_BASE_URL || '/adm'
  try {
    const url = new URL(base)
    return url.origin
  } catch {
    // 相对路径（如 '/adm'），回退到当前 origin
    return '/'
  }
})()

async function getSystemMetrics(): Promise<ApiResponse<SystemMetrics>> {
  const response = await client.get('/metrics', { baseURL: METRICS_BASE_URL })
  return response.data
}

export async function getSystemHealthStats(): Promise<SystemHealthStats> {
  const metrics = requireApiPayload(await getSystemMetrics(), '/metrics')
  const c = metrics.counters || {}

  const toMB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100

  // Known system keys — separate from app counters
  const systemKeys = new Set([
    'erlang_process_count',
    'erlang_memory_total_bytes',
    'erlang_memory_processes_bytes',
    'erlang_memory_ets_bytes',
    'imboy_online_users',
    'ws_connections_current',
    'db_pool_free',
    'db_pool_in_use',
  ])

  const appCounters: Record<string, number> = {}
  for (const [key, value] of Object.entries(c)) {
    if (!systemKeys.has(key) && typeof value === 'number') {
      appCounters[key] = value
    }
  }

  return {
    processCount: c.erlang_process_count ?? 0,
    memoryTotalMB: toMB(c.erlang_memory_total_bytes ?? 0),
    memoryProcessesMB: toMB(c.erlang_memory_processes_bytes ?? 0),
    memoryEtsMB: toMB(c.erlang_memory_ets_bytes ?? 0),
    onlineUsers: c.imboy_online_users ?? 0,
    wsConnections: c.ws_connections_current ?? 0,
    dbPoolFree: c.db_pool_free ?? 0,
    dbPoolInUse: c.db_pool_in_use ?? 0,
    appCounters,
  }
}
