import type { ReactNode } from 'react'

export type ReportTargetType = 'moment' | 'group' | 'channel' | 'user'

export type ReportProcessStep = {
  title: string
  description: string
}

export type ReportPanelContext = {
  targetType: ReportTargetType
  targetLabel: string
  governancePath: string
  governanceLabel: string
  processSteps: ReportProcessStep[]
}

export interface ReportPanelExtension {
  id: string
  targetType: ReportTargetType | 'default'
  render: (_context: ReportPanelContext) => ReactNode
}
