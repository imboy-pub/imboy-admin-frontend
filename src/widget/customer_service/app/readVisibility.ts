import type { EntityId } from '../../../types/common'
import { canonicalReadId } from './visitorRead'

/** Geometry is rechecked on every event; render/history alone never confirms a read. */
export function observeReadVisibility(root: HTMLElement, report: (_ids: EntityId[]) => void) {
  const doc = root.ownerDocument
  const win = doc.defaultView
  let stopped = false
  const check = (): void => {
    if (stopped) return
    if (doc.visibilityState !== 'visible' || !doc.hasFocus() || !win) { report([]); return }
    const modal = root.querySelector<HTMLElement>('[aria-modal="true"]')
    if (modal && win.getComputedStyle(modal).display !== 'none'
      && win.getComputedStyle(modal).visibility !== 'hidden') { report([]); return }
    const log = root.querySelector<HTMLElement>('[role="log"]')
    if (!log) { report([]); return }
    const bounds = log.getBoundingClientRect()
    const ids: EntityId[] = []
    for (const bubble of log.querySelectorAll<HTMLElement>('[data-role="agent"][data-message-id]')) {
      const id = bubble.dataset.messageId
      const rect = bubble.getBoundingClientRect()
      if (canonicalReadId(id) && bubble.getClientRects().length > 0 && rect.width > 0 && rect.height > 0
        && bounds.width > 0 && bounds.height > 0 && rect.bottom > Math.max(bounds.top, 0)
        && rect.top < Math.min(bounds.bottom, win.innerHeight) && rect.right > Math.max(bounds.left, 0)
        && rect.left < Math.min(bounds.right, win.innerWidth)) ids.push(id)
    }
    report(ids)
  }
  const observer = win && typeof win.IntersectionObserver === 'function'
    ? new win.IntersectionObserver(check, { root: root.querySelector('[role="log"]') }) : null
  doc.addEventListener('visibilitychange', check)
  win?.addEventListener('focus', check)
  win?.addEventListener('blur', check)
  win?.addEventListener('resize', check)
  root.addEventListener('scroll', check, true)
  return {
    refresh(): void {
      if (stopped) return
      observer?.disconnect()
      root.querySelectorAll('[data-role="agent"][data-message-id]').forEach(node => observer?.observe(node))
      // Layout after DOM replacement and auto-scroll is measured in the next frame.
      win?.requestAnimationFrame(check)
    },
    stop(): void {
      stopped = true; observer?.disconnect()
      doc.removeEventListener('visibilitychange', check)
      win?.removeEventListener('focus', check); win?.removeEventListener('blur', check)
      win?.removeEventListener('resize', check); root.removeEventListener('scroll', check, true)
    },
  }
}
