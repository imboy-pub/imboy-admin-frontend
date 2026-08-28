import { describe, expect, it } from 'bun:test'
import { md5 } from 'js-md5'
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

  // C-1 回归（2026-08-28 发布审查）：此前测试只断言"非空字符串"，
  // 前端把 md5 换成 sha256 原始字节都没人发现，后端契约断裂导致管理员全锁死。
  // 本用例解密密文验证内容，锁死后端契约：密文载荷必须是 md5(password) 的 hex 字符串。
  it('契约：密文解密后必须是 md5(password) 的 hex 字符串（C-1 回归）', async () => {
    const kp = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    )
    const spki = await crypto.subtle.exportKey('spki', kp.publicKey)
    const spkiB64 = btoa(String.fromCharCode(...new Uint8Array(spki)))

    const encrypted = await encryptLoginPassword('password123', spkiB64)
    expect(encrypted).not.toBeNull()

    const raw = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      kp.privateKey,
      Uint8Array.from(atob(encrypted as string), (c) => c.charCodeAt(0)),
    )
    expect(new TextDecoder().decode(raw)).toBe(md5('password123'))
  })
})
