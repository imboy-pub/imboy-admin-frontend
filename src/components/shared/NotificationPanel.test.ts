/**
 * Unit tests for NotificationPanel exported functions:
 *   loadNotifications, pushNotification
 */
import '../../test/setupDom'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { loadNotifications, pushNotification } from './NotificationPanel'

const STORAGE_KEY = 'imboy_admin_notifications'

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe('loadNotifications', () => {
  it('returns empty array when storage is empty', () => {
    expect(loadNotifications()).toEqual([])
  })

  it('returns empty array when storage contains invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(loadNotifications()).toEqual([])
  })

  it('returns empty array when stored value is not an array', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    expect(loadNotifications()).toEqual([])
  })

  it('returns stored notifications', () => {
    const items = [{ id: '1', message: 'test', type: 'info', timestamp: 100, read: false }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    const result = loadNotifications()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })
})

describe('pushNotification', () => {
  it('adds notification to storage', () => {
    pushNotification({ message: 'Hello', type: 'info' })
    const stored = loadNotifications()
    expect(stored).toHaveLength(1)
    expect(stored[0].message).toBe('Hello')
    expect(stored[0].read).toBe(false)
  })

  it('assigns unique id and timestamp', () => {
    pushNotification({ message: 'A', type: 'info' })
    pushNotification({ message: 'B', type: 'warning' })
    const stored = loadNotifications()
    expect(stored).toHaveLength(2)
    expect(stored[0].id).not.toBe(stored[1].id)
  })

  it('prepends new notification (most recent first)', () => {
    pushNotification({ message: 'First', type: 'info' })
    pushNotification({ message: 'Second', type: 'info' })
    const stored = loadNotifications()
    expect(stored[0].message).toBe('Second')
    expect(stored[1].message).toBe('First')
  })

  it('dispatches admin-notifications-changed event', () => {
    let eventFired = false
    window.addEventListener('admin-notifications-changed', () => { eventFired = true }, { once: true })
    pushNotification({ message: 'test', type: 'info' })
    expect(eventFired).toBe(true)
  })
})
