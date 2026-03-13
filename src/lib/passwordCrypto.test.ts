import { describe, expect, it } from 'bun:test'
import { encryptLoginPassword, normalizePublicKey } from './passwordCrypto'

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDARqnAEpvlAB/3zZFAkJZMdvgO
7sfzCRcS9NggJtmwmOG9KTKhDL8NlNAmTzUXQvMQEtSmqt7rWjyhbt325ecCKrdp
MPgMDXIvDceV0pAwSS99mie5gvACH1x/NsKBWTnBV5hFpyZ0CB0DQ670PwicwWDm
4MUBJW/q8y2aiLIfHQIDAQAB
-----END PUBLIC KEY-----`

describe('normalizePublicKey', () => {
  it('returns empty string when raw key is blank', () => {
    expect(normalizePublicKey('   ')).toBe('')
  })

  it('wraps bare key body with PEM header and footer', () => {
    const rawBody =
      'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDARqnAEpvlAB/3zZFAkJZMdvgO7sfzCRcS9NggJtmwmOG9KTKhDL8NlNAmTzUXQvMQEtSmqt7rWjyhbt325ecCKrdpMPgMDXIvDceV0pAwSS99mie5gvACH1x/NsKBWTnBV5hFpyZ0CB0DQ670PwicwWDm4MUBJW/q8y2aiLIfHQIDAQAB'

    const normalized = normalizePublicKey(rawBody)
    expect(normalized.startsWith('-----BEGIN PUBLIC KEY-----\n')).toBeTrue()
    expect(normalized.endsWith('\n-----END PUBLIC KEY-----')).toBeTrue()

    const bodyLines = normalized
      .replace('-----BEGIN PUBLIC KEY-----\n', '')
      .replace('\n-----END PUBLIC KEY-----', '')
      .split('\n')
    expect(bodyLines.every((line) => line.length <= 64)).toBeTrue()
  })
})

describe('encryptLoginPassword', () => {
  it('returns null when key is blank', async () => {
    expect(await encryptLoginPassword('password123', '')).toBeNull()
  })

  it('returns null when key content is invalid', async () => {
    expect(await encryptLoginPassword('password123', 'not-a-valid-public-key')).toBeNull()
  })

  it('returns encrypted ciphertext when key is valid', async () => {
    const encrypted = await encryptLoginPassword('password123', TEST_PUBLIC_KEY)
    expect(encrypted).not.toBeNull()
    expect(typeof encrypted).toBe('string')
    expect((encrypted as string).length).toBeGreaterThan(20)
  })
})
