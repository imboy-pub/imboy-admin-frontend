import { describe, expect, it } from 'bun:test'
import { isValidPemFormat } from './pemValidation'

describe('isValidPemFormat', () => {
  const validPem = [
    '-----BEGIN PUBLIC KEY-----',
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a2rwplBQLzygykE',
    '-----END PUBLIC KEY-----',
  ].join('\n')

  it('accepts a valid PEM public key', () => {
    expect(isValidPemFormat(validPem)).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidPemFormat('')).toBe(false)
  })

  it('rejects plain base64 without headers', () => {
    expect(isValidPemFormat('MIIBIjANBgkqhkiG9w0BAQEFAA==')).toBe(false)
  })

  it('rejects missing END header', () => {
    expect(isValidPemFormat('-----BEGIN PUBLIC KEY-----\nMIIBIjAN')).toBe(false)
  })

  it('rejects mismatched BEGIN/END type', () => {
    const mismatch = [
      '-----BEGIN PUBLIC KEY-----',
      'MIIBIjAN',
      '-----END PRIVATE KEY-----',
    ].join('\n')
    expect(isValidPemFormat(mismatch)).toBe(false)
  })

  it('rejects input exceeding 8192 characters', () => {
    const oversized = [
      '-----BEGIN PUBLIC KEY-----',
      'A'.repeat(8200),
      '-----END PUBLIC KEY-----',
    ].join('\n')
    expect(isValidPemFormat(oversized)).toBe(false)
  })

  it('accepts different PEM type (CERTIFICATE)', () => {
    const certPem = [
      '-----BEGIN CERTIFICATE-----',
      'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a2rwplBQLzygykE',
      '-----END CERTIFICATE-----',
    ].join('\n')
    expect(isValidPemFormat(certPem)).toBe(true)
  })
})
