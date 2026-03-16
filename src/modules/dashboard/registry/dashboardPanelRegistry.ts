import type { DashboardPanelExtension } from '@/modules/dashboard/contracts/dashboardPanelExtension'

export class DashboardPanelRegistry {
  private readonly panels = new Map<string, DashboardPanelExtension>()

  register(panel: DashboardPanelExtension) {
    this.panels.set(panel.id, panel)
    return panel
  }

  resolveById(id: string) {
    return this.panels.get(id) ?? null
  }

  list() {
    return Array.from(this.panels.values())
  }
}

export const dashboardPanelRegistry = new DashboardPanelRegistry()
