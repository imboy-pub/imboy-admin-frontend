import { beforeEach } from 'bun:test'

// Unit-only Web Locks substitute; real cross-tab exclusion requires browser acceptance.
beforeEach(() => {
  const held = new Set<string>()
  if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: async (name: string, _options: unknown, callback: (_lock: object | null) => unknown) => {
      if (held.has(name)) return callback(null)
      held.add(name)
      try { return await callback({}) } finally { held.delete(name) }
    },
  } })
})
