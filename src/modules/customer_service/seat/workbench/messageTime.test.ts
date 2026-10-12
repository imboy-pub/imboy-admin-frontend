import { expect, it } from 'bun:test'
import { messageTime } from './messageTime'

it('formats equivalent timezone timestamps as the same local date and time', () => {
  const a = messageTime('2026-10-12T08:30:00+08:00')
  const b = messageTime('2026-10-12T00:30:00Z')
  expect(a).toEqual(b)
  expect(a?.time).toMatch(/^\d{2}:\d{2}$/)
  expect(a?.iso).toBe('2026-10-12T00:30:00.000Z')
})

it('does not render invalid or absent timestamps as a fabricated date', () => {
  expect(messageTime(null)).toBeNull()
  expect(messageTime('not-a-timestamp')).toBeNull()
})
