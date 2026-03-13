import { md5 } from 'js-md5'

function chunkBy64(input: string): string {
  return input.match(/.{1,64}/g)?.join('\n') || input
}

export function normalizePublicKey(rawKey: string): string {
  const trimmed = rawKey.trim()
  if (!trimmed) return ''

  const body = trimmed
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '')

  if (!body) return ''
  return `-----BEGIN PUBLIC KEY-----\n${chunkBy64(body)}\n-----END PUBLIC KEY-----`
}

function pemToArrayBuffer(pem: string): ArrayBuffer | null {
  const body = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '')

  if (!body || typeof atob !== 'function') return null

  try {
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  } catch {
    return null
  }
}

function arrayBufferToBase64(data: ArrayBuffer): string | null {
  if (typeof btoa !== 'function') return null

  const bytes = new Uint8Array(data)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }

  try {
    return btoa(binary)
  } catch {
    return null
  }
}

function getSubtleCrypto(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null
}

export async function encryptLoginPassword(password: string, rawPublicKey: string): Promise<string | null> {
  const subtle = getSubtleCrypto()
  const publicKey = normalizePublicKey(rawPublicKey)
  if (!subtle || !publicKey) return null

  const keyData = pemToArrayBuffer(publicKey)
  if (!keyData) return null

  try {
    const cryptoKey = await subtle.importKey(
      'spki',
      keyData,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
      },
      false,
      ['encrypt'],
    )

    const hashedPwd = md5(password)
    const encrypted = await subtle.encrypt(
      { name: 'RSA-OAEP' },
      cryptoKey,
      new TextEncoder().encode(hashedPwd),
    )

    return arrayBufferToBase64(encrypted)
  } catch {
    return null
  }
}
