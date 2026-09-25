/**
 * ENT-INT-01（M3 Enterprise UX 真实浏览器门）——写操作补完：J-ENT-01/02 write + CAS + 权限矩阵。
 *
 * 真实拓扑（零 mock route，禁 page.route）：
 *   - admin dev :8906（vite proxy → 真实 Cowboy :19802，imboy integration 候选）；
 *   - 平台 admin 会话 ×4（adm_session_ds 生产同款签发，seed 直种：
 *     SUPER=role1 全权 / AUDIT=role3 组织只读 / MOD=role4 群频道只读 / VICTIM=role1 撤权目标）；
 *   - 双租户 org1/org2 + 部门树 + 企业群/牺牲群/个人群 + 企业频道（admin/channel_admin/subscription）
 *     直种 scratch PG（见 RUN evidence/ENT-INT-01/internal/entw.env + entint01w_seed.escript）。
 *
 * 三重 Oracle：每个写断言 = HTTP 信封 + DB 行（psql 直查，落 db_oracle.log）+ UI 可见反馈（toast/树/行）。
 * CAS：部门 rename expected_version——成功后 version 前进；stale version 重放被 409 拒且 DB 无变化。
 * 权限矩阵：super×写集=2xx；audit/mod×同集=信封 403（adm 业务错误统一 HTTP 200 + code，见
 * elib_response:error）；UI 面：无 organizations:write 的会话成员行操作列渲染 "-"（入口隐藏）。
 * 撤权：VICTIM 写 2xx → SUPER 走真实 assign_role API 降级 role3（handler 内 flush 权限缓存）→ 同写 403。
 * 跨租户 fail-closed：org2 资源挂 org1 上下文一律 409/404，DB 无任何越租户写入。
 * 匿名：无会话写 API = HTTP 401（认证边界走真实 HTTP 状态码）。
 */
import { execSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.IMBOY_ADMIN_E2E_BASE_URL || 'http://127.0.0.1:8906'
const ORACLE_LOG =
  process.env.ENTW_ORACLE_LOG ||
  '/Users/leeyi/project/imboy.pub/.Codex/runs/cs-agent-entux-v1-20260924T164136Z-539f3dae/evidence/ENT-INT-01/db_oracle.log'

// 种子固定 TSID（entw.env 同源；固定 ID 使断言可复现）
const ORG1 = process.env.ENTW_ORG1 ?? '942134885750600005'
const ORG2 = process.env.ENTW_ORG2 ?? '942134885750600007'
const D11 = process.env.ENTW_D11 ?? '942134885751100003'
const D2 = process.env.ENTW_D2 ?? '942134885751100002'
const D_ORG2 = '942134885751100004'
const G_ENT = process.env.ENTW_G_ENT ?? '942134885751200001'
const G_SAC = process.env.ENTW_G_SAC ?? '942134885751200002'
const CH1 = process.env.ENTW_CH1 ?? '942134885751300001'
const OWNER = process.env.ENTW_OWNER ?? '942134885750600001'
const MA = process.env.ENTW_MA ?? '942134885750600002'
const MB = process.env.ENTW_MB ?? '942134885750600003'
const MC2 = process.env.ENTW_MC2 ?? '942134885750600004'
const GM_KICK = process.env.ENTW_GM_KICK ?? '942134885751400001'
const CH_SUB = process.env.ENTW_CH_SUB ?? '942134885751400002'
const CH_ADM2 = process.env.ENTW_CH_ADM2 ?? '942134885751400003'

const SESSIONS = {
  super: {
    id: process.env.ENTW_ADM_SUPER_ID ?? '943135039686900001',
    sig: process.env.ENTW_ADM_SUPER_SIG ?? '',
  },
  audit: {
    id: process.env.ENTW_ADM_AUDIT_ID ?? '943135039686900002',
    sig: process.env.ENTW_ADM_AUDIT_SIG ?? '',
  },
  mod: {
    id: '943135039686900004',
    sig: process.env.ENTW_ADM_MOD_SIG ?? '',
  },
  victim: {
    id: process.env.ENTW_ADM_VICTIM_ID ?? '943135039686900003',
    sig: process.env.ENTW_ADM_VICTIM_SIG ?? '',
  },
}

const ADM_API = '/api/adm'

// ---------------------------------------------------------------------------
// DB Oracle：psql 直查 scratch PG（真实后端同库），结果追加落 evidence/db_oracle.log
// ---------------------------------------------------------------------------
const PG_DB = 'imboy_csagent_cs-agent-entux-v1-20260924T164136Z-539f3dae'

function psql(sql: string): string {
  const out = execSync(
    `docker exec imboy_pg18 psql -U imboy_user -d "${PG_DB}" -tA -c ${JSON.stringify(sql)}`,
    { encoding: 'utf8', timeout: 20_000 },
  )
  return out.trim()
}

function dbOracle(label: string, sql: string): string {
  const result = psql(sql)
  const stamp = new Date().toISOString()
  appendFileSync(ORACLE_LOG, `[${stamp}] ${label}\n  SQL> ${sql.replace(/\s+/g, ' ')}\n  => ${result}\n`)
  return result
}

/** API 直调（走 vite proxy → 真实 Cowboy；adm cookie 会话）。 */
async function apiPost(page: Page, path: string, body: unknown, who: keyof typeof SESSIONS = 'super') {
  return page.request.post(`${ADM_API}${path}`, {
    data: body as Record<string, unknown>,
    headers: { cookie: `adm_user_id=${SESSIONS[who].id}; adm_user_sig=${SESSIONS[who].sig}` },
  })
}

async function apiGet(page: Page, path: string, who: keyof typeof SESSIONS = 'super') {
  return page.request.get(`${ADM_API}${path}`, {
    headers: { cookie: `adm_user_id=${SESSIONS[who].id}; adm_user_sig=${SESSIONS[who].sig}` },
  })
}

async function injectSession(page: Page, who: keyof typeof SESSIONS) {
  await page.context().addCookies([
    { name: 'adm_user_id', value: SESSIONS[who].id, domain: '127.0.0.1', path: '/' },
    { name: 'adm_user_sig', value: SESSIONS[who].sig, domain: '127.0.0.1', path: '/' },
  ])
}

test.use({ baseURL: BASE })

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await injectSession(page, 'super')
})

// ---------------------------------------------------------------------------
// J-ENT-01：成员生命周期（suspend / restore / remove）+ Owner 转移
// ---------------------------------------------------------------------------
test.describe('ENT-INT-01 write-ops real gate', () => {
  test('W01 成员 suspend：UI 停用 → 信封 suspended → DB status=suspended → 最近停用记录', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/organizations/${ORG1}/members`)
    const mbRow = page.locator('tr', { hasText: MB }).first()
    await expect(mbRow).toBeVisible({ timeout: 30_000 })
    await mbRow.getByTestId('member-suspend-btn').click()
    await page.getByRole('button', { name: '确认停用' }).click()
    // UI 反馈：toast + 最近停用面板出现
    await expect(page.getByText(new RegExp(`成员 ${MB} 已停用（suspended）`))).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('suspended-members-panel')).toBeVisible()
    // DB Oracle：成员行状态前进为 suspended
    const status = dbOracle(
      'W01 suspend MB',
      `SELECT status FROM organization_member WHERE organization_id=${ORG1} AND user_id=${MB}`,
    )
    expect(status).toBe('suspended')
  })

  test('W02 成员 restore：最近停用面板恢复 → DB status=active', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/organizations/${ORG1}/members`)
    // W01 的 suspend 记录在组件 state，刷新即失——但 DB 是 suspended；恢复入口
    // 在本页会话内，因此先经 API 复位到 active 再走 UI 全链（suspend→restore 同会话）。
    const pre = dbOracle('W02 precheck', `SELECT status FROM organization_member WHERE organization_id=${ORG1} AND user_id=${MB}`)
    if (pre !== 'active') {
      const resp = await apiPost(page, `/organizations/${ORG1}/members/${MB}/restore`, {})
      expect(resp.status()).toBe(200)
    }
    await page.goto(`/organizations/${ORG1}/members`)
    const mbRow = page.locator('tr', { hasText: MB }).first()
    await expect(mbRow).toBeVisible({ timeout: 30_000 })
    await mbRow.getByTestId('member-suspend-btn').click()
    await page.getByRole('button', { name: '确认停用' }).click()
    await expect(page.getByText(new RegExp(`成员 ${MB} 已停用（suspended）`))).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('member-restore-btn').click()
    await expect(page.getByText(new RegExp(`成员 ${MB} 已恢复（active）`))).toBeVisible({ timeout: 15_000 })
    const status = dbOracle(
      'W02 restore MB',
      `SELECT status FROM organization_member WHERE organization_id=${ORG1} AND user_id=${MB}`,
    )
    expect(status).toBe('active')
  })

  test('W03 成员 remove：最近停用面板移除 → DB status=removed 终态', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/organizations/${ORG1}/members`)
    const mbRow = page.locator('tr', { hasText: MB }).first()
    await expect(mbRow).toBeVisible({ timeout: 30_000 })
    await mbRow.getByTestId('member-suspend-btn').click()
    await page.getByRole('button', { name: '确认停用' }).click()
    await expect(page.getByText(new RegExp(`成员 ${MB} 已停用（suspended）`))).toBeVisible({ timeout: 15_000 })
    // 最近停用面板内的移除入口（suspended 成员不在 active 分页，行内按钮不可达）
    await page.getByTestId('suspended-remove-btn').click()
    await expect(page.getByText(new RegExp(`成员 ${MB} 已移除（removed 终态）`))).toBeVisible({ timeout: 15_000 })
    const status = dbOracle(
      'W03 remove MB',
      `SELECT status FROM organization_member WHERE organization_id=${ORG1} AND user_id=${MB}`,
    )
    expect(status).toBe('removed')
    // removed 终态成员不再出现在 active 分页（服务端硬编码 active 过滤）
    await page.goto(`/organizations/${ORG1}/members`)
    await expect(mbRow).toHaveCount(0, { timeout: 30_000 })
  })

  test('W04 Owner 转移：详情页搜索选择新 Owner → DB owner_id/双成员角色事务变化 → 转回复位', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(`/organizations/${ORG1}`)
    await page.getByTestId('org-owner-change-btn').click()
    await page.getByTestId('owner-transfer-search-input').fill(`int02-${MA}`)
    await page.getByRole('button', { name: '搜索' }).click()
    await page.getByTestId('owner-transfer-option').first().click()
    await page.getByTestId('owner-transfer-next').click()
    await page.getByTestId('owner-transfer-confirm').click()
    await expect(page.getByText('Owner 已转移')).toBeVisible({ timeout: 20_000 })
    // DB Oracle：单事务双写——owner_id 投影 + 新旧 Owner 角色互换
    const owner = dbOracle('W04 owner_id -> MA', `SELECT owner_id FROM organization WHERE id=${ORG1}`)
    expect(owner).toBe(MA)
    const roles = dbOracle(
      'W04 roles swap',
      `SELECT role FROM organization_member WHERE organization_id=${ORG1} AND user_id IN (${OWNER},${MA}) ORDER BY user_id`,
    )
    expect(roles.split('\n').join(',')).toBe('admin,owner') // OWNER(...001)<MA(...002)：admin,owner
    // 复位：Owner 转回 OWNER（同一真实链路）
    await page.goto(`/organizations/${ORG1}`)
    await page.getByTestId('org-owner-change-btn').click()
    await page.getByTestId('owner-transfer-search-input').fill(`int02-${OWNER}`)
    await page.getByRole('button', { name: '搜索' }).click()
    await page.getByTestId('owner-transfer-option').first().click()
    await page.getByTestId('owner-transfer-next').click()
    await page.getByTestId('owner-transfer-confirm').click()
    await expect(page.getByText('Owner 已转移')).toBeVisible({ timeout: 20_000 })
    expect(dbOracle('W04 owner_id back', `SELECT owner_id FROM organization WHERE id=${ORG1}`)).toBe(OWNER)
  })

  // -------------------------------------------------------------------------
  // J-ENT-01：部门治理（create / rename CAS / move / archive）
  // -------------------------------------------------------------------------
  test('W05 部门 create：UI 新建根部门 → DB 新行 version=1', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/organizations/${ORG1}/departments`)
    await expect(page.getByTestId('department-tree')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('dept-create-btn').click()
    await page.getByLabel('部门名称').fill('ENTW 写操作测试部')
    await page.getByTestId('dept-create-submit').click()
    await expect(page.getByText('部门「ENTW 写操作测试部」已创建')).toBeVisible({ timeout: 15_000 })
    const row = dbOracle(
      'W05 create dept',
      `SELECT id || '|' || version || '|' || status FROM organization_department WHERE organization_id=${ORG1} AND name='ENTW 写操作测试部'`,
    )
    expect(row).toMatch(/^\d+\|1\|active$/)
    const deptId = row.split('|')[0]
    // 供 W06-W08 使用：登记到 env 透传（进程内）
    process.env.ENTW_NEW_DEPT = deptId
    await expect(page.getByTestId(`dept-node-name-${deptId}`)).toBeVisible()
  })

  test('W06 部门 rename CAS：成功写 version+1；stale version 重放 409 且 DB 无变化', async ({ page }) => {
    test.setTimeout(90_000)
    const deptId = process.env.ENTW_NEW_DEPT!
    expect(deptId).toBeTruthy()
    await page.goto(`/organizations/${ORG1}/departments`)
    await expect(page.getByTestId(`dept-node-name-${deptId}`)).toBeVisible({ timeout: 30_000 })
    // UI rename（用当前 version）成功
    await page.locator('li', { hasText: 'ENTW 写操作测试部' }).getByRole('button', { name: '改名' }).click()
    await page.getByLabel('新名称').fill('ENTW 写操作测试部V2')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText('部门已更名为「ENTW 写操作测试部V2」')).toBeVisible({ timeout: 15_000 })
    let row = dbOracle(
      'W06 rename ok',
      `SELECT name || '|' || version FROM organization_department WHERE id=${deptId}`,
    )
    expect(row).toBe('ENTW 写操作测试部V2|2')
    // stale 重放：用旧 version=1 走真实 API（UI 无 stale 入口，合同级冲突由 API 验证）
    const stale = await apiPost(
      page,
      `/organizations/${ORG1}/departments/${deptId}/rename`,
      { name: 'ENTW 冲突幽灵名', expected_version: 1 },
    )
    expect(stale.status()).toBe(200)
    const envelope = (await stale.json()) as { code: number; msg: string }
    expect(envelope.code).toBe(409)
    // 冲突副作用：DB 无变化（name/version 保持成功后的值）
    row = dbOracle(
      'W06 stale replay rejected',
      `SELECT name || '|' || version FROM organization_department WHERE id=${deptId}`,
    )
    expect(row).toBe('ENTW 写操作测试部V2|2')
  })

  test('W07 部门 move：UI 把「前端组」移到「工程部」→ DB parent_id 变化 + version 前进', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/organizations/${ORG1}/departments`)
    await expect(page.getByTestId(`dept-node-name-${D11}`)).toBeVisible({ timeout: 30_000 })
    // 选中节点后用右侧详情面板的治理入口（与树行共用同一 mutation）
    await page.getByTestId(`dept-node-${D11}`).click()
    await page.getByTestId('dept-detail-move-btn').click()
    await page.getByLabel('目标父部门').selectOption(D2)
    await page.getByTestId('dept-move-submit').click()
    await expect(page.getByText(/已移动/)).toBeVisible({ timeout: 15_000 })
    const row = dbOracle(
      'W07 move D11 -> D2',
      `SELECT parent_id || '|' || version FROM organization_department WHERE id=${D11}`,
    )
    expect(row.split('|')[0]).toBe(D2)
    expect(Number(row.split('|')[1])).toBeGreaterThanOrEqual(2)
  })

  test('W08 部门 archive：归档测试部门 → DB status=archived', async ({ page }) => {
    test.setTimeout(90_000)
    const deptId = process.env.ENTW_NEW_DEPT!
    await page.goto(`/organizations/${ORG1}/departments`)
    await expect(page.getByTestId(`dept-node-name-${deptId}`)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(`dept-node-${deptId}`).click()
    await page.getByTestId('dept-detail-archive-btn').click()
    await page.getByRole('button', { name: '确认归档' }).click()
    await expect(page.getByText('已归档（含全部 active 后代')).toBeVisible({ timeout: 15_000 })
    const status = dbOracle('W08 archive dept', `SELECT status FROM organization_department WHERE id=${deptId}`)
    expect(status).toBe('archived')
  })

  // -------------------------------------------------------------------------
  // J-ENT-02：群/频道动作副作用
  // -------------------------------------------------------------------------
  test('W09 群资料 update：编辑群组改名 → DB title 变化', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/groups/${G_ENT}`)
    await expect(page.getByRole('button', { name: '编辑群组' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '编辑群组' }).click()
    await page.locator('#group-title').fill('ENTW EnterpriseGroup V2')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText('群组信息已更新')).toBeVisible({ timeout: 15_000 })
    const title = dbOracle('W09 group update title', `SELECT title FROM "group" WHERE id=${G_ENT}`)
    expect(title).toBe('ENTW EnterpriseGroup V2')
  })

  test('W10 群成员治理 kick：成员管理页踢出 → DB group_member 行删除', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/groups/${G_ENT}/members`)
    const kickRow = page.locator('tr', { hasText: GM_KICK }).first()
    await expect(kickRow).toBeVisible({ timeout: 30_000 })
    await kickRow.getByRole('button', { name: '踢出成员' }).click()
    await page.getByRole('button', { name: '踢出', exact: true }).click()
    await expect(page.getByText('成员已踢出')).toBeVisible({ timeout: 15_000 })
    const count = dbOracle(
      'W10 kick GM_KICK',
      `SELECT count(*) FROM group_member WHERE group_id=${G_ENT} AND user_id=${GM_KICK}`,
    )
    expect(count).toBe('0')
  })

  test('W11 群 dissolve：牺牲群解散 → DB status=-1（企业群保留可见性）', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/groups/${G_SAC}`)
    await expect(page.getByRole('button', { name: '解散群组' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '解散群组' }).click()
    await page.getByRole('button', { name: '解散', exact: true }).click()
    await expect(page.getByText('群组已解散')).toBeVisible({ timeout: 15_000 })
    const status = dbOracle('W11 dissolve G_SAC', `SELECT status FROM "group" WHERE id=${G_SAC}`)
    expect(status).toBe('-1')
  })

  test('W12 频道管理员角色变更：role 2→1 → DB channel_admin.role=1 → 1→2 双向复位', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/channels/${CH1}/admins`)
    const admRow = page.locator('tr', { hasText: CH_ADM2 }).first()
    await expect(admRow).toBeVisible({ timeout: 30_000 })
    await admRow.getByRole('combobox').selectOption('1')
    await expect(page.getByText('管理员角色已更新')).toBeVisible({ timeout: 15_000 })
    expect(dbOracle('W12 role 2->1', `SELECT role FROM channel_admin WHERE channel_id=${CH1} AND user_id=${CH_ADM2}`)).toBe('1')
    await admRow.getByRole('combobox').selectOption('2')
    await expect(page.getByText('管理员角色已更新')).toBeVisible({ timeout: 15_000 })
    expect(dbOracle('W12 role 1->2 restore', `SELECT role FROM channel_admin WHERE channel_id=${CH1} AND user_id=${CH_ADM2}`)).toBe('2')
  })

  test('W13 频道订阅者治理：移除订阅 → DB subscription 行删除 + subscriber_count -1', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/channels/${CH1}/subscribers`)
    const subRow = page.locator('tr', { hasText: CH_SUB }).first()
    await expect(subRow).toBeVisible({ timeout: 30_000 })
    await subRow.getByRole('button', { name: '移除订阅者' }).click()
    await page.getByRole('button', { name: '移除', exact: true }).click()
    await expect(page.getByText('订阅者已移除')).toBeVisible({ timeout: 15_000 })
    // 订阅移除为软删（repo delete = UPDATE status 1→0），活跃订阅归零
    const sub = dbOracle(
      'W13 remove subscriber (soft-delete status=0)',
      `SELECT count(*) FROM channel_subscription WHERE channel_id=${CH1} AND user_id=${CH_SUB} AND status=1`,
    )
    expect(sub).toBe('0')
    const count = dbOracle('W13 subscriber_count', `SELECT subscriber_count FROM channel WHERE id=${CH1}`)
    expect(count).toBe('1')
  })

  // -------------------------------------------------------------------------
  // 权限矩阵（API 面 + UI 面）与撤权 / 跨租户 / 匿名负例
  // -------------------------------------------------------------------------
  test('W14 权限矩阵：super 全写 2xx；audit/mod 越权信封 403 + UI 入口隐藏', async ({ page }) => {
    test.setTimeout(120_000)
    // —— super × 写操作集（复用一次性资源：新部门做 rename；G_ENT 不动）——
    const seedDept = psql(
      `SELECT id FROM organization_department WHERE organization_id=${ORG1} AND name='产品部'`,
    )
    const curVer = psql(`SELECT version FROM organization_department WHERE id=${seedDept}`)
    const ok1 = await apiPost(page, `/organizations/${ORG1}/departments/${seedDept}/rename`, {
      name: '产品部-M',
      expected_version: Number(curVer),
    })
    expect(ok1.status()).toBe(200)
    expect(((await ok1.json()) as { code: number }).code).toBe(0)
    dbOracle('W14 super rename 2xx', `SELECT version FROM organization_department WHERE id=${seedDept}`)

    // —— audit(role3 组织只读) × 同写集：信封 403 ——
    const denied1 = await apiPost(page, `/organizations/${ORG1}/members/${MA}/suspend`, {}, 'audit')
    const denied1Body = (await denied1.json()) as { code: number; msg: string }
    expect(denied1.status()).toBe(200)
    expect(denied1Body.code).toBe(403)
    const denied2 = await apiPost(
      page,
      `/organizations/${ORG1}/departments`,
      { name: 'audit 越权部门', parent_id: null },
      'audit',
    )
    expect(((await denied2.json()) as { code: number }).code).toBe(403)
    // 读侧放行（只读角色可见事实）
    const readOk = await apiGet(page, `/organizations/${ORG1}/members?page=1&size=10`, 'audit')
    expect(readOk.status()).toBe(200)

    // —— mod(role4 群频道只读、无 organizations:read) × 组织读 = 403；群/频道读 200 写 403 ——
    const modOrg = await apiGet(page, `/organizations/${ORG1}/members?page=1&size=10`, 'mod')
    expect(modOrg.status()).toBe(200)
    expect(((await modOrg.json()) as { code: number }).code).toBe(403)
    const modGroupRead = await apiGet(page, '/group/list?page=1&size=10', 'mod')
    expect(modGroupRead.status()).toBe(200)
    expect(((await modGroupRead.json()) as { code: number }).code).toBe(0)
    const modGroupWrite = await apiPost(page, '/group/update', { gid: G_ENT, title: 'mod 越权重命名' }, 'mod')
    expect(((await modGroupWrite.json()) as { code: number }).code).toBe(403)
    const modChWrite = await page.request.put(`${ADM_API}/channel/${CH1}/admin/${CH_ADM2}/role`, {
      data: { role: 1 },
      headers: { cookie: `adm_user_id=${SESSIONS.mod.id}; adm_user_sig=${SESSIONS.mod.sig}` },
    })
    expect(((await modChWrite.json()) as { code: number }).code).toBe(403)
    // 越权零副作用：群名未被改写
    expect(dbOracle('W14 mod write denied', `SELECT title FROM "group" WHERE id=${G_ENT}`)).not.toContain('越权')

    // —— UI 面：audit 会话成员页可读但写入口隐藏（操作列渲染 "-"）——
    const auditPage = await page.context().browser()!.newContext({ baseURL: BASE })
    await auditPage.addCookies([
      { name: 'adm_user_id', value: SESSIONS.audit.id, domain: '127.0.0.1', path: '/' },
      { name: 'adm_user_sig', value: SESSIONS.audit.sig, domain: '127.0.0.1', path: '/' },
    ])
    const ap = await auditPage.newPage()
    await ap.goto(`/organizations/${ORG1}/members`)
    await expect(ap.getByText('int02-').first()).toBeVisible({ timeout: 30_000 })
    await expect(ap.getByTestId('member-suspend-btn')).toHaveCount(0)
    await expect(ap.getByTestId('member-remove-btn')).toHaveCount(0)
    await auditPage.close()
  })

  test('W15 撤权负例：VICTIM 写 2xx → assign_role 降级 role3（真实 API + 缓存失效）→ 同写 403', async ({ page }) => {
    test.setTimeout(120_000)
    // 撤权前：victim(role1) 可写（建部门）
    const before = await apiPost(
      page,
      `/organizations/${ORG1}/departments`,
      { name: 'victim 撤权前部门', parent_id: null },
      'victim',
    )
    expect(before.status()).toBe(200)
    expect(((await before.json()) as { code: number }).code).toBe(0)
    dbOracle(
      'W15 victim create dept (pre-revoke)',
      `SELECT count(*) FROM organization_department WHERE organization_id=${ORG1} AND name='victim 撤权前部门'`,
    )
    // super 走真实 assign_role API 撤权（handler 内 flush_admin_permission_cache）
    const revoke = await page.request.put(`${ADM_API}/admin/assign_role`, {
      data: { admin_id: SESSIONS.victim.id, role_id: 3 },
      headers: { cookie: `adm_user_id=${SESSIONS.super.id}; adm_user_sig=${SESSIONS.super.sig}` },
    })
    expect(revoke.status()).toBe(200)
    dbOracle(
      'W15 revoke victim role -> 3',
      `SELECT role_id FROM adm_user WHERE id=${SESSIONS.victim.id}`,
    )
    // 撤权后：同写被 403 拒，零副作用
    const after = await apiPost(
      page,
      `/organizations/${ORG1}/departments`,
      { name: 'victim 撤权后幽灵部门', parent_id: null },
      'victim',
    )
    const afterBody = (await after.json()) as { code: number }
    expect(after.status()).toBe(200)
    expect(afterBody.code).toBe(403)
    expect(
      dbOracle(
        'W15 post-revoke zero side effect',
        `SELECT count(*) FROM organization_department WHERE organization_id=${ORG1} AND name='victim 撤权后幽灵部门'`,
      ),
    ).toBe('0')
  })

  test('W16 跨租户 fail-closed：org2 资源挂 org1 上下文 → 409/404，DB 零越租户写入', async ({ page }) => {
    test.setTimeout(120_000)
    // org1 路径 suspend org2 的 owner（MC2 不是 org1 成员）
    const c1 = await apiPost(page, `/organizations/${ORG1}/members/${MC2}/suspend`, {})
    expect(((await c1.json()) as { code: number }).code).toBe(409)
    // org1 owner-transfer 目标为 org2 owner（非 org1 成员）
    const c2 = await apiPost(page, `/organizations/${ORG1}/owner-transfer`, { target_user_id: MC2 })
    expect(((await c2.json()) as { code: number }).code).toBe(409)
    // org1 路径 rename org2 的部门（资源不属于 org1）
    const c3 = await apiPost(page, `/organizations/${ORG1}/departments/${D_ORG2}/rename`, {
      name: '跨租户幽灵部门',
      expected_version: 1,
    })
    const c3Body = (await c3.json()) as { code: number }
    expect([404, 409]).toContain(c3Body.code)
    // 跨租户零副作用
    expect(dbOracle('W16 org1 owner unchanged', `SELECT owner_id FROM organization WHERE id=${ORG1}`)).toBe(OWNER)
    expect(dbOracle('W16 org2 dept intact', `SELECT name FROM organization_department WHERE id=${D_ORG2}`)).toBe('entw-org2-dept')
    expect(
      dbOracle(
        'W16 MC2 still org2 member',
        `SELECT status FROM organization_member WHERE organization_id=${ORG2} AND user_id=${MC2}`,
      ),
    ).toBe('active')
  })

  test('W17 匿名写 API：无会话 → HTTP 401（认证边界真实状态码）', async ({ page }) => {
    test.setTimeout(60_000)
    // page.request 继承 context cookie——匿名语义必须用全新无 cookie context
    const anonCtx = await page.context().browser()!.newContext({ baseURL: BASE })
    const anon = await anonCtx.newPage()
    const resp = await anon.request.post(`${ADM_API}/organizations/${ORG1}/members/${MA}/suspend`, { data: {} })
    expect(resp.status()).toBe(401)
    await anonCtx.close()
    expect(
      dbOracle(
        'W17 anon zero side effect',
        `SELECT status FROM organization_member WHERE organization_id=${ORG1} AND user_id=${MA}`,
      ),
    ).toBe('active')
  })
})
