// J02-c acceptance contract. Pure checks: no login, network, or database writes.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const RUN_ID = /^[a-z0-9][a-z0-9_-]{7,47}$/
const SHA = /^[a-f0-9]{40}$/
const DIGEST = /^[a-f0-9]{64}$/
export const REQUIRED_BACKEND_COMMIT = 'b418ad52944b687e0b643431d5b7e5be82b9594d'
export const MODULES = [
  'adm_admin_handler', 'adm_passport_handler', 'adm_index_handler',
  'adm_role_handler', 'adm_acl', 'adm_user_repo', 'config_ds', 'imboy_env',
]
export const OPERATIONS = [
  'Log in with the dedicated super administrator (login metadata/session/audit may change).',
  'Create one role R with dashboard:view and organizations:read.',
  'Create one administrator C, assign R, and verify the exact account and lossless ID.',
  'Log in as C in a fresh browser context; verify initial RBAC, organization allow, admin-list deny.',
  'Save R with dashboard:view only; verify organization denial before and after reload.',
  'Recheck C identity, the exact role, and retained/revoked permissions; close browsers.',
]
export const CLEANUP = [
  'Stop the dedicated backend and dispose of the entire approved test database / isolated instance.',
  'Includes adm_user, adm_role, config keys adm_role_names/adm_role_descriptions/adm_role_permissions,',
  'login metadata, auth/audit/UX side effects, process caches and test-only keys/cookies.',
  'Keep sanitized evidence; do not auto-delete rows, restore shared config, or touch another instance.',
]

export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
  return value
}
export function digest(value) { return sha256(JSON.stringify(stable(value))) }

export function validateBrowserEnvironment(env) {
  for (const key of ['PLAYWRIGHT_BROWSERS_PATH', 'XDG_CACHE_HOME', 'PLAYWRIGHT_EXECUTABLE_PATH']) {
    assert(env[key] === undefined, `unset ${key}: J02 preflight and execution must use the same lockfile-managed browser location`)
  }
}

function text(value, label) {
  assert(typeof value === 'string' && value.trim() && !/[\r\n\0]/.test(value), `${label} is required`)
  assert(!/REPLACE|CHANGE_ME|ABSOLUTE_PATH/.test(value), `${label} still contains a placeholder`)
}
function absolute(value, label) { text(value, label); assert(value.startsWith('/'), `${label} must be absolute`) }
function localOrigin(value, label) {
  text(value, label)
  const url = new URL(value)
  assert(url.protocol === 'http:' && url.hostname === '127.0.0.1', `${label}: run on the isolated host using http://127.0.0.1`)
  assert(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', `${label}: origin only`)
  assert(url.port && Number(url.port) >= 1024 && Number(url.port) <= 65535, `${label}: explicit non-privileged port required`)
  assert(value === url.origin, `${label}: use the canonical origin, without a trailing slash`)
  return url
}

export function validateTarget(t) {
  assert.equal(t.schema_version, 1, 'target schema_version must be 1')
  assert(RUN_ID.test(t.run_id), 'run_id: 8–48 lowercase letters/digits/_/-')
  assert(SHA.test(t.frontend_sha), 'frontend_sha must be the exact reviewed checkout SHA')
  const front = localOrigin(t.frontend_url, 'frontend_url')
  const back = localOrigin(t.backend?.url, 'backend.url')
  assert.notEqual(front.port, back.port, 'frontend and backend ports must differ')
  assert(SHA.test(t.backend.sha), 'backend.sha must be an exact commit')
  absolute(t.backend.source_dir, 'backend.source_dir')
  absolute(t.backend.release_dir, 'backend.release_dir')
  absolute(t.backend.vm_args_file, 'backend.vm_args_file')
  absolute(t.backend.sys_config_file, 'backend.sys_config_file')
  assert.equal(t.backend.node, `${t.run_id}@127.0.0.1`, 'dedicated backend node must match run_id')
  assert(['test', 'local', 'dev'].includes(t.backend.environment), 'backend.environment must permit the test captcha')
  assert(DIGEST.test(t.backend.rsa_public_key_sha256), 'test RSA public-key fingerprint is required')
  assert.equal(t.database?.host, '127.0.0.1', 'database.host must be loopback on the isolated host')
  assert(Number.isInteger(t.database.port) && t.database.port >= 1024 && t.database.port <= 65535, 'database.port invalid')
  assert.equal(t.database.name, `j02_${t.run_id}`, 'database.name must be dedicated to this run_id')
  assert(/^[a-z][a-z0-9_]{0,62}$/.test(t.database.user), 'database.user must be an explicit test role')
  assert.equal(t.database.server_address, '127.0.0.1', 'database.server_address must be explicit loopback')
  assert.equal(t.database.server_port, t.database.port, 'direct local PostgreSQL connection required')
  assert(Number.isInteger(t.database.major) && t.database.major >= 15, 'database.major must be explicit')
  assert.equal(t.database.schema, 'public', 'this entry supports the reviewed public schema only')
  for (const key of ['dedicated_backend', 'dedicated_database', 'fresh_database', 'test_only_keys', 'no_production_data', 'no_shared_cluster']) {
    assert.equal(t.isolation?.[key], true, `isolation.${key} must be independently confirmed; a name is not proof`)
  }
  text(t.isolation.instance_id, 'isolation.instance_id')
  text(t.isolation.owner, 'isolation.owner')
  absolute(t.isolation.evidence_file, 'isolation.evidence_file')
  text(t.super_account, 'super_account')
  assert(t.super_account.startsWith('j02_'), 'use a dedicated j02_ super account')
  assert.equal(t.cleanup?.strategy, 'dispose-entire-dedicated-environment', 'whole-environment disposal must be agreed')
  text(t.cleanup.owner, 'cleanup.owner')
  text(t.cleanup.procedure, 'cleanup.procedure')
  // This file is reviewable and must never contain credentials, including unknown fields.
  function rejectSecrets(obj) {
    for (const [key, value] of Object.entries(obj)) {
      assert(!/password|private_key|cookie_secret|pgpassword|access_token/i.test(key), 'do not put secrets in the target manifest')
      if (value && typeof value === 'object') rejectSecrets(value)
    }
  }
  rejectSecrets(t)
  return t
}

export function validateApproval(a, plan, now = Date.now()) {
  assert.equal(a.schema_version, 1, 'approval schema_version must be 1')
  assert.equal(a.decision, 'APPROVED', 'explicit human approval is required before any real login/write')
  assert.equal(a.scope, 'RUN_J02_C_ONCE', 'approval scope must be RUN_J02_C_ONCE')
  assert.equal(a.plan_sha256, digest(plan), 'approval does not match this target/code/operation plan')
  text(a.approved_by, 'approved_by')
  text(a.approval_reference, 'approval_reference')
  const issued = Date.parse(a.approved_at), expires = Date.parse(a.expires_at)
  assert(Number.isFinite(issued) && Number.isFinite(expires) && issued <= now && now < expires, 'approval time is invalid or expired')
  assert(expires - issued <= 24 * 60 * 60 * 1000, 'approval validity must not exceed 24 hours')
}

export function validateRuntime(r, t, expectedMigrations) {
  assert.equal(r.environment, t.backend.environment, 'runtime environment mismatch')
  assert.equal(r.node, t.backend.node, 'runtime node mismatch')
  assert.deepEqual(r.connected_nodes, [], 'backend must not be connected to another BEAM node')
  assert.equal(r.release_root, t.backend.release_dir, 'RPC reached a different release')
  assert.equal(r.http?.port, Number(new URL(t.backend.url).port), 'runtime HTTP port mismatch')
  assert.equal(r.http.ip, '127.0.0.1', 'backend HTTP listener must bind only to loopback')
  assert.equal(r.login_rsa_public_key_sha256, t.backend.rsa_public_key_sha256, 'test RSA key mismatch')
  assert.equal(r.pg.database, t.database.name, 'runtime configured DB mismatch')
  assert.equal(r.pg.host, t.database.host, 'runtime configured PG host mismatch')
  assert.equal(Number(r.pg.port), t.database.port, 'runtime configured PG port mismatch')
  assert.equal(r.pg.username, t.database.user, 'runtime configured PG user mismatch')
  const d = r.database.identity
  assert.equal(d.database, t.database.name, 'actual connection DB mismatch')
  assert.equal(d.username, t.database.user, 'actual connection user mismatch')
  assert.equal(d.server_address, t.database.server_address, 'actual PG server address mismatch')
  assert.equal(d.server_port, t.database.server_port, 'actual PG server port mismatch')
  assert.equal(Math.floor(d.server_version_num / 10000), t.database.major, 'actual PG major mismatch')
  assert.equal(d.transaction_read_only, 'on', 'probe transaction must be read-only')
  assert.equal(d.is_replica, false, 'a read replica cannot execute the approved lifecycle')
  assert.deepEqual(r.database.migrations, [{ version: Math.max(...expectedMigrations), dirty: false }], 'migration head/dirty state mismatch')
  assert.deepEqual(r.database.history.map(x => x.version), expectedMigrations, 'migration history is incomplete or belongs to another build')
  for (const key of ['adm_user', 'adm_role', 'config', 'adm_auth_epoch', 'organization']) {
    assert(r.database.tables[key], `required table is missing: ${key}`)
  }
  assert.equal(r.database.prior_runs.admins, 0, 'fresh DB required: previous J02 accounts exist')
  assert.equal(r.database.prior_runs.roles, 0, 'fresh DB required: previous J02 roles exist')
  for (const name of ['timescaledb', 'pg_jieba', 'postgis', 'pgcrypto', 'citext']) {
    assert(r.database.extensions?.some(x => x.extname === name && typeof x.extversion === 'string' && x.extversion), `required PostgreSQL extension missing: ${name}`)
  }
  for (const name of MODULES) {
    const module = r.modules[name]
    assert(module && /^[a-f0-9]{32}$/.test(module.loaded_md5), `missing runtime module: ${name}`)
    assert.equal(module.loaded_md5, module.disk_md5, `loaded/disk BEAM mismatch: ${name}`)
    assert(module.path.startsWith(`${t.backend.release_dir}/lib/imboy-`) && module.path.endsWith(`/ebin/${name}.beam`), `module loaded outside approved release: ${name}`)
  }
}

export function validateResult(report, evidence, plan, exitCode) {
  assert.equal(exitCode, 0, 'Playwright exited unsuccessfully')
  assert.equal(report.errors?.length ?? 0, 0, 'Playwright global errors present')
  const specs = []
  function collect(suites) { for (const suite of suites ?? []) { specs.push(...(suite.specs ?? [])); collect(suite.suites) } }
  collect(report.suites)
  assert.equal(specs.length, 1, 'exactly one J02-c spec must run')
  assert(specs[0].title.startsWith('J02-c '), 'a different test ran')
  const tests = specs[0].tests
  assert.equal(tests.length, 1, 'exactly one browser/project must run')
  const item = tests[0]
  assert.equal(item.projectName, 'j02-real-chromium', 'unexpected project')
  assert.equal(item.expectedStatus, 'passed', 'expected failure/skip is not acceptance')
  assert.equal(item.status, 'expected', 'flaky/unexpected/skipped is not acceptance')
  assert.equal(item.results.length, 1, 'retries/repeats are not allowed')
  assert.equal(item.results[0].status, 'passed', 'J02-c did not pass')
  assert.equal(item.results[0].retry, 0, 'retry is not allowed')
  assert.equal(report.stats?.expected, 1, 'report must contain one passing test')
  for (const key of ['unexpected', 'flaky', 'skipped']) assert.equal(report.stats?.[key], 0, `${key} must be zero`)
  assert.equal(evidence.evidence_kind, 'REAL_BACKEND_E2E', 'missing real-test evidence')
  assert.equal(evidence.completed, true, 'semantic checkpoints did not complete')
  assert.equal(evidence.run_id, plan.target.run_id, 'stale evidence run_id')
  assert.equal(evidence.approved_plan_sha256, digest(plan), 'stale evidence plan digest')
  assert.equal(evidence.account, `j02_admin_${plan.target.run_id}`, 'wrong newly created account')
  assert.equal(evidence.role_name, `j02_role_${plan.target.run_id}`, 'wrong newly created role')
  for (const key of ['admin_id', 'role_id']) assert(typeof evidence[key] === 'string' && /^\d+$/.test(evidence[key]), `${key} must be a lossless decimal string`)
}
