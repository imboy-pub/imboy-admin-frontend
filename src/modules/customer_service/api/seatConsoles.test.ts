/**
 * SC-FE seat console 管理面单元测试（仿 widgetInstallations.test.ts 纪律）。
 *
 * 覆盖验收点：
 * - A06：路径只落 /customer-service/seat-consoles*；id 只在路径（PUT/revoke）；
 *   列表投影白名单 + 敏感键熔断；TSID 全程 string（无 Number() 回转）；
 * - A03/A04：buildSeatEmbedCode 输出冻结的 iframe 片段（title/sandbox/
 *   referrerpolicy/固定尺寸），负例锁死绝不出现 script loader/token/secret/
 *   organization_id/workspace_id/API base；非法 public id / 非法 origin 抛错；
 * - 客户端 fail-closed：缺 organization_id/workspace_id 直接抛错、不发请求。
 */
import { afterEach, describe, expect, it, mock, afterAll } from 'bun:test'
import client from '@/services/api/client'
import * as realWidgetConfig from '../widgetConfig'
import {
  buildSeatEmbedCode,
  isValidPublicSeatConsoleId,
  parseAllowedOriginsInput,
  toSeatConsole,
  toSeatConsoleList,
} from './seatConsolesPure'
import {
  createSeatConsole,
  listSeatConsoles,
  revokeSeatConsole,
  updateSeatConsole,
} from './seatConsoles'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; put: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalPut = mutableClient.put
const realWidgetConfigExports = { ...realWidgetConfig }

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  mutableClient.put = originalPut
})

function captureCalls(responder?: (_url: string, _body: unknown) => unknown) {
  const calls: Array<{ method: string; url: string; body: unknown; params: unknown }> = []
  mutableClient.get = (url: unknown, config: unknown) => {
    calls.push({ method: 'GET', url: String(url), body: null, params: (config as { params?: unknown })?.params })
    const payload = responder?.(String(url), null) ?? { list: [] }
    return { data: { code: 0, msg: 'success', payload } }
  }
  mutableClient.post = (url: unknown, body: unknown) => {
    calls.push({ method: 'POST', url: String(url), body, params: null })
    const payload = responder?.(String(url), body) ?? {}
    return { data: { code: 0, msg: 'success', payload } }
  }
  mutableClient.put = (url: unknown, body: unknown) => {
    calls.push({ method: 'PUT', url: String(url), body, params: null })
    const payload = responder?.(String(url), body) ?? {}
    return { data: { code: 0, msg: 'success', payload } }
  }
  return calls
}

const SEAT_CONSOLES_BASE = '/customer-service/seat-consoles'
const SCOPE = { organizationId: '1234567890123456789', workspaceId: '9876543210987654321' }
const CONSOLE_ID = '555555555555555555'
const PUBLIC_ID = '730123456789012345678'

function consoleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSOLE_ID,
    organization_id: SCOPE.organizationId,
    workspace_id: SCOPE.workspaceId,
    public_seat_console_id: PUBLIC_ID,
    allowed_origins: ['https://admin.example.com'],
    status: 'active',
    version: 3,
    created_at: 1789638174,
    updated_at: 1789638200,
    ...overrides,
  }
}

describe('seat console API 路径与方法（A06）', () => {
  it('list 带显式租户 query；create body 仅三个白名单键', async () => {
    const calls = captureCalls((url) => (url === SEAT_CONSOLES_BASE ? { seat_console: consoleRow() } : { list: [] }))
    await listSeatConsoles(SCOPE)
    await createSeatConsole({ ...SCOPE, allowedOrigins: ['https://admin.example.com'] })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.url).toBe('/customer-service/seat-consoles')
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.params).toEqual({
      organization_id: SCOPE.organizationId,
      workspace_id: SCOPE.workspaceId,
    })
    expect(calls[1]?.method).toBe('POST')
    expect(calls[1]?.url).toBe('/customer-service/seat-consoles')
    const createBody = calls[1]?.body as Record<string, unknown>
    expect(Object.keys(createBody).sort()).toEqual(['allowed_origins', 'organization_id', 'workspace_id'])
    expect(JSON.stringify(createBody)).not.toMatch(/secret|token|sk_live|api_key/i)
  })

  it('update 走 PUT /seat-consoles/:id（id 只在路径）；revoke 走 POST /:id/revoke', async () => {
    const calls = captureCalls((_url) => ({ seat_console: consoleRow() }))
    await updateSeatConsole(CONSOLE_ID, { ...SCOPE, allowedOrigins: ['https://ops.example.com'] })
    await revokeSeatConsole(CONSOLE_ID, SCOPE)
    expect(calls).toHaveLength(2)
    expect(calls[0]?.method).toBe('PUT')
    expect(calls[0]?.url).toBe(`/customer-service/seat-consoles/${CONSOLE_ID}`)
    const putBody = calls[0]?.body as Record<string, unknown>
    expect(Object.keys(putBody).sort()).toEqual(['allowed_origins', 'organization_id', 'workspace_id'])
    expect(putBody.allowed_origins).toEqual(['https://ops.example.com'])
    expect(calls[1]?.method).toBe('POST')
    expect(calls[1]?.url).toBe(`/customer-service/seat-consoles/${CONSOLE_ID}/revoke`)
    const revokeBody = calls[1]?.body as Record<string, unknown>
    expect(Object.keys(revokeBody).sort()).toEqual(['organization_id', 'workspace_id'])
  })

  it('update 提供 expectedVersion 时随请求携带 expected_version（F-6 乐观并发控制）；缺省不携带（LWW 兼容）', async () => {
    const calls = captureCalls((_url) => ({ seat_console: consoleRow() }))
    await updateSeatConsole(CONSOLE_ID, {
      ...SCOPE,
      allowedOrigins: ['https://cas.example.com'],
      expectedVersion: 3,
    })
    await updateSeatConsole(CONSOLE_ID, { ...SCOPE, allowedOrigins: ['https://lww.example.com'] })
    await updateSeatConsole(CONSOLE_ID, {
      ...SCOPE,
      allowedOrigins: ['https://nan.example.com'],
      expectedVersion: Number.NaN,
    })
    const putBodies = calls.map((c) => c.body as Record<string, unknown>)
    expect(putBodies[0]?.expected_version).toBe(3)
    expect(putBodies[1]).not.toHaveProperty('expected_version')
    expect(putBodies[2]).not.toHaveProperty('expected_version')
  })

  it('客户端 fail-closed：缺 organization_id / workspace_id 直接抛错且不发请求', async () => {
    const calls = captureCalls()
    await expect(listSeatConsoles({ organizationId: '', workspaceId: SCOPE.workspaceId })).rejects.toThrow(
      /organization_id/,
    )
    await expect(listSeatConsoles({ organizationId: SCOPE.organizationId, workspaceId: '  ' })).rejects.toThrow(
      /workspace_id/,
    )
    await expect(createSeatConsole({ organizationId: '', workspaceId: 'x', allowedOrigins: [] })).rejects.toThrow(
      /organization_id/,
    )
    await expect(updateSeatConsole('  ', { ...SCOPE, allowedOrigins: [] })).rejects.toThrow(/seat_console_id/)
    await expect(revokeSeatConsole('', SCOPE)).rejects.toThrow(/seat_console_id/)
    expect(calls).toHaveLength(0)
  })

  it('响应包装容忍 {seat_console} 与裸对象（投影兜底校验）', async () => {
    captureCalls((_url) => consoleRow())
    const created = await createSeatConsole({ ...SCOPE, allowedOrigins: [] })
    expect(created.public_seat_console_id).toBe(PUBLIC_ID)
    expect(created.id).toBe(CONSOLE_ID)
    captureCalls(() => consoleRow({ status: 'revoked' }))
    const revoked = await revokeSeatConsole(CONSOLE_ID, SCOPE)
    expect(revoked?.status).toBe('revoked')
  })
})

describe('seat console 投影熔断与类型纪律（A06）', () => {
  it('列表行命中敏感键整体丢弃；白名单字段保留、非法 origin 过滤', () => {
    expect(
      toSeatConsole({
        ...consoleRow(),
        seat_login_token: 'OOPS',
      })
    ).toBeNull()
    const clean = toSeatConsole(consoleRow({ allowed_origins: ['https://admin.example.com/', 'not-a-origin'] }))
    expect(clean).not.toBeNull()
    expect(clean?.allowed_origins).toEqual(['https://admin.example.com'])
    expect(clean?.version).toBe(3)
    expect(clean?.status).toBe('active')
    // epoch 秒 number 惯例规范化为 string；null 落 null
    expect(clean?.created_at).toBe('1789638174')
    expect(toSeatConsole(consoleRow({ created_at: null }))?.created_at).toBeNull()
  })

  it('缺 id / public_seat_console_id 返回 null（fail-closed）；version 非数字落 0', () => {
    expect(toSeatConsole({ id: '' })).toBeNull()
    expect(toSeatConsole(consoleRow({ public_seat_console_id: 'x' }))).not.toBeNull()
    expect(toSeatConsole(consoleRow({ version: 'NaN-value' }))?.version).toBe(0)
  })

  it('toSeatConsoleList 容忍 {seat_consoles}/{list}/裸数组；熔断行被剔除', () => {
    // R3-F5 键集分页新形状（真实 BE 合同；R5 F4 e2e 抓出前端漏适配）
    expect(toSeatConsoleList({ seat_consoles: [consoleRow()], next_after_id: null })).toHaveLength(1)
    expect(toSeatConsoleList({ list: [consoleRow()] })).toHaveLength(1)
    expect(toSeatConsoleList([consoleRow(), { ...consoleRow(), id: '2', secret: 'x' }])).toHaveLength(1)
    expect(toSeatConsoleList(null)).toEqual([])
    expect(toSeatConsoleList({ seat_consoles: 'not-an-array' })).toEqual([])
  })

  it('TSID 保持 string（无 Number() 精度回转）', () => {
    const row = toSeatConsole(consoleRow())
    expect(typeof row?.id).toBe('string')
    expect(typeof row?.organization_id).toBe('string')
    expect(typeof row?.public_seat_console_id).toBe('string')
    expect(row?.id).toBe(CONSOLE_ID)
    expect(row?.organization_id).toBe(SCOPE.organizationId)
  })
})

describe('iframe 嵌入代码冻结形状（A03/A04）', () => {
  it('buildSeatEmbedCode 输出与冻结片段逐字相等', () => {
    const code = buildSeatEmbedCode(PUBLIC_ID)
    expect(code).toBe(
      '<iframe\n' +
        `  src="https://cs.imboy.pub/seat/${PUBLIC_ID}"\n` +
        '  title="IMBoy 客服工作台"\n' +
        '  sandbox="allow-scripts allow-same-origin allow-downloads"\n' +
        '  referrerpolicy="no-referrer"\n' +
        '  style="width:100%;height:100vh;border:0"\n' +
        '></iframe>',
    )
  })

  it('片段含 title/sandbox/referrerpolicy/稳定尺寸；绝无 loader/secret/租户上下文', () => {
    const code = buildSeatEmbedCode(PUBLIC_ID)
    expect(code).toContain('title="IMBoy 客服工作台"')
    expect(code).toContain('sandbox="allow-scripts allow-same-origin allow-downloads"')
    expect(code).toContain('referrerpolicy="no-referrer"')
    expect(code).toContain('style="width:100%;height:100vh;border:0"')
    expect(code).not.toContain('<script')
    expect(code).not.toContain('/loader.js')
    expect(code).not.toMatch(/token|secret|sk_live|api_key|signature/i)
    expect(code).not.toContain(SCOPE.organizationId)
    expect(code).not.toContain(SCOPE.workspaceId)
    expect(code).not.toContain('/api/')
  })

  it('非法 public_seat_console_id 抛错（fail-closed，防注入）', () => {
    expect(() => buildSeatEmbedCode('')).toThrow()
    expect(() => buildSeatEmbedCode('" onload="alert(1)')).toThrow()
    expect(() => buildSeatEmbedCode('123abc')).toThrow()
    expect(() => buildSeatEmbedCode('0'.repeat(27))).toThrow()
    expect(() => buildSeatEmbedCode(`1234567890123456"></iframe><script>alert(1)</script>`)).toThrow()
  })

  it('widgetConfig origin 非法时拒绝生成（单一 origin 真源的 fail-closed 分支）', () => {
    mock.module('../widgetConfig', () => ({
      CUSTOMER_SERVICE_WIDGET_ORIGIN: 'javascript:alert(1)',
    }))
    try {
      expect(() => buildSeatEmbedCode(PUBLIC_ID)).toThrow(/域名非法/)
    } finally {
      mock.module('../widgetConfig', () => realWidgetConfigExports)
    }
    // 恢复后回到真实 origin（默认 https://cs.imboy.pub）
    expect(buildSeatEmbedCode(PUBLIC_ID)).toContain('https://cs.imboy.pub/seat/')
  })
})

describe('公开标识与 origin 解析（A03/A06）', () => {
  it('isValidPublicSeatConsoleId：TSID 十进制 1..26 位', () => {
    expect(isValidPublicSeatConsoleId('1')).toBe(true)
    expect(isValidPublicSeatConsoleId(PUBLIC_ID)).toBe(true)
    expect(isValidPublicSeatConsoleId('0'.repeat(26))).toBe(true)
    expect(isValidPublicSeatConsoleId('')).toBe(false)
    expect(isValidPublicSeatConsoleId('0'.repeat(27))).toBe(false)
    expect(isValidPublicSeatConsoleId('12a')).toBe(false)
    expect(isValidPublicSeatConsoleId('wgt_pub_x')).toBe(false)
    expect(isValidPublicSeatConsoleId('123 456')).toBe(false)
  })

  it('parseAllowedOriginsInput 复用 widget 同一实现：拒通配/路径/非 http(s)，去重', () => {
    const parsed = parseAllowedOriginsInput(
      'https://a.example.com\nhttps://b.example.com/, https://a.example.com\ngit://x\nhttps://c.example.com/path',
    )
    expect(parsed.origins).toEqual(['https://a.example.com', 'https://b.example.com'])
    expect(parsed.errors).toEqual(['git://x', 'https://c.example.com/path'])
  })
})

afterAll(() => {
  mock.module('../widgetConfig', () => realWidgetConfigExports)
})
