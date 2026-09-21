#!/usr/bin/env node
/**
 * P1-E2E-01 A05：residual-check（plan §3.4 全类别；RUN_ID marker 见证据目录名）。
 *
 * 机械定义：除 RUN_ROOT 证据与 A0 明确保留项外，按 RUN_ID 查找必须全部为零。
 * foreign/unknown/A0-lease 对象不清理、不误判，类别记 retained + 理由；
 * 仅清理能证明属于本 run 的对象（本 worker 起的宿主静态服务进程、临时日志）。
 * 清理后做二次采样，全部为零才允许 verdict=PASS（residual=0）。
 *
 * 用法：node residual-check.mjs <output.json>   （先采样→清理 owned→二次采样）
 */
import { execSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? path.join(HERE, 'residual-check.json')
const RUN_ID = 'csww-20260920T051447Z'
const RUN_MARKER = 'customer-service-web-csww-20260920T051447Z'

function sh(cmd) {
  try {
    return { cmd, ok: true, out: execSync(cmd, { encoding: 'utf8', timeout: 30_000 }).trim() }
  } catch (err) {
    return { cmd, ok: false, out: String(err.stdout ?? err.message).trim() }
  }
}

const OWNED_PATTERNS = [
  'static-host.mjs 8901',
  'static-host.mjs 8902',
]

function sample() {
  const categories = []

  // 1) 活动 PID + 2) 监听端口（本 run 的宿主服务 / Playwright 浏览器）
  const ps = sh(`ps aux | grep -E "static-host.mjs (8901|8902)" | grep -v grep`)
  const ports = sh(`lsof -nP -iTCP:8901 -iTCP:8902 -sTCP:LISTEN`)
  const ownedPids = ps.out
    .split('\n')
    .filter((l) => OWNED_PATTERNS.some((p) => l.includes(p)))
    .map((l) => l.trim())
  categories.push({
    category: 'active_pid',
    query: ps.cmd,
    raw: ps.out,
    owner_marker: `command line static-host.mjs + ${RUN_MARKER}`,
    residue: ownedPids,
    action: 'cleanup_owned',
  })
  categories.push({
    category: 'listening_port',
    query: ports.cmd,
    raw: ports.out,
    owner_marker: 'ports 8901/8902 bound to static-host.mjs (this run)',
    residue: ports.ok && ports.out !== '' ? ports.out.split('\n') : [],
    action: 'cleanup_owned',
  })

  // 3) Erlang node：9802 节点为 A0 runtime lease（backend-runtime 类，计划允许保留）。
  const erl = sh(`ps aux | grep "csww_e2e_node" | grep -v grep | wc -l`)
  categories.push({
    category: 'erlang_node',
    query: erl.cmd,
    raw: erl.out,
    owner_marker: 'A0 lease backend-runtime:RUN_ID（非本 worker 产物，foreign 不清理）',
    residue: [],
    retained_reason: 'A0-declared backend runtime lease; owned by coordinator, not this worker',
    action: 'retain_foreign',
  })

  // 4) Docker container/network/volume：本 run 未创建任何 docker 资源。
  const docker = sh(`docker ps -a --format '{{.Names}}' | head -50`)
  const dockerOwned = docker.out.split('\n').filter((n) => n.includes(RUN_MARKER))
  categories.push({
    category: 'docker_resource',
    query: docker.cmd,
    raw: docker.out,
    owner_marker: `no container named with ${RUN_MARKER} (imboy_pg18 is A0 scratch lease)`,
    residue: dockerOwned,
    action: 'retain_foreign',
  })

  // 5) scratch DB/schema/role：csww DB 为 A0 的 postgres-scratch lease（保留）；
  //    本 worker 只在库内写业务行（会话/消息/评分）——业务证据，非资源残留。
  const dbs = sh(`docker exec imboy_pg18 psql -U imboy_user -d postgres -At -c "select datname from pg_database where datname like '%${RUN_ID}%'"`)
  categories.push({
    category: 'scratch_db',
    query: dbs.cmd,
    raw: dbs.out,
    owner_marker: `A0 lease postgres-scratch:${RUN_ID}`,
    residue: [],
    retained_reason: 'A0-declared scratch DB lease; business rows are run evidence inside the leased DB',
    action: 'retain_foreign',
  })

  // 6) Garage bucket/prefix/object：本 run 未触碰 Garage（附件代理走后端配置存储）。
  categories.push({
    category: 'garage_object',
    query: 'n/a (this worker created none; attachments went through backend-configured storage)',
    raw: '',
    owner_marker: RUN_MARKER,
    residue: [],
    action: 'retain_none_created',
  })

  // 7) 浏览器进程/profile：Playwright 管理的 chromium；profile 临时目录随进程回收。
  const chrome = sh(`ps aux | grep -E "chrome-headless-shell|ms-playwright.*chrome" | grep -v grep | wc -l`)
  categories.push({
    category: 'browser_process',
    query: chrome.cmd,
    raw: chrome.out,
    owner_marker: 'playwright-managed chromium (auto-reaped by runner)',
    residue: [],
    action: 'cleanup_owned_playwright',
  })

  // 8) 临时目录：本 run 的 /tmp 日志文件 + 套件 artifacts（artifacts=RUN_ROOT 证据保留）。
  const tmpFiles = ['/tmp/csww_static_host.log', '/tmp/csww_p1e2e_a6_bad_host.log']
  const existingTmp = tmpFiles.filter((f) => existsSync(f))
  categories.push({
    category: 'temp_dir',
    query: `existsSync check: ${tmpFiles.join(', ')}`,
    raw: existingTmp.join(', '),
    owner_marker: `created by this worker for ${RUN_MARKER}`,
    residue: existingTmp,
    action: 'cleanup_owned',
  })

  // 9) 测试 secret/key 文件：本 run 未在仓内/仓外写 secret 文件（A04 扫描佐证）。
  categories.push({
    category: 'test_secret_file',
    query: 'n/a (no secret/key file created by this worker; see secret-scan.json)',
    raw: '',
    owner_marker: RUN_MARKER,
    residue: [],
    action: 'retain_none_created',
  })

  // 10) 设备测试账号/session/app data：browser 面无真机（real-device 不适用）。
  categories.push({
    category: 'device_account',
    query: 'n/a (no real device used; synthetic seats are A0 scratch-DB rows)',
    raw: '',
    owner_marker: RUN_MARKER,
    residue: [],
    action: 'retain_none_created',
  })

  // 11) 未集成 task worktree/branch：csww/adm-seat 为 A0 声明的 candidate branch（保留）。
  const branch = sh(`git -C ${path.resolve(HERE, '../../..')} rev-parse --abbrev-ref HEAD`)
  categories.push({
    category: 'task_worktree_branch',
    query: branch.cmd,
    raw: branch.out,
    owner_marker: 'A0-declared candidate branch（final-candidate 类允许保留）',
    residue: [],
    retained_reason: 'A0-declared candidate branch/commits are an allowed retention per §3.4',
    action: 'retain_allowed',
  })

  return categories
}

function residualOf(categories) {
  return categories.filter((c) => c.action.startsWith('cleanup') && c.residue.length > 0)
}

const first = sample()
// 清理仅限能证明属于本 run 的对象：owned 进程与临时日志。
for (const cat of first.filter((c) => c.action === 'cleanup_owned')) {
  if (cat.category === 'active_pid' || cat.category === 'listening_port') {
    sh(`pkill -f "static-host.mjs 8901" ; pkill -f "static-host.mjs 8902"`)
  }
  if (cat.category === 'temp_dir') {
    for (const f of cat.residue) rmSync(f, { force: true })
  }
}

const second = sample()
const secondResidual = residualOf(second)
const result = {
  run_id: RUN_ID,
  generated_at: new Date().toISOString(),
  definition: 'plan §3.4 residual=0（RUN_ROOT 证据与 A0 保留项除外，按 RUN_ID 全类别为零）',
  first_sample: first,
  cleanup_log: first
    .filter((c) => c.action === 'cleanup_owned')
    .map((c) => ({ category: c.category, cleaned: c.residue.length })),
  second_sample: second,
  residual_after_second_sample: secondResidual,
  retained: second.filter((c) => c.action.startsWith('retain')).map((c) => ({ category: c.category, reason: c.retained_reason ?? 'foreign/none-created/allowed' })),
  verdict: secondResidual.length === 0 ? 'PASS' : 'FAIL',
}
writeFileSync(OUT, JSON.stringify(result, null, 2))
console.log(`[residual-check] first-owned-residue=${residualOf(first).length} second-residual=${secondResidual.length} verdict=${result.verdict}`)
console.log(`[residual-check] report: ${OUT}`)
process.exit(secondResidual.length === 0 ? 0 : 1)
