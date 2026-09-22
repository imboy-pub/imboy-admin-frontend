/**
 * FULL-04 真实浏览器 E2E：Admin Application 治理（`/enterprise/applications*`）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 口径说明（诚实记录，不夸大）：
 *   - **真实**：Chromium 真实浏览器 + 真实应用代码（React 路由守卫 / RBAC 门 /
 *     组件 / 服务层熔断 / 一次性 secret 内存仓），`bun run dev` 起的真实 dev server。
 *   - **合成**：`/api/adm/*` 全部由 `page.route` 以**确定性合成响应**提供 ——
 *     因为 Admin 聚合面（`/api/adm/enterprise/*`）属 A0 接线范围，本 phase 尚未
 *     注册（checkpoint §0.5 `PENDING_A0_WIRING`），本机也没有 9800 后端。
 *     因此本 spec **不需要**真实后端与真实凭据，可重复跑（gate 用）。
 *   - 本 spec **不使用** `test.skip`：任何断言失败都是硬失败。
 *
 * 覆盖的链（brief 指定）：
 *   ① 主链：登录 → 进入企业治理 → 签发凭证（断言 secret 只出现一次、刷新后不可再见）
 *      → 撤销凭证 → 审计可见
 *   ② 无权限拒绝链 A：ops_admin（role 2，只读）可读不可写 —— 越权写被拒
 *   ③ 无权限拒绝链 B：audit_admin（role 3，无 enterprise_business 权限）→ /forbidden
 *   ④ 边界：全程 0 次 `/api/internal/v1/*` 请求（INV-2/INV-3）、0 次 `/api/v1/*`
 *   ⑤ 熔断：投递响应含 payload → 页面熔断且正文永不渲染
 *
 * 运行：bun run test:e2e -- --project=chromium enterprise-app-governance
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { expect, test, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// 合成数据 / Synthetic fixtures（无真实 PII、无真实凭据、无真实 secret）
// ---------------------------------------------------------------------------

const ORG = '9100000000000000001'
const APP = '9100000000000000002'
const CRED_FIRST = '9100000000000000003'
const GRANT = '9100000000000000004'

/** 合成 secret：形态对齐后端（`ib_int_<id>.<secret>`），但**不是**任何真实凭据。 */
const ISSUED_SECRET = 'ib_int_9100000000000000003.SYNTHETIC-NOT-A-REAL-SECRET-0001'
const ROTATED_SECRET = 'ib_int_9100000000000000003.SYNTHETIC-NOT-A-REAL-SECRET-0002'

const PAYLOAD_CANARY = 'CANARY-PAYLOAD-MUST-NEVER-RENDER'

const PERM_READ = 'enterprise_business:read'
const PERM_WRITE = 'enterprise_business:write'

/**
 * 测试专用 RSA **公钥**（SPKI）：只为让浏览器 WebCrypto `importKey('spki')` 成功，
 * 从而走完登录表单的真实加密路径。
 *
 * ⚠️ 这不是秘密：它是公钥（`-----BEGIN PUBLIC KEY-----`），且对应私钥从未入库
 * （一次性在 /tmp 生成、用完即弃）。gitleaks 的 `generic-api-key` 规则会把 PEM 头
 * 误判为凭据，故按本仓既有惯例（`src/test/miscPureFunctions.test.ts`）加
 * `gitleaks:allow` 显式豁免 —— 是「如实标注」，不是绕过扫描。
 */
// 单行 PEM + 行尾 gitleaks:allow（与 src/test/miscPureFunctions.test.ts 同款写法）：
// gitleaks 的 generic-api-key 规则按整段 PEM 匹配，标注必须与匹配同行。
const TEST_LOGIN_PUBLIC_KEY =
  '-----BEGIN PUBLIC KEY-----\n'
  + 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp9Ki9Sre7Ttb5Utauzgo0l8n7qvFWGl2zcTSFbEhN46pmVKuTBaA1MDvo/KUmnVg7PQiJ8aBHCtg9YUR3xtRtS4/UmL64emHvpueyogcnToZtRVb2Mca+8/0I5aeQK2cjiQ+LYrlz2vqZsT4B+hbuLagkv1yq8tvFsBQ5f242Gn/DqoAPhct2ut9m7Auwvom8Z14FJ5T7prz+RGX8SOJHEmjd4KFux/bwm+izOnI4M7Q1GWhofMpYGMX7UZZsm7XZxX8IKnizbW5r8FVf/LHD5GMLg9tFn+QAJmM429kEVhIMz+kCX9PN5me3PzFlU8q8RbrpwJn2/gawK4ebKHcNQIDAQAB\n'
  + '-----END PUBLIC KEY-----' // gitleaks:allow

/** 1x1 透明 PNG：只为让验证码 <img> 加载成功（登录不依赖真实验证码）。 */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

type Role = 'super' | 'readonly' | 'none'

type GovernanceState = {
  role: Role
  /** 应用版本（CAS）。 */
  appVersion: number
  appStatus: 'draft' | 'active' | 'disabled' | 'archived'
  scopes: string[]
  issued: Array<{ id: string; prefix: string; status: string; createdAt: string; lastUsedAt: string }>
  grants: Array<{ id: string; version: number; status: string; scopes: string[]; kind: string; workspaces: string[] }>
  audits: Array<Record<string, unknown>>
  /** 本轮签发/轮换的一次性明文（只在响应里出现一次）。 */
  pendingSecret: string | null
  /** 投递列表是否掺入非法 payload 字段（熔断负例）。 */
  leakPayload: boolean
  /** 记录全部写请求路径（越权负例的证据）。 */
  writeCalls: string[]
  /** 服务端强制 403（用于「可写角色被服务端拒绝」的端到端负例）。 */
  serverDeniesWrites: boolean
  /** 记录全部 /api/internal 与 /api/v1 请求（INV-2/INV-3 边界）。 */
  internalCalls: string[]
}

function freshState(role: Role): GovernanceState {
  return {
    role,
    appVersion: 4,
    appStatus: 'active',
    scopes: ['application:read', 'identities:read'],
    issued: [],
    grants: [
      {
        id: GRANT,
        version: 1,
        status: 'active',
        scopes: ['application:read', 'identities:write'],
        kind: 'explicit',
        workspaces: ['9200000000000000001'],
      },
    ],
    audits: [],
    pendingSecret: null,
    leakPayload: false,
    writeCalls: [],
    serverDeniesWrites: false,
    internalCalls: [],
  }
}

function rolePermissions(role: Role): string[] {
  // super 额外带 settings:view —— 推送 token 页的门（同一 harness 复用）
  if (role === 'super') return [PERM_READ, PERM_WRITE, 'settings:view']
  if (role === 'readonly') return [PERM_READ]
  return []
}

function roleId(role: Role): string {
  if (role === 'super') return '1'
  if (role === 'readonly') return '2'
  return '3'
}

/** 后端 envelope：业务错误 = HTTP 200 + code；认证边界 = 真 HTTP 状态码。 */
function envelope(payload: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, msg: 'ok', payload }) }
}

function apiError(code: number, msg: string) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ code, msg, payload: null }) }
}

function httpStatus(status: number, msg: string) {
  return { status, contentType: 'application/json', body: JSON.stringify({ code: status, msg, payload: null }) }
}

function auditEntry(action: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  return {
    id: `${action}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    actor_account: 'e2e@example.invalid',
    target_kind: 'application',
    target_id: APP,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    before,
    after,
  }
}

// ---------------------------------------------------------------------------
// 路由装配 / route harness
// ---------------------------------------------------------------------------

const ADM = '/api/adm'

async function installGovernanceRoutes(page: Page, state: GovernanceState) {
  // 边界采样：任何 internal / v1 请求都记下来（断言为 0）
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/api/internal/') || url.includes('/api/v1/')) {
      state.internalCalls.push(url)
    }
  })

  // 登录 / 会话 / 权限 / 侧边栏
  await page.route(`**${ADM}/setup/status*`, (route) => route.fulfill(envelope({ initialized: true })))
  await page.route(`**${ADM}/passport/meta*`, (route) =>
    route.fulfill(
      envelope({ csrf_token: 'e2e-csrf', public_key: TEST_LOGIN_PUBLIC_KEY, system_name: 'IMBoy Admin E2E' })
    )
  )
  await page.route(`**${ADM}/passport/captcha*`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(TINY_PNG_BASE64, 'base64') })
  )
  await page.route(`**${ADM}/passport/do_login*`, (route) =>
    route.fulfill(
      envelope({
        id: '1',
        account: 'e2e-admin',
        nickname: 'E2E 管理员',
        avatar: '',
        role_id: roleId(state.role),
        next: '/dashboard',
      })
    )
  )
  await page.route(`**${ADM}/current*`, (route) =>
    route.fulfill(
      envelope({ id: '1', account: 'e2e-admin', nickname: 'E2E 管理员', avatar: '', role_id: roleId(state.role), status: 1 })
    )
  )
  await page.route(`**${ADM}/rbac/me*`, (route) =>
    route.fulfill(
      envelope({
        role_id: roleId(state.role),
        role_ids: [roleId(state.role)],
        role_name: state.role,
        permissions: rolePermissions(state.role),
        menu_paths: ['/enterprise/applications'],
      })
    )
  )
  await page.route(`**${ADM}/admin/config/sidebar*`, (route) =>
    route.fulfill(
      envelope({
        title: 'IMBoy Admin E2E',
        items: [
          { path: '/dashboard', icon: 'LayoutDashboard', label: '仪表盘', roles: ['1', '2', '3'] },
          {
            label: '企业业务',
            icon: 'Briefcase',
            children: [
              {
                path: '/enterprise/applications',
                icon: 'ShieldCheck',
                label: '企业应用治理',
                roles: ['1', '2'],
                permission: PERM_READ,
              },
            ],
          },
        ],
        rbac: { roles: [] },
      })
    )
  )

  // 治理面（全部 /api/adm/enterprise/...）
  const base = `${ADM}/enterprise/organizations/${ORG}/applications`
  const writeGuard = (route: Route): boolean => {
    const url = route.request().url()
    state.writeCalls.push(`${route.request().method()} ${url}`)
    if (state.serverDeniesWrites) {
      // 真 HTTP 403（认证/授权边界）：页面必须显示失败，绝不显示成功态
      void route.fulfill(httpStatus(403, 'forbidden'))
      return false
    }
    if (state.role !== 'super') {
      void route.fulfill(apiError(403, 'forbidden'))
      return false
    }
    return true
  }

  await page.route(`**${base}?*`, async (route) => {
    await route.fulfill(
      envelope({
        items: [
          {
            id: APP,
            organization_id: ORG,
            name: 'OA 集成应用（合成）',
            status: state.appStatus,
            scopes: state.scopes,
            version: state.appVersion,
            created_at: '2026-09-01 10:00:00',
            updated_at: '2026-09-20 10:00:00',
          },
        ],
        total: 1,
        page: 1,
        size: 10,
      })
    )
  })

  await page.route(`**${base}/${APP}/credentials`, async (route) => {
    if (route.request().method() === 'POST') {
      if (!writeGuard(route)) return
      const credential = {
        id: CRED_FIRST,
        credential_prefix: 'ib_int_9100000000000000003',
        status: 'active',
        created_at: '2026-09-22 10:00:00',
        last_used_at: '',
        version: 1,
      }
      state.issued = [credential]
      state.pendingSecret = ISSUED_SECRET
      state.audits.push(auditEntry('credential_issued', {}, { credential_prefix: credential.credential_prefix }))
      // ⚠️ 唯一携带 secret 的响应（合同：只在签发/轮换响应出现一次）
      await route.fulfill(envelope({ credential, secret: ISSUED_SECRET }))
      return
    }
    await route.fulfill(envelope(state.issued))
  })

  await page.route(`**${base}/${APP}/credentials/${CRED_FIRST}/rotate`, async (route) => {
    if (!writeGuard(route)) return
    state.pendingSecret = ROTATED_SECRET
    state.audits.push(auditEntry('credential_rotated', { credential_prefix: 'ib_int_9100000000000000003' }, { credential_prefix: 'ib_int_9100000000000000003' }))
    await route.fulfill(
      envelope({
        credential: {
          id: CRED_FIRST,
          credential_prefix: 'ib_int_9100000000000000003',
          status: 'active',
          created_at: '2026-09-22 10:00:00',
          last_used_at: '',
          version: 2,
        },
        secret: ROTATED_SECRET,
      })
    )
  })

  await page.route(`**${base}/${APP}/credentials/${CRED_FIRST}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      if (!writeGuard(route)) return
      state.issued = state.issued.map((row) => ({ ...row, status: 'revoked' }))
      state.audits.push(auditEntry('credential_revoked', { credential_status: 'active' }, { credential_status: 'revoked' }))
      await route.fulfill(envelope({ id: CRED_FIRST, status: 'revoked' }))
      return
    }
    await route.fulfill(apiError(404, 'not_found'))
  })

  await page.route(`**${base}/${APP}/grants`, async (route) => {
    if (route.request().method() === 'POST') {
      if (!writeGuard(route)) return
      await route.fulfill(envelope(state.grants[0]))
      return
    }
    await route.fulfill(envelope(state.grants))
  })

  await page.route(`**${base}/${APP}/grants/${GRANT}`, async (route) => {
    if (!writeGuard(route)) return
    await route.fulfill(envelope(state.grants[0]))
  })

  await page.route(`**${base}/${APP}/delivery-stats`, async (route) =>
    route.fulfill(
      envelope({ total: 12, success: 9, retry: 2, dead: 1, pending: 0, success_rate: 0.9, dead_letter_rate: 0.1 })
    )
  )

  await page.route(`**${base}/${APP}/deliveries*`, async (route) => {
    const row: Record<string, unknown> = {
      id: '9300000000000000001',
      event_id: '9300000000000000002',
      event_type: 'message.created',
      status: 'retry',
      attempt_count: 2,
      endpoint_generation: 3,
      ledger_version: 5,
      replay_of: null,
      correlation_id: 'corr-1',
      next_retry_at: '2026-09-22 10:05:00',
      last_error_class: 'timeout',
      created_at: '2026-09-22 10:00:00',
      terminal_at: '',
    }
    if (state.leakPayload) row.payload = PAYLOAD_CANARY
    await route.fulfill(envelope([row]))
  })

  await page.route(`**${base}/${APP}/audit-logs*`, async (route) => route.fulfill(envelope(state.audits)))

  await page.route(`**${base}/${APP}/scopes`, async (route) => {
    if (!writeGuard(route)) return
    await route.fulfill(envelope({ scopes: state.scopes }))
  })

  await page.route(`**${base}/${APP}/status`, async (route) => {
    if (!writeGuard(route)) return
    await route.fulfill(envelope({ status: state.appStatus }))
  })

  await page.route(`**${base}/${APP}`, async (route) => {
    await route.fulfill(
      envelope({
        id: APP,
        organization_id: ORG,
        name: 'OA 集成应用（合成）',
        status: state.appStatus,
        scopes: state.scopes,
        version: state.appVersion,
        created_at: '2026-09-01 10:00:00',
        updated_at: '2026-09-20 10:00:00',
        description: 'E2E 合成数据（无 PII）',
        owner_application_key: 'oa-e2e-demo',
      })
    )
  })
}

async function login(page: Page) {
  await page.goto('/login')
  await expect(page.getByLabel('账号', { exact: true })).toBeVisible()
  await page.getByLabel('账号', { exact: true }).fill('e2e-admin')
  await page.getByLabel('密码', { exact: true }).fill('NotARealPassword1')
  await page.getByLabel('验证码', { exact: true }).fill('1234')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/)
}

async function openGovernance(page: Page) {
  await page.goto('/enterprise/applications')
  await expect(page.locator('[data-page="enterprise-applications"]')).toBeVisible()
  await page.getByLabel('组织 ID（organization_id）').fill(ORG)
  await expect(page.getByRole('button', { name: '详情' }).first()).toBeVisible({ timeout: 15_000 })
}

async function openDetail(page: Page) {
  await page.getByRole('button', { name: '详情' }).first().click()
  await expect(page.locator('[data-page="enterprise-application-detail"]')).toBeVisible()
  await expect(page.getByTestId('credential-panel')).toBeVisible({ timeout: 15_000 })
}

/** 点击某元素并通过 AlertDialog 确认（敏感动作二次确认）。 */
async function confirmAction(page: Page, testId: string) {
  await page.getByTestId(testId).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '确认执行' }).click()
}

function storageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const dump = (storage: Storage): string => {
      const parts: string[] = []
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i)
        if (key === null) continue
        parts.push(`${key}=${storage.getItem(key) ?? ''}`)
      }
      return parts.join('\n')
    }
    return `${dump(window.localStorage)}\n${dump(window.sessionStorage)}\n${window.location.href}`
  })
}

// ---------------------------------------------------------------------------
// ① 主链
// ---------------------------------------------------------------------------

test.describe('FULL-04 主链：登录 → 治理 → 签发 → 撤销 → 审计', () => {
  test('secret 只出现一次 + 刷新后不可再见 + 撤销后审计可见', async ({ page }) => {
    const state = freshState('super')
    await installGovernanceRoutes(page, state)

    // 1) 真实登录表单（WebCrypto RSA-OAEP 加密路径真实走一遍）
    await login(page)

    // 2) 进入企业治理
    await openGovernance(page)
    await expect(page.getByTestId(`app-status-${APP}`).first()).toContainText('启用')
    await openDetail(page)

    // 3) 签发凭证（二次确认）
    await expect(page.getByText('暂无凭证')).toBeVisible()
    await confirmAction(page, 'credential-issue')
    const secretNode = page.getByTestId('secret-once-value')
    await expect(secretNode).toBeVisible()
    await expect(secretNode).toHaveText(ISSUED_SECRET)

    // 3a) 明文在页面里**恰好出现一次**
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.split(ISSUED_SECRET).length - 1).toBe(1)
    // 3b) 明文不落任何 Web Storage（只在内存仓）
    expect(await storageText(page)).not.toContain(ISSUED_SECRET)
    // 3c) 列表里只有脱敏前缀，没有明文
    await expect(
      page.getByTestId('credential-panel').getByRole('cell', { name: 'ib_int_9100000000000000003' })
    ).toBeVisible()

    // 4) 刷新后不可再见
    await page.reload()
    await expect(page.locator('[data-page="enterprise-application-detail"]')).toBeVisible()
    await expect(page.getByTestId('credential-panel')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('secret-once-value')).toHaveCount(0)
    await expect(page.getByTestId('secret-once-tombstone')).toHaveCount(0)
    const afterReload = await page.locator('body').innerText()
    expect(afterReload).not.toContain(ISSUED_SECRET)
    expect(await storageText(page)).not.toContain(ISSUED_SECRET)
    // 凭证行仍在（明文消失 ≠ 数据消失）
    await expect(
      page.getByTestId('credential-panel').getByRole('cell', { name: 'ib_int_9100000000000000003' })
    ).toBeVisible()

    // 5) 撤销凭证（敏感动作 + 二次确认）
    await confirmAction(page, `credential-revoke-${CRED_FIRST}`)
    await expect(page.getByTestId(`credential-expiry-${CRED_FIRST}`)).toContainText('已撤销')
    expect(state.writeCalls.some((call) => call.startsWith(`DELETE `) && call.includes(CRED_FIRST))).toBe(true)

    // 6) 审计可见（签发 + 撤销）
    await expect(page.getByTestId('audit-trail-panel')).toBeVisible()
    await expect(page.getByTestId('audit-action-credential_issued')).toBeVisible()
    await expect(page.getByTestId('audit-action-credential_revoked')).toBeVisible()
    await expect(page.getByTestId('audit-before-credential_status')).toContainText('active')
    await expect(page.getByTestId('audit-after-credential_status')).toContainText('revoked')

    // 7) 边界：全程 0 次 internal / v1 请求
    expect(state.internalCalls).toEqual([])
  })

  test('轮换：新明文出现一次、旧明文不可能再出现；响应不得回显 digest', async ({ page }) => {
    const state = freshState('super')
    state.issued = [
      {
        id: CRED_FIRST,
        prefix: 'ib_int_9100000000000000003',
        status: 'active',
        createdAt: '2026-09-22 10:00:00',
        lastUsedAt: '',
      },
    ]
    await installGovernanceRoutes(page, state)
    await login(page)
    await openGovernance(page)
    await openDetail(page)

    await confirmAction(page, `credential-rotate-${CRED_FIRST}`)
    await expect(page.getByTestId('secret-once-value')).toHaveText(ROTATED_SECRET)
    const text = await page.locator('body').innerText()
    expect(text.split(ROTATED_SECRET).length - 1).toBe(1)
    expect(text).not.toContain(ISSUED_SECRET)

    // 销毁后同一会话内不可再见
    await page.getByTestId('secret-once-dismiss').click()
    await expect(page.getByTestId('secret-once-value')).toHaveCount(0)
    await expect(page.getByTestId('secret-once-panel')).toHaveCount(0)
    const afterDismiss = await page.locator('body').innerText()
    expect(afterDismiss).not.toContain(ROTATED_SECRET)
    expect(await storageText(page)).not.toContain(ROTATED_SECRET)
  })

  test('投递与健康度：无 payload / 无 secret（含后端违规掺 payload 的熔断负例）', async ({ page }) => {
    const state = freshState('super')
    await installGovernanceRoutes(page, state)
    await login(page)
    await page.goto(`/enterprise/applications/${APP}/deliveries?org_id=${ORG}`)
    await expect(page.locator('[data-page="enterprise-deliveries"]')).toBeVisible()

    // 正例：健康度与投递元数据渲染，页面不含 payload
    await expect(page.getByTestId('delivery-health-panel')).toBeVisible()
    await expect(page.getByRole('heading', { name: '成功率' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '死信' })).toBeVisible()
    await expect(page.getByText('90%')).toBeVisible()
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toContain(PAYLOAD_CANARY)
    // 投递明细表头不得出现 payload/body 字段名
    const headers = await page.locator('[data-testid="delivery-health-panel"] th').allInnerTexts()
    expect(headers.join(',')).not.toMatch(/payload|body|content/i)

    // 负例：后端在投递响应里掺 payload → 前端熔断（不渲染、不缓存）
    state.leakPayload = true
    await page.reload()
    await expect(page.getByText(/熔断/)).toBeVisible({ timeout: 15_000 })
    const afterLeak = await page.locator('body').innerText()
    expect(afterLeak).not.toContain(PAYLOAD_CANARY)
  })

  test('聚合面未接线（404）：诚实失败提示，不伪造数据', async ({ page }) => {
    const state = freshState('super')
    await installGovernanceRoutes(page, state)
    // 覆盖列表路由为 404（模拟 A0 尚未接线的真实状态）
    await page.route(`**${ADM}/enterprise/organizations/${ORG}/applications?*`, (route) =>
      route.fulfill(httpStatus(404, 'not_found'))
    )
    await login(page)
    await page.goto('/enterprise/applications')
    await page.getByLabel('组织 ID（organization_id）').fill(ORG)

    await expect(page.getByText(/聚合面未接线/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/不展示伪造数据/)).toBeVisible()
    // 不伪造：不出现任何应用行
    await expect(page.getByRole('button', { name: '详情' })).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// ⑤ 追加必修项：推送 token 明文不得进入真实浏览器 DOM
// ---------------------------------------------------------------------------

/** 合成探针：**不是**任何真实设备凭据（FCM/JPush token）。 */
const PUSH_TOKEN_PROBE = 'SYNTHETIC-PUSH-TOKEN-PROBE-0001-not-a-real-device-credential'

test.describe('FULL-04 追加必修项：推送 token 明文不回显', () => {
  test('后端仍回传 token 时，页面与 DOM 属性均零命中（只展示不可逆指纹）', async ({ page }) => {
    const state = freshState('super')
    await installGovernanceRoutes(page, state)
    // 模拟后端当前形状：响应里**带**明文 token（push_token_repo:list_page/2 未修正）
    await page.route(`**${ADM}/admin/push_token/list*`, (route) =>
      route.fulfill(
        envelope({
          list: [
            {
              user_id: '9100000000000000005',
              device_id: 'e2e-device-001',
              device_type: 'phone',
              platform: 'android',
              token: PUSH_TOKEN_PROBE,
              created_at: '2026-09-22 10:00:00',
              updated_at: '2026-09-22 10:00:00',
            },
          ],
          total: 1,
          page: 1,
          size: 10,
        })
      )
    )

    await login(page)
    await page.goto('/settings/push-tokens')
    await expect(page.getByText('推送 Token 管理')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('9100000000000000005')).toBeVisible()

    // 1) 正文零命中（含明文片段）
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.indexOf(PUSH_TOKEN_PROBE)).toBe(-1)
    expect(bodyText).not.toContain(PUSH_TOKEN_PROBE.slice(0, 20))
    // 2) DOM 源（含 title / data-* 属性）零命中
    const html = await page.content()
    expect(html.indexOf(PUSH_TOKEN_PROBE)).toBe(-1)
    // 3) 任何 title 属性都不得含明文
    const titles = await page.$$eval('[title]', (nodes) =>
      nodes.map((node) => node.getAttribute('title') ?? '').join('|')
    )
    expect(titles).not.toContain(PUSH_TOKEN_PROBE)
    // 4) Web Storage 里也不得落明文
    expect(await storageText(page)).not.toContain(PUSH_TOKEN_PROBE)
    // 5) 正向：只展示不可逆指纹（md5 前 8 位 + 原长标记）
    await expect(page.getByText(`:${PUSH_TOKEN_PROBE.length}`)).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// ② / ③ 无权限拒绝链
// ---------------------------------------------------------------------------

test.describe('FULL-04 无权限拒绝链', () => {
  test('ops_admin（只读）：可读不可写；全程 0 个写请求、0 个 secret', async ({ page }) => {
    const state = freshState('readonly')
    await installGovernanceRoutes(page, state)
    await login(page)
    await openGovernance(page)
    await openDetail(page)

    // 可读（读面正常渲染）
    await expect(page.getByTestId('credential-panel')).toBeVisible()

    // 写入口全部 disabled（锁 1：渲染层）
    await expect(page.getByTestId('governance-readonly-hint')).toBeVisible()
    await expect(page.getByTestId('credential-readonly-hint')).toBeVisible()
    await expect(page.getByTestId('credential-issue')).toBeDisabled()
    await expect(page.getByTestId('lifecycle-to-disabled')).toBeDisabled()
    await expect(page.getByTestId('application-scope-save')).toBeDisabled()
    await expect(page.getByTestId('grant-create-submit')).toBeDisabled()

    // 点 disabled 按钮：不打开二次确认、不发请求（浏览器原生 disabled 语义）
    await page.getByTestId('credential-issue').click({ force: true })
    await expect(page.getByRole('alertdialog')).toHaveCount(0)

    // 锁 2（请求层）：整个只读会话 0 个写请求（服务层 assertWriteAllowed 在发请求前拒绝）
    expect(state.writeCalls).toEqual([])
    await expect(page.getByTestId('secret-once-value')).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toContain(ISSUED_SECRET)
    expect(await storageText(page)).not.toContain(ISSUED_SECRET)

    // 无权限会话同样 0 次 internal / v1 请求（INV-2/INV-3）
    expect(state.internalCalls).toEqual([])
  })

  test('服务端 403（可写角色被拒）：页面显示失败，不产生任何成功态或一次性 secret', async ({ page }) => {
    const state = freshState('super')
    state.serverDeniesWrites = true
    await installGovernanceRoutes(page, state)
    await login(page)
    await openGovernance(page)
    await openDetail(page)

    await confirmAction(page, 'credential-issue')
    await expect(page.getByTestId('credential-action-error')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('credential-action-error')).toContainText('权限')
    // 被拒时绝不出现一次性 secret 面板，也不出现凭证行
    await expect(page.getByTestId('secret-once-value')).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toContain(ISSUED_SECRET)
    // 写请求确实发出并被服务端拒绝（证明拒绝来自服务端而非前端误判）
    expect(state.writeCalls.length).toBeGreaterThan(0)
  })

  test('audit_admin（无 enterprise_business 权限）：直链 /enterprise/applications 被拒到 /forbidden', async ({
    page,
  }) => {
    const state = freshState('none')
    await installGovernanceRoutes(page, state)
    await login(page)
    await page.goto('/enterprise/applications')

    await expect(page).toHaveURL(/\/forbidden$/)
    await expect(page.locator('[data-page="enterprise-applications"]')).toHaveCount(0)

    // 拒绝发生在 UI 门；即便直访详情页同样被拒
    await page.goto(`/enterprise/applications/${APP}?org_id=${ORG}`)
    await expect(page).toHaveURL(/\/forbidden$/)
    expect(state.writeCalls).toEqual([])
    expect(state.internalCalls).toEqual([])
  })
})
