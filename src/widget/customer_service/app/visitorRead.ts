import type { EntityId } from '../../../types/common'

export function canonicalReadId(value: unknown): value is EntityId {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
    && BigInt(value) <= 9223372036854775807n
}

/** A receipt confirms exactly its requested set, never an id range. */
export function createVisitorReads(
  eligible: () => boolean,
  confirm: (_ids: EntityId[], _signal: AbortSignal) => Promise<unknown>,
) {
  let generation = 0
  let flight: AbortController | null = null
  let visible = new Set<EntityId>()
  const confirmed = new Set<EntityId>()
  async function flush(): Promise<void> {
    if (flight !== null || !eligible()) return
    const ids = [...visible].filter(id => !confirmed.has(id)).slice(0, 200)
    if (ids.length === 0) return
    const current = generation
    const request = new AbortController()
    flight = request
    let success = false
    try {
      await confirm(ids, request.signal)
      if (generation !== current || request.signal.aborted) return
      ids.forEach(id => confirmed.add(id))
      success = true
    } catch { /* Unconfirmed ids remain retryable on the next visibility/focus check. */ }
    finally {
      if (generation === current) {
        flight = null
        if (success) void flush()
      }
    }
  }
  return {
    visible(ids: EntityId[]): void { visible = new Set(ids.filter(canonicalReadId)); void flush() },
    reset(): void { generation += 1; flight?.abort(); flight = null; visible.clear(); confirmed.clear() },
  }
}
