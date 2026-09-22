/**
 * EADM-04 创建组织——纯函数单测（契约回归）。
 *
 * 覆盖：
 * ① 请求体形状（严格三键、owner_user_id 为 string TSID）；
 * ② created=false 幂等呈现与 created=true 成功呈现被明确区分；
 * ⑤ 错误分类文案（400/403/404/409/500 各自可行动提示）；
 *   Owner 可选性判定（仅按可见 status 过滤 active；User 无 account_type，human 由后端判定）。
 *
 * 这些断言针对旧实现会"真红"：旧 impl 不存在 buildCreateOrganizationBody /
 * classifyCreateOutcome / createOrgErrorHint，导入即失败，契约回归立即暴露。
 */
import { describe, expect, it } from 'bun:test'
import {
  ACTIVE_USER_STATUS,
  buildCreateOrganizationBody,
  classifyCreateOutcome,
  createOrgErrorHint,
  isUserSelectableForOwner,
  type CreateOrganizationResult,
} from './pureFunctions'
import { classifyOrgError, type OrgFailure } from './pureFunctions'

// ---------------------------------------------------------------------------
// ① 请求体形状：严格三键，owner_user_id 为 string
// ---------------------------------------------------------------------------
describe('buildCreateOrganizationBody — 请求体形状', () => {
  it('仅含三键 {name, owner_user_id, default_workspace_name}，owner_user_id 为 string', () => {
    const body = buildCreateOrganizationBody({
      name: 'imboy',
      ownerUserId: '7700487999999999999',
      defaultWorkspaceName: 'imboy',
    })
    expect(Object.keys(body).sort()).toEqual(['default_workspace_name', 'name', 'owner_user_id'])
    expect(body.name).toBe('imboy')
    expect(body.owner_user_id).toBe('7700487999999999999')
    expect(typeof body.owner_user_id).toBe('string')
    expect(body.default_workspace_name).toBe('imboy')
  })

  it('大整数 TSID 保持 string，不被 Number 回转（>2^53 精度保护）', () => {
    const tsid = '7700487123456789012'
    const body = buildCreateOrganizationBody({ name: 'o', ownerUserId: tsid, defaultWorkspaceName: 'w' })
    expect(body.owner_user_id).toBe(tsid)
    expect(body.owner_user_id).not.toBe(Number(tsid))
  })

  it('缺字段 / 空白抛错（契约护栏）：禁止无 Owner 创建', () => {
    expect(() => buildCreateOrganizationBody({ name: 'o', ownerUserId: '', defaultWorkspaceName: 'w' })).toThrow()
    expect(() => buildCreateOrganizationBody({ name: '', ownerUserId: '1', defaultWorkspaceName: 'w' })).toThrow()
    expect(() =>
      buildCreateOrganizationBody({ name: 'o', ownerUserId: '1', defaultWorkspaceName: '' })
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// ② created=false 幂等命中 vs created=true 真实新建：呈现必须不同
// ---------------------------------------------------------------------------
describe('classifyCreateOutcome — 幂等 vs 真实新建', () => {
  const base = {
    organization: { id: 'org-1', name: 'imboy', ownerId: 'u-1', status: 'active' as const, memberRole: null, createdAt: '', updatedAt: '', brandingKeys: [], settingsKeys: [] },
    defaultWorkspace: { id: 'ws-1', name: 'imboy', ownerId: 'u-1', organizationId: 'org-1', status: 'active', createdAt: '', updatedAt: '' },
  }

  it('created=true → kind=created', () => {
    const result: CreateOrganizationResult = { ...base, created: true }
    const outcome = classifyCreateOutcome(result)
    expect(outcome.kind).toBe('created')
    expect(outcome.organizationId).toBe('org-1')
    expect(outcome.workspaceId).toBe('ws-1')
  })

  it('created=false → kind=idempotent（同一详情页，但呈现金字塔不同于成功）', () => {
    const result: CreateOrganizationResult = { ...base, created: false }
    const outcome = classifyCreateOutcome(result)
    expect(outcome.kind).toBe('idempotent')
    // 关键：两种 outcome 的 kind 不同，UI 据此区分"成功"与"已存在"而非当失败。
    expect(classifyCreateOutcome({ ...base, created: true }).kind).not.toBe(outcome.kind)
  })
})

// ---------------------------------------------------------------------------
// ⑤ 错误分类文案（400/403/404/409/500）
// ---------------------------------------------------------------------------
describe('createOrgErrorHint — 错误可行动文案', () => {
  const cases: Array<[number, string]> = [
    [400, '400'],
    [403, '403'],
    [404, '404'],
    [409, '409'],
    [500, '500'],
  ]
  it('每个 HTTP 状态给出不同且可行动的提示', () => {
    const hints = cases.map(([code, marker]) => {
      const failure: OrgFailure = classifyOrgError({ code, msg: 'detail' })
      const hint = createOrgErrorHint(failure)
      expect(hint).toContain(marker)
      return hint
    })
    // 全部互不相同（文案粒度足以区分错误类别）。
    expect(new Set(hints).size).toBe(hints.length)
  })

  it('403 提示授权由服务端 fail-closed 判定', () => {
    const hint = createOrgErrorHint(classifyOrgError({ code: 403, msg: 'no permission' }))
    expect(hint).toContain('fail-closed')
  })
})

// ---------------------------------------------------------------------------
// Owner 可选性：仅按可见 status 过滤 active（human 由后端 fail-closed 判定）
// ---------------------------------------------------------------------------
describe('isUserSelectableForOwner — 仅可见 status 可过滤', () => {
  it('ACTIVE_USER_STATUS = 1', () => {
    expect(ACTIVE_USER_STATUS).toBe(1)
  })

  it('status=1 可选；非 1 不可选（UI 无法判定 human，仅过滤 active）', () => {
    expect(isUserSelectableForOwner({ status: 1 })).toBe(true)
    expect(isUserSelectableForOwner({ status: 2 })).toBe(false)
    expect(isUserSelectableForOwner({ status: -1 })).toBe(false)
  })
})
