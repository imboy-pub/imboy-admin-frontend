import type {
  ReportPanelExtension,
  ReportTargetType,
} from '@/modules/reports/contracts/reportPanelExtension'

export class ReportPanelRegistry {
  private readonly panels = new Map<string, ReportPanelExtension>()

  register(panel: ReportPanelExtension) {
    if (this.panels.has(panel.id)) {
      throw new Error(`Report panel "${panel.id}" already registered`)
    }
    this.panels.set(panel.id, panel)
  }

  resolveById(id: string) {
    return this.panels.get(id)
  }

  resolveForTarget(targetType: ReportTargetType) {
    for (const panel of this.panels.values()) {
      if (panel.targetType === targetType) {
        return panel
      }
    }

    for (const panel of this.panels.values()) {
      if (panel.targetType === 'default') {
        return panel
      }
    }

    return undefined
  }
}
