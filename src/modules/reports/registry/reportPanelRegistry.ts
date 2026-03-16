import type {
  ReportPanelExtension,
  ReportTargetType,
} from '@/modules/reports/contracts/reportPanelExtension'

export class ReportPanelRegistry {
  private readonly panels = new Map<string, ReportPanelExtension>()

  register(panel: ReportPanelExtension) {
    this.panels.set(panel.id, panel)
    return panel
  }

  resolveById(id: string) {
    return this.panels.get(id) ?? null
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

    return null
  }

  list() {
    return Array.from(this.panels.values())
  }
}

export const reportPanelRegistry = new ReportPanelRegistry()
