/**
 * SC-E2E — 静态合同测试（FIXTURE_ONLY 即跑；无需 backend / docker / nginx）。
 *
 * 两类静态 oracle：
 *   1. 渲染产物合同：harness --print-config-only 渲染的 nginx 模板文本逐条实现
 *      SC-OPS 合同（/seat/ 动态 frame、四组精确 API 白名单、无全量 /api/v1/ 代理、
 *      seat-assets 缓存头、SSE buffering off、网关零注入 CSP/XFO）；
 *   2. snippet 合同：宿主页 fixture 嵌入的 iframe 与计划 §1.1 冻结片段逐属性一致
 *      （sandbox 精确三值、no-referrer、零凭证标记），且三张宿主页共用同一
 *      public id（origin 轮换/负例不改 snippet）。
 *   3. 种子↔常量↔宿主页一致性：同一段 TSID 在 seed SQL、helpers/env.ts、
 *      host fixtures 三处同源（防止漂移出「测试测错了行」的假绿）。
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { ALLOWED_ORIGIN, CONSOLE_PUBLIC_ID, CS_ORIGIN, IFRAME_SANDBOX_EXACT, ORG_ID, WIDGET_PUBLIC_ID, WORKSPACE_ID } from './helpers/env'

const ROOT = process.cwd()
const HERE = path.join(ROOT, 'tests/e2e/customer-service-seat-embed')
const HARNESS = path.join(HERE, 'fixtures/harness-seat-embed.sh')

function renderNginxConf(): string {
  // 非零退出直接抛（execFileSync），断言 exit 0 由调用点先行包裹。
  return execFileSync('bash', [HARNESS, '--print-config-only'], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  })
}

function readFixture(name: string): string {
  return readFileSync(path.join(HERE, 'fixtures', name), 'utf8')
}

/** 抽取 host page 中第一个 <iframe ...> 标签原文（先剥 HTML 注释，注释里的合同文档片段不参与）。 */
function iframeTag(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '')
  const m = /<iframe\b[\s\S]*?>/i.exec(withoutComments)
  expect(m, '宿主页必须含 <iframe> 嵌入标签').toBeTruthy()
  return m![0]
}

function attrValue(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)
  return m === null ? null : m[1]
}

// ---------------------------------------------------------------------------
// 1. 渲染产物合同（nginx 模板 = SC-OPS 合同的本地等价实现）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 静态合同：harness 渲染的 nginx 模板', () => {
  let conf: string

  test.beforeAll(() => {
    conf = renderNginxConf() // 非零退出 → beforeAll 失败 → 本组用例失败（如实暴露）
  })

  test('S1 --print-config-only exit 0 且两次渲染逐字节一致（模板生成确定性）', () => {
    const again = renderNginxConf()
    expect(again, '两次渲染必须逐字节一致（幂等模板，无随机路径泄漏进文本）').toBe(conf)
    expect(conf.length).toBeGreaterThan(500)
  })

  test('S2 /seat/ 动态 frame 代理存在且指向 backend；网关零注入 CSP/XFO', () => {
    expect(conf).toMatch(/location \^~ \/seat\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:9801;/)
    // 网关不添加任何影响 frame 嵌入的头（多 CSP 浏览器取交集；XFO 由 backend 逐路径豁免）
    expect(conf).not.toMatch(/add_header\s+Content-Security-Policy/i)
    expect(conf).not.toMatch(/add_header\s+X-Frame-Options/i)
    // server 级收紧头仍在（HSTS/nosniff/Referrer-Policy 与生产同强度）
    expect(conf).toMatch(/add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/)
    expect(conf).toMatch(/add_header X-Content-Type-Options nosniff always;/)
    expect(conf).toMatch(/add_header Referrer-Policy strict-origin-when-cross-origin always;/)
  })

  test('S3 四组 Seat API 精确代理齐全；不存在全量 /api/v1/ 代理', () => {
    expect(conf).toMatch(/location \/api\/v1\/cs\/ \{[^}]*proxy_pass/)
    expect(conf).toMatch(/location \/api\/v1\/passport\/qr_login\/ \{[^}]*proxy_pass/)
    expect(conf).toMatch(/location \/api\/v1\/enterprise\/conversations\/ \{[^}]*proxy_pass/)
    expect(conf).toMatch(/location \/api\/v1\/enterprise\/organizations\/ \{[^}]*proxy_pass/)
    // 全量代理禁令：不得出现裸 `/api/v1/` 前缀 location（漏一个字都算放大攻击面）
    expect(conf).not.toMatch(/location\s+\/api\/v1\/\s*\{/)
  })

  test('S4 Seat SSE 与 Widget SSE buffering/cache off + 长超时；普通 API 不误套', () => {
    // Widget SSE（既有行为回归不变）
    expect(conf).toMatch(/location ~ \^\/api\/v1\/cs\/widget\/sessions\/\[0-9A-Za-z_-\]\+\/events\$ \{[\s\S]*?proxy_buffering off; proxy_cache off;[\s\S]*?proxy_read_timeout 3600s;/)
    // Seat SSE：/api/v1/cs/organizations/:org/seats/me/events
    expect(conf).toMatch(/location ~ \^\/api\/v1\/cs\/organizations\/\[0-9A-Za-z_-\]\+\/seats\/me\/events\$ \{[\s\S]*?proxy_buffering off; proxy_cache off;[\s\S]*?proxy_read_timeout 3600s;/)
  })

  test('S5 seat-assets 稳定别名 no-cache must-revalidate；/assets/ immutable；缓存头只在静态面', () => {
    expect(conf).toMatch(/location \/seat-assets\/ \{ add_header Cache-Control "no-cache, must-revalidate" always;/)
    expect(conf).toMatch(/location \/assets\/ \{ add_header Cache-Control "public, max-age=31536000, immutable" always;/)
    // cs.test 网关 vhost 内不得叠加缓存头（静态容器/静态面是缓存头唯一来源）
    const csVhost = conf.slice(conf.indexOf('server_name cs.test'))
    expect(csVhost).not.toMatch(/add_header Cache-Control/i)
  })

  test('S6 五域 vhost 齐全（cs/shop/shop2/evil/admin）+ admin 面仅反代 /api/ 与 SPA fallback', () => {
    for (const host of ['cs.test', 'shop.test', 'shop2.test', 'evil.test', 'admin.test']) {
      expect(conf, `server_name ${host} 缺失`).toMatch(new RegExp(`server_name ${host};`))
    }
    expect(conf).toMatch(/server_name admin\.test;[\s\S]*?location \/api\/ \{[^}]*proxy_pass[\s\S]*?try_files \$uri \/index\.html;/)
  })
})

// ---------------------------------------------------------------------------
// 2. snippet 合同（计划 §1.1 冻结片段的逐属性断言）
// ---------------------------------------------------------------------------
test.describe('SC-E2E 静态合同：宿主 iframe snippet', () => {
  test('S7 shop.test 宿主页：sandbox 精确三值 + no-referrer + 零凭证标记 + src 域名映射', () => {
    const html = readFixture('host-shop.html')
    const tag = iframeTag(html)
    // sandbox 精确相等（多一个少一个权限、顺序变化都算漂移）
    expect(attrValue(tag, 'sandbox')).toBe(IFRAME_SANDBOX_EXACT)
    expect(attrValue(tag, 'referrerpolicy')).toBe('no-referrer')
    expect(attrValue(tag, 'title')).toBe('IMBoy 客服工作台')
    // 模板占位符合同：src 由 harness 唯一映射替换（cs origin 与 public id 两个占位符）
    expect(attrValue(tag, 'src')).toBe('__SC153_CS_ORIGIN__/seat/__SC153_PUBLIC_ID__')
    expect(html).toMatch(/cs\.imboy\.pub/) // 映射说明必须在注释里留档
    // style 冻结：width:100%;height:100vh;border:0（商家可调高度，片段默认值不改）
    expect(attrValue(tag, 'style')).toBe('width:100%;height:100vh;border:0')
    // 零凭证标记：iframe 标签不得出现任何 token/secret 形态属性（公开 ID 非凭证）
    expect(tag).not.toMatch(/(authorization|bearer|token|jwt|secret|password|api[_-]?key)\s*=/i)
    // 无 script loader（V1 合同：只 iframe，不生成 loader）
    expect(html).not.toMatch(/<script[^>]*src=[^>]*seat/)

    // 替换 oracle：跑 harness --render-page（零副作用）拿运行时真正写出的页面，
    // 断言 src 解析为本地 cs origin + 种子 public id（生产 cs.imboy.pub 的唯一映射）。
    const rendered = execFileSync('bash', [HARNESS, '--render-page', 'host-shop.html'], {
      encoding: 'utf8',
      timeout: 30_000,
    })
    const renderedSrc = attrValue(iframeTag(rendered), 'src')
    expect(renderedSrc).toBe(`${CS_ORIGIN}/seat/${CONSOLE_PUBLIC_ID}`)
    // 替换不得残留任何占位符（漏替换 = 运行时 embed 指向字面占位符域）。
    expect(rendered).not.toContain('__SC153_')
  })

  test('S8 三张宿主页共用同一 snippet 与同一 public id（轮换/负例不改代码）', () => {
    const shop = iframeTag(readFixture('host-shop.html'))
    const shop2 = iframeTag(readFixture('host-shop2.html'))
    const evil = iframeTag(readFixture('host-evil.html'))
    const normalize = (tag: string): string => tag.replace(/\s+/g, ' ').trim()
    expect(normalize(shop2)).toBe(normalize(shop))
    expect(normalize(evil)).toBe(normalize(shop))
  })
})

// ---------------------------------------------------------------------------
// 3. 种子↔常量↔宿主页一致性
// ---------------------------------------------------------------------------
test.describe('SC-E2E 静态合同：种子 / 常量 / 宿主页同源', () => {
  test('S9 seed SQL 的 console 行与 env 常量同源（org/ws/public id/active/allowed_origins）', () => {
    const seed = readFileSync(path.join(HERE, 'fixtures/seed-seat-console.sql'), 'utf8')
    // INSERT ... INTO customer_service_seat_console 行：id/public id = CONSOLE_PUBLIC_ID，
    // org/ws 与常量一致，status='active'，allowed_origins 含合法宿主 origin。
    const row = /INSERT INTO customer_service_seat_console[\s\S]*?VALUES\s*\(([^;]+);/.exec(seed)
    expect(row, 'seed 必须包含 customer_service_seat_console 行').toBeTruthy()
    const values = row![1]
    expect(values).toContain(CONSOLE_PUBLIC_ID)
    expect(values).toContain(ORG_ID)
    expect(values).toContain(WORKSPACE_ID)
    expect(values).toContain(`'["${ALLOWED_ORIGIN}"]'::jsonb`)
    expect(values).toMatch(/'active'/)
    // 公开 ID 的幂等键：id 与 public_seat_console_id 同值（TSID 十进制串）
    expect(seed).toMatch(new RegExp(`INSERT INTO customer_service_seat_console[\\s\\S]*?\\nVALUES\\s*\\n?\\s*\\(${CONSOLE_PUBLIC_ID},`))
  })

  test('S10 访客链路 fixture 与种子 widget installation 同源（public_widget_id 一致）', () => {
    const seed = readFileSync(path.join(HERE, 'fixtures/seed-seat-console.sql'), 'utf8')
    expect(seed).toContain(WIDGET_PUBLIC_ID)
    const visitor = readFixture('host-visitor.html')
    expect(visitor).toContain('__SC153_WIDGET_ID__')
    expect(visitor).toContain('__SC153_CS_ORIGIN__')
  })

  test('S11 seat 客户端 API 白名单 ⊆ 网关四组代理（路径合同与 src 同源）', () => {
    // 真源：src/modules/customer_service/seat/seatApiClient.ts 的 ALLOWED 前缀族；
    // 网关四组必须完整覆盖（本测试只做静态一致性，不 import src 以免构建耦合）。
    const conf = renderNginxConf()
    const groups = [
      '/api/v1/cs/',
      '/api/v1/passport/qr_login/',
      '/api/v1/enterprise/conversations/',
      '/api/v1/enterprise/organizations/',
    ]
    for (const g of groups) {
      expect(conf, `网关缺 seat API 组 ${g}`).toContain(`location ${g} {`)
    }
  })
})
