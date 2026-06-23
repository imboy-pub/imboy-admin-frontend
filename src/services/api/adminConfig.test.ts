import { describe, expect, it, afterEach } from 'bun:test'
import { fetchSidebarMenuConfig } from './adminConfig'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockFetch(responseMap: Record<string, { ok: boolean; body: unknown }>) {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input).replace(/\?t=\d+$/, '') // strip no-cache stamp
    const config = responseMap[url]
    if (!config) {
      return new Response('Not Found', { status: 404 })
    }
    return new Response(JSON.stringify(config.body), {
      status: config.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ---------------------------------------------------------------------------
// fetchSidebarMenuConfig
// ---------------------------------------------------------------------------
describe('fetchSidebarMenuConfig', () => {
  it('parses plain array response as items', async () => {
    const items = [
      { label: '仪表盘', path: '/dashboard', enabled: true },
      { label: '用户管理', path: '/users', enabled: true },
    ]

    mockFetch({ '/api/adm/admin/config/sidebar': { ok: true, body: items } })

    const result = await fetchSidebarMenuConfig()
    expect(result.items).toHaveLength(2)
    expect(result.items?.[0].label).toBe('仪表盘')
  })

  it('parses wrapped API envelope { code: 0, payload: ... }', async () => {
    const wrappedBody = {
      code: 0,
      msg: 'ok',
      payload: {
        title: '管理后台',
        items: [
          { label: '群组', path: '/groups', enabled: true },
        ],
        rbac: {
          permissions: [
            { key: 'users:read', name: '查看用户', module: 'users', path: '/users' },
          ],
          roles: [
            { id: 1, name: '超级管理员', description: '全权限', permissions: ['users:read'] },
          ],
        },
      },
    }

    mockFetch({ '/api/adm/admin/config/sidebar': { ok: true, body: wrappedBody } })

    const result = await fetchSidebarMenuConfig()
    expect(result.title).toBe('管理后台')
    expect(result.items?.[0].label).toBe('群组')
    expect(result.rbac?.permissions).toHaveLength(1)
    expect(result.rbac?.permissions?.[0].key).toBe('users:read')
    expect(result.rbac?.roles?.[0].name).toBe('超级管理员')
  })

  it('falls back to local sidebar-menu.json when remote fails', async () => {
    const localItems = [{ label: '本地配置', path: '/local', enabled: true }]

    mockFetch({
      '/api/adm/admin/config/sidebar': { ok: false, body: 'error' },
      '/sidebar-menu.json': { ok: true, body: localItems },
    })

    const result = await fetchSidebarMenuConfig()
    expect(result.items?.[0].label).toBe('本地配置')
  })

  it('throws when all URLs fail', async () => {
    mockFetch({}) // no valid responses

    await expect(fetchSidebarMenuConfig()).rejects.toThrow('Load sidebar config failed')
  })

  it('throws when backend returns error code in payload', async () => {
    const errorBody = { code: 401, msg: '未登录', payload: null }

    mockFetch({ '/api/adm/admin/config/sidebar': { ok: true, body: errorBody } })

    await expect(fetchSidebarMenuConfig()).rejects.toThrow('backend config rejected')
  })

  it('strips invalid permission catalog entries (missing required fields)', async () => {
    const body = {
      code: 0, msg: 'ok',
      payload: {
        items: [],
        rbac: {
          permissions: [
            { key: 'valid:read', name: '有效', module: 'valid', path: '/valid' },
            { key: '', name: '缺 key', module: 'm', path: '/p' }, // invalid: empty key
            { name: '缺 key 字段', module: 'm', path: '/p' }, // invalid: no key
          ],
          roles: [],
        },
      },
    }

    mockFetch({ '/api/adm/admin/config/sidebar': { ok: true, body } })

    const result = await fetchSidebarMenuConfig()
    // Only the first (valid) entry should survive
    expect(result.rbac?.permissions).toHaveLength(1)
    expect(result.rbac?.permissions?.[0].key).toBe('valid:read')
  })

  it('strips invalid role template entries (missing id or name)', async () => {
    const body = {
      code: 0, msg: 'ok',
      payload: {
        items: [],
        rbac: {
          permissions: [],
          roles: [
            { id: 1, name: '有效角色', description: '描述', permissions: ['p:read'] },
            { id: 0, name: '无效 id', description: '', permissions: [] }, // invalid: id=0
            { id: 2, name: '', description: '', permissions: [] }, // invalid: empty name
          ],
        },
      },
    }

    mockFetch({ '/api/adm/admin/config/sidebar': { ok: true, body } })

    const result = await fetchSidebarMenuConfig()
    expect(result.rbac?.roles).toHaveLength(1)
    expect(result.rbac?.roles?.[0].name).toBe('有效角色')
  })
})
