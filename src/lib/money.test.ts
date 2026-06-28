import { describe, it, expect } from 'bun:test'
import { fenToYuan, yuanToFen } from './money'

describe('fenToYuan', () => {
  it('converts integer fen to ¥-prefixed yuan string', () => {
    expect(fenToYuan(5999)).toBe('¥59.99')
    expect(fenToYuan(100)).toBe('¥1.00')
    expect(fenToYuan(0)).toBe('¥0.00')
  })

  it('handles string input', () => {
    expect(fenToYuan('5000')).toBe('¥50.00')
  })

  it('returns - for null/undefined/NaN', () => {
    expect(fenToYuan(null)).toBe('-')
    expect(fenToYuan(undefined)).toBe('-')
    expect(fenToYuan('abc')).toBe('-')
  })

  it('includes ¥ prefix without double-prefix', () => {
    const result = fenToYuan(1000)
    expect(result.startsWith('¥')).toBe(true)
    expect(result.indexOf('¥', 1)).toBe(-1)
  })
})

describe('yuanToFen', () => {
  it('converts yuan to fen integer', () => {
    expect(yuanToFen(59.99)).toBe(5999)
    expect(yuanToFen(1)).toBe(100)
    expect(yuanToFen('1.5')).toBe(150)
  })

  it('returns 0 for invalid input', () => {
    expect(yuanToFen('abc')).toBe(0)
  })

  it('round-trips with fenToYuan', () => {
    expect(yuanToFen(Number(fenToYuan(8888).slice(1)))).toBe(8888)
  })
})
