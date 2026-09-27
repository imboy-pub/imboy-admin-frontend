/**
 * ORG-ADMIN-ADM-WIRING organization 模块纯函数单测（adm 平台面）。
 *
 * 覆盖：C16 组织写门禁、成员行级谓词（owner 不可 suspend/remove）、
 * 错误分类映射（400/401/403/404/409/422/503）、分页信封归一化、
 * TSID→EntityId 投影、平台事实投影（owner 昵称/账号 + 关系计数）、
 * org lifecycle 信封（{organization_id,status,changed}）、Workspace 行投影、
 * 邀请 token 一次性展示语义、部门树构造（含孤儿节点）、
 * 并发冲突（expected_version 409）刷新提示、敏感键白名单投影。
 */
import { describe, expect, it } from 'bun:test'
import {
  ADM_SESSION_HINT,
  asOrgRole,
  buildDepartmentTree,
  canTargetMemberRow,
  classifyOrgError,
  descendantIdsOf,
  isOrgConflict,
  suggestRefreshForCasMutation,
  isOrgWriteAllowed,
  normalizeOrgPage,
  orgFailureKindFromStatus,
  ownerTransferErrorHint,
  redactToken,
  safeJsonKeyNames,
  toDepartmentRow,
  toInvitationCreatedReveal,
  toInvitationView,
  toMemberLifecycleResult,
  toOrganizationMemberRow,
  toOrganizationSummary,
  toOrgLifecycleResult,
  toWorkspaceRow,
} from './pureFunctions'

// ---------------------------------------------------------------------------
// C16 写门禁 + adm 面成员行级谓词
// ---------------------------------------------------------------------------
describe('组织写门禁与成员行级谓词', () => {
  it('C16 archived fail-closed：只有 restore 放行', () => {
    expect(isOrgWriteAllowed('active', 'update')).toBe(true)
    expect(isOrgWriteAllowed('active', 'archive')).toBe(true)
    expect(isOrgWriteAllowed('active', 'restore')).toBe(true)
    expect(isOrgWriteAllowed('archived', 'update')).toBe(false)
    expect(isOrgWriteAllowed('archived', 'archive')).toBe(false)
    expect(isOrgWriteAllowed('archived', 'restore')).toBe(true)
    expect(isOrgWriteAllowed('unknown', 'restore')).toBe(false)
  })

  it('canTargetMemberRow：owner 行不可 suspend/remove（服务端 409 镜像），admin/member 行放行', () => {
    expect(canTargetMemberRow({ role: 'owner' })).toBe(false)
    expect(canTargetMemberRow({ role: 'admin' })).toBe(true)
    expect(canTargetMemberRow({ role: 'member' })).toBe(true)
    expect(canTargetMemberRow({ role: 'unknown' })).toBe(true)
    expect(canTargetMemberRow({ role: null })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 生命周期命令响应投影（member_result：suspend/restore 含 role，remove 无 role）
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

  it('remove 响应（removed 终态）无 role 字段 → role 投影为 null', () => {
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
// org lifecycle 信封投影（adm 面 archive/restore 响应）
// ---------------------------------------------------------------------------
describe('组织 lifecycle 信封投影', () => {
  it('{organization_id,status,changed} 全量映射；changed=false 表示幂等重放', () => {
    const archived = toOrgLifecycleResult({ organization_id: '7700487111111111111', status: 'archived', changed: true })
    expect(archived.organizationId).toBe('7700487111111111111')
    expect(archived.status).toBe('archived')
    expect(archived.changed).toBe(true)

    const replay = toOrgLifecycleResult({ organization_id: '1', status: 'archived', changed: false })
    expect(replay.changed).toBe(false)
  })

  it('缺字段走防御默认（unknown / changed=false），不抛异常', () => {
    const result = toOrgLifecycleResult({})
    expect(result.status).toBe('unknown')
    expect(result.changed).toBe(false)
    expect(toOrgLifecycleResult(undefined).status).toBe('unknown')
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

    const forbidden = classifyOrgError({ code: 403, msg: '无 organizations:write 权限' })
    expect(forbidden.kind).toBe('forbidden')
    expect(forbidden.suggestRefresh).toBe(false)

    const unavailable = classifyOrgError({ code: 503, msg: '依赖域事实不可用' })
    expect(unavailable.kind).toBe('facts_unavailable')
    expect(unavailable.message).toContain('fail-closed')
  })

  it('401 呈现 adm 会话边界说明（管理会话失效 → 重新登录）', () => {
    const unauthorized = classifyOrgError({ code: 401, msg: '未登录，请先登录' })
    expect(unauthorized.kind).toBe('unauthorized')
    expect(unauthorized.message).toContain(ADM_SESSION_HINT)
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
// TSID → EntityId 投影（64 位安全）+ 平台事实投影
// ---------------------------------------------------------------------------
describe('TSID 与平台事实投影', () => {
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

  it('adm 面 list/detail 行无 member_role → memberRole 恒 null；平台事实键完整投影', () => {
    const summary = toOrganizationSummary({
      id: '7700487123456789012',
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
    })
    expect(summary.memberRole).toBeNull()
    expect(summary.ownerNickname).toBe('张三')
    expect(summary.ownerAccount).toBe('zhangsan')
    expect(summary.memberCount).toBe(12)
    expect(summary.workspaceCount).toBe(3)
  })

  it('平台事实键缺失时投影为 null/undefined（页面按 - 呈现）', () => {
    const summary = toOrganizationSummary({ id: '1', name: '组织', owner_id: '2', status: 'active' })
    expect(summary.ownerNickname).toBeUndefined()
    expect(summary.ownerAccount).toBeUndefined()
    expect(summary.memberCount).toBeNull()
    expect(summary.workspaceCount).toBeNull()
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
// Workspace 只读关系行投影（adm 面 read 端点；is_default 服务端真源 CP-CON-03）
// ---------------------------------------------------------------------------
describe('Workspace 行投影', () => {
  it('id/name/owner_id/organization_id/status/is_default/时间戳 全量映射，TSID 保持 string', () => {
    const row = toWorkspaceRow({
      id: '7700487555555555555',
      name: '默认空间',
      owner_id: '7700487222222222222',
      organization_id: '7700487111111111111',
      status: 'active',
      is_default: true,
      created_at: '2026-09-01T00:00:00',
      updated_at: '2026-09-01T00:00:00',
    })
    expect(row.id).toBe('7700487555555555555')
    expect(row.name).toBe('默认空间')
    expect(row.ownerId).toBe('7700487222222222222')
    expect(row.organizationId).toBe('7700487111111111111')
    expect(row.status).toBe('active')
    expect(row.isDefault).toBe(true)
    expect(row.createdAt).toBe('2026-09-01T00:00:00')
  })

  it('is_default=false 如实映射为 false（非默认行）', () => {
    const row = toWorkspaceRow({ id: '1', is_default: false })
    expect(row.isDefault).toBe(false)
  })

  it('缺字段走防御默认，不抛异常（is_default 缺失 = false，不猜测）', () => {
    const row = toWorkspaceRow({})
    expect(row.name).toBe('')
    expect(row.status).toBe('unknown')
    expect(row.isDefault).toBe(false)
    expect(toWorkspaceRow(undefined).status).toBe('unknown')
    expect(toWorkspaceRow(undefined).isDefault).toBe(false)
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
// Owner 转移错误分类文案（POST /organizations/:id/owner-transfer）
// ---------------------------------------------------------------------------
describe('ownerTransferErrorHint', () => {
  it('400 自转移/参数：给出「不能转移到当前 Owner 本人」指引', () => {
    const failure = classifyOrgError({ code: 400, msg: '不能转移给自己' })
    const hint = ownerTransferErrorHint(failure)
    expect(hint).toContain('400')
    expect(hint).toContain('自转移')
  })

  it('409 非成员/归档冲突：给出成员资格与归档状态指引', () => {
    const failure = classifyOrgError({ code: 409, msg: '该用户不是组织成员或已被移除' })
    const hint = ownerTransferErrorHint(failure)
    expect(hint).toContain('409')
    expect(hint).toContain('active 成员')
    expect(hint).toContain('未归档')
  })

  it('403/404/500 与默认分支各有可行动文案', () => {
    expect(ownerTransferErrorHint(classifyOrgError({ code: 403, msg: 'denied' }))).toContain('organizations:write')
    expect(ownerTransferErrorHint(classifyOrgError({ code: 404, msg: '不存在' }))).toContain('404')
    expect(ownerTransferErrorHint(classifyOrgError({ code: 500, msg: 'boom' }))).toContain('回滚')
    expect(ownerTransferErrorHint(classifyOrgError(new Error('network down')))).toContain('network down')
  })
})
