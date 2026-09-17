/**
 * ORG-14 organization 模块纯函数单测。
 *
 * 覆盖：权限矩阵（ORG-A14：read-only/平台管理员不映射为 org 角色）、
 * 错误分类映射（400/401/403/404/409/422/503）、分页信封归一化、
 * TSID→EntityId 投影、邀请 token 一次性展示语义、部门树构造（含孤儿节点）、
 * 并发冲突（expected_version 409）刷新提示、敏感键白名单投影。
 */
import { describe, expect, it } from 'bun:test'
import {
  asOrgRole,
  buildDepartmentTree,
  canManageAdminRole,
  canManageInvitations,
  canManageMemberLifecycle,
  canOffboardMember,
  canOrgWrite,
  canRestoreMember,
  canSuspendMember,
  canTransferOwner,
  canViewMembers,
  canViewOrgDetail,
  canWriteDepartments,
  classifyOrgError,
  descendantIdsOf,
  isOrgConflict,
  suggestRefreshForCasMutation,
  isOrgWriteAllowed,
  normalizeOrgPage,
  orgFailureKindFromStatus,
  redactToken,
  safeJsonKeyNames,
  toDepartmentRow,
  toInvitationCreatedReveal,
  toInvitationView,
  toMemberLifecycleResult,
  toOrganizationMemberRow,
  toOrganizationSummary,
  toDeletionPreflight,
  V1_SESSION_HINT,
} from './pureFunctions'

// ---------------------------------------------------------------------------
// 权限矩阵（服务端事实驱动的 org 级裁决）
// ---------------------------------------------------------------------------
describe('organization 权限矩阵', () => {
  it('member / 非成员（含平台管理员降级场景）拿不到任何组织写入口', () => {
    expect(canOrgWrite('member')).toBe(false)
    expect(canOrgWrite(null)).toBe(false)
    expect(canManageAdminRole('admin')).toBe(false)
    expect(canManageAdminRole('member')).toBe(false)
    expect(canManageAdminRole(null)).toBe(false)
    expect(canTransferOwner('admin')).toBe(false)
    expect(canTransferOwner('member')).toBe(false)
    expect(canTransferOwner(null)).toBe(false)
    expect(canManageInvitations('member')).toBe(false)
    expect(canManageInvitations(null)).toBe(false)
    expect(canViewMembers('member')).toBe(false)
    expect(canViewMembers(null)).toBe(false)
  })

  it('owner / admin 按服务端口径分级放行', () => {
    expect(canOrgWrite('owner')).toBe(true)
    expect(canOrgWrite('admin')).toBe(true)
    expect(canManageAdminRole('owner')).toBe(true)
    expect(canTransferOwner('owner')).toBe(true)
    expect(canViewMembers('owner')).toBe(true)
    expect(canViewMembers('admin')).toBe(true)
    expect(canManageInvitations('owner')).toBe(true)
    expect(canManageInvitations('admin')).toBe(true)
  })

  it('详情只读对任意 active 成员开放；部门写基线是任意 active 成员', () => {
    expect(canViewOrgDetail('member')).toBe(true)
    expect(canViewOrgDetail('admin')).toBe(true)
    expect(canViewOrgDetail('owner')).toBe(true)
    expect(canViewOrgDetail(null)).toBe(false)
    expect(canWriteDepartments('member')).toBe(true)
    expect(canWriteDepartments('owner')).toBe(true)
    expect(canWriteDepartments(null)).toBe(false)
  })

  it('C16 archived fail-closed：只有 restore 放行', () => {
    expect(isOrgWriteAllowed('active', 'update')).toBe(true)
    expect(isOrgWriteAllowed('active', 'archive')).toBe(true)
    expect(isOrgWriteAllowed('active', 'restore')).toBe(true)
    expect(isOrgWriteAllowed('archived', 'update')).toBe(false)
    expect(isOrgWriteAllowed('archived', 'archive')).toBe(false)
    expect(isOrgWriteAllowed('archived', 'restore')).toBe(true)
    expect(isOrgWriteAllowed('unknown', 'restore')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 成员生命周期命令谓词（EB-D07/EB-08：suspend / restore / offboard）
// 服务端契约：actor 均需 owner/admin；suspend 禁 owner 目标（admin 目标不要求
// 主 Owner）；restore 仅 suspended；offboard 禁 owner 目标、admin 目标需主 Owner。
// ---------------------------------------------------------------------------
describe('成员生命周期谓词', () => {
  const rowOf = (role: string) => ({ role: role as 'owner' | 'admin' | 'member' | 'unknown' })

  it('actor 资格基线：owner/admin 可执行生命周期命令，member/非成员不可', () => {
    expect(canManageMemberLifecycle('owner')).toBe(true)
    expect(canManageMemberLifecycle('admin')).toBe(true)
    expect(canManageMemberLifecycle('member')).toBe(false)
    expect(canManageMemberLifecycle(null)).toBe(false)
  })

  it('suspend：owner 行不可停用；admin/member 行放行（admin 目标不要求主 Owner，与离场不同）', () => {
    expect(canSuspendMember('owner', rowOf('owner'))).toBe(false)
    expect(canSuspendMember('owner', rowOf('admin'))).toBe(true)
    expect(canSuspendMember('owner', rowOf('member'))).toBe(true)
    // 关键差异：非主 Owner 的 admin actor 也可停用 admin 目标（后端 suspend_tx 无主 Owner 门）
    expect(canSuspendMember('admin', rowOf('admin'))).toBe(true)
    expect(canSuspendMember('admin', rowOf('member'))).toBe(true)
    expect(canSuspendMember('member', rowOf('member'))).toBe(false)
    expect(canSuspendMember(null, rowOf('member'))).toBe(false)
  })

  it('restore：仅 suspended 状态可恢复；active / removed / unknown 均不可', () => {
    expect(canRestoreMember('owner', { status: 'suspended' })).toBe(true)
    expect(canRestoreMember('admin', { status: 'suspended' })).toBe(true)
    expect(canRestoreMember('owner', { status: 'active' })).toBe(false)
    expect(canRestoreMember('owner', { status: 'removed' })).toBe(false)
    expect(canRestoreMember('owner', { status: 'unknown' })).toBe(false)
    expect(canRestoreMember('member', { status: 'suspended' })).toBe(false)
    expect(canRestoreMember(null, { status: 'suspended' })).toBe(false)
  })

  it('offboard：owner 行不可离场；admin 行需主 Owner；member 行 owner/admin 均可离场', () => {
    expect(canOffboardMember('owner', rowOf('owner'))).toBe(false)
    expect(canOffboardMember('owner', rowOf('admin'))).toBe(true)
    expect(canOffboardMember('admin', rowOf('admin'))).toBe(false) // admin actor 离场 admin 目标被拒
    expect(canOffboardMember('owner', rowOf('member'))).toBe(true)
    expect(canOffboardMember('admin', rowOf('member'))).toBe(true)
    expect(canOffboardMember('member', rowOf('member'))).toBe(false)
    expect(canOffboardMember(null, rowOf('member'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 生命周期命令响应投影（member_result：suspend/restore 含 role，offboard 无 role）
// ---------------------------------------------------------------------------
describe('生命周期响应投影', () => {
  it('suspend / restore 响应：organization_id/user_id/role/status 全量映射，TSID 保持 string', () => {
    const result = toMemberLifecycleResult({
      organization_id: '7700487111111111111',
      user_id: '7700487222222222222',
      role: 'member',
      status: 'suspended',
    })
    expect(result.organizationId).toBe('7700487111111111111')
    expect(result.userId).toBe('7700487222222222222')
    expect(result.role).toBe('member')
    expect(result.status).toBe('suspended')

    const restored = toMemberLifecycleResult({ organization_id: '1', user_id: '2', role: 'admin', status: 'active' })
    expect(restored.status).toBe('active')
    expect(restored.role).toBe('admin')
  })

  it('offboard 响应（removed 终态）无 role 字段 → role 投影为 null', () => {
    const result = toMemberLifecycleResult({ organization_id: '1', user_id: '2', status: 'removed' })
    expect(result.status).toBe('removed')
    expect(result.role).toBeNull()
  })

  it('未知 status / 缺字段走防御默认（不抛异常）', () => {
    const result = toMemberLifecycleResult({})
    expect(result.status).toBe('unknown')
    expect(result.role).toBeNull()
    expect(toMemberLifecycleResult(undefined).status).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// 错误分类（400/401/403/404/409/422/503 稳定归类）
// ---------------------------------------------------------------------------
describe('错误分类映射', () => {
  it('HTTP 状态 → 稳定 kind', () => {
    expect(orgFailureKindFromStatus(400)).toBe('validation')
    expect(orgFailureKindFromStatus(401)).toBe('unauthorized')
    expect(orgFailureKindFromStatus(403)).toBe('forbidden')
    expect(orgFailureKindFromStatus(404)).toBe('not_found')
    expect(orgFailureKindFromStatus(409)).toBe('conflict')
    expect(orgFailureKindFromStatus(422)).toBe('validation')
    expect(orgFailureKindFromStatus(503)).toBe('facts_unavailable')
    expect(orgFailureKindFromStatus(500)).toBe('server')
    expect(orgFailureKindFromStatus(0)).toBe('unknown')
  })

  it('409 并发/状态冲突给出刷新建议；其余不误导', () => {
    const conflict = classifyOrgError({ code: 409, msg: '组织已归档，不能更新' })
    expect(conflict.kind).toBe('conflict')
    expect(conflict.suggestRefresh).toBe(true)
    expect(conflict.message).toContain('409')

    const forbidden = classifyOrgError({ code: 403, msg: '仅 Organization Owner 或 Admin 可执行此操作' })
    expect(forbidden.kind).toBe('forbidden')
    expect(forbidden.suggestRefresh).toBe(false)

    const unavailable = classifyOrgError({ code: 503, msg: '依赖域事实不可用，删除预检被拒绝' })
    expect(unavailable.kind).toBe('facts_unavailable')
    expect(unavailable.message).toContain('fail-closed')
  })

  it('401 呈现 v1 会话边界说明（不做身份冒充）', () => {
    const unauthorized = classifyOrgError({ code: 401, msg: '未登录，请先登录' })
    expect(unauthorized.kind).toBe('unauthorized')
    expect(unauthorized.message).toContain(V1_SESSION_HINT)
  })

  it('isOrgConflict 识别 expected_version CAS 冲突', () => {
    expect(isOrgConflict({ code: 409, msg: '部门状态迁移非法' })).toBe(true)
    expect(isOrgConflict({ code: 404, msg: '部门不存在' })).toBe(false)
  })

  it('CAS mutation（部门 rename/move）失败时任何 4xx/5xx 都给刷新入口（版本冲突经后端兜底映射为 400）', () => {
    // 后端 map_dept_error 兜底：版本冲突 {error, conflict} → 400「请求参数非法」
    const as400 = classifyOrgError({ code: 400, msg: '请求参数非法' })
    expect(as400.kind).toBe('validation')
    expect(as400.suggestRefresh).toBe(false) // 通用分类不给刷新建议（避免误导）
    expect(suggestRefreshForCasMutation(as400.kind)).toBe(true) // CAS 场景仍提供刷新入口
    expect(suggestRefreshForCasMutation('conflict')).toBe(true)
    expect(suggestRefreshForCasMutation('server')).toBe(true)
    // 网络错误刷新无意义；401 是会话边界（先重新认证），均不给刷新入口
    expect(suggestRefreshForCasMutation('network')).toBe(false)
    expect(suggestRefreshForCasMutation('unauthorized')).toBe(false)
  })

  it('网络错误归类（拦截器 code=-1）', () => {
    const failure = classifyOrgError({ code: -1, msg: '网络错误' })
    expect(failure.kind).toBe('network')
  })
})

// ---------------------------------------------------------------------------
// 分页信封归一化（{list,page,size,total,total_page}）
// ---------------------------------------------------------------------------
describe('分页信封归一化', () => {
  it('后端 list 信封映射为 items 并保留分页事实', () => {
    const page = normalizeOrgPage(
      { list: [{ id: 'x1' }, { id: 'x2' }], page: 3, size: 10, total: 25, total_page: 3 },
      (item) => (item as { id: string }).id
    )
    expect(page.items).toEqual(['x1', 'x2'])
    expect(page.page).toBe(3)
    expect(page.size).toBe(10)
    expect(page.total).toBe(25)
    expect(page.totalPage).toBe(3)
  })

  it('缺字段的防御默认不抛异常', () => {
    const page = normalizeOrgPage(undefined, (item) => item)
    expect(page.items).toEqual([])
    expect(page.page).toBe(1)
    expect(page.size).toBe(10)
    expect(page.total).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// TSID → EntityId 投影（64 位安全）
// ---------------------------------------------------------------------------
describe('TSID 投影', () => {
  it('大整数 TSID 以 string 形态安全保留（safeParseBigIntJson 产物）', () => {
    const tsid = '7700487123456789012'
    const summary = toOrganizationSummary({
      id: tsid,
      name: '示例组织',
      owner_id: '7700487999999999999',
      status: 'active',
      member_role: 'owner',
      branding: { logo: 'x' },
      settings: {},
      created_at: '2026-09-01T00:00:00',
      updated_at: '2026-09-01T00:00:00',
    })
    expect(summary.id).toBe(tsid)
    expect(summary.ownerId).toBe('7700487999999999999')
    expect(summary.memberRole).toBe('owner')
    expect(summary.status).toBe('active')
    expect(summary.brandingKeys).toEqual(['logo'])
    expect(summary.settingsKeys).toEqual([])
  })

  it('branding/settings 只投影键名，不投影取值（敏感内部字段熔断）', () => {
    const keys = safeJsonKeyNames({ logo_url: 'https://secret.example/x', smtp_password: 'p', theme: 'dark' })
    expect(keys).toEqual(['logo_url', 'smtp_password', 'theme'])
    // 键值永不出现在投影结果里
    expect(JSON.stringify(keys)).not.toContain('secret.example')
  })

  it('成员行键投影（organization_id/user_id/role/invited_by/joined_at/status）', () => {
    const row = toOrganizationMemberRow({
      organization_id: '111',
      user_id: '222',
      role: 'admin',
      invited_by: '333',
      joined_at: '2026-01-01',
      status: 'active',
      nickname: '张三',
      account: 'zhangsan',
      avatar: 'https://avatar.example/x',
    })
    expect(row.userId).toBe('222')
    expect(row.role).toBe('admin')
    expect(row.nickname).toBe('张三')
    expect(row).not.toHaveProperty('avatar')
  })

  it('asOrgRole 拒绝未知角色（无万能角色）', () => {
    expect(asOrgRole('superadmin')).toBeNull()
    expect(asOrgRole('owner')).toBe('owner')
  })
})

// ---------------------------------------------------------------------------
// 邀请 token 一次性展示语义
// ---------------------------------------------------------------------------
describe('邀请 token 一次性展示', () => {
  it('create 响应含 token 时产出 reveal；缺失时返回 null（契约回归检出）', () => {
    const reveal = toInvitationCreatedReveal({
      invitation_id: '555',
      organization_id: '111',
      target_user_id: '222',
      invited_by: '333',
      status: 'pending',
      expires_at: 1780000000,
      responded_at: null,
      created_at: 1770000000,
      token: 'tok_plain_secret_value',
    })
    expect(reveal).not.toBeNull()
    expect(reveal?.token).toBe('tok_plain_secret_value')
    expect(reveal?.view.invitationId).toBe('555')

    expect(toInvitationCreatedReveal({ invitation_id: '555', status: 'pending' })).toBeNull()
  })

  it('列表视图永不携带 token / token_digest', () => {
    const view = toInvitationView({
      invitation_id: '555',
      organization_id: '111',
      target_user_id: '222',
      invited_by: '333',
      status: 'pending',
      expires_at: 1780000000,
      responded_at: null,
      created_at: 1770000000,
      token_digest: 'sha256:abc',
    })
    expect(Object.keys(view)).not.toContain('token')
    expect(Object.keys(view)).not.toContain('tokenDigest')
    expect(JSON.stringify(view)).not.toContain('sha256:abc')
  })

  it('redactToken 中段打码用于非一次性场景', () => {
    expect(redactToken('abcdefghijklmnop')).toBe('abcd****mnop')
    expect(redactToken('short')).toBe('****')
  })
})

// ---------------------------------------------------------------------------
// 部门树构造
// ---------------------------------------------------------------------------
describe('部门树构造', () => {
  const rows = [
    toDepartmentRow({ id: '1', organization_id: 'o1', parent_id: null, name: '根A', status: 'active', version: 1 }),
    toDepartmentRow({ id: '2', organization_id: 'o1', parent_id: '1', name: '子B', status: 'active', version: 2 }),
    toDepartmentRow({ id: '3', organization_id: 'o1', parent_id: '2', name: '孙C', status: 'active', version: 1 }),
    toDepartmentRow({ id: '4', organization_id: 'o1', parent_id: '999', name: '孤儿D', status: 'active', version: 1 }),
  ]

  it('父子层级 + 深度正确，孤儿节点提升为根不丢失', () => {
    const tree = buildDepartmentTree(rows)
    const rootNames = tree.map((node) => node.name)
    expect(rootNames).toContain('根A')
    expect(rootNames).toContain('孤儿D')
    const rootA = tree.find((node) => node.name === '根A')
    expect(rootA?.depth).toBe(0)
    expect(rootA?.children[0]?.name).toBe('子B')
    expect(rootA?.children[0]?.children[0]?.name).toBe('孙C')
    expect(rootA?.children[0]?.children[0]?.depth).toBe(2)
  })

  it('descendantIdsOf 枚举归档影响范围（archive_subtree 语义镜像）', () => {
    expect(descendantIdsOf(rows, '1')).toEqual(['2', '3'])
    expect(descendantIdsOf(rows, '3')).toEqual([])
  })

  it('环状数据不会无限递归，每个节点恰好出现一次（防御）', () => {
    const cyclic = [
      toDepartmentRow({ id: 'a', organization_id: 'o1', parent_id: 'b', name: 'A', status: 'active', version: 1 }),
      toDepartmentRow({ id: 'b', organization_id: 'o1', parent_id: 'a', name: 'B', status: 'active', version: 1 }),
    ]
    const tree = buildDepartmentTree(cyclic)
    // 环被打断：整棵树里 a、b 各出现一次
    const collected: string[] = []
    const walk = (nodes: ReturnType<typeof buildDepartmentTree>) => {
      for (const node of nodes) {
        collected.push(node.id)
        walk(node.children)
      }
    }
    walk(tree)
    expect(collected.sort()).toEqual(['a', 'b'])
  })
})

// ---------------------------------------------------------------------------
// 删除预检投影（C17 冻结形状）
// ---------------------------------------------------------------------------
describe('删除预检投影', () => {
  it('blockers / facts / observed_at 冻结字段完整映射', () => {
    const preflight = toDeletionPreflight({
      subject_user_id: '42',
      blockers: [
        { code: 'org_owner_of_active_org', resource_type: 'organization', resource_id: '111', organization_id: 111 },
        { code: 'cs_active_seat', resource_type: 'cs_seat', resource_id: 'seat-9', organization_id: null },
      ],
      facts: [
        { subject_user_id: 42, domain: 'organization', observed_at: 1770000000, fact_version: 1, blockers: [] },
      ],
      observed_at: 1770000001,
    })
    expect(preflight.subjectUserId).toBe('42')
    expect(preflight.blockers).toHaveLength(2)
    expect(preflight.blockers[0]?.organizationId).toBe('111')
    expect(preflight.blockers[1]?.organizationId).toBeNull()
    expect(preflight.facts[0]?.domain).toBe('organization')
    expect(preflight.observedAt).toBe(1770000001)
  })
})
