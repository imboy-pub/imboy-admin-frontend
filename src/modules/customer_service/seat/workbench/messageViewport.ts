import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EntityId } from '../types'

type Snapshot = {
  scope: string
  first: EntityId | null
  last: EntityId | null
  atBottom: boolean
  anchor: { id: EntityId; offset: number } | null
}

const rows = (box: HTMLElement) => Array.from(box.querySelectorAll<HTMLElement>('[data-message-id]'))
const bottom = (box: HTMLElement) => Math.max(0, box.scrollHeight - box.clientHeight)

function visibleRows(box: HTMLElement) {
  const bounds = box.getBoundingClientRect()
  if (bounds.height <= 0) return []
  return rows(box).filter(row => {
    const rect = row.getBoundingClientRect()
    return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom
  })
}

function snapshot(box: HTMLElement, scope: string): Snapshot {
  const all = rows(box), firstVisible = visibleRows(box)[0]
  return {
    scope,
    first: all[0]?.dataset.messageId ?? null,
    last: all[all.length - 1]?.dataset.messageId ?? null,
    atBottom: bottom(box) - box.scrollTop <= 16,
    anchor: firstVisible ? {
      id: firstVisible.dataset.messageId!,
      offset: firstVisible.getBoundingClientRect().top - box.getBoundingClientRect().top,
    } : null,
  }
}

function restoreScroll(box: HTMLElement, before: Snapshot | null, scope: string, intersections: Map<Element, boolean>) {
  const now = snapshot(box, scope)
  const initial = before === null || before.scope !== scope || before.first === null
  const prepended = !initial && before.first !== now.first && rows(box).some(row => row.dataset.messageId === before.first)
  if (initial) {
    intersections.clear()
    box.scrollTop = bottom(box)
  } else if (prepended || !before.atBottom) {
    const anchor = before.anchor
    const row = anchor && rows(box).find(item => item.dataset.messageId === anchor.id)
    if (row && anchor) {
      box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - anchor.offset
    }
  } else {
    box.scrollTop = bottom(box)
  }
  return snapshot(box, scope)
}

function publishVisible(box: HTMLElement, intersections: Map<Element, boolean>, changed?: (_id: EntityId | null) => void) {
  let max: EntityId | null = null
  if (typeof IntersectionObserver !== 'undefined') for (const row of visibleRows(box)) {
    if (intersections.get(row) !== true) continue
    const id = row.dataset.messageId!
    if (max === null || id.length > max.length || (id.length === max.length && id > max)) max = id
  }
  changed?.(max)
}

function observeViewport(box: HTMLElement, updateLayout: () => void, publish: (_box: HTMLElement) => void, intersections: Map<Element, boolean>) {
  let active = true
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateLayout)
  const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    if (!active) return
    for (const entry of entries) {
      if (box.contains(entry.target)) intersections.set(entry.target, entry.isIntersecting && entry.intersectionRatio > 0)
    }
    publish(box)
  }, { root: null, threshold: 0 })
  resize?.observe(box)
  for (const row of rows(box)) {
    resize?.observe(row)
    intersection?.observe(row)
  }
  return () => { active = false; resize?.disconnect(); intersection?.disconnect() }
}

export function useSeatMessageViewport(
  scope: string, messageIds: EntityId[], onVisibleMessageChange?: (_id: EntityId | null) => void,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previous = useRef<Snapshot | null>(null)
  const intersections = useRef(new Map<Element, boolean>())
  const [reading, setReading] = useState<{ scope: string; last: EntityId | null; atBottom: boolean } | null>(null)
  const messageKey = messageIds.join(',')
  const lastId = messageIds[messageIds.length - 1] ?? null
  const hasNewMessages = reading?.scope === scope && !reading.atBottom && reading.last !== lastId
  const publish = useCallback((box: HTMLElement) => publishVisible(box, intersections.current, onVisibleMessageChange), [onVisibleMessageChange])
  const onScroll = useCallback(() => {
    const box = containerRef.current
    if (!box) return
    const current = snapshot(box, scope)
    previous.current = current
    setReading(before => ({
      scope,
      last: current.atBottom || before?.scope !== scope ? current.last : before.last,
      atBottom: current.atBottom,
    }))
    publish(box)
  }, [scope, publish])
  const updateLayout = useCallback(() => {
    const box = containerRef.current
    if (!box) return
    previous.current = restoreScroll(box, previous.current, scope, intersections.current)
    publish(box)
  }, [scope, publish])
  useLayoutEffect(updateLayout, [updateLayout, messageKey])
  useEffect(() => {
    const box = containerRef.current
    if (box) return observeViewport(box, updateLayout, publish, intersections.current)
  }, [updateLayout, publish, messageKey])
  const jumpToLatest = useCallback(() => {
    const box = containerRef.current
    if (!box) return
    box.scrollTop = bottom(box)
    onScroll()
  }, [onScroll])

  return { containerRef, onScroll, hasNewMessages, jumpToLatest }
}
