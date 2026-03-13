import { describe, expect, it } from 'bun:test'
import { normalizeLoginMeta } from './auth'

describe('normalizeLoginMeta', () => {
  it('fills defaults when fields are missing', () => {
    const normalized = normalizeLoginMeta({})
    expect(normalized.csrf_token).toBe('')
    expect(normalized.public_key).toBe('')
    expect(normalized.system_name).toBe('Imboy Admin')
  })

  it('keeps server-provided values', () => {
    const normalized = normalizeLoginMeta({
      csrf_token: 'csrf_1',
      public_key: 'PUBLIC_KEY',
      system_name: 'IMBoy Admin System',
    })
    expect(normalized.csrf_token).toBe('csrf_1')
    expect(normalized.public_key).toBe('PUBLIC_KEY')
    expect(normalized.system_name).toBe('IMBoy Admin System')
  })
})
