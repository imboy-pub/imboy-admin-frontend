import '../../../test/setupDom'
// AI 助手管理 API 测试（TDD：先 RED 后 GREEN）
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { useAuthStore } from '@/stores/authStore'
import client from '@/services/api/client'
import {
  getAiAgentList,
  getAiAgentDetail,
  createAiAgent,
  updateAiAgent,
  setAiAgentStatus,
  getAiRoles,
  saveAiRole,
  deleteAiRole,
  getAiRolePage,
  getAiRoleDetail,
  createAiRole,
  saveAiRoleDraft,
  publishAiRole,
  setAiRoleStatus,
  getOnboardingConfig,
  putOnboardingConfig,
  getKnowledgeConfig,
  putKnowledgeConfig,
  uploadAgentAvatar,
  createAgentMandate,
  type AiRolesMap,
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

const listRow = {
  user_id: '1001',
  nickname: '医生助手',
  avatar: '',
  provider: 'bailian',
  model: 'qwen-flash',
  description: '专业医生',
  visibility: 1,
  status: 1,
  owner_uid: '0',
  category: 'medical',
  created_at: '2026-08-01 10:00:00',
}

const detailFixture = {
  user_id: '1001',
  provider: 'bailian',
  model: 'qwen-flash',
  role_id: 'doctor',
  system_prompt: '你是一名医生',
  owner_uid: '0',
  status: 1,
  description: '专业医生',
  visibility: 1,
  category: 'medical',
  voice_id: 'xiaoyan',
  greeting: '您好，我是您的健康顾问',
  capabilities: '{"knowledge":true,"proactive":false}',
  temperature: 0.7,
}

describe('列表与详情扩展字段', () => {
  it('list 行透传 category', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/ai_agent/list')
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: { list: [listRow], page: 1, size: 10, total: 1 },
        },
      }
    }
    const result = await getAiAgentList()
    expect(result.items[0].category).toBe('medical')
  })

  it('detail 透传扩展字段，capabilities 解析为对象', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/ai_agent/detail')
      expect(config?.params?.user_id).toBe('1001')
      return { data: { code: 0, msg: 'ok', payload: detailFixture } }
    }
    const result = await getAiAgentDetail('1001')
    expect(result.category).toBe('medical')
    expect(result.voice_id).toBe('xiaoyan')
    expect(result.greeting).toBe('您好，我是您的健康顾问')
    expect(result.temperature).toBe(0.7)
    expect(result.capabilities).toEqual({ knowledge: true, proactive: false })
  })

  it('update 入参透传扩展字段', async () => {
    mutableClient.post = async (url: string, body: unknown) => {
      expect(url).toBe('/ai_agent/update')
      expect(body).toMatchObject({
        user_id: '1001',
        category: 'medical',
        voice_id: 'xiaoyan',
        greeting: '您好',
        temperature: 0.5,
        capabilities: { knowledge: true },
      })
      return { data: { code: 0, msg: 'ok', payload: { user_id: '1001' } } }
    }
    await updateAiAgent({
      user_id: '1001',
      provider: 'bailian',
      category: 'medical',
      voice_id: 'xiaoyan',
      greeting: '您好',
      temperature: 0.5,
      capabilities: { knowledge: true },
    })
  })
})

describe('roles 角色管理', () => {
  const rolesFixture: AiRolesMap = { doctor: '你是一名医生' }

  it('getAiRoles 返回全量角色', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/ai_agent/roles')
      return { data: { code: 0, msg: 'ok', payload: { roles: rolesFixture } } }
    }
    const result = await getAiRoles()
    expect(result).toEqual(rolesFixture)
  })

  it('saveAiRole 提交 action=save 并回读全量', async () => {
    mutableClient.post = async (url: string, body: unknown) => {
      expect(url).toBe('/ai_agent/roles')
      expect(body).toEqual({
        action: 'save',
        role_id: 'lawyer',
        prompt: '你是一名律师',
      })
      return {
        data: { code: 0, msg: 'ok', payload: { roles: { lawyer: '你是一名律师' } } },
      }
    }
    const result = await saveAiRole('lawyer', '你是一名律师')
    expect(result).toEqual({ lawyer: '你是一名律师' })
  })

  it('deleteAiRole 提交 action=delete', async () => {
    mutableClient.post = async (url: string, body: unknown) => {
      expect(url).toBe('/ai_agent/roles')
      expect(body).toEqual({ action: 'delete', role_id: 'doctor' })
      return { data: { code: 0, msg: 'ok', payload: { roles: {} } } }
    }
    const result = await deleteAiRole('doctor')
    expect(result).toEqual({})
  })
})

describe('versioned role template API', () => {
  it('分页读取角色模板并保留分页参数', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/ai_agent/role/list')
      expect(config?.params).toMatchObject({ page: 2, size: 20, keyword: 'doctor' })
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            list: [{ code: 'doctor', name: 'Doctor', status: 1, active_version: 2 }],
            page: 2,
            size: 20,
            total: 1,
          },
        },
      }
    }
    const result = await getAiRolePage({ page: 2, size: 20, keyword: 'doctor' })
    expect(result.items[0]?.code).toBe('doctor')
    expect(result.total).toBe(1)
  })

  it('保存草稿和发布不接受前端伪造 admin_uid', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    mutableClient.post = async (url: string, body: unknown) => {
      calls.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }
    await saveAiRoleDraft('doctor', {
      version: 3,
      system_prompt: 'prompt',
      capabilities: { knowledge: true },
      knowledge_policy: { knowledge: { mode: 'on_demand' } },
    })
    await publishAiRole('doctor', 3)
    expect(calls[0]).toMatchObject({
      url: '/ai_agent/role/draft',
      body: { role_code: 'doctor', version: 3 },
    })
    expect(calls[1]).toEqual({
      url: '/ai_agent/role/publish',
      body: { role_code: 'doctor', version: 3 },
    })
  })
})

describe('uploadAgentAvatar', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ isAuthenticated: true, admin: { id: '42' } as never })
    Object.defineProperty(navigator, 'locks', { configurable: true,
      value: { request: async (_name: string, _opts: unknown, run: (_lock: object) => unknown) => run({}) } })
  })
  it('拒绝空文件、过大文件和不支持的类型且不发请求', async () => {
    let calls = 0
    mutableClient.post = async () => { calls++; throw new Error('unexpected request') }
    const oversized = new File(['x'], 'a.png', { type: 'image/png' })
    Object.defineProperty(oversized, 'size', { value: 100 * 1024 * 1024 + 1 })
    for (const file of [new File([], 'a.png', { type: 'image/png' }), oversized,
      new File(['x'], 'a.svg', { type: 'image/svg+xml' })]) {
      await expect(uploadAgentAvatar(file)).rejects.toThrow('头像格式或大小不受支持')
    }
    expect(calls).toBe(0)
  })

  it('发布响应丢失后复用同一会话并验证已确认内容再恢复发布', async () => {
    const file = new File(['PNGDATA'], 'avatar.png', { type: 'image/png' })
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
      .map((b) => b.toString(16).padStart(2, '0')).join('')
    const ops: string[] = []
    const ids: string[] = []
    let replay = false
    mutableClient.post = async (_url: string, body: unknown) => {
      const b = body as Record<string, unknown>
      const op = String(b.op)
      ops.push(op)
      if (op === 'register') {
        ids.push(String(b.client_upload_id))
        return { data: { code: 0, msg: 'ok', payload: {
          object_key: 'app1001/avatar/a.png', state: replay ? 'CONFIRMED' : 'RESERVED',
        } } }
      }
      if (op === 'declare') return { data: { code: 0, msg: 'ok', payload: {} } }
      if (op === 'grant') return { data: { code: 0, msg: 'ok', payload: {
        attempt_id: 1, grant: { transport: 's3_put', method: 'PUT', url: 'https://s3.invalid/a',
          required_headers: [{ key: 'Content-Type', value: 'image/png' },
            { key: 'x-amz-checksum-sha256', value: 'KFjR0XFXoQsx0cHZXfqS9mMkN+uM3Y3T4KZ1fFTzQyU=' }] },
      } } }
      if (op === 'finalize') return { data: { code: 0, msg: 'ok', payload: { state: 'CONFIRMED' } } }
      if (op === 'status') return { data: { code: 0, msg: 'ok', payload: {
        object_key: 'app1001/avatar/a.png', state: 'CONFIRMED', expected: { sha256: sha, size_bytes: file.size, mime: file.type },
      } } }
      if (op === 'publish') {
        if (!replay) { replay = true; throw new Error('response lost') }
        return { data: { code: 0, msg: 'ok', payload: { public_url: 'https://public.example.com/a.png' } } }
      }
      throw new Error(`unexpected ${op}`)
    }
    const originalFetch = globalThis.fetch
    let puts = 0
    globalThis.fetch = (async () => { puts++; return new Response(null, { status: 200 }) }) as typeof fetch
    try {
      await expect(uploadAgentAvatar(file, { agentId: '1001' })).rejects.toThrow('response lost')
      const result = await uploadAgentAvatar(file, { agentId: '1001' })
      expect(ids).toHaveLength(2)
      expect(ids[0]).toBe(ids[1])
      expect(result.clientUploadId).toBe(ids[0])
      expect(ops).toEqual(['register', 'declare', 'grant', 'finalize', 'publish', 'register', 'status', 'publish'])
      expect(puts).toBe(1)
    } finally { globalThis.fetch = originalFetch }
  })

  it('已确认会话摘要不匹配时拒绝发布', async () => {
    const calls: string[] = []
    mutableClient.post = async (_url: string, body: unknown) => {
      const op = String((body as Record<string, unknown>).op)
      calls.push(op)
      const payload = op === 'register' ? { object_key: 'app1001/avatar/a.png', state: 'CONFIRMED' }
        : { object_key: 'app1001/avatar/a.png', state: 'CONFIRMED', expected: { sha256: 'wrong', size_bytes: 1, mime: 'image/png' } }
      return { data: { code: 0, msg: 'ok', payload } }
    }
    await expect(uploadAgentAvatar(new File(['x'], 'a.png', { type: 'image/png' }), { agentId: '1001' }))
      .rejects.toThrow('头像文件与已登记内容不一致')
    expect(calls).toEqual(['register', 'status'])
  })

  it('GRANTED 恢复核对 frozen expected 后续期，不重放旧 PUT', async () => {
    const file = new File(['PNGDATA'], 'avatar.png', { type: 'image/png' })
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
      .map((b) => b.toString(16).padStart(2, '0')).join('')
    const calls: string[] = []
    mutableClient.post = async (_url: string, body: unknown) => {
      const b = body as Record<string, unknown>
      const op = String(b.op)
      calls.push(op)
      const payload = op === 'register' ? { object_key: 'app1001/avatar/a.png', state: 'GRANTED' }
        : op === 'status' ? { object_key: 'app1001/avatar/a.png', state: 'GRANTED',
          expected: { sha256: sha, size_bytes: file.size, mime: file.type } }
        : op === 'renew' ? { attempt_id: 2, state: 'GRANTED', grant: { transport: 's3_put', method: 'PUT',
          url: 'https://s3.invalid/new', required_headers: [
            { key: 'Content-Type', value: 'image/png' },
            { key: 'x-amz-checksum-sha256', value: 'KFjR0XFXoQsx0cHZXfqS9mMkN+uM3Y3T4KZ1fFTzQyU=' }] } }
        : op === 'finalize' ? { state: 'CONFIRMED' }
        : { public_url: 'https://public.example.com/a.png' }
      return { data: { code: 0, msg: 'ok', payload } }
    }
    const originalFetch = globalThis.fetch
    const targets: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      targets.push(String(input)); return new Response(null, { status: 200 })
    }) as typeof fetch
    try {
      await uploadAgentAvatar(file, { agentId: '1001' })
      expect(calls).toEqual(['register', 'status', 'renew', 'finalize', 'publish'])
      expect(targets).toEqual(['https://s3.invalid/new'])
    } finally { globalThis.fetch = originalFetch }
  })

  it('没有跨页面锁时拒绝创建远程会话', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    let calls = 0
    mutableClient.post = async () => { calls++; throw new Error('unexpected request') }
    await expect(uploadAgentAvatar(new File(['x'], 'a.png', { type: 'image/png' })))
      .rejects.toThrow('浏览器不支持安全上传任务锁')
    expect(calls).toBe(0)
  })

  it('管理员在请求期间切换后不再执行后续操作', async () => {
    const calls: string[] = []
    mutableClient.post = async (_url: string, body: unknown) => {
      calls.push(String((body as Record<string, unknown>).op))
      useAuthStore.setState({ isAuthenticated: true, admin: { id: '43' } as never })
      useAuthStore.setState({ isAuthenticated: true, admin: { id: '42' } as never })
      return { data: { code: 0, msg: 'ok', payload: { object_key: 'app1001/avatar/a.png', state: 'RESERVED' } } }
    }
    await expect(uploadAgentAvatar(new File(['x'], 'a.png', { type: 'image/png' }), { agentId: '1001' }))
      .rejects.toThrow('管理员会话已切换')
    expect(calls).toEqual(['register'])
  })

  it('取消在途 PUT 后保留恢复记录并以新授权重试', async () => {
    const file = new File(['PNGDATA'], 'avatar.png', { type: 'image/png' })
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
      .map((b) => b.toString(16).padStart(2, '0')).join('')
    const ids: string[] = []
    const ops: string[] = []
    let retry = false
    mutableClient.post = async (_url: string, body: unknown) => {
      const b = body as Record<string, unknown>
      const op = String(b.op)
      ops.push(op)
      if (op === 'register') ids.push(String(b.client_upload_id))
      const payload = op === 'register' ? { object_key: 'app/avatar/a.png', state: retry ? 'GRANTED' : 'RESERVED' }
        : op === 'status' ? { object_key: 'app/avatar/a.png', state: 'GRANTED', expected: { sha256: sha, size_bytes: file.size, mime: file.type } }
        : op === 'grant' || op === 'renew' ? { attempt_id: retry ? 2 : 1, grant: { transport: 's3_put', method: 'PUT', url: 'https://s3.invalid/a', required_headers: [
          { key: 'Content-Type', value: 'image/png' },
          { key: 'x-amz-checksum-sha256', value: 'KFjR0XFXoQsx0cHZXfqS9mMkN+uM3Y3T4KZ1fFTzQyU=' }] } }
        : op === 'finalize' ? { state: 'CONFIRMED' } : op === 'publish' ? { public_url: 'https://public.example.com/a.png' } : {}
      return { data: { code: 0, msg: 'ok', payload } }
    }
    const originalFetch = globalThis.fetch
    const controller = new AbortController()
    let started!: () => void
    const putStarted = new Promise<void>((resolve) => { started = resolve })
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (retry) return new Response(null, { status: 200 })
      started()
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    }) as typeof fetch
    try {
      const pending = uploadAgentAvatar(file, { agentId: '1001', signal: controller.signal })
      await putStarted
      controller.abort()
      await expect(pending).rejects.toThrow()
      expect(ops).toEqual(['register', 'declare', 'grant'])
      retry = true
      await uploadAgentAvatar(file, { agentId: '1001' })
      expect(ids[1]).toBe(ids[0])
      expect(ops).toEqual(['register', 'declare', 'grant', 'register', 'status', 'renew', 'finalize', 'publish'])
    } finally { globalThis.fetch = originalFetch }
  })

  for (const reason of ['timeout', 'account'] as const) {
    it(`在途 PUT 遇到 ${reason} 时中止且不执行确认`, async () => {
      const ops: string[] = []
      mutableClient.post = async (_url: string, body: unknown) => {
        const op = String((body as Record<string, unknown>).op)
        ops.push(op)
        const payload = op === 'register' ? { object_key: 'app/avatar/a.png', state: 'RESERVED' }
          : op === 'grant' ? { attempt_id: 1, grant: { transport: 's3_put', method: 'PUT', url: 'https://s3.invalid/a', required_headers: [
            { key: 'Content-Type', value: 'image/png' },
            { key: 'x-amz-checksum-sha256', value: 'KFjR0XFXoQsx0cHZXfqS9mMkN+uM3Y3T4KZ1fFTzQyU=' }] } } : {}
        return { data: { code: 0, msg: 'ok', payload } }
      }
      const oldFetch = globalThis.fetch
      const oldTimer = globalThis.setTimeout
      let timeout: (() => void) | undefined
      let started!: () => void
      const ready = new Promise<void>((resolve) => { started = resolve })
      globalThis.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (delay === 120_000 && typeof callback === 'function') { timeout = () => callback(...args); return 0 as never }
        return oldTimer(callback, delay, ...args)
      }) as typeof setTimeout
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        started()
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
        })
      }) as typeof fetch
      try {
        const pending = uploadAgentAvatar(new File(['x'], 'a.png', { type: 'image/png' }))
        await ready
        if (reason === 'timeout') timeout?.()
        else useAuthStore.setState({ isAuthenticated: true, admin: { id: '43' } as never })
        await expect(pending).rejects.toThrow()
        expect(ops).toEqual(['register', 'declare', 'grant'])
      } finally { globalThis.fetch = oldFetch; globalThis.setTimeout = oldTimer }
    })
  }

  it('非法签名头在发包前拒绝', async () => {
    mutableClient.post = async (_url: string, body: unknown) => {
      const op = (body as Record<string, unknown>).op
      const payload = op === 'register' ? { object_key: 'app/avatar/a.png' }
        : op === 'grant' ? { attempt_id: 1, grant: { transport: 's3_put', method: 'PUT',
          url: 'https://s3.invalid/a', required_headers: [{ key: 'Authorization', value: 'secret' }] } }
        : {}
      return { data: { code: 0, msg: 'ok', payload } }
    }
    const originalFetch = globalThis.fetch
    let sent = false
    globalThis.fetch = (async () => { sent = true; return new Response(null, { status: 200 }) }) as typeof fetch
    try {
      await expect(uploadAgentAvatar(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow()
      expect(sent).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('direct-v1 全链：register→declare→grant→PUT→finalize→publish 返回公开 URL', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    mutableClient.post = async (url: string, body: unknown) => {
      const b = body as Record<string, unknown>
      if (url === '/ai_agent/avatar_direct') {
        calls.push({ url, body: b })
        const op = b.op
        if (op === 'register') {
          expect(b.application_id).toBe('1001')
          expect(b.client_upload_id).toBe('b2387555-4504-4926-a905-0bf6d55ac15e')
          return {
            data: { code: 0, msg: 'ok', payload: { object_key: 'app1001/avatar/a.png', state: 'RESERVED' } },
          }
        }
        if (op === 'declare') return { data: { code: 0, msg: 'ok', payload: {} } }
        if (op === 'finalize') return { data: { code: 0, msg: 'ok', payload: { state: 'CONFIRMED' } } }
        if (op === 'grant') {
          return {
            data: {
              code: 0,
              msg: 'ok',
              payload: {
                state: 'GRANTED',
                attempt_id: 1,
                grant: {
                  transport: 's3_put',
                  url: 'https://s3.invalid/staging/a.png',
                  method: 'PUT',
                  required_headers: [
                    { key: 'Content-Type', value: 'image/png' },
                    {
                      key: 'x-amz-checksum-sha256',
                      // sha256('PNGDATA') 的 Base64（32 字节摘要形态校验前端透传）
                      value: 'KFjR0XFXoQsx0cHZXfqS9mMkN+uM3Y3T4KZ1fFTzQyU=',
                    },
                  ],
                  expires_in: 3600,
                },
              },
            },
          }
        }
        if (op === 'publish') {
          return {
            data: { code: 0, msg: 'ok', payload: { public_url: 'https://public.example.com/a.png' } },
          }
        }
      }
      throw new Error(`unexpected post ${url}`)
    }

    const puts: Array<{ url: string; headers: Record<string, string>; credentials: string }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      puts.push({
        url: String(input),
        headers: (init?.headers ?? {}) as Record<string, string>,
        credentials: String(init?.credentials),
      })
      return new Response(null, { status: 200 })
    }) as typeof fetch

    try {
      const file = new File(['PNGDATA'], 'avatar.png', { type: 'image/png' })
      const result = await uploadAgentAvatar(file, {
        agentId: '1001',
        clientUploadId: 'b2387555-4504-4926-a905-0bf6d55ac15e',
      })
      expect(result).toEqual({
        url: 'https://public.example.com/a.png',
        objectKey: 'app1001/avatar/a.png',
        clientUploadId: 'b2387555-4504-4926-a905-0bf6d55ac15e',
      })
      expect(calls.map((c) => c.body.op)).toEqual([
        'register',
        'declare',
        'grant',
        'finalize',
        'publish',
      ])
      // declare 冻结 sha256/size 与 file 一致
      expect(calls[1].body.object_key).toBe('app1001/avatar/a.png')
      expect(calls[1].body.size_bytes).toBe(file.size)
      expect(typeof calls[1].body.sha256).toBe('string')
      expect((calls[1].body.sha256 as string).length).toBe(64)
      // PUT：签名头逐字透传、credentials omit、目标 = grant.url
      expect(puts.length).toBe(1)
      expect(puts[0].url).toBe('https://s3.invalid/staging/a.png')
      expect(puts[0].headers['Content-Type']).toBe('image/png')
      expect(puts[0].credentials).toBe('omit')
      // finalize 携带 attempt_id；publish 关联 agent
      expect(calls[3].body.attempt_id).toBe(1)
      expect(calls[4].body.agent_id).toBe('1001')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('角色与配置 API 完整契约', () => {
  it('创建助手并切换助手状态', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    mutableClient.post = async (url: string, body: unknown) => {
      calls.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: { user_id: '1001' } } }
    }
    await createAiAgent({ provider: 'bailian', nickname: '医生助手' })
    const status = await setAiAgentStatus('1001', 0)
    expect(calls).toEqual([
      { url: '/ai_agent/create', body: { provider: 'bailian', nickname: '医生助手' } },
      { url: '/ai_agent/set_status', body: { user_id: '1001', status: 0 } },
    ])
    expect(status.payload).toEqual({ user_id: '1001' })
  })

  it('角色详情解析策略对象、JSON 字符串和非法 JSON 兜底', async () => {
    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      expect(config?.params?.role_code).toBe('support')
      return {
        data: {
          code: 0,
          msg: 'ok',
          payload: {
            code: 'support',
            name: '客服',
            status: 1,
            active_version: 2,
            capabilities: '{"knowledge":true}',
            knowledge_policy: '{"knowledge":{"mode":"on_demand"}}',
          },
        },
      }
    }
    const parsed = await getAiRoleDetail('support')
    expect(parsed.capabilities).toEqual({ knowledge: true })
    expect(parsed.knowledge_policy.knowledge?.mode).toBe('on_demand')

    mutableClient.get = async () => ({
      data: {
        code: 0,
        msg: 'ok',
        payload: {
          code: 'broken',
          name: 'Broken',
          status: 1,
          active_version: 0,
          capabilities: '{bad',
          knowledge_policy: '{bad',
        },
      },
    })
    const fallback = await getAiRoleDetail('broken')
    expect(fallback.capabilities).toEqual({})
    expect(fallback.knowledge_policy).toEqual({})
  })

  it('创建角色并修改角色状态', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    mutableClient.post = async (url: string, body: unknown) => {
      calls.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: { code: 'support', name: '客服' } } }
    }
    const created = await createAiRole({ code: 'support', name: '客服', description: '答疑' })
    const status = await setAiRoleStatus('support', 0)
    expect(created.code).toBe('support')
    expect(status.payload).toEqual({ code: 'support', name: '客服' })
    expect(calls).toEqual([
      {
        url: '/ai_agent/role/create',
        body: { code: 'support', name: '客服', description: '答疑' },
      },
      { url: '/ai_agent/role/set_status', body: { role_code: 'support', status: 0 } },
    ])
  })

  it('读写 onboarding 与知识库配置', async () => {
    const gets: string[] = []
    const posts: Array<{ url: string; body: unknown }> = []
    mutableClient.get = async (url: string) => {
      gets.push(url)
      return { data: { code: 0, msg: 'ok', payload: { enabled: true } } }
    }
    mutableClient.post = async (url: string, body: unknown) => {
      posts.push({ url, body })
      return { data: { code: 0, msg: 'ok', payload: { enabled: false } } }
    }
    expect((await getOnboardingConfig()).enabled).toBe(true)
    expect((await getKnowledgeConfig()).enabled).toBe(true)
    expect((await putOnboardingConfig({ enabled: false })).enabled).toBe(false)
    expect((await putKnowledgeConfig({ enabled: false })).enabled).toBe(false)
    expect(gets).toEqual(['/ai_agent/onboarding_config', '/ai_agent/knowledge_config'])
    expect(posts).toEqual([
      { url: '/ai_agent/onboarding_config', body: { enabled: false } },
      { url: '/ai_agent/knowledge_config', body: { enabled: false } },
    ])
  })
})

describe('受控支付授权', () => {
  it('posts mandate params to /ai_agent/mandate_create', async () => {
    let capturedUrl = ''
    let capturedBody: unknown
    mutableClient.post = async (url: string, body: unknown) => {
      capturedUrl = url
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: { id: '1' } } }
    }
    await createAgentMandate({
      agent_uid: '1001',
      max_amount_fen: 1000,
      max_total_fen: 5000,
      expires_in_secs: 604800,
    })
    expect(capturedUrl).toBe('/ai_agent/mandate_create')
    expect(capturedBody).toEqual({
      agent_uid: '1001',
      max_amount_fen: 1000,
      max_total_fen: 5000,
      expires_in_secs: 604800,
    })
  })
})
