import client from './client'
import { ApiResponse } from '@/types/api'
import { SystemMetrics, SystemHealthStats } from '@/types/systemHealth'
import { requireApiPayload } from './responseAdapter'

/**
 * /metrics 端点不走 /adm 前缀，需要显式指定完整路径。
 * 从 VITE_API_BASE_URL 推导出 API 根路径，确保生产环境路由正确。
 */
const METRICS_BASE_URL = (() => {
  const base = import.meta.env.VITE_API_BASE_URL || '/api/adm'
  try {
    const url = new URL(base)
    return url.origin
  } catch {
    // 相对路径（如 '/api/adm'），回退到当前 origin
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
  // （B-26 改名后的扁平名，见后端 metrics_handler json_counter_key/2）
  const systemKeys = new Set([
    'erlang_vm_process_count',
    'erlang_vm_port_count',
    'erlang_vm_memory_bytes_total_total',
    'erlang_vm_memory_bytes_total_processes',
    'erlang_vm_memory_bytes_total_ets',
    'process_uptime_seconds',
    'imboy_online_users',
    'imboy_ws_connections_total',
    'db_pool_free',
    'db_pool_in_use',
  ])

  const appCounters: Record<string, number> = {}
  for (const [key, value] of Object.entries(c)) {
    // Old backend images may still expose retired deployment-license metrics.
    if (!systemKeys.has(key) && !key.startsWith('imboy_license_') && typeof value === 'number') {
      appCounters[key] = value
    }
  }

  return {
    processCount: c.erlang_vm_process_count ?? 0,
    memoryTotalMB: toMB(c.erlang_vm_memory_bytes_total_total ?? 0),
    memoryProcessesMB: toMB(c.erlang_vm_memory_bytes_total_processes ?? 0),
    memoryEtsMB: toMB(c.erlang_vm_memory_bytes_total_ets ?? 0),
    onlineUsers: c.imboy_online_users ?? 0,
    wsConnections: c.imboy_ws_connections_total ?? 0,
    dbPoolFree: c.db_pool_free ?? 0,
    dbPoolInUse: c.db_pool_in_use ?? 0,
    appCounters,
  }
}
