/**
 * CS-03 企业业务平台只读面单元测试。
 *
 * 覆盖验收点：
 * - CS-03-A01：所有 API 调用只落 `/enterprise-business/organizations/*`，无 `/api/v1`；
 * - CS-03-A03：TSID 全程 string；
 * - CS-03-A05：密文/HMAC/object key 不进入展示视图（contact.profile_cipher、
 *   message.body_cipher、asset.object_key 均被白名单投影丢弃）。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  assertEbScope,
  isSensitiveKey,
  nextCursor,
  pickSafeFields,
  toEbContact,
  toEbContactList,
  toEbIdentity,
  toEbMessage,
  toEbMessageList,
  EB_CONTACT_SAFE_KEYS,
  EB_IDENTITY_SAFE_KEYS,
  EB_MESSAGE_SAFE_KEYS,
} from './pureFunctions'
import {
  fetchEbAssetContent,
  getEbContacts,
  getEbContactDetail,
  getEbConversationMessages,
  getEbIdentities,
  readBlobErrorMessage,
} from './public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

function stubGet(handler: (_url: string, _config: Record<string, unknown>) => unknown) {
  const calls: Array<{ url: string; config: Record<string, unknown> }> = []
  mutableClient.get = (url: unknown, config: unknown) => {
    const record = { url: String(url), config: (config ?? {}) as Record<string, unknown> }
    calls.push(record)
    return handler(record.url, record.config)
  }
  return calls
}

const SCOPE = { organizationId: '1234567890123456789', workspaceId: '9876543210987654321' }

// ---------------------------------------------------------------------------
// CS-03-A01：/api/adm 单一出口，禁止 /api/v1
// ---------------------------------------------------------------------------
describe('enterprise_business api paths (A01)', () => {
  it('读端点全部落在 /enterprise-business/organizations 下且无 /api/v1', async () => {
    const calls = stubGet(() => ({ data: { code: 0, msg: 'success', payload: [] } }))
    await getEbIdentities(SCOPE, undefined, 10)
    await getEbContacts(SCOPE, '111111111111111111', 10)
    await getEbContactDetail(SCOPE, '222222222222222222')
    await getEbConversationMessages(SCOPE, '333333333333333333', undefined, 10)

    expect(calls.length).toBe(4)
    for (const call of calls) {
      expect(call.url.startsWith('/enterprise-business/organizations/')).toBe(true)
      expect(call.url.includes('/api/v1')).toBe(false)
      expect(call.url.includes('/api/adm')).toBe(false)
    }
    expect(calls[0]?.url).toBe('/enterprise-business/organizations/1234567890123456789/identities')
    expect(calls[1]?.url).toBe('/enterprise-business/organizations/1234567890123456789/contacts')
    expect(calls[2]?.url).toBe('/enterprise-business/organizations/1234567890123456789/contacts/222222222222222222')
    expect(calls[3]?.url).toBe('/enterprise-business/organizations/1234567890123456789/conversations/333333333333333333/messages')
  })

  it('键集分页参数：workspace_id 必填，after_id/limit 按需携带', async () => {
    const calls = stubGet(() => ({ data: { code: 0, msg: 'success', payload: [] } }))
    await getEbIdentities(SCOPE, undefined, 10)
    await getEbContacts(SCOPE, '111111111111111111', 10)

    const firstParams = calls[0]?.config.params as Record<string, unknown>
    expect(firstParams.workspace_id).toBe(SCOPE.workspaceId)
    expect(firstParams.after_id).toBeUndefined()
    expect(firstParams.limit).toBe(10)

    const secondParams = calls[1]?.config.params as Record<string, unknown>
    expect(secondParams.after_id).toBe('111111111111111111')
  })

  it('附件内容走授权代理流式端点并要求 actor_user_id', async () => {
    const calls = stubGet(() => {
      const blob = new Blob(['hello'])
      return { data: blob, headers: { 'content-type': 'text/plain', 'x-asset-sha256': 'abc' } }
    })
    const result = await fetchEbAssetContent(SCOPE, '4444444444444444444', '5555555555555555555')
    expect(result.sizeBytes).toBe(5)
    expect(result.contentType).toBe('text/plain')
    const url = calls[0]?.url ?? ''
    expect(
      url.startsWith('/enterprise-business/organizations/1234567890123456789/assets/4444444444444444444/content')
    ).toBe(true)
    // 流式端点的必填参数随 URL 查询串走
    expect(url.includes(`workspace_id=${encodeURIComponent(SCOPE.workspaceId)}`)).toBe(true)
    expect(url.includes('actor_user_id=5555555555555555555')).toBe(true)
    expect(url.includes('/api/v1')).toBe(false)
  })

  it('缺 scope/ID fail-closed，零网络调用', async () => {
    const calls = stubGet(() => ({ data: { code: 0, msg: 'success', payload: [] } }))
    expect(() => assertEbScope({ organizationId: '', workspaceId: '1' })).toThrow()
    await getEbIdentities({ organizationId: '1', workspaceId: '' }).catch(() => undefined)
    await getEbContactDetail(SCOPE, '').catch(() => undefined)
    await fetchEbAssetContent(SCOPE, '1', '').catch(() => undefined)
    expect(calls.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// CS-03-A03：TSID 全程 string
// ---------------------------------------------------------------------------
describe('enterprise_business TSID handling (A03)', () => {
  it('identity/contact/message 的 *_id 保持 string', () => {
    const identity = toEbIdentity({ id: '111111111111111111', function_key: 'sales', display_name: '销售A', status: 'active', version: 1 })
    expect(identity?.id).toBe('111111111111111111')
    expect(typeof identity?.id).toBe('string')

    const contact = toEbContact({ id: '222222222222222222', imboy_user_id: '8888888888888888888', display_name: '客户X', status: 'active', version: 2 })
    expect(contact?.id).toBe('222222222222222222')
    expect(contact?.imboy_user_id).toBe('8888888888888888888')

    const message = toEbMessage({
      id: '333333333333333333',
      conversation_id: '444444444444444444',
      sender_type: 'contact',
      sender_contact_id: '555555555555555555',
      sender_business_identity_id: null,
      visibility: 'visible',
      policy_id: '666666666666666666',
      retention_days: 1095,
      retain_until: '2029-01-01T00:00:00Z',
      version: 1,
      created_at: '2026-01-01T00:00:00Z',
    })
    expect(message?.id).toBe('333333333333333333')
    expect(message?.conversation_id).toBe('444444444444444444')
    expect(message?.policy_id).toBe('666666666666666666')
    expect(message?.retention_days).toBe(1095)
  })

  it('形状不合法 → null / 空列表', () => {
    expect(toEbIdentity(null)).toBeNull()
    expect(toEbContact({ broken: true })).toBeNull()
    expect(toEbMessage('nope')).toBeNull()
    expect(toEbContactList('x')).toEqual([])
    expect(toEbMessageList(undefined)).toEqual([])
  })

  it('键集游标：整块返回才有下一页', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1) }))
    expect(nextCursor(items, 10)).toBe('10')
    expect(nextCursor(items.slice(0, 9), 10)).toBeNull()
    expect(nextCursor([], 10)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// CS-03-A05：密文 / HMAC / object key 不泄露
// ---------------------------------------------------------------------------
describe('enterprise_business sensitive field guard (A05)', () => {
  it('contact 投影丢弃 profile_cipher（即便它在原始行里）', () => {
    const rawContact = {
      id: '222222222222222222',
      imboy_user_id: '8888888888888888888',
      display_name: '客户X',
      status: 'active',
      profile_cipher: 'SUPERSECRETBASE64',
      profile_key_version: 1,
      created_by_business_identity_id: '1',
      version: 2,
    }
    const view = toEbContact(rawContact)
    const json = JSON.stringify(view)
    expect(json.includes('SUPERSECRETBASE64')).toBe(false)
    expect(json.includes('profile_cipher')).toBe(false)
    expect(json.includes('profile_key_version')).toBe(false)
    expect(view?.display_name).toBe('客户X')
  })

  it('contact 展示白名单本身无敏感键（熔断双保险）', () => {
    for (const key of EB_CONTACT_SAFE_KEYS) expect(isSensitiveKey(key)).toBe(false)
    for (const key of EB_IDENTITY_SAFE_KEYS) expect(isSensitiveKey(key)).toBe(false)
    for (const key of EB_MESSAGE_SAFE_KEYS) expect(isSensitiveKey(key)).toBe(false)
  })

  it('message 投影丢弃 body_cipher/aad_hash/content_hash', () => {
    const rawMessage = {
      id: '333333333333333333',
      conversation_id: '444444444444444444',
      sender_type: 'contact',
      body_cipher: 'E2EECIPHERTEXT',
      key_version: 1,
      aad_hash: 'AAD',
      content_hash: 'CHASH',
      visibility: 'visible',
      version: 1,
    }
    const view = toEbMessage(rawMessage)
    const json = JSON.stringify(view)
    expect(json.includes('E2EECIPHERTEXT')).toBe(false)
    expect(json.includes('body_cipher')).toBe(false)
    expect(json.includes('aad_hash')).toBe(false)
    expect(json.includes('content_hash')).toBe(false)
  })

  it('pickSafeFields 熔断兜底：误配白名单也不放行', () => {
    const view = pickSafeFields(
      { object_key: 'tenant/db/asset.bin', ok_field: 1 },
      ['object_key', 'ok_field']
    )
    expect('object_key' in view).toBe(false)
    expect(view.ok_field).toBe(1)
  })

  it('blob 错误信封解析出稳定 msg', async () => {
    const blob = new Blob([JSON.stringify({ code: 403, msg: 'asset_acl_denied' })])
    expect(await readBlobErrorMessage(blob)).toBe('asset_acl_denied')
    expect(await readBlobErrorMessage(new Blob(['not json']))).toBeNull()
  })
})
