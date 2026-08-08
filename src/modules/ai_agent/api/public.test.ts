// AI 助手管理 API 测试（TDD：先 RED 后 GREEN）
import { afterEach, describe, expect, it } from 'bun:test'
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
  it('multipart 上传 file 字段并返回 URL', async () => {
    mutableClient.post = async (url: string, body: unknown) => {
      expect(url).toBe('/ai_agent/upload_avatar')
      expect(body).toBeInstanceOf(FormData)
      const form = body as FormData
      expect(form.get('file')).not.toBeNull()
      return {
        data: { code: 0, msg: 'ok', payload: { url: 'https://s3.example.com/avatar.png' } },
      }
    }
    const file = new File(['PNGDATA'], 'avatar.png', { type: 'image/png' })
    const result = await uploadAgentAvatar(file)
    expect(result.url).toBe('https://s3.example.com/avatar.png')
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
