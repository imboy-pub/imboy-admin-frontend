import { afterEach, expect, it } from 'bun:test'
import {
  displayFormatter,
  recheckDisplayZone,
  resetDisplayZoneResolver,
  setDisplayZoneResolver,
} from '@/lib/displayTime'
import { messageTime } from './messageTime'

/** 固定瞬间（毫秒）＝2026-09-16T23:06:40.000Z（与 apiInstant.test.ts 的 T1 同锚点）。 */
const T1_ISO = '2026-09-16T23:06:40.000Z'

afterEach(() => {
  resetDisplayZoneResolver()
})

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

it('R14 formatter cache: identical (locale, zone, kind) reuses one instance; kind differs', () => {
  const a = displayFormatter('zh-CN', 'Asia/Shanghai', 'time')
  const b = displayFormatter('zh-CN', 'Asia/Shanghai', 'time')
  expect(b).toBe(a)
  const day = displayFormatter('zh-CN', 'Asia/Shanghai', 'day')
  expect(day).not.toBe(a)
})

it('R14-2 explicit timeZone: same instant renders each browser context own local format', () => {
  // 两个「浏览器 context」＝同一进程内以显式 IANA zone 分别断言各自本地格式。
  const shanghai = messageTime(T1_ISO, { timeZone: 'Asia/Shanghai' })
  expect(shanghai?.day).toBe('2026/09/17')
  expect(shanghai?.time).toBe('07:06')
  expect(shanghai?.iso).toBe(T1_ISO)

  const newYork = messageTime(T1_ISO, { timeZone: 'America/New_York' })
  expect(newYork?.day).toBe('2026/09/16')
  expect(newYork?.time).toBe('19:06')
  expect(newYork?.iso).toBe(T1_ISO)
})

it('R14-3 resolver change + recheck: cache invalidates and implicit-zone output follows', () => {
  setDisplayZoneResolver(() => 'America/New_York')
  const before = messageTime(T1_ISO)
  expect(before?.time).toBe('19:06')

  // 查看者旅行换区：resolver 返回值变化，生命周期事件触发核对 → true（需刷新）。
  setDisplayZoneResolver(() => 'Asia/Shanghai')
  expect(recheckDisplayZone()).toBe(true)
  const after = messageTime(T1_ISO)
  expect(after?.time).toBe('07:06')

  // zone 未再变化：核对返回 false（不无谓刷新）。
  expect(recheckDisplayZone()).toBe(false)
})
