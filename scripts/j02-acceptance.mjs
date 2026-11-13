#!/usr/bin/env node
// J02-c: offline plan -> read-only preflight -> explicitly approved, single run.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import {
  CLEANUP, MODULES, OPERATIONS, REQUIRED_BACKEND_COMMIT, digest, sha256,
  validateApproval, validateBrowserEnvironment, validateResult, validateRuntime, validateTarget,
} from './j02-contract.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const hashFile = file => sha256(fs.readFileSync(file))
function writeJson(file, value, flag = 'w') {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag, mode: 0o600 })
}
function git(dir, args) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
function privateDir(dir) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700) }

export function sourceFingerprint(dir) {
  const files = execFileSync('git', ['-C', dir, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  return digest([...new Set(files)].sort().map(file => {
    const full = path.join(dir, file)
    return [file, fs.existsSync(full) ? hashFile(full) : 'DELETED']
  }))
}

export function buildPlan(t) {
  validateBrowserEnvironment(process.env)
  validateTarget(t)
  assert.equal(git(ROOT, ['rev-parse', 'HEAD']), t.frontend_sha, 'frontend checkout SHA differs from target')
  assert.equal(git(t.backend.source_dir, ['rev-parse', 'HEAD']), t.backend.sha, 'backend source checkout SHA differs from target')
  git(t.backend.source_dir, ['diff', '--exit-code', 'HEAD', '--'])
  // Fails on insufficient shallow history as well as a missing required fix.
  git(t.backend.source_dir, ['merge-base', '--is-ancestor', REQUIRED_BACKEND_COMMIT, t.backend.sha])
  assert.equal(fs.realpathSync(t.backend.release_dir), t.backend.release_dir, 'use the canonical release directory (no moving current symlink)')
  const receipt = path.join(t.backend.release_dir, 'delivery-build/build.env')
  assert.equal(/^SOURCE_SHA=([a-f0-9]{40})$/m.exec(fs.readFileSync(receipt, 'utf8'))?.[1], t.backend.sha, 'release build receipt SOURCE_SHA mismatch')
  const versions = fs.readdirSync(path.join(t.backend.source_dir, 'priv/migrations'))
    .filter(x => /^\d{8}_.*\.up\.sql$/.test(x)).map(x => Number(x.slice(0, 8))).sort((a, b) => a - b)
  assert(versions.length && new Set(versions).size === versions.length, 'invalid migration file set')
  return {
    schema_version: 1,
    target: t,
    frontend_tree_sha256: sourceFingerprint(ROOT),
    backend_source_tree_sha256: sourceFingerprint(t.backend.source_dir),
    release_receipt_sha256: hashFile(receipt),
    release_file_manifest_sha256: hashFile(path.join(t.backend.release_dir, 'BUILD_FILES.sha256')),
    isolation_evidence_sha256: hashFile(t.isolation.evidence_file),
    node_version: process.version,
    playwright_version: readJson(path.join(ROOT, 'node_modules/@playwright/test/package.json')).version,
    lockfile_sha256: hashFile(path.join(ROOT, 'bun.lock')),
    expected_migrations: versions,
    selection: { config: 'playwright.j02-real.config.ts', file: 'tests/e2e/j02-role-permission-lifecycle.spec.ts', grep: 'J02-c ', project: 'j02-real-chromium', workers: 1, retries: 0, repeat_each: 1 },
    entities: { account: `j02_admin_${t.run_id}`, role: `j02_role_${t.run_id}` },
    operations: OPERATIONS,
    cleanup: CLEANUP,
    risks: [
      'This test changes instance-global encrypted RBAC config; a separate organization is not isolation.',
      'Login and browser UX may write metadata/audit data. Failure can leave partial data.',
      'A disposable name or checkbox is not independent evidence of exclusive ownership.',
      'Automated pass does not prove cleanup. Whole-environment disposal stays pending.',
    ],
  }
}

function paths(t) {
  const dir = path.join(ROOT, 'test-results/j02', t.run_id)
  return { dir, plan: path.join(dir, 'plan.json'), summary: path.join(dir, 'summary.json') }
}
function checkedPlan(t) {
  const p = paths(t)
  const saved = readJson(p.plan)
  assert.equal(digest(saved), digest(buildPlan(t)), 'target, build, source, or tooling changed: prepare a new plan and approval')
  return saved
}

export function verifyRelease(root) {
  const checked = new Set()
  for (const line of fs.readFileSync(path.join(root, 'BUILD_FILES.sha256'), 'utf8').trim().split('\n')) {
    const match = /^([a-f0-9]{64}) [ *](.+)$/.exec(line)
    assert(match, 'invalid BUILD_FILES.sha256 line')
    const file = path.resolve(root, match[2])
    assert(file.startsWith(root + path.sep), 'release manifest path escapes root')
    assert(fs.realpathSync(file).startsWith(root + path.sep), 'release symlink escapes root')
    assert.equal(hashFile(file), match[1], `release file digest mismatch: ${match[2]}`)
    checked.add(file)
  }
  for (const file of ['bin/imboy', 'delivery-build/build.env']) assert(checked.has(path.join(root, file)), `unverified release file: ${file}`)
  for (const module of MODULES) assert([...checked].some(x => x.endsWith(`/ebin/${module}.beam`)), `missing verified BEAM: ${module}`)
  return checked
}

export async function preflight(plan) {
  const t = plan.target
  const checked = verifyRelease(t.backend.release_dir)
  // Existing release eval only: no start, migrate, setup/seed, login or readiness script.
  // Use the reviewed external config selectors; never inherit a different VMARGS_PATH.
  let raw
  try {
    raw = execFileSync(path.join(t.backend.release_dir, 'bin/imboy'),
      ['eval', fs.readFileSync(path.join(ROOT, 'scripts/j02-runtime-probe.eval'), 'utf8')],
      { cwd: t.backend.release_dir, env: { ...process.env, VMARGS_PATH: t.backend.vm_args_file, RELX_CONFIG_PATH: t.backend.sys_config_file }, encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    throw new Error('Read-only release RPC failed; inspect the isolated node locally. Raw runtime output is not printed.')
  }
  const lines = raw.split(/\r?\n/).filter(x => x.startsWith('J02_RUNTIME_JSON='))
  assert.equal(lines.length, 1, 'missing or ambiguous runtime receipt')
  const runtime = JSON.parse(lines[0].slice('J02_RUNTIME_JSON='.length))
  validateRuntime(runtime, t, plan.expected_migrations)
  for (const module of Object.values(runtime.modules)) assert(checked.has(module.path), 'running BEAM is absent from the verified build manifest')
  // Pair the RPC node with the actual HTTP listener selected for the Vite proxy.
  const response = await fetch(`${t.backend.url}/healthz`, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200, 'approved backend is not ready')
  const health = await response.json()
  assert.equal(health.status, 'ok', 'backend health not ok')
  assert.equal(health.db, 'up', 'backend DB not ready')
  assert.equal(health.tsid, 'ready', 'backend TSID generator not ready')
  assert.deepEqual(health.nodes, [t.backend.node], 'HTTP target differs from the dedicated RPC node')
  assert.equal(health.version, runtime.version, 'HTTP/RPC application versions differ')
  // Check the exact lockfile-managed browser exists; do not auto-install or substitute it.
  const { chromium } = await import(pathToFileURL(path.join(ROOT, 'node_modules/playwright/index.mjs')).href)
  const browser = chromium.executablePath()
  assert(fs.existsSync(browser), 'Install the lockfile-matched Chromium before requesting execution')
  let browserVersion
  try {
    const instance = await chromium.launch({ headless: true })
    try { browserVersion = instance.version() } finally { await instance.close() }
  } catch {
    throw new Error('Lockfile-matched headless Chromium could not launch; install its browser and host dependencies before acceptance.')
  }
  return { schema_version: 1, state: 'READ_ONLY_PREFLIGHT_PASS', observed_at: new Date().toISOString(), plan_sha256: digest(plan), runtime, health, browser_executable: browser, browser_version: browserVersion }
}

export function childEnvironment(plan, env = process.env) {
  const t = plan.target
  const clean = {}
  // Do not inherit VITE_*, NODE_OPTIONS, proxy switches, .env.e2e, storage states, or external browser executables.
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TERM']) if (env[key]) clean[key] = env[key]
  for (const key of ['IMBOY_ADMIN_E2E_SUPER_PASSWORD', 'IMBOY_ADMIN_E2E_NEW_ADMIN_PASSWORD']) {
    assert(typeof env[key] === 'string' && env[key].trim().length >= 6, `${key} is required; use a private environment file`)
    clean[key] = env[key]
  }
  assert.notEqual(clean.IMBOY_ADMIN_E2E_SUPER_PASSWORD, clean.IMBOY_ADMIN_E2E_NEW_ADMIN_PASSWORD, 'use distinct test passwords')
  return { ...clean,
    CI: '1',
    IMBOY_J02_RUN_ID: t.run_id,
    IMBOY_J02_APPROVAL_DIGEST: digest(plan),
    IMBOY_ADMIN_E2E_SUPER_ACCOUNT: t.super_account,
    IMBOY_ADMIN_E2E_BASE_URL: t.frontend_url,
    IMBOY_ADMIN_E2E_NEW_ROLE_PREFIX: 'j02_role',
    IMBOY_ADMIN_E2E_NEW_ADMIN_PREFIX: 'j02_admin',
    VITE_PROXY_TARGET: t.backend.url,
    VITE_API_BASE_URL: '/api/adm',
    VITE_SIDEBAR_CONFIG_URL: '/api/adm/admin/config/sidebar',
    VITE_UX_EVENT_REPORT_URL: '/api/adm/admin/ux/events',
    VITE_FEEDBACK_WORKFLOW_CONFIG_URL: '/api/adm/admin/config/feedback-workflow',
    VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL: '/api/adm/admin/config/feedback-workflow',
  }
}

function readEvidence(report, out) {
  const attachments = []
  function walk(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? [])
        attachments.push(...(result.attachments ?? []).filter(x => x.name === 'j02-c-evidence' && x.contentType === 'application/json'))
      walk(suite.suites)
    }
  }
  walk(report.suites)
  assert.equal(attachments.length, 1, 'exactly one sanitized J02-c evidence attachment is required')
  const attachment = attachments[0]
  if (attachment.body) return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'))
  const file = path.resolve(ROOT, attachment.path)
  assert(fs.realpathSync(file).startsWith(out + path.sep), 'evidence attachment outside this run directory')
  return readJson(file)
}

async function execute(plan, approvalFile) {
  const t = plan.target, p = paths(t)
  const approval = readJson(approvalFile)
  validateApproval(approval, plan)
  const env = childEnvironment(plan)
  assert(!fs.existsSync(path.join(p.dir, 'execution-started.json')), 'run_id already consumed; inspect/clean the old environment before a new approved run')
  const before = await preflight(plan)
  writeJson(path.join(p.dir, 'preflight.json'), before)
  checkedPlan(t) // Fail if code or target changed during read-only checks.
  validateApproval(approval, plan) // The approval may have expired during preflight.
  assert(!fs.existsSync(path.join(p.dir, 'playwright.json')), 'old Playwright output exists; refuse evidence reuse')
  writeJson(path.join(p.dir, 'approval.json'), approval, 'wx')
  writeJson(path.join(p.dir, 'execution-started.json'), { started_at: new Date().toISOString(), plan_sha256: digest(plan) }, 'wx')
  const running = { schema_version: 1, scope: 'REAL_BACKEND', verdict: 'INCOMPLETE', evidence_state: 'REAL_NOT_PASSED', run_id: t.run_id, plan_sha256: digest(plan), cleanup_status: 'PENDING_EXTERNAL_DISPOSAL' }
  writeJson(p.summary, running)
  const log = fs.openSync(path.join(p.dir, 'runner.log'), 'wx', 0o600)
  let exitCode
  try {
    exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['node_modules/playwright/cli.js', 'test', '--config=playwright.j02-real.config.ts'],
        { cwd: ROOT, env, stdio: ['ignore', log, log] })
      const stop = () => child.kill('SIGTERM')
      process.once('SIGINT', stop); process.once('SIGTERM', stop)
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop)
        resolve(signal ? 130 : code ?? 1)
      })
    })
  } finally { fs.closeSync(log) }
  try {
    const report = readJson(path.join(p.dir, 'playwright.json'))
    const evidence = readEvidence(report, p.dir)
    validateResult(report, evidence, plan, exitCode)
    checkedPlan(t)
    writeJson(path.join(p.dir, 'j02-c-evidence.json'), evidence)
    writeJson(p.summary, { ...running, verdict: 'PASS', evidence_state: 'REAL_PASS', finished_at: new Date().toISOString(), exit_code: exitCode })
    console.log(`REAL_PASS: ${p.summary}\nCleanup is still PENDING_EXTERNAL_DISPOSAL.`)
  } catch {
    writeJson(p.summary, { ...running, verdict: 'FAIL', finished_at: new Date().toISOString(), exit_code: exitCode })
    throw new Error(`Real execution did not meet acceptance. Inspect private artifacts at ${p.dir}; partial writes may exist. Cleanup is pending.`)
  }
}

export async function main(args) {
  const [mode, targetFile, approvalFile] = args
  assert(['plan', 'preflight', 'run'].includes(mode) && targetFile && args.length === (mode === 'run' ? 3 : 2),
    'Usage: node scripts/j02-acceptance.mjs plan|preflight TARGET.json | run TARGET.json APPROVAL.json')
  assert(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js >=22 required')
  const t = validateTarget(readJson(targetFile)), p = paths(t)
  if (mode === 'plan') {
    const plan = buildPlan(t)
    privateDir(p.dir)
    assert(!fs.existsSync(path.join(p.dir, 'execution-started.json')), 'run_id already consumed')
    if (fs.existsSync(p.plan)) assert.equal(digest(readJson(p.plan)), digest(plan), 'run_id has a different plan; choose a new run_id')
    else writeJson(p.plan, plan, 'wx')
    const review = `# J02-c 执行审批 / Execution review\n\n- State: NOT_RUN\n- Plan SHA-256: ${digest(plan)}\n- Instance: ${t.isolation.instance_id}\n- Frontend: ${t.frontend_url} (${t.frontend_sha})\n- Backend: ${t.backend.url} (${t.backend.sha})\n- Node: ${t.backend.node}\n- PostgreSQL: ${t.database.host}:${t.database.port}/${t.database.name} as ${t.database.user}\n- New account: ${plan.entities.account}\n- New role: ${plan.entities.role}\n- Isolation evidence SHA-256: ${plan.isolation_evidence_sha256}\n\n## Operations / 操作\n\n${OPERATIONS.map(x => '- ' + x).join('\n')}\n\n## Cleanup / 清理范围\n\n${CLEANUP.map(x => '- ' + x).join('\n')}\n\nOwner: ${t.cleanup.owner}\nProcedure: ${t.cleanup.procedure}\n\n## Risks / 风险\n\n${plan.risks.map(x => '- ' + x).join('\n')}\n\nCreating this plan is NOT approval. Show this review and plan.json to the human approver before run.\n`;
    fs.writeFileSync(path.join(p.dir, 'review.md'), review, { mode: 0o600 })
    writeJson(p.summary, { scope: 'NOT_RUN', verdict: 'NOT_RUN', evidence_state: 'NOT_RUN', run_id: t.run_id, plan_sha256: digest(plan), cleanup_status: 'NOT_STARTED' })
    console.log(review)
    return
  }
  const plan = checkedPlan(t)
  if (mode === 'preflight') {
    const receipt = await preflight(plan)
    writeJson(path.join(p.dir, 'preflight.json'), receipt)
    console.log(`READ_ONLY_PREFLIGHT_PASS; J02-c remains NOT_RUN. Plan: ${digest(plan)}`)
    return
  }
  await execute(plan, approvalFile)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    // Never dump child-process objects/stdout/stderr, which may include secrets.
    const message = error instanceof assert.AssertionError ? error.message.split('\n')[0] :
      error instanceof Error && !('stdout' in error) && !('stderr' in error) ? error.message : 'Local verification failed; inspect the approved source/build paths.'
    console.error(`J02 BLOCKED/FAILED: ${message}`)
    process.exitCode = 1
  })
}
