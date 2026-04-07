export interface SystemMetrics {
  counters: Record<string, number>
  histograms: Record<string, unknown[]>
}

/** Derived view-model for the health dashboard */
export interface SystemHealthStats {
  processCount: number
  memoryTotalMB: number
  memoryProcessesMB: number
  memoryEtsMB: number
  onlineUsers: number
  wsConnections: number
  dbPoolFree: number
  dbPoolInUse: number
  /** Application-level counters not covered above */
  appCounters: Record<string, number>
}
