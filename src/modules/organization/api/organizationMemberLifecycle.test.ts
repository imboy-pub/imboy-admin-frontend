/**
 * Organization 治理 API client 单测（ORG-ADMIN-ADM-WIRING，adm 面全量）。
 *
 * 契约真源：`control/org15/adm-org-api-contract.md`（A0 冻结版 r1）——本套件对
 * public.ts 的全部 client 方法做 URL / method / payload 断言：
 *   * base path 全部落在公共 client 默认基址 `/api/adm`（不再携带 App 面
 *     `/api/v1` baseURL 覆盖——V1_REQUEST 已随迁移作废删除）；
 *   * mutation 全部为 POST command（含部门 rename：App 面 PATCH 收敛为
 *     POST .../rename）；
 *   * 术语映射断言：offboard→remove、transfer_owner→owner-transfer
 *     （body 键 target_user_id）、invitations/:iid/revoke→cancel、
 *     创建邀请 body 键 user_id→target_user_id；
 *   * 响应信封 {code,msg,payload}；member_result：suspend/restore 含 role，
 *     remove（removed 终态）无 role；org lifecycle 信封 {organization_id,status,changed}。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  archiveDepartment,
  archiveOrganization,
  cancelOrganizationInvitation,
  createDepartment,
  createOrganizationInvitation,
  getOrganizationDetail,
  getOrganizationMembers,
  getOrganizations,
  listDepartments,
  listOrganizationInvitations,
  listOrganizationWorkspaces,
  moveDepartment,
  removeOrganizationMember,
  renameDepartment,
  restoreOrganizationMember,
  restoreOrganization,
  suspendOrganizationMember,
  transferOrganizationOwner,
} from './public'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }
/** config 形态刻意只声明 baseURL：任何残留的 v1 覆盖都会被断言逮住。 */
type RequestConfig = { baseURL?: string; params?: Record<string, unknown> }
type GetCapture = { method: 'GET'; url: string; config?: RequestConfig }
type PostCapture = { method: 'POST'; url: string; body: unknown; config?: RequestConfig }
type Capture = GetCapture | PostCapture

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
})

function stubRequests(captures: Capture[], payload: unknown): void {
  mutableClient.get = async (url: string, config?: RequestConfig) => {
    captures.push({ method: 'GET', url, config })
    return { data: { code: 0, msg: 'success', payload } }
  }
  mutableClient.post = async (url: string, body: unknown, config?: RequestConfig) => {
    captures.push({ method: 'POST', url, body, config })
    return { data: { code: 0, msg: 'success', payload } }
  }
}

/** 共通断言：路径挂在 adm 基址上（无 v1 baseURL 覆盖残留）。 */
function expectAdmBase(capture: Capture): void {
  expect(capture.url.startsWith('/organizations')).toBe(true)
  expect(capture.url).not.toContain('/api/v1')
  expect(capture.config?.baseURL).toBeUndefined()
}

const ORG = '7700487111111111111'
const USER = '7700487222222222222'
const DEPT = '7700487333333333333'
const INVITE = '7700487444444444444'

const orgRow = {
  id: ORG,
  name: '示例组织',
  owner_id: '7700487999999999999',
  owner_nickname: '张三',
  owner_account: 'zhangsan',
  member_count: 12,
  workspace_count: 3,
  status: 'active',
  branding: {},
  settings: {},
  created_at: '2026-09-01T00:00:00',
  updated_at: '2026-09-01T00:00:00',
}

// ---------------------------------------------------------------------------
// 组织本体：list / detail / archive / restore
// ---------------------------------------------------------------------------
describe('getOrganizations（GET /api/adm/organizations）', () => {
  it('GET 列表 + 分页/搜索参数；keyword 空白时不发送', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { list: [orgRow], page: 1, size: 10, total: 1, total_page: 1 })

    const page = await getOrganizations(2, 20, 'archived', '  imboy  ')

    expect(captures).toHaveLength(1)
    const capture = captures[0] as GetCapture
    expect(capture.method).toBe('GET')
    expect(capture.url).toBe('/organizations')
    expectAdmBase(capture)
    expect(capture.config?.params).toEqual({ page: 2, size: 20, status: 'archived', keyword: 'imboy' })
    expect(page.total).toBe(1)
    expect(page.items[0]?.ownerNickname).toBe('张三')
    expect(page.items[0]?.memberCount).toBe(12)
  })

  it('keyword 为空时省略搜索参数', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { list: [], page: 1, size: 10, total: 0, total_page: 0 })
    await getOrganizations(1, 10)
    expect((captures[0] as GetCapture).config?.params).toEqual({ page: 1, size: 10, status: 'all' })
  })
})

describe('getOrganizationDetail（GET /:id）', () => {
  it('GET 详情路径正确', async () => {
    const captures: Capture[] = []
    stubRequests(captures, orgRow)
    const org = await getOrganizationDetail(ORG)
    expect(captures[0]?.url).toBe(`/organizations/${ORG}`)
    expectAdmBase(captures[0])
    expect(org.id).toBe(ORG)
  })

  it('空 ID 直接抛错，不发请求', async () => {
    const captures: Capture[] = []
    stubRequests(captures, {})
    await expect(getOrganizationDetail('  ')).rejects.toThrow('organization_id')
    expect(captures).toHaveLength(0)
  })
})

describe('archiveOrganization / restoreOrganization（lifecycle 信封）', () => {
  it('POST archive：路径 + 空体 + {organization_id,status,changed} 投影', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { organization_id: ORG, status: 'archived', changed: true })
    const result = await archiveOrganization(ORG)
    const capture = captures[0] as PostCapture
    expect(capture.method).toBe('POST')
    expect(capture.url).toBe(`/organizations/${ORG}/archive`)
    expectAdmBase(capture)
    expect(capture.body).toEqual({})
    expect(result.status).toBe('archived')
    expect(result.changed).toBe(true)
    expect(result.organizationId).toBe(ORG)
  })

  it('POST restore：changed=false 投影为幂等重放', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { organization_id: ORG, status: 'archived', changed: false })
    const result = await restoreOrganization(ORG)
    expect(captures[0]?.url).toBe(`/organizations/${ORG}/restore`)
    expect((captures[0] as PostCapture).body).toEqual({})
    expect(result.changed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 成员治理：members 列表 + suspend / restore / remove + owner-transfer
// ---------------------------------------------------------------------------
describe('getOrganizationMembers（GET /:id/members）', () => {
  it('GET 成员分页 + page/size 参数', async () => {
    const captures: Capture[] = []
    stubRequests(captures, {
      list: [{ organization_id: ORG, user_id: USER, role: 'member', joined_at: '2026-01-01', status: 'active', nickname: '李四' }],
      page: 1,
      size: 10,
      total: 1,
      total_page: 1,
    })
    const page = await getOrganizationMembers(ORG, 1, 10)
    const capture = captures[0] as GetCapture
    expect(capture.method).toBe('GET')
    expect(capture.url).toBe(`/organizations/${ORG}/members`)
    expectAdmBase(capture)
    expect(capture.config?.params).toEqual({ page: 1, size: 10 })
    expect(page.items[0]?.userId).toBe(USER)
  })
})

describe('成员生命周期命令（suspend / restore / remove）', () => {
  it('POST suspend 路径正确、空请求体，响应投影含 role', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { organization_id: ORG, user_id: USER, role: 'member', status: 'suspended' })
    const result = await suspendOrganizationMember(ORG, USER)
    expect(result.status).toBe('suspended')
    expect(result.role).toBe('member')
    const capture = captures[0] as PostCapture
    expect(capture.method).toBe('POST')
    expect(capture.url).toBe(`/organizations/${ORG}/members/${USER}/suspend`)
    expectAdmBase(capture)
    expect(capture.body).toEqual({})
  })

  it('POST restore 路径正确，响应投影 status=active', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { organization_id: ORG, user_id: USER, role: 'admin', status: 'active' })
    const result = await restoreOrganizationMember(ORG, USER)
    expect(result.status).toBe('active')
    expect(result.role).toBe('admin')
    expect(captures[0]?.url).toBe(`/organizations/${ORG}/members/${USER}/restore`)
    expect((captures[0] as PostCapture).body).toEqual({})
  })

  it('POST remove（App 面 offboard 的 adm 收敛）路径正确，removed 终态无 role → 投影为 null', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { organization_id: ORG, user_id: USER, status: 'removed' })
    const result = await removeOrganizationMember(ORG, USER)
    expect(result.status).toBe('removed')
    expect(result.role).toBeNull()
    const capture = captures[0] as PostCapture
    expect(capture.url).toBe(`/organizations/${ORG}/members/${USER}/remove`)
    expect(capture.body).toEqual({})
  })

  it('响应缺 payload 时抛错（契约回归检出，不静默成功）', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'success' } })
    await expect(removeOrganizationMember(ORG, USER)).rejects.toThrow('Missing payload')
  })

  it('空 ID 直接抛错，不发请求', async () => {
    const captures: Capture[] = []
    stubRequests(captures, {})
    await expect(suspendOrganizationMember('', USER)).rejects.toThrow('organization_id')
    await expect(restoreOrganizationMember(ORG, '  ')).rejects.toThrow('user_id')
    await expect(removeOrganizationMember(ORG, '')).rejects.toThrow('user_id')
    expect(captures).toHaveLength(0)
  })

  it('TSID 以 string 形态进入 URL（不发生 64-bit 精度丢失）', async () => {
    const captures: Capture[] = []
    const bigTsid = '9007199254740993' // 2^53+1，超出 JS Number 安全整数
    stubRequests(captures, { organization_id: bigTsid, user_id: bigTsid, status: 'removed' })
    await removeOrganizationMember(bigTsid, bigTsid)
    expect(captures[0]?.url).toBe(`/organizations/${bigTsid}/members/${bigTsid}/remove`)
  })
})

describe('transferOrganizationOwner（POST /:id/owner-transfer）', () => {
  it('POST owner-transfer：body 键 target_user_id（App 面 user_id 已弃用）', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { organization_id: ORG, owner_id: USER, previous_owner_id: '7700487999999999999' })
    await transferOrganizationOwner(ORG, USER)
    const capture = captures[0] as PostCapture
    expect(capture.method).toBe('POST')
    expect(capture.url).toBe(`/organizations/${ORG}/owner-transfer`)
    expectAdmBase(capture)
    expect(capture.body).toEqual({ target_user_id: USER })
  })

  it('空目标 ID 抛错，不发请求', async () => {
    const captures: Capture[] = []
    stubRequests(captures, {})
    await expect(transferOrganizationOwner(ORG, '')).rejects.toThrow('user_id')
    expect(captures).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 邀请治理：list / create / cancel
// ---------------------------------------------------------------------------
describe('listOrganizationInvitations（GET /:id/invitations）', () => {
  it('GET 邀请列表 + status/limit 可选参数', async () => {
    const captures: Capture[] = []
    stubRequests(captures, [])
    await listOrganizationInvitations(ORG, 'pending', 50)
    const capture = captures[0] as GetCapture
    expect(capture.method).toBe('GET')
    expect(capture.url).toBe(`/organizations/${ORG}/invitations`)
    expectAdmBase(capture)
    expect(capture.config?.params).toEqual({ status: 'pending', limit: 50 })
  })

  it('status=unknown 或 limit 非正整数时省略参数', async () => {
    const captures: Capture[] = []
    stubRequests(captures, [])
    await listOrganizationInvitations(ORG)
    expect((captures[0] as GetCapture).config?.params).toEqual({})
  })
})

describe('createOrganizationInvitation（POST /:id/invitations）', () => {
  it('POST 创建邀请：body 键 target_user_id + 可选 expires_at', async () => {
    const captures: Capture[] = []
    stubRequests(captures, {
      invitation_id: INVITE,
      organization_id: ORG,
      target_user_id: USER,
      status: 'pending',
      expires_at: 1780000000,
      token: 'tok_plain_secret_value',
    })
    const reveal = await createOrganizationInvitation(ORG, USER, 1780000000)
    const capture = captures[0] as PostCapture
    expect(capture.method).toBe('POST')
    expect(capture.url).toBe(`/organizations/${ORG}/invitations`)
    expectAdmBase(capture)
    expect(capture.body).toEqual({ target_user_id: USER, expires_at: 1780000000 })
    expect(reveal?.token).toBe('tok_plain_secret_value')
  })

  it('不带 expires_at 时 body 只有 target_user_id', async () => {
    const captures: Capture[] = []
    stubRequests(captures, {
      invitation_id: INVITE,
      organization_id: ORG,
      target_user_id: USER,
      status: 'pending',
      token: 'tok',
    })
    await createOrganizationInvitation(ORG, USER)
    expect((captures[0] as PostCapture).body).toEqual({ target_user_id: USER })
  })

  it('响应缺一次性 token 时抛错（契约回归检出）', async () => {
    stubRequests([], { invitation_id: INVITE, status: 'pending' })
    await expect(createOrganizationInvitation(ORG, USER)).rejects.toThrow('一次性 token')
  })
})

describe('cancelOrganizationInvitation（POST /:id/invitations/:iid/cancel）', () => {
  it('POST cancel（App 面 revoke 的 adm 收敛）路径 + 空体', async () => {
    const captures: Capture[] = []
    stubRequests(captures, {})
    await cancelOrganizationInvitation(ORG, INVITE)
    const capture = captures[0] as PostCapture
    expect(capture.method).toBe('POST')
    expect(capture.url).toBe(`/organizations/${ORG}/invitations/${INVITE}/cancel`)
    expectAdmBase(capture)
    expect(capture.body).toEqual({})
  })

  it('空邀请 ID 抛错，不发请求', async () => {
    const captures: Capture[] = []
    stubRequests(captures, {})
    await expect(cancelOrganizationInvitation(ORG, '')).rejects.toThrow('invitation_id')
    expect(captures).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 部门治理：list / create / rename / move / archive
// ---------------------------------------------------------------------------
describe('listDepartments（GET /:id/departments）', () => {
  it('GET 部门目录 + status 参数', async () => {
    const captures: Capture[] = []
    stubRequests(captures, [])
    await listDepartments(ORG, 'active')
    const capture = captures[0] as GetCapture
    expect(capture.method).toBe('GET')
    expect(capture.url).toBe(`/organizations/${ORG}/departments`)
    expectAdmBase(capture)
    expect(capture.config?.params).toEqual({ status: 'active' })
  })
})

describe('createDepartment（POST /:id/departments）', () => {
  it('POST 建部门：body {name, parent_id}，parent_id 可为 null（根）', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { id: DEPT, organization_id: ORG, parent_id: null, name: '研发部', status: 'active', version: 1 })
    const dept = await createDepartment(ORG, '研发部', null)
    const capture = captures[0] as PostCapture
    expect(capture.method).toBe('POST')
    expect(capture.url).toBe(`/organizations/${ORG}/departments`)
    expectAdmBase(capture)
    expect(capture.body).toEqual({ name: '研发部', parent_id: null })
    expect(dept.name).toBe('研发部')
  })
})

describe('renameDepartment（POST /:id/departments/:did/rename）', () => {
  it('POST rename（adm 面将 App 面 PATCH 收敛为 POST command）：body {name, expected_version} CAS', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { id: DEPT, organization_id: ORG, parent_id: null, name: '新名称', status: 'active', version: 2 })
    await renameDepartment(ORG, DEPT, '新名称', 1)
    const capture = captures[0] as PostCapture
    expect(capture.method).toBe('POST')
    expect(capture.url).toBe(`/organizations/${ORG}/departments/${DEPT}/rename`)
    expectAdmBase(capture)
    expect(capture.body).toEqual({ name: '新名称', expected_version: 1 })
  })
})

describe('moveDepartment（POST /:id/departments/:did/move）', () => {
  it('POST move：body {parent_id, expected_version}，parent_id=null 提升为根', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { id: DEPT, organization_id: ORG, parent_id: null, name: '研发部', status: 'active', version: 2 })
    await moveDepartment(ORG, DEPT, null, 1)
    const capture = captures[0] as PostCapture
    expect(capture.method).toBe('POST')
    expect(capture.url).toBe(`/organizations/${ORG}/departments/${DEPT}/move`)
    expectAdmBase(capture)
    expect(capture.body).toEqual({ parent_id: null, expected_version: 1 })
  })
})

describe('archiveDepartment（POST /:id/departments/:did/archive）', () => {
  it('POST archive：路径 + 空体', async () => {
    const captures: Capture[] = []
    stubRequests(captures, { id: DEPT, organization_id: ORG, parent_id: null, name: '研发部', status: 'archived', version: 2 })
    await archiveDepartment(ORG, DEPT)
    const capture = captures[0] as PostCapture
    expect(capture.method).toBe('POST')
    expect(capture.url).toBe(`/organizations/${ORG}/departments/${DEPT}/archive`)
    expectAdmBase(capture)
    expect(capture.body).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// Workspace 只读关系（合同 read 端点；暂无 UI 旅程，仅 client 方法 + 单测）
// ---------------------------------------------------------------------------
describe('listOrganizationWorkspaces（GET /:id/workspaces）', () => {
  it('GET Workspace 关系分页 + page/size 参数 + 行投影', async () => {
    const captures: Capture[] = []
    stubRequests(captures, {
      list: [{ id: '7700487555555555555', name: '默认空间', owner_id: USER, organization_id: ORG, status: 'active' }],
      page: 1,
      size: 10,
      total: 1,
      total_page: 1,
    })
    const page = await listOrganizationWorkspaces(ORG, 1, 10)
    const capture = captures[0] as GetCapture
    expect(capture.method).toBe('GET')
    expect(capture.url).toBe(`/organizations/${ORG}/workspaces`)
    expectAdmBase(capture)
    expect(capture.config?.params).toEqual({ page: 1, size: 10 })
    expect(page.items[0]?.name).toBe('默认空间')
    expect(page.items[0]?.ownerId).toBe(USER)
  })
})

// ---------------------------------------------------------------------------
// 导出面守恒：App 面遗留方法已移除（防止回潮到 v1 语义）
// ---------------------------------------------------------------------------
describe('public 模块导出面（adm 面收敛）', () => {
  it('App 面 v1 旅程方法不再导出；adm 面术语方法就位', async () => {
    const mod = (await import('./public')) as Record<string, unknown>
    // v1 App 面遗留（含 offboard/revoke 旧术语）已移除
    expect(mod['offboardOrganizationMember']).toBeUndefined()
    expect(mod['revokeOrganizationInvitation']).toBeUndefined()
    expect(mod['getMyOrganizations']).toBeUndefined()
    expect(mod['updateOrganizationName']).toBeUndefined()
    expect(mod['changeMemberRole']).toBeUndefined()
    expect(mod['getDeletionPreflight']).toBeUndefined()
    expect(mod['getDefaultWorkspace']).toBeUndefined()
    expect(mod['listDepartmentMembers']).toBeUndefined()
    expect(mod['addDepartmentMember']).toBeUndefined()
    expect(mod['removeDepartmentMember']).toBeUndefined()
    expect(mod['setDepartmentMemberAdmin']).toBeUndefined()
    // adm 面术语就位
    expect(typeof mod['removeOrganizationMember']).toBe('function')
    expect(typeof mod['cancelOrganizationInvitation']).toBe('function')
    expect(typeof mod['transferOrganizationOwner']).toBe('function')
    expect(typeof mod['getOrganizations']).toBe('function')
    expect(typeof mod['listOrganizationWorkspaces']).toBe('function')
    // EADM-04：创建组织复用集合路由 POST /api/adm/organizations（adm 面语义，
    // 非 v1 /organizations/mine 旅程）——导出面必须就位。
    expect(typeof mod['createOrganization']).toBe('function')
  })
})
