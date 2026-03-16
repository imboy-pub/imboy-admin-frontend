import type { DashboardPanelExtension } from '@/modules/dashboard/contracts/dashboardPanelExtension'

export class DashboardPanelRegistry {
  private readonly panels = new Map<string, DashboardPanelExtension>()

  register(panel: DashboardPanelExtension) {
    if (this.panels.has(panel.id)) {
      throw new Error(`Dashboard panel "${panel.id}" already registered`)
    }
    this.panels.set(panel.id, panel)
  }

  resolveById(id: string) {
    return this.panels.get(id)
  }

  list() {
    return Array.from(this.panels.values())
  }
}
