/**
 * SC-E2E — cs 网关收敛负例：治理端点经嵌入 origin 不可达（r3-B1，REVIEW-2 P2）。
 *
 * ⛔ EXECUTE-GATED：本文件全部用例 `SC153_E2E_EXECUTE=1` 才执行（与
 * journey.spec 同一门；FIXTURE_ONLY 阶段 0 条执行）。本文件只把断言写进
 * 合同，置门与执行由主线程串行阶段负责 —— 任何自动化不得在本文件内置位
 * SC153_E2E_EXECUTE。
 *
 * 被 测 合 同（r3-B1 网关收敛）：
 *   cs.test 网关（= 生产 cs.imboy.pub 本地等价）只放行坐席工作台实际调用面
 *   （contract.spec S3/S11/S12 冻结的 2 收敛正则 + 3 前缀 + 2 SSE 正则）；
 *   被收敛掉的整族前缀（/api/v1/cs/、/api/v1/enterprise/organizations/）之下的
 *   治理/访客端点，即使携带**有效 seat JWT** 直打网关，也必须不可达
 *   （网关 fail-closed 落静态 404；若 backend 防线先接住则为 403 —— 两者都算
 *   合同成立，但**绝不**允许 200/2xx 信封）。
 *
 * 与 journey.spec 的分工：journey 证明「该通的通」（正路 + 凭证卫生）；
 * 本文件证明「不该通的绝不通」（攻击面最小性的负例面）。正路可达性由本
 * 文件的正例控制组复核（防「网关整体宕机 → 全 404」的假绿）。
 *
 * 拓扑：cs.test:18443（harness 网关，见 fixtures/harness-seat-embed.sh）。
 */
import { expect, test } from '@playwright/test'
import { CS_ORIGIN, EXECUTE_ENABLED, ORG_ID, SEAT, seatPassportLogin, WORKSPACE_ID } from './helpers/env'

// ⛔ EXECUTE 阶段门（文件级：FIXTURE_ONLY 下本文件全部用例 skip）
test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: 主线程串行阶段 sets SC153_E2E_EXECUTE=1 after SC-INT PASS')

/** 会话内 seat JWT（beforeAll 经 passport/login 真实签发；只进 Authorization 头）。 */
let seatJwt = ''

test.beforeAll(async () => {
  seatJwt = await seatPassportLogin(SEAT.account)
  expect(seatJwt.length).toBeGreaterThan(0)
})

/** 样本 TSID（形状合法即可：网关在 backend 之前裁决，不要求真实存在）。 */
const SESSION_ID = '1700000000000001'
const CONVERSATION_ID = '1800000000000001'
const ASSET_ID = '1900000000000001'
const MEMBER_ID = '1700000000000002'
const MESSAGE_ID = '1900000000000002'

interface ProbeResult {
  status: number
  contentType: string
  body: string
}

async function probe(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET'): Promise<ProbeResult> {
  const res = await fetch(`${CS_ORIGIN}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${seatJwt}`,
      Accept: 'application/json',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    body: method === 'POST' ? '{}' : undefined,
    // A01 同纪律：负例探针也绝不携带 Cookie。
    credentials: 'omit',
  })
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    body: (await res.text()).slice(0, 500),
  }
}

// ---------------------------------------------------------------------------
// 1. 负例组：收敛后必须不可达的治理/访客端点（带有效 seat JWT 仍 403/404）
// ---------------------------------------------------------------------------
test.describe('r3-B1 网关收敛负例：治理面经 cs.test origin 携有效 seat JWT 不可达', () => {
  // —— enterprise/organizations 整族收敛掉的治理端点 ——
  test('N01 offboarding 案件创建（POST，REVIEW-2 P2 点名端点）不可达', async () => {
    const r = await probe(`/api/v1/enterprise/organizations/${ORG_ID}/offboarding`, 'POST')
    expect([403, 404], `状态=${r.status} body=${r.body}`).toContain(r.status)
  })

  test('N02 offboarding 案件列表/详情/执行族不可达', async () => {
    for (const p of [
      `/api/v1/enterprise/organizations/${ORG_ID}/offboarding/cases`,
      `/api/v1/enterprise/organizations/${ORG_ID}/offboarding/${SESSION_ID}`,
      `/api/v1/enterprise/organizations/${ORG_ID}/offboarding/${SESSION_ID}/execute`,
    ]) {
      const r = await probe(p)
      expect([403, 404], `${p} 状态=${r.status}`).toContain(r.status)
    }
  })

  test('N03 contacts / business-identities / members suspend 治理面不可达', async () => {
    for (const p of [
      `/api/v1/enterprise/organizations/${ORG_ID}/contacts`,
      `/api/v1/enterprise/organizations/${ORG_ID}/business-identities`,
      `/api/v1/enterprise/organizations/${ORG_ID}/members/${MEMBER_ID}/suspend`,
    ]) {
      const r = await probe(p)
      expect([403, 404], `${p} 状态=${r.status}`).toContain(r.status)
    }
  })

  test('N04 conversations 集合与 messages/:id/ack（非坐席调用形状）不可达', async () => {
    for (const [method, p] of [
      ['GET', `/api/v1/enterprise/organizations/${ORG_ID}/conversations`],
      ['POST', `/api/v1/enterprise/organizations/${ORG_ID}/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/ack`],
    ] as const) {
      const r = await probe(p, method)
      expect([403, 404], `${p} 状态=${r.status}`).toContain(r.status)
    }
  })

  test('N05 assets 裸资源路径（无 /content 后缀）不可达', async () => {
    const r = await probe(`/api/v1/enterprise/organizations/${ORG_ID}/assets/${ASSET_ID}`)
    expect([403, 404], `状态=${r.status}`).toContain(r.status)
  })

  // —— cs 整族收敛掉的治理/访客端点 ——
  test('N06 cs 席位治理面（seats 列表 / suspend）不可达', async () => {
    for (const [method, p] of [
      ['GET', `/api/v1/cs/organizations/${ORG_ID}/seats`],
      ['POST', `/api/v1/cs/organizations/${ORG_ID}/seats/${MEMBER_ID}/suspend`],
    ] as const) {
      const r = await probe(p, method)
      expect([403, 404], `${p} 状态=${r.status}`).toContain(r.status)
    }
  })

  test('N07 cs 团队 presence 列表（工作台无此调用点）不可达', async () => {
    const r = await probe(`/api/v1/cs/organizations/${ORG_ID}/seats/presence`)
    expect([403, 404], `状态=${r.status}`).toContain(r.status)
  })

  test('N08 shop-keys / visit-tokens 治理面不可达', async () => {
    for (const p of [
      `/api/v1/cs/organizations/${ORG_ID}/shop-keys`,
      `/api/v1/cs/organizations/${ORG_ID}/visit-tokens`,
    ]) {
      const r = await probe(p)
      expect([403, 404], `${p} 状态=${r.status}`).toContain(r.status)
    }
  })

  test('N09 seat-limit / stats 治理面不可达', async () => {
    for (const [method, p] of [
      ['PUT', `/api/v1/cs/organizations/${ORG_ID}/seat-limit`],
      ['GET', `/api/v1/cs/organizations/${ORG_ID}/stats/sessions`],
    ] as const) {
      const r = await probe(p, method)
      expect([403, 404], `${p} 状态=${r.status}`).toContain(r.status)
    }
  })

  test('N10 cs 访客面（sessions / messages / rating）不可达', async () => {
    for (const p of [
      '/api/v1/cs/sessions',
      `/api/v1/cs/sessions/${SESSION_ID}/messages`,
      `/api/v1/cs/sessions/${SESSION_ID}/rating`,
    ]) {
      const r = await probe(p)
      expect([403, 404], `${p} 状态=${r.status}`).toContain(r.status)
    }
  })

  test('N11 全量通配禁止：/api/v1/ 根与其余族不可达', async () => {
    for (const p of ['/api/v1/', '/api/v1/organizations', '/api/adm/organizations']) {
      const r = await probe(p)
      expect([403, 404], `${p} 状态=${r.status}`).toContain(r.status)
    }
  })

  test('N12 负例响应绝不携带成功信封（code 0 永不出现）', async () => {
    const r = await probe(`/api/v1/enterprise/organizations/${ORG_ID}/offboarding`, 'POST')
    let envelope: { code?: number } | null = null
    try {
      envelope = JSON.parse(r.body) as { code?: number }
    } catch {
      envelope = null // 非 JSON（静态 404 HTML）即天然无信封
    }
    expect(envelope?.code ?? 0).not.toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2. 正例控制组：允许集内的端点必须仍可达（防「网关宕机全 404」假绿）
// ---------------------------------------------------------------------------
test.describe('r3-B1 正例控制组：允许集端点经网关可达（backend JSON 信封，非静态 404）', () => {
  test('P01 seat-contexts（收敛正则 literal 段）可达且返回 JSON 信封', async () => {
    const r = await probe('/api/v1/cs/me/seat-contexts')
    expect(r.status, `状态=${r.status} body=${r.body}`).toBeLessThan(500)
    expect(r.contentType).toContain('application/json')
    const envelope = JSON.parse(r.body) as { code?: number }
    expect(envelope.code).toBe(0)
  })

  test('P02 queue / seats/me/presence（收敛正则子路径）可达', async () => {
    for (const p of [
      `/api/v1/cs/organizations/${ORG_ID}/sessions/queue?workspace_id=${WORKSPACE_ID}`,
      `/api/v1/cs/organizations/${ORG_ID}/seats/me/presence`,
    ]) {
      const r = await probe(p)
      expect(r.status, `${p} 状态=${r.status}`).toBeLessThan(500)
      expect(r.contentType, `${p} 必须是 backend JSON 而非静态 404`).toContain('application/json')
    }
  })

  test('P03 heartbeat POST（presence lease）可达', async () => {
    const r = await probe(`/api/v1/cs/organizations/${ORG_ID}/seats/me/heartbeat?workspace_id=${WORKSPACE_ID}`, 'POST')
    expect(r.status, `状态=${r.status}`).toBeLessThan(500)
    expect(r.contentType).toContain('application/json')
  })

  test('P04 访客面 /api/v1/cs/widget/* 既有前缀回归不变', async () => {
    const r = await probe('/api/v1/cs/widget/sessions')
    expect(r.status, `状态=${r.status}`).toBeLessThan(500)
    expect(r.contentType).toContain('application/json')
  })
})
