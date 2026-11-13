// Offline safety/evidence checks only. These tests are NOT real J02-c acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import {
  MODULES, digest, sha256, validateApproval, validateBrowserEnvironment, validateResult, validateRuntime, validateTarget,
} from '../j02-contract.mjs'
import { ROOT, childEnvironment, verifyRelease } from '../j02-acceptance.mjs'

function target() {
  return {
    schema_version: 1, run_id: 'j02_guard_01', frontend_sha: 'a'.repeat(40), frontend_url: 'http://127.0.0.1:18082', super_account: 'j02_super@local.test',
    backend: { sha: 'b'.repeat(40), source_dir: '/test/source', release_dir: '/test/release', vm_args_file: '/test/conf/vm.args', sys_config_file: '/test/conf/sys.config', url: 'http://127.0.0.1:19821', node: 'j02_guard_01@127.0.0.1', environment: 'test', rsa_public_key_sha256: 'c'.repeat(64) },
    database: { host: '127.0.0.1', port: 55432, name: 'j02_j02_guard_01', user: 'j02_user', server_address: '127.0.0.1', server_port: 55432, major: 18, schema: 'public' },
    isolation: { instance_id: 'synthetic-fixture', owner: 'test', evidence_file: '/test/receipt.json', dedicated_backend: true, dedicated_database: true, fresh_database: true, test_only_keys: true, no_production_data: true, no_shared_cluster: true },
    cleanup: { strategy: 'dispose-entire-dedicated-environment', owner: 'test', procedure: 'Dispose synthetic fixture only' },
  }
}
function plan() { return { target: target(), frontend_tree_sha256: 'd'.repeat(64), operations: ['create R, create C, revoke R'] } }
function approval(p) {
  return { schema_version: 1, decision: 'APPROVED', scope: 'RUN_J02_C_ONCE', plan_sha256: digest(p), approved_by: 'synthetic-approver', approval_reference: 'offline-fixture-only', approved_at: '2026-11-13T00:00:00Z', expires_at: '2026-11-13T01:00:00Z' }
}
function runtime(t = target()) {
  return {
    environment: 'test', node: t.backend.node, connected_nodes: [], release_root: t.backend.release_dir,
    http: { ip: '127.0.0.1', port: 19821 }, login_rsa_public_key_sha256: t.backend.rsa_public_key_sha256,
    pg: { database: t.database.name, username: t.database.user, host: t.database.host, port: t.database.port },
    database: {
      identity: { database: t.database.name, username: t.database.user, server_address: t.database.server_address, server_port: t.database.port, server_version_num: 180006, transaction_read_only: 'on', is_replica: false },
      migrations: [{ version: 275, dirty: false }], history: [1, 103, 275].map(version => ({ version })),
      tables: Object.fromEntries(['adm_user', 'adm_role', 'config', 'adm_auth_epoch', 'organization'].map(key => [key, key])),
      prior_runs: { admins: 0, roles: 0 },
      extensions: ['timescaledb', 'pg_jieba', 'postgis', 'pgcrypto', 'citext'].map(extname => ({ extname, extversion: 'synthetic' })),
    },
    modules: Object.fromEntries(MODULES.map(name => [name, { loaded_md5: 'd'.repeat(32), disk_md5: 'd'.repeat(32), path: `/test/release/lib/imboy-v/ebin/${name}.beam` }])),
  }
}
function result(p = plan()) {
  return {
    report: { errors: [], stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 }, suites: [{ specs: [{ title: 'J02-c fixture', tests: [{ projectName: 'j02-real-chromium', expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0 }] }] }] }] },
    evidence: { evidence_kind: 'REAL_BACKEND_E2E', completed: true, run_id: p.target.run_id, approved_plan_sha256: digest(p), account: `j02_admin_${p.target.run_id}`, role_name: `j02_role_${p.target.run_id}`, admin_id: '9223372036854775806', role_id: '9223372036854775805' },
  }
}

test('target requires explicit isolation and exact safe origins', () => {
  assert.doesNotThrow(() => validateTarget(target()))
  for (const change of [
    t => { t.isolation.dedicated_database = false },
    t => { t.isolation.no_shared_cluster = false },
    t => { t.backend.environment = 'prod' },
    t => { t.frontend_url = 'https://admin.example.com' },
    t => { t.backend.url = 'http://127.0.0.1:19821?redirect=other' },
    t => { t.backend.url = 'http://user:secret@127.0.0.1:19821' },
    t => { t.database.name = 'shared_production' },
    t => { t.password = 'synthetic-do-not-store' },
    t => { t.run_id = '../other' },
  ]) { const t = target(); change(t); assert.throws(() => validateTarget(t)) }
})

test('approval is human-explicit, time-limited and bound to target/code/operations', () => {
  const p = plan(), now = Date.parse('2026-11-13T00:30:00Z')
  assert.doesNotThrow(() => validateApproval(approval(p), p, now))
  for (const change of [
    a => { a.decision = 'NOT_APPROVED' }, a => { a.scope = 'ANY_TEST' },
    a => { a.plan_sha256 = '0'.repeat(64) }, a => { a.approval_reference = '' },
    a => { a.expires_at = '2026-11-12T00:00:00Z' }, a => { a.expires_at = '2026-11-15T00:00:00Z' },
  ]) { const a = approval(p); change(a); assert.throws(() => validateApproval(a, p, now)) }
  const a = approval(p); p.frontend_tree_sha256 = 'e'.repeat(64)
  assert.throws(() => validateApproval(a, p, now))
})

test('runtime checks actual connection, migrations, loaded code and cluster membership', () => {
  assert.doesNotThrow(() => validateRuntime(runtime(), target(), [1, 103, 275]))
  for (const change of [
    r => { r.connected_nodes = ['shared@127.0.0.1'] },
    r => { r.database.identity.database = 'other' },
    r => { r.database.identity.transaction_read_only = 'off' },
    r => { r.database.migrations[0].dirty = true },
    r => { r.database.history.splice(1, 1) },
    r => { r.database.tables.adm_auth_epoch = null },
    r => { r.database.prior_runs.admins = 1 },
    r => { r.database.extensions = [] },
    r => { r.modules.adm_admin_handler.loaded_md5 = 'e'.repeat(32) },
    r => { r.modules.adm_admin_handler.path = '/another/release/adm_admin_handler.beam' },
    r => { r.http.ip = '0.0.0.0' },
  ]) { const r = runtime(); change(r); assert.throws(() => validateRuntime(r, target(), [1, 103, 275])) }
})

test('evidence rejects zero tests, mocks, skip, retry, expected failure and stale IDs', () => {
  const p = plan(), good = result(p)
  assert.doesNotThrow(() => validateResult(good.report, good.evidence, p, 0))
  for (const change of [
    x => { x.report.suites = [] },
    x => { x.report.suites[0].specs[0].title = 'setup-flow mock' },
    x => { x.report.suites[0].specs[0].tests[0].projectName = 'chromium' },
    x => { x.report.suites[0].specs[0].tests[0].expectedStatus = 'failed' },
    x => { x.report.suites[0].specs[0].tests[0].results[0].status = 'skipped' },
    x => { x.report.suites[0].specs[0].tests[0].results[0].retry = 1 },
    x => { x.report.stats.flaky = 1 },
    x => { x.evidence.completed = false },
    x => { x.evidence.run_id = 'old_run_000' },
    x => { x.evidence.admin_id = 9223372036854775806 },
    x => { x.evidence.account = 'unrelated-admin' },
  ]) { const x = result(p); change(x); assert.throws(() => validateResult(x.report, x.evidence, p, 0)) }
  assert.throws(() => validateResult(good.report, good.evidence, p, 1))
})

test('child process cannot inherit API overrides or browser/auth configuration', () => {
  const env = childEnvironment(plan(), {
    PATH: '/usr/bin', IMBOY_ADMIN_E2E_SUPER_PASSWORD: 'SyntheticSuper123', IMBOY_ADMIN_E2E_NEW_ADMIN_PASSWORD: 'SyntheticNew123',
    VITE_API_BASE_URL: 'https://production.invalid', VITE_ADMIN_CREATE_ENDPOINT: 'https://production.invalid/create',
    VITE_PROXY_TARGET: 'https://production.invalid', NODE_OPTIONS: '--require=unexpected.js',
    PLAYWRIGHT_EXECUTABLE_PATH: '/some-browser', HTTP_PROXY: 'http://unexpected.invalid', IMBOY_ADMIN_E2E_SUPER_ACCOUNT: 'production-admin',
  })
  assert.equal(env.VITE_API_BASE_URL, '/api/adm')
  assert.equal(env.VITE_PROXY_TARGET, plan().target.backend.url)
  assert.equal(env.IMBOY_ADMIN_E2E_SUPER_ACCOUNT, plan().target.super_account)
  for (const key of ['VITE_ADMIN_CREATE_ENDPOINT', 'NODE_OPTIONS', 'PLAYWRIGHT_EXECUTABLE_PATH', 'HTTP_PROXY']) assert.equal(env[key], undefined)
})

test('browser cache overrides cannot make preflight and execution inspect different binaries', () => {
  assert.doesNotThrow(() => validateBrowserEnvironment({}))
  for (const key of ['PLAYWRIGHT_BROWSERS_PATH', 'XDG_CACHE_HOME', 'PLAYWRIGHT_EXECUTABLE_PATH']) {
    assert.throws(() => validateBrowserEnvironment({ [key]: '/synthetic/override' }))
  }
})

test('build verification rejects altered or escaping files without executing them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'j02-release-guard-'))
  try {
    fs.mkdirSync(path.join(dir, 'bin')); fs.mkdirSync(path.join(dir, 'delivery-build'))
    fs.mkdirSync(path.join(dir, 'lib/imboy-v/ebin'), { recursive: true })
    const files = ['bin/imboy', 'delivery-build/build.env', ...MODULES.map(m => `lib/imboy-v/ebin/${m}.beam`)]
    for (const file of files) fs.writeFileSync(path.join(dir, file), 'synthetic fixture, never executable')
    const hashes = files.map(file => `${sha256(fs.readFileSync(path.join(dir, file)))}  ./${file}`).join('\n') + '\n'
    fs.writeFileSync(path.join(dir, 'BUILD_FILES.sha256'), hashes)
    assert.equal(verifyRelease(dir).size, files.length)
    fs.writeFileSync(path.join(dir, 'bin/imboy'), 'changed')
    assert.throws(() => verifyRelease(dir))
    fs.writeFileSync(path.join(dir, 'BUILD_FILES.sha256'), `${'0'.repeat(64)}  ../outside\n`)
    assert.throws(() => verifyRelease(dir))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('unfilled template and missing approval cannot start any real execution', () => {
  for (const args of [[], ['run', 'tests/e2e/fixtures/j02-target.example.json'], ['plan', 'tests/e2e/fixtures/j02-target.example.json']]) {
    const child = spawnSync(process.execPath, ['scripts/j02-acceptance.mjs', ...args], { cwd: ROOT, encoding: 'utf8' })
    assert.equal(child.status, 1)
    assert.match(child.stderr, /J02 BLOCKED\/FAILED/)
    assert.doesNotMatch(child.stdout, /REAL_PASS/)
  }
})
