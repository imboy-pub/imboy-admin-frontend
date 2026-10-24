import { expect, it } from 'bun:test'
import { customerServiceTimestamp } from './customerServiceTimestamp'
import { messageTime } from '../modules/customer_service/seat/workbench/messageTime'

it('converts the backend seconds contract and numeric-string legacy shape once', () => {
  expect(customerServiceTimestamp(1789600000)).toBe('2026-09-16T23:06:40.000Z')
  expect(customerServiceTimestamp('1789600000')).toBe('2026-09-16T23:06:40.000Z')
  expect(customerServiceTimestamp(0)).toBe('1970-01-01T00:00:00.000Z')
  expect(customerServiceTimestamp(-1)).toBe('1969-12-31T23:59:59.000Z')
})

it('preserves legacy qualified instants and their existing string shape', () => {
  const utc = '2026-09-16T23:06:40Z'
  const shanghai = '2026-09-17T07:06:40+08:00'
  expect(customerServiceTimestamp(utc)).toBe(utc)
  expect(customerServiceTimestamp(shanghai)).toBe(shanghai)
  expect(messageTime(customerServiceTimestamp(1789600000)))
    .toEqual(messageTime(customerServiceTimestamp(shanghai)))
})

it('does not manufacture timestamps from missing, ambiguous or invalid input', () => {
  for (const value of [null, undefined, '', 'bad', false, {}, [], NaN, Infinity,
    1.5, Number.MAX_SAFE_INTEGER, '2026-09-16', '2026-09-16T23:06:40']) {
    expect(customerServiceTimestamp(value)).toBeNull()
  }
})

it('rejects impossible calendar dates instead of allowing Date.parse normalization', () => {
  for (const value of [
    '2026-02-30T00:00:00Z', '2026-02-29T00:00:00Z',
    '1900-02-29T00:00:00Z', '2024-02-30T00:00:00Z',
    '2026-04-31T00:00:00Z', '2026-00-01T00:00:00Z',
    '2026-13-01T00:00:00Z', '2026-01-00T00:00:00Z',
    '2026-01-32T00:00:00Z', '0099-02-29T00:00:00Z',
  ]) expect(customerServiceTimestamp(value)).toBeNull()
})

it('rejects out-of-range time and offset fields and non-RFC3339 shapes', () => {
  for (const value of [
    '2026-01-01T24:00:00Z', '2026-01-01T23:60:00Z',
    '2026-01-01T23:59:60Z', '2026-01-01T00:00:00+24:00',
    '2026-01-01T00:00:00-24:00', '2026-01-01T00:00:00+08:60',
    '2026-01-01T00:00:00-08:60', '2026-01-01T00:00Z',
    '2026-01-01T00:00:00.Z', '2026-01-01T00:00:00+0800',
    '2026-01-01 00:00:00Z', '2026-01-01T00:00:00Z ',
  ]) expect(customerServiceTimestamp(value)).toBeNull()
})

it('preserves real leap days, low years and offset microsecond strings exactly', () => {
  for (const value of [
    '2024-02-29T23:59:59Z', '2000-02-29T00:00:00Z',
    '0096-02-29T00:00:00Z', '0099-02-28T00:00:00Z',
    '2024-02-29T23:59:59.123456+08:00',
    '2024-02-29T00:00:00.654321-05:30',
    '2024-02-29t00:00:00.123456z',
  ]) expect(customerServiceTimestamp(value)).toBe(value)
})
