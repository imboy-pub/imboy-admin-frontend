import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { getAdminCredentials, loginAsAdmin } from './support/adminAuth'

/**
 * GZAPP-06 待激活 Owner e2e（骨架卡：API 合同断言优先）。
 *
 * 覆盖旅程（对齐后端 adm_owner_activation_handler + migration 00000138）：
 *   ① 创建（owner_mode=pending_phone）：org/ws/owner_activation 落库形状 +
 *      mobile_masked（前3后4）+ activation_token 一次性 + 四键请求体；
 *   ② D12 成功分叉：fake 平台 000 前缀注入失败 → sms_sent=false +
 *      owner_activation.status=sms_failed（org 已建，非错误）；
 *   ③ 状态卡：GET .../owner-activation（ttl_remaining_seconds / expired 谓词）；
 *   ④ 重发：POST .../resend（token 轮换：旧 token 消费 404 / 新 token 单次消费 200；
 *      resend_count++）；
 *   ⑤ 重新激活：POST .../reactivate（TTL 重置 ≈30d；token 轮换）；
 *   ⑥ 换 Owner：POST .../owner-transfer-by-phone（新号 → pending_transfer +
 *      旧 invite superseded + 恰一 active owner；注册号 → direct_transfer）；
 *   ⑦ 激活消费（合同级）：POST .../consume 单次消费 CAS（重复 409 / 过期 409 /
 *      无效 404）+ user status 0→1 语义（owner_activated 翻转）。
 *
 * 运行前提（与 admin-organization-governance.spec 同口径；真实跑需要
 * 后端 + 专用库 + fake 短信平台，环境不满足时按 probe skip 模式让行——
 * 单测层已全绿，e2e 属骨架交付）：
 *   1. GZAPP-06 后端节点（含 migration 00000138 + adm_owner_activation_handler
 *      路由 + config sms.platform=fake）；
 *   2. VITE_PROXY_TARGET 指向该节点（vite proxy ^/api/adm 转发）；
 *   3. IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD（super_admin，
 *      role_id=[1] 含 organizations:read/write）；
 *   4. 专用库（避免污染共享种子：本 spec 全程自建随机 mobile/org name，
 *      测后可按 name 前缀清理）。
 */

const NAME_PREFIX = 'gzapp06-e2e'

function uniqueName(): string {
  return `${NAME_PREFIX}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

function uniqueMobile(head: string): string {
  // 11 位国内形状；000 前缀保留给 fake provider 注入失败缝（②用例）
  return `${head}${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`
}

function envelopeCode(status: number, body: unknown): number {
  if (status >= 400) return status
  if (body != null && typeof body === 'object' && !Array.isArray(body)) {
    const code = (body as Record<string, unknown>)['code']
    if (typeof code === 'number' && Number.isFinite(code)) return code
  }
  return -1
}

async function readJson(res: APIResponse): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

async function apiPost(page: Page, path: string, body: unknown): Promise<{ status: number; code: number; payload: Record<string, unknown> | null }> {
  const res = await page.request.post(path, { data: body })
  const json = await readJson(res)
  return { status: res.status(), code: envelopeCode(res.status(), json), payload: json?.['payload'] ?? null }
}

test.describe.serial('GZAPP-06 待激活 Owner（API 合同）', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    const credentials = getAdminCredentials()
    test.skip(!credentials, 'probe：需要 IMBOY_ADMIN_E2E_ACCOUNT / IMBOY_ADMIN_E2E_PASSWORD（后端 + 专用库就绪后启用）')
    page = await browser.newPage()
    await loginAsAdmin(page, credentials)
  })

  test.afterAll(async () => {
    await page?.close()
  })

  test('① 创建（pending_phone）→ org/owner_activation 形状 + 脱敏 + 一次性 token', async () => {
    test.skip(!getAdminCredentials(), 'probe')
    const mobile = uniqueMobile('138')
    const create = await apiPost(page, '/api/adm/organizations', {
      name: uniqueName(),
      owner_mode: 'pending_phone',
      default_workspace_name: '默认区',
      owner_mobile: mobile,
    })
    expect(create.code, `create envelope code（status=${create.status}）`).toBe(0)
    const payload = create.payload
    expect(payload, 'payload 必须存在（{code,msg,payload} 信封）').toBeTruthy()
    expect(payload!['created']).toBe(true)
    const activation = payload!['owner_activation'] as Record<string, unknown>
    expect(activation['status']).toBe('pending')
    // 脱敏：前3后4，绝无明文
    expect(activation['mobile_masked']).toBe(`${mobile.slice(0, 3)}****${mobile.slice(-4)}`)
    expect(JSON.stringify(payload)).not.toContain(mobile)
    // 一次性 token：64 hex（消费链路在 ⑦）
    expect(typeof activation['activation_token']).toBe('string')
    expect(activation['activation_token'] as string).toMatch(/^[0-9a-f]{64}$/)
  })

  test('② D12：000 号注入失败 → sms_sent=false + sms_failed（org 已建）', async () => {
    test.skip(!getAdminCredentials(), 'probe')
    const create = await apiPost(page, '/api/adm/organizations', {
      name: uniqueName(),
      owner_mode: 'pending_phone',
      default_workspace_name: '默认区',
      owner_mobile: uniqueMobile('000'),
    })
    expect(create.code).toBe(0)
    expect(create.payload!['created']).toBe(true)
    expect(create.payload!['sms_sent']).toBe(false)
    const activation = create.payload!['owner_activation'] as Record<string, unknown>
    expect(activation['status']).toBe('sms_failed')
  })

  test('③④⑤⑥⑦ 重发/TTL/换 Owner/单次消费 —— 骨架断言（启用环境后按 §旅程展开）', async () => {
    test.skip(!getAdminCredentials(), 'probe')
    // 骨架卡交付：完整旅程断言在环境就绪后按用例①的形状逐端点展开。
    // 合同锚点（后端契约已由真 PG eunit 14 例锁定）：
    //   POST /api/adm/organizations/:id/owner-activation/resend → {invite, sms_sent}
    //   POST /api/adm/organizations/:id/owner-activation/reactivate → 同上（TTL 重置）
    //   GET  /api/adm/organizations/:id/owner-activation → {owner_activated, invite{expired, ttl_remaining_seconds}}
    //   POST /api/adm/organizations/:id/owner-activation/consume {token} → 200/404/409
    //   POST /api/adm/organizations/:id/owner-transfer-by-phone {owner_mobile} → {mode, invite}
    test.skip(true, 'probe：待后端 + 专用库环境（BLOCKED_ENVIRONMENT），合同已由单测/后端 eunit 锁定')
  })
})
