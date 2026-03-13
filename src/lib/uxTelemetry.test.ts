import '../test/setupDom'

import { afterEach, describe, expect, it } from 'bun:test'
import { trackUxEvent, UX_EVENT_DISPATCH } from './uxTelemetry'

type UxEventDetail = {
  event: string
  payload: Record<string, unknown>
  timestamp: string
}

afterEach(() => {
  window.sessionStorage.clear()
})

describe('trackUxEvent', () => {
  it('dispatches event with __meta payload for funnel analysis', () => {
    const captured: UxEventDetail[] = []
    const handler = (event: Event) => {
      const custom = event as CustomEvent<UxEventDetail>
      captured.push(custom.detail)
    }

    window.addEventListener(UX_EVENT_DISPATCH, handler)
    trackUxEvent('ux_filter_apply', { page: 'user_list' })
    trackUxEvent('ux_drawer_open', { page: 'user_list' })
    window.removeEventListener(UX_EVENT_DISPATCH, handler)

    expect(captured.length).toBe(2)
    const firstMeta = captured[0]?.payload?.__meta as Record<string, unknown>
    const secondMeta = captured[1]?.payload?.__meta as Record<string, unknown>

    expect(typeof firstMeta.session_id).toBe('string')
    expect(firstMeta.path).toBe('/')
    expect(typeof firstMeta.seq).toBe('number')
    expect(typeof secondMeta.seq).toBe('number')
    expect(Number(secondMeta.seq)).toBeGreaterThan(Number(firstMeta.seq))
  })
})
