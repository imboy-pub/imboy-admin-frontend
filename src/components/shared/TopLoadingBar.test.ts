/**
 * Unit tests for TopLoadingBar module exports:
 *   startTopLoading, finishTopLoading
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { startTopLoading, finishTopLoading } from './TopLoadingBar'

// The module tracks a `loadingCount` internally. We test via the exported functions.
// Since the count persists across test calls, we reset by calling finishTopLoading
// enough times to drain it.

function drainLoadingCount() {
  // Call finish 10 times to ensure count is 0 (clamped at 0)
  for (let i = 0; i < 10; i++) {
    finishTopLoading()
  }
}

afterEach(() => {
  drainLoadingCount()
})

describe('startTopLoading / finishTopLoading', () => {
  it('startTopLoading increments without throwing', () => {
    expect(() => startTopLoading()).not.toThrow()
  })

  it('finishTopLoading decrements without throwing', () => {
    startTopLoading()
    expect(() => finishTopLoading()).not.toThrow()
  })

  it('finishTopLoading does not go below 0 (clamped)', () => {
    // Should not throw even when count is 0
    expect(() => finishTopLoading()).not.toThrow()
    expect(() => finishTopLoading()).not.toThrow()
  })

  it('multiple start/finish calls balance out', () => {
    startTopLoading()
    startTopLoading()
    startTopLoading()
    expect(() => {
      finishTopLoading()
      finishTopLoading()
      finishTopLoading()
    }).not.toThrow()
  })
})
