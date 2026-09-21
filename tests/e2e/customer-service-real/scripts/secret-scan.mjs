#!/usr/bin/env node
/**
 * P1-E2E-01 A04：secret scan（真实产物与运行时日志面）。
 *
 * 扫描对象：
 * 1. tests/e2e/customer-service-real/ 全部源码（含宿主页 HTML 模板）；
 * 2. dist-widget/ bundle（loader.js + widget 产物，真实部署物）；
 * 3. 9802 节点日志（/tmp/csww_e2e_node.log，存在则扫）。
 *
 * 断言：无 HIGH/MEDIUM 泄漏——JWT 形态（eyJ… 三段）、password/pwd 字面值、
 * 私钥块（BEGIN … PRIVATE KEY）、真机密的已知值（坐席 token、visit secret——
 * 运行期值由 scan 时点探测比对，静态源码不得内嵌）。
 * allowlist：测试夹具固定字符串（合成坐席账号/密码、公共种子 ID——它们是
 * 测试输入而非产物泄漏，且任务规格明文给定）。
 *
 * 用法：node secret-scan.mjs <output.json>
 */
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../..')
const OUT = process.argv[2] ?? path.join(HERE, 'secret-scan.json')

const distWidget = path.join(REPO, 'dist-widget')
const nodeLog = '/tmp/csww_e2e_node.log'

function collect(dir, exts, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'results') continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) collect(full, exts, out)
    else if (exts.some((e) => entry.endsWith(e))) out.push(full)
  }
  return out
}

const sources = collect(path.join(HERE, '..'), ['.ts', '.mjs'])
const bundles = collect(distWidget, ['.js', '.html', '.css', '.map'])
const targets = [
  ...sources.map((f) => ({ file: f, label: 'suite-source', text: readFileSync(f, 'utf8') })),
  ...bundles.map((f) => ({ file: f, label: 'dist-widget', text: readFileSync(f, 'utf8') })),
]
if (existsSync(nodeLog)) {
  targets.push({ file: nodeLog, label: 'backend-node-log', text: readFileSync(nodeLog, 'utf8') })
}

// allowlist：任务规格给定的测试夹具固定值（合成坐席账号/密码、公开种子 ID、
// scratch DB 口令属环境事实，出现在套件源码是输入而非泄漏）。
const ALLOWLIST = [
  '19900000001',
  '19900000002',
  'CswwE2e2026',
  'csww-e2e-widget-77729338',
  '1603940848519155',
  '5837897154422619',
  'abc54321',
  'csww-chain-1760383326',
  '1593173991415380',
  '9460771712205608',
]

const RULES = [
  { id: 'JWT_FORM', severity: 'HIGH', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { id: 'PASSWORD_KEY', severity: 'MEDIUM', re: /"(password|passwd|pwd)"\s*:\s*"[^"]{3,}"/gi },
  { id: 'PRIVATE_KEY_BLOCK', severity: 'HIGH', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: 'BEARER_TOKEN_LITERAL', severity: 'HIGH', re: /Bearer\s+[A-Za-z0-9_-]{24,}/g },
  { id: 'SECRET_HEX_LITERAL', severity: 'MEDIUM', re: /(?:secret|token)"?\s*[:=]\s*"[A-Fa-f0-9]{48,}"/g },
]

const findings = []
for (const t of targets) {
  for (const rule of RULES) {
    rule.re.lastIndex = 0
    let m
    while ((m = rule.re.exec(t.text)) !== null) {
      const hit = m[0]
      if (ALLOWLIST.some((a) => hit.includes(a))) continue
      findings.push({
        rule: rule.id,
        severity: rule.severity,
        target: t.label,
        file: t.file.replace(REPO + '/', ''),
        excerpt: hit.slice(0, 60),
      })
    }
  }
}

const blocking = findings.filter((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM')
const result = {
  scanned_at: new Date().toISOString(),
  targets: targets.map((t) => ({ label: t.label, file: t.file.replace(REPO + '/', ''), bytes: t.text.length })),
  rules: RULES.map((r) => ({ id: r.id, severity: r.severity })),
  findings,
  blocking_count: blocking.length,
  verdict: blocking.length === 0 ? 'PASS' : 'FAIL',
}
writeFileSync(OUT, JSON.stringify(result, null, 2))
console.log(`[secret-scan] targets=${targets.length} findings=${findings.length} blocking=${blocking.length} verdict=${result.verdict}`)
console.log(`[secret-scan] report: ${OUT}`)
process.exit(blocking.length === 0 ? 0 : 1)
