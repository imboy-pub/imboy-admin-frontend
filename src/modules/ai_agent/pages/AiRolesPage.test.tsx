// AI 角色管理页测试（TDD：#19 角色管理页 + 路由菜单）
import '../../../test/setupDom'

import { afterEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import client from '@/services/api/client'
import { AiRolesPage } from './AiRolesPage'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const rolesFixture = {
  doctor: '你是一名医生，回答医疗健康问题。',
  lawyer: '你是一名律师，提供法律建议。',
}

const envelope = (payload: unknown) => ({ data: { code: 0, msg: 'ok', payload } })

function renderPage(initialEntries = ['/ai-agents/roles']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AiRolesPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  cleanup()
})

describe('AiRolesPage 角色列表', () => {
  it('加载并渲染角色列表', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/roles') return envelope({ roles: rolesFixture })
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.getAllByText('doctor').length).toBeGreaterThan(0)
    })
    expect(view.getAllByText('lawyer').length).toBeGreaterThan(0)
    expect(view.getAllByText(/你是一名医生/).length).toBeGreaterThan(0)
  })

  it('空角色列表显示空态', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/roles') return envelope({ roles: {} })
      throw new Error(`unexpected GET: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })

    await waitFor(() => {
      expect(view.getAllByText(/暂无角色/).length).toBeGreaterThan(0)
    })
  })
})

describe('AiRolesPage 新建/编辑/删除', () => {
  it('新建角色：提交 role_id + prompt，POST save', async () => {
    // GET/POST 共享可变状态：invalidate 后 refetch 读到「保存后」的数据
    let currentRoles: Record<string, string> = { ...rolesFixture }
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/roles') return envelope({ roles: currentRoles })
      throw new Error(`unexpected GET: ${url}`)
    }

    let savedBody: Record<string, unknown> | null = null
    mutableClient.post = async (url: string, body: unknown) => {
      if (url === '/ai_agent/roles') {
        savedBody = body as Record<string, unknown>
        const { role_id: id, prompt: text } = body as { role_id: string; prompt: string }
        currentRoles = { ...currentRoles, [id]: text }
        return envelope({ roles: currentRoles })
      }
      throw new Error(`unexpected POST: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => expect(view.getAllByText('doctor').length).toBeGreaterThan(0))

    await act(async () => {
      fireEvent.click(view.getByText('新建角色'))
    })
    await waitFor(() => expect(view.getByTestId('role-id-input')).toBeTruthy())

    const user = userEvent.setup()
    await user.type(view.getByTestId('role-id-input'), 'teacher')
    await user.type(view.getByTestId('role-prompt-input'), '你是一名教师。')
    await act(async () => {
      fireEvent.click(view.getByText('保存'))
    })

    await waitFor(() => {
      expect(savedBody).toMatchObject({
        action: 'save',
        role_id: 'teacher',
        prompt: '你是一名教师。',
      })
    })
    // 列表刷新出现新角色
    await waitFor(() => {
      expect(view.getAllByText('teacher').length).toBeGreaterThan(0)
    })
  })

  it('编辑回显并保存：role_id 不变，prompt 更新', async () => {
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/roles') return envelope({ roles: rolesFixture })
      throw new Error(`unexpected GET: ${url}`)
    }

    let savedBody: Record<string, unknown> | null = null
    mutableClient.post = async (url: string, body: unknown) => {
      if (url === '/ai_agent/roles') {
        savedBody = body as Record<string, unknown>
        return envelope({ roles: { ...rolesFixture, doctor: '你是一名全科医生。' } })
      }
      throw new Error(`unexpected POST: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => expect(view.getAllByText('doctor').length).toBeGreaterThan(0))

    await act(async () => {
      fireEvent.click(view.getAllByText('编辑')[0])
    })
    await waitFor(() => expect(view.getByTestId('role-prompt-input')).toBeTruthy())
    // 回显原 prompt
    expect((view.getByTestId('role-prompt-input') as HTMLTextAreaElement).value).toContain(
      '你是一名医生'
    )
    // 编辑态 role_id 只读
    expect((view.getByTestId('role-id-input') as HTMLInputElement).value).toBe('doctor')

    const user = userEvent.setup()
    await user.clear(view.getByTestId('role-prompt-input'))
    await user.type(view.getByTestId('role-prompt-input'), '你是一名全科医生。')
    await act(async () => {
      fireEvent.click(view.getByText('保存'))
    })

    await waitFor(() => {
      expect(savedBody).toMatchObject({
        action: 'save',
        role_id: 'doctor',
        prompt: '你是一名全科医生。',
      })
    })
  })

  it('删除角色：确认后 POST delete', async () => {
    let currentRoles: Record<string, string> = { ...rolesFixture }
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/roles') return envelope({ roles: currentRoles })
      throw new Error(`unexpected GET: ${url}`)
    }

    let savedBody: Record<string, unknown> | null = null
    mutableClient.post = async (url: string, body: unknown) => {
      if (url === '/ai_agent/roles') {
        savedBody = body as Record<string, unknown>
        const { role_id: id } = body as { role_id: string }
        currentRoles = Object.fromEntries(
          Object.entries(currentRoles).filter(([k]) => k !== id)
        )
        return envelope({ roles: currentRoles })
      }
      throw new Error(`unexpected POST: ${url}`)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => expect(view.getAllByText('doctor').length).toBeGreaterThan(0))

    await act(async () => {
      fireEvent.click(view.getAllByText('删除')[0])
    })
    await act(async () => {
      fireEvent.click(view.getByText('确认'))
    })

    await waitFor(() => {
      expect(savedBody).toMatchObject({ action: 'delete', role_id: 'doctor' })
    })
    // 列表刷新后 doctor 消失
    await waitFor(() => {
      expect(view.queryAllByText('doctor').length).toBe(0)
    })
  })
})

describe('AiRolesPage 版本化角色发布', () => {
  it('重置筛选：请求回到第 1 页', async () => {
    const listCalls: Array<{ params?: Record<string, unknown> }> = []
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/ai_agent/role/list') {
        listCalls.push({ params: config?.params })
        return envelope({
          list: [],
          page: 3,
          size: 10,
          total: 30,
        })
      }
      throw new Error('unexpected GET: ' + url)
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage(['/ai-agents/roles?page=3&keyword=doctor&status=1'])
    })
    await waitFor(() => expect(view.getByText('重置')).toBeTruthy())

    await act(async () => {
      fireEvent.click(view.getByText('重置'))
    })

    await waitFor(() => {
      const last = listCalls[listCalls.length - 1]
      expect(last?.params?.page).toBe(1)
      expect(last?.params?.keyword).toBeUndefined()
      expect(last?.params?.status).toBeUndefined()
    })
  })

  it('保存草稿后显式发布新版本', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    mutableClient.get = async (url: string) => {
      if (url === '/ai_agent/role/list') {
        return envelope({
          list: [
            {
              code: 'doctor',
              name: 'Doctor',
              description: '',
              status: 1,
              active_version: 2,
              bound_agent_count: 1,
            },
          ],
          page: 1,
          size: 10,
          total: 1,
        })
      }
      if (url === '/ai_agent/role/detail') {
        return envelope({
          code: 'doctor',
          name: 'Doctor',
          description: '',
          status: 1,
          active_version: 2,
          version: 2,
          system_prompt: '旧提示词',
          capabilities: {},
          knowledge_policy: {
            knowledge: { mode: 'on_demand' },
            group_reply: { mode: 'off' },
            proactive: { mode: 'off' },
          },
        })
      }
      throw new Error('unexpected GET: ' + url)
    }
    mutableClient.post = async (url: string, body: unknown) => {
      calls.push({ url, body })
      return envelope({ ok: true })
    }

    let view: ReturnType<typeof renderPage>
    await act(async () => {
      view = renderPage()
    })
    await waitFor(() => expect(view.getAllByText('doctor').length).toBeGreaterThan(0))

    await act(async () => {
      fireEvent.click(view.getAllByText('编辑')[0])
    })
    await waitFor(() => expect(view.getByTestId('role-prompt-input')).toBeTruthy())
    const user = userEvent.setup()
    await user.clear(view.getByTestId('role-prompt-input'))
    await user.type(view.getByTestId('role-prompt-input'), '新版本提示词')
    fireEvent.change(view.getByTestId('role-knowledge-source'), { target: { value: 'faq' } })
    await user.clear(view.getByTestId('role-context-bytes'))
    await user.type(view.getByTestId('role-context-bytes'), '1200')
    await act(async () => {
      fireEvent.click(view.getByText('保存草稿'))
    })
    await waitFor(() => {
      expect(calls[0]).toEqual({
        url: '/ai_agent/role/draft',
        body: expect.objectContaining({ role_code: 'doctor', version: 3 }),
      })
      expect(calls[0].body).toEqual(
        expect.objectContaining({
          capabilities: { knowledge: true, group_reply: false, proactive: false },
          knowledge_policy: {
            knowledge: { mode: 'on_demand', source: 'faq', max_context_bytes: 1200 },
            group_reply: { mode: 'off' },
            proactive: { mode: 'off', daily_limit: 0 },
          },
        })
      )
    })

    await act(async () => {
      fireEvent.click(view.getByText('发布 v3'))
    })
    await act(async () => {
      fireEvent.click(view.getByText('确认'))
    })
    await waitFor(() => {
      expect(calls[1]).toEqual({
        url: '/ai_agent/role/publish',
        body: { role_code: 'doctor', version: 3 },
      })
    })
  })
})
