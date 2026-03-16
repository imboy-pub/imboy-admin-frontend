import type { ReactNode } from 'react'
import type { OverviewStats } from '@/services/api/stats'

export type DashboardTrendPoint = {
  date: string
  [key: string]: string | number
}

export type DashboardPanelContext = {
  stats: OverviewStats | undefined
  userTrendData: DashboardTrendPoint[]
  messageTrendData: DashboardTrendPoint[]
}

export interface DashboardPanelExtension {
  id: string
  render: (context: DashboardPanelContext) => ReactNode
}
