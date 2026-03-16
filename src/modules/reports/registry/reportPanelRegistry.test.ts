import { describe, expect, it } from 'bun:test'
import type { ReportPanelExtension } from '@/modules/reports/contracts/reportPanelExtension'
import { ReportPanelRegistry } from '@/modules/reports/registry/reportPanelRegistry'

const createPanel = (
  id: string,
  targetType: ReportPanelExtension['targetType']
): ReportPanelExtension => ({
  id,
  targetType,
  render: () => null,
})

describe('ReportPanelRegistry', () => {
  it('registers and resolves panel by id', () => {
    const registry = new ReportPanelRegistry()
    const panel = createPanel('moment-panel', 'moment')

    registry.register(panel)

    expect(registry.resolveById('moment-panel')).toBe(panel)
  })

  it('falls back when target-specific panel is missing', () => {
    const registry = new ReportPanelRegistry()
    const fallbackPanel = createPanel('fallback-panel', 'default')

    registry.register(fallbackPanel)

    expect(registry.resolveForTarget('channel')).toBe(fallbackPanel)
  })
})
