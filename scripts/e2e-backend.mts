#!/usr/bin/env bun
/**
 * PR-W2-C05 — Admin E2E 独立后端 / scratch DB / 短期凭据编排器。
 *
 * 目标：给 `bun run test:e2e` 提供一个**完全隔离**的 imboy 后端：
 *   - 专用 scratch DB（名字含 `prodready`，绝不触碰其他 DB；结束不删，由 A0 统一清理）
 *   - 专用 HTTP 端口（默认 9821，避开主树常驻 9800 与 foreign beam）
 *   - 专用 Erlang 节点名（prodready_e2e@127.0.0.1，避开 epmd 上的 imboy_local）
 *   - 短期超管账号：随机密码，仅写入 gitignored 的 .env.e2e（env 通道），绝不入 git/日志
 *
 * 前置：
 *   - 后端仓（imboy）已完成 `IMBOYENV=local make rel`（release 已产出 _rel/imboy）
 *   - 本机 PG（默认 127.0.0.1:4323，imboy_pg18 docker：timescaledb/pg_jieba/postgis/pgcrypto 齐全）
 *     注：5432 Homebrew PG 缺 timescaledb/pg_jieba/postgis，迁移（create_hypertable/
 *     jiebacfg/geometry）必然失败，故默认指向项目本地 dev PG 4323；可用环境变量改指别处。
 *
 * 用法（在 imboyadmin 仓根）：
 *   bun scripts/e2e-backend.mts db        # 建 scratch DB + 扩展（幂等）
 *   bun scripts/e2e-backend.mts start     # 后台启动隔离后端并等就绪（迁移在启动时自动跑）
 *   bun scripts/e2e-backend.mts seed      # 首启向导创建短期超管 → 写 .env.e2e（幂等）
 *   bun scripts/e2e-backend.mts status    # 后端/DB/账号状态
 *   bun scripts/e2e-backend.mts stop      # 停止隔离后端节点
 *
 * 环境变量（均可覆盖默认值）：
 *   E2E_BACKEND_DIR   imboy 仓（须已 make rel；默认取 IMBOY_REPO_DIR）
 *   E2E_PGHOST/E2E_PGPORT/E2E_PGUSER/E2E_PGPASSWORD  scratch PG 连接（默认
 *                     127.0.0.1:4323 imboy_user；密码经 PGPASSWORD 传 psql，不落盘）
 *   E2E_DB            scratch DB 名（默认 prodready_v13_e2e）
 *   E2E_HTTP_PORT     后端 HTTP 端口（默认 9821）
 *   E2E_NODE_NAME     Erlang 节点短名（默认 prodready_e2e）
 *   E2E_ADMIN_ACCOUNT 短期超管账号（默认 prodready-e2e-admin@local.test，邮箱形态
 *                     为后端 adm_setup_logic 的合同要求；账号名内含 prodready 标记）
 */
import { execFileSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '..')

const DB = process.env.E2E_DB ?? 'prodready_v13_e2e'
const PGHOST = process.env.E2E_PGHOST ?? '127.0.0.1'
const PGPORT = process.env.E2E_PGPORT ?? '4323'
const PGUSER = process.env.E2E_PGUSER ?? 'imboy_user'
const PGPASSWORD = process.env.E2E_PGPASSWORD ?? 'abc54321'
const HTTP_PORT = process.env.E2E_HTTP_PORT ?? '9821'
const NODE_NAME = process.env.E2E_NODE_NAME ?? 'prodready_e2e'
const ADMIN_ACCOUNT = process.env.E2E_ADMIN_ACCOUNT ?? 'prodready-e2e-admin@local.test'
const BACKEND_DIR = process.env.E2E_BACKEND_DIR ?? process.env.IMBOY_REPO_DIR ?? ''

/** 迁移全量依赖的扩展（fresh-install 等价；缺任何一个 151 条迁移会在中途硬失败）。 */
const EXTENSIONS = ['timescaledb', 'pg_jieba', 'postgis', 'pgcrypto', 'citext']

const LOG_DIR = path.join(ROOT, 'test-results', 'e2e-backend')
const BACKEND_LOG = path.join(LOG_DIR, 'backend.log')
const PID_FILE = path.join(LOG_DIR, 'backend.pid')
const ENV_FILE = path.join(ROOT, '.env.e2e')

function die(msg: string): never {
  console.error(`[e2e-backend] FATAL: ${msg}`)
  process.exit(1)
}

function psql(database: string, sql: string, ...args: string[]): string {
  return execFileSync(
    'psql',
    [
      '-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-tAc', sql, ...args,
    ],
    { env: { ...process.env, PGPASSWORD }, encoding: 'utf8' },
  ).trim()
}

function requireBackendDir(): string {
  if (!BACKEND_DIR) {
    die('未设置 E2E_BACKEND_DIR / IMBOY_REPO_DIR（imboy 仓路径，须已 IMBOYENV=local make rel）')
  }
  if (!fs.existsSync(path.join(BACKEND_DIR, '_rel', 'imboy', 'bin', 'imboy'))) {
    die(`${BACKEND_DIR} 下无 _rel/imboy/bin/imboy —— 先在该仓执行 IMBOYENV=local make rel`)
  }
  return BACKEND_DIR
}

// ---------------------------------------------------------------------------
// db：创建 scratch DB + 扩展（幂等）
// ---------------------------------------------------------------------------
function cmdDb(): void {
  const exists = psql('postgres', `SELECT 1 FROM pg_database WHERE datname='${DB}'`)
  if (exists !== '1') {
    psql('postgres', `CREATE DATABASE ${DB}`)
    console.log(`[db] 已创建 scratch DB: ${DB} @ ${PGHOST}:${PGPORT}`)
  } else {
    console.log(`[db] scratch DB 已存在: ${DB} @ ${PGHOST}:${PGPORT}`)
  }
  for (const ext of EXTENSIONS) {
    psql(DB, `CREATE EXTENSION IF NOT EXISTS ${ext}`)
  }
  console.log(`[db] 扩展就绪: ${EXTENSIONS.join(', ')}`)
}

// ---------------------------------------------------------------------------
// start：后台启动隔离后端（唯一节点名 + 独立端口 + scratch DB env 注入）
// ---------------------------------------------------------------------------
function backendBaseUrl(): string {
  return `http://127.0.0.1:${HTTP_PORT}`
}

async function waitForBackend(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${backendBaseUrl()}/healthz`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return
    } catch {
      // 未就绪（首启要跑 151 条迁移，分钟级）
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  die(`后端 ${backendBaseUrl()} 在 ${timeoutMs / 1000}s 内未就绪；日志见 ${BACKEND_LOG}`)
}

function cmdStart(): void {
  const dir = requireBackendDir()
  fs.mkdirSync(LOG_DIR, { recursive: true })

  // 端口/节点名冲突前置检查（fail-fast，不悄悄撞别人）
  try {
    execFileSync('nc', ['-z', '127.0.0.1', HTTP_PORT], { stdio: 'ignore' })
    die(`端口 ${HTTP_PORT} 已被占用（E2E_HTTP_PORT 可换）`)
  } catch {
    // 期望：连不上 = 空闲
  }
  const epmd = execFileSync('epmd', ['-names'], { encoding: 'utf8' })
  if (epmd.includes(`name ${NODE_NAME} `)) {
    die(`Erlang 节点 ${NODE_NAME} 已存在（先 bun scripts/e2e-backend.mts stop）`)
  }

  // start_node.sh <nodename> [cookie] [port] [exclude_apps] [daemon]：
  // 必须用 daemon 模式——console 模式的 stdin 在 detached spawn 下立即 EOF，
  // Erlang shell 收到 EOF 即 halt 节点（实测 11:40Z 启动 3s 后自杀）。
  // daemon 模式由 rel 脚本正确 detach，日志落 release 的 log/ 目录 + 本仓镜像日志。
  const child = spawn(
    path.join(dir, 'scripts', 'start_node.sh'),
    [NODE_NAME, 'imboycookie', HTTP_PORT, '', 'daemon'],
    {
      cwd: dir,
      detached: true,
      stdio: ['ignore', fs.openSync(BACKEND_LOG, 'a'), fs.openSync(BACKEND_LOG, 'a')],
      env: {
        ...process.env,
        IMBOYENV: 'local', // 验证码旁路（adm_passport_handler 固定码 1234 仅 local/dev/test 放行）
        HTTP_PORT, // imboy_app.erl 运行时覆盖监听端口
        // scratch DB 注入：imboy_env boot 时覆盖 pg_conf + super_account（迁移连接）
        IMBOY_PG_HOST: PGHOST,
        IMBOY_PG_PORT: PGPORT,
        IMBOY_PG_USERNAME: PGUSER,
        IMBOY_PG_PASSWORD: PGPASSWORD,
        IMBOY_PG_DATABASE: DB,
        IMBOY_AUTO_MIGRATE: 'true',
        // E2E 压力基线：默认 api_per_ip=60/min 会被浏览器套件打穿（/passport/meta、
        // /current、rbac/me 等高频轮询同 IP），429 噪声淹没真实断言。
        IMBOY_THROTTLE_API_PER_USER: '100000',
        IMBOY_THROTTLE_API_PER_IP: '100000',
        // GAP-09：passport/meta+captcha+do_login 走独立 passport_per_ip=5/min/IP，
        // 每用例 goto /login 即 2-3 请求，多 worker 齐发秒穿 → 登录链路全挂。
        IMBOY_THROTTLE_PASSPORT_PER_IP: '100000',
        // SMS fake：owner_activation（GZAPP-06 API 合同）在无真实短信凭据的隔离
        // 后端上必须走 imboy_sms_fake（platform=fake + switch=on），否则
        // organization_owner_activation 创建即 sms_failed（gzadm-pending-owner
        // 实证：status 期望 pending 实收 sms_failed）。eunit 口径同为 fake。
        IMBOY_SMS_PLATFORM: 'fake',
        IMBOY_SMS_SWITCH: 'on',
      },
    },
  )
  child.unref()
  fs.writeFileSync(PID_FILE, String(child.pid))
  console.log(`[start] 后端启动中 pid=${child.pid} node=${NODE_NAME}@127.0.0.1 http=${backendBaseUrl()} db=${DB}`)
  console.log(`[start] 日志: ${BACKEND_LOG}（首启迁移 151 条，分钟级）`)
}

// ---------------------------------------------------------------------------
// seed：首启向导创建短期超管（随机密码，只写 gitignored .env.e2e）
// ---------------------------------------------------------------------------
function md5Hex(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex')
}

/** 与前端 src/lib/passwordCrypto.ts 同协议：RSA-OAEP(SHA-256) 加密 md5(明文) hex。 */
function encryptLoginPassword(md5: string, rawPublicKey: string): string {
  // 后端 meta 已剥掉 PEM 换行（adm_passport_handler build_login_meta）——先按前端
  // normalizePublicKey 同款逻辑重整为合法 PEM。
  const body = rawPublicKey
    .replaceAll('-----BEGIN PUBLIC KEY-----', '')
    .replaceAll('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '')
  const pem = `-----BEGIN PUBLIC KEY-----\n${(body.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PUBLIC KEY-----\n`
  return crypto
    .publicEncrypt(
      { key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(md5, 'utf8'),
    )
    .toString('base64')
}

function randomPassword(): string {
  // 16 hex + 固定字母数字前缀：满足 adm_setup_logic 强度合同（8-64、字母+数字）
  return `E2e${crypto.randomBytes(10).toString('hex')}`
}

async function api(pathname: string, init?: RequestInit): Promise<Response> {
  return fetch(`${backendBaseUrl()}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
}

async function readEnvelope(res: Response): Promise<unknown> {
  const body = (await res.json()) as { code?: number; msg?: string; payload?: unknown; data?: unknown }
  if (body.code !== undefined && body.code !== 0) {
    throw new Error(`API ${res.url} -> code=${body.code} msg=${body.msg}`)
  }
  return body.payload ?? body.data ?? body
}

/** writeEnvFile 管理的键（重写时整组替换）；其余行（seed-data 锚点、手工旋钮）原样保留。 */
const MANAGED_ENV_KEYS = [
  'IMBOY_ADMIN_E2E_ACCOUNT',
  'IMBOY_ADMIN_E2E_PASSWORD',
  'IMBOY_ADMIN_E2E_SUPER_ACCOUNT',
  'IMBOY_ADMIN_E2E_SUPER_PASSWORD',
  'IMBOY_ADMIN_E2E_PORT',
  'IMBOY_ADMIN_E2E_BASE_URL',
  'IMBOY_ADMIN_BASE_URL',
  'VITE_PROXY_TARGET',
  'IMBOY_ADMIN_E2E_NEW_ADMIN_PREFIX',
  'IMBOY_ADMIN_E2E_NEW_ADMIN_PASSWORD',
  'IMBOY_ADMIN_E2E_CREATE_ADMIN_ROLE_NAME',
  'IMBOY_ADMIN_E2E_ASSIGN_ROLE_NAME',
  'IMBOY_ADMIN_E2E_NEW_ROLE_PREFIX',
  'IMBOY_ADMIN_E2E_NEW_ROLE_DESCRIPTION',
  'IMBOY_ADMIN_E2E_ROLE_PERMISSION_KEY',
  'IMBOY_ADMIN_E2E_OWNER_SEARCH_KEYWORD',
] as const

function writeEnvFile(account: string, password: string): void {
  const lines = [
    '# 由 scripts/e2e-backend.mts seed 生成（PR-W2-C05 独立后端短期凭据）——gitignored，勿提交',
    `# 后端: ${backendBaseUrl()} (node ${NODE_NAME}@127.0.0.1, db ${DB})`,
    `IMBOY_ADMIN_E2E_ACCOUNT=${account}`,
    `IMBOY_ADMIN_E2E_PASSWORD=${password}`,
    `IMBOY_ADMIN_E2E_SUPER_ACCOUNT=${account}`,
    `IMBOY_ADMIN_E2E_SUPER_PASSWORD=${password}`,
    'IMBOY_ADMIN_E2E_PORT=8082',
    'IMBOY_ADMIN_E2E_BASE_URL=http://127.0.0.1:8082',
    `IMBOY_ADMIN_BASE_URL=${backendBaseUrl()}/api/adm`,
    `VITE_PROXY_TARGET=${backendBaseUrl()}`,
    // 以下为套件旋钮（与 .env.e2e.example 同源，非敏感默认值）
    'IMBOY_ADMIN_E2E_NEW_ADMIN_PREFIX=pw_e2e_admin',
    'IMBOY_ADMIN_E2E_NEW_ADMIN_PASSWORD=Passw0rd!',
    'IMBOY_ADMIN_E2E_CREATE_ADMIN_ROLE_NAME=运营管理员',
    'IMBOY_ADMIN_E2E_ASSIGN_ROLE_NAME=审计管理员',
    'IMBOY_ADMIN_E2E_NEW_ROLE_PREFIX=pw_e2e_role',
    'IMBOY_ADMIN_E2E_NEW_ROLE_DESCRIPTION=Playwright E2E created role',
    'IMBOY_ADMIN_E2E_ROLE_PERMISSION_KEY=reports:read',
    // Owner 搜索关键字：种子人类用户（prodready-org-u*）可命中；默认 'e2e'
    // 会命中 ai-agent spec 留下的 bot 用户（account_type=1，不可为 Owner）。
    'IMBOY_ADMIN_E2E_OWNER_SEARCH_KEYWORD=prodready',
  ]
  // 保留未管理行（seed-data 写入的锚点 env、FC_* 等手工旋钮），丢弃旧的管理键
  // 行与旧注释头，避免轮换重写时累积重复。
  const preserved = fs.existsSync(ENV_FILE)
    ? fs
        .readFileSync(ENV_FILE, 'utf8')
        .split('\n')
        .filter(
          (l) =>
            l.trim().length > 0 &&
            !l.startsWith('#') &&
            !MANAGED_ENV_KEYS.some((k) => l.startsWith(`${k}=`)),
        )
    : []
  fs.writeFileSync(ENV_FILE, `${[...lines, ...preserved].join('\n')}\n`)
}

/** .env.e2e 是否缺超管凭据行（文件缺失/被截断/只余旋钮均算缺）。 */
function envFileMissingSuperCredentials(): boolean {
  if (!fs.existsSync(ENV_FILE)) return true
  const content = fs.readFileSync(ENV_FILE, 'utf8')
  return !/^IMBOY_ADMIN_E2E_ACCOUNT=.+$/m.test(content) || !/^IMBOY_ADMIN_E2E_PASSWORD=.+$/m.test(content)
}

async function cmdSeed(): Promise<void> {
  const statusRes = await api('/api/adm/setup/status')
  const status = (await readEnvelope(statusRes)) as { initialized: boolean }

  if (status.initialized) {
    if (!envFileMissingSuperCredentials()) {
      console.log('[seed] 已初始化（幂等跳过）；.env.e2e 已含凭据')
      return
    }
    // 自愈路径：DB 已初始化但本地凭据丢失（.env.e2e 被截断/清理）→ 轮换超管
    // 密码（SQL 直写与 elib_password:generate/1 legacy 同构 hash），不重建 DB
    // （151 条迁移分钟级，且种子锚点/运行期数据全在）。
    const password = randomPassword()
    const hash = adminPasswordHash(md5Hex(password))
    const updated = psql(DB, `UPDATE adm_user SET password='${hash}' WHERE account='${ADMIN_ACCOUNT}'`)
    if (updated === 'UPDATE 0') {
      die(`DB 已初始化但账号 ${ADMIN_ACCOUNT} 不存在且 .env.e2e 凭据缺失：换 E2E_DB 重建`)
    }
    writeEnvFile(ADMIN_ACCOUNT, password)
    console.log(`[seed] DB 已初始化但凭据缺失——已轮换超管密码并重写 ${ENV_FILE}（旧密码全量失效）`)
    return
  }

  const metaRes = await api('/api/adm/passport/meta')
  const meta = (await readEnvelope(metaRes)) as { public_key: string }

  const password = randomPassword()
  const encrypted = encryptLoginPassword(md5Hex(password), meta.public_key)
  const initRes = await api('/api/adm/setup/init', {
    method: 'POST',
    body: JSON.stringify({
      account: ADMIN_ACCOUNT,
      password: encrypted,
      nickname: 'prodready E2E Admin',
    }),
  })
  const created = (await readEnvelope(initRes)) as unknown
  console.log(`[seed] 短期超管已创建: account=${ADMIN_ACCOUNT} resp=${JSON.stringify(created)}`)

  writeEnvFile(ADMIN_ACCOUNT, password)
  console.log(`[seed] 凭据已写入 ${ENV_FILE}（gitignored；密码仅存 env 文件，未入库未入 git）`)
}

/** 与后端 elib_password:generate/1 legacy 格式逐位一致（adm_user.password 直插用）。
 *  形态：base64( saltB64 + ":hmac_sha512:" + base64(hmac_sha512(key=saltB64, sha256(plaintext))) )
 *  其中 plaintext = md5hex(明文)（登录链路解 RSA 后到达 do_login 的值）。 */
function adminPasswordHash(plaintext: string): string {
  const saltB64 = crypto.randomBytes(16).toString('base64')
  const hmacB64 = crypto
    .createHmac('sha512', Buffer.from(saltB64, 'utf8'))
    .update(crypto.createHash('sha256').update(plaintext, 'utf8').digest())
    .digest('base64')
  return Buffer.from(`${saltB64}:hmac_sha512:${hmacB64}`, 'utf8').toString('base64')
}

const SEED_ORG_NAME = process.env.E2E_SEED_ORG_NAME ?? 'org15-e2e-w2-seed'
const SEED_ORG_ID = 710000000000000201n
const SEED_USER_IDS = [710000000000000101n, 710000000000000102n, 710000000000000103n]
const READONLY_ACCOUNT = process.env.E2E_READONLY_ACCOUNT ?? 'prodready-e2e-readonly@local.test'

/** eadm-cs-provisioning §9-4 的组织/工作区（独立 TSID：默认常量与
 *  admin-organization-governance 的 INVALID_TSID 冲突，见 spec 内注释）。 */
const EADM_ORG_ID = 710000000000000401n
const EADM_WS_ID = 710000000000000402n

function updateEnvLine(key: string, value: string): void {
  const lines = fs.existsSync(ENV_FILE)
    ? fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter((l) => !l.startsWith(`${key}=`))
    : ['# 由 scripts/e2e-backend.mts 生成（gitignored，勿提交）']
  lines.push(`${key}=${value}`)
  fs.writeFileSync(ENV_FILE, `${lines.filter((l, i, a) => l !== '' || i === a.length - 1).join('\n').replace(/\n+$/, '')}\n`)
}

/**
 * seed-data：组织治理六旅程（admin-organization-governance）与 ENT-ADM-01 需要的
 * 服务端种子：U1(owner)/U2/U3 已注册用户 + org15 种子组织 + 成员关系；以及
 * read-only 账号（role_id=[3] audit_admin，setup/init 只能建超管故 SQL 直插）。
 * 全部幂等（WHERE NOT EXISTS）。
 */
function cmdSeedData(): void {
  const dummyHash = adminPasswordHash(md5Hex(randomPassword()))
  for (const [i, uid] of SEED_USER_IDS.entries()) {
    const account = `prodready-org-u${i + 1}@local.test`
    psql(
      DB,
      `INSERT INTO "user" (id, nickname, password, account, email, reg_ip, reg_cosv, source)
       SELECT ${uid}, 'prodready-org-u${i + 1}', '${dummyHash}', '${account}', '${account}', '127.0.0.1', 'e2e-seed', 'e2e'
       WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE id = ${uid})`,
    )
  }
  psql(
    DB,
    `INSERT INTO organization (id, name, owner_id, status)
     SELECT ${SEED_ORG_ID}, '${SEED_ORG_NAME}', ${SEED_USER_IDS[0]}, 'active'
     WHERE NOT EXISTS (SELECT 1 FROM organization WHERE id = ${SEED_ORG_ID})`,
  )
  const roles = ['owner', 'member', 'member'] as const
  for (const [i, uid] of SEED_USER_IDS.entries()) {
    psql(
      DB,
      `INSERT INTO organization_member (organization_id, user_id, role, status, joined_at)
       SELECT ${SEED_ORG_ID}, ${uid}, '${roles[i]}', 'active', now()
       WHERE NOT EXISTS (SELECT 1 FROM organization_member WHERE organization_id = ${SEED_ORG_ID} AND user_id = ${uid})`,
    )
  }
  // 状态复位：org-governance 六旅程是 serial 一次性链条（owner 转移/成员移除/
  // 邀请消费状态），重跑套件前须把种子组织复位到规范形态（owner+2 member、
  // active、无遗留邀请行），否则 ② 起硬失败「seed 成员不足」。
  // 不变量实现（顺序敏感，单事务 psql -1）：
  //   - uq_organization_member_single_active_owner（即时唯一索引）：同时刻只能
  //     一个 active owner 行 → 先降级旧 owner，再改 organization.owner_id；
  //   - trg_organization_owner_member_sync（organization 即时触发）：owner_id
  //     变更自动把新 owner upsert 成 member 表 owner 行；
  //   - primary_owner_member_guard / member_owner_invariant（均 DEFERRABLE）：
  //     COMMIT 时校验终态「恰好一个 active owner 且 == organization.owner_id」。
  psql(
    DB,
    `DELETE FROM organization_invitation WHERE organization_id = ${SEED_ORG_ID};
     UPDATE organization_member SET role='member' WHERE organization_id = ${SEED_ORG_ID} AND role='owner' AND user_id <> ${SEED_USER_IDS[0]};
     UPDATE organization SET status='active', owner_id=${SEED_USER_IDS[0]} WHERE id = ${SEED_ORG_ID};
     UPDATE organization_member SET role='member', status='active' WHERE organization_id = ${SEED_ORG_ID} AND user_id IN (${SEED_USER_IDS[1]}, ${SEED_USER_IDS[2]});`,
    '-1',
  )
  console.log(`[seed-data] 组织种子就绪(已复位): org=${SEED_ORG_NAME}(${SEED_ORG_ID}) owner/member×2`)

  const existing = psql(DB, `SELECT count(*) FROM adm_user WHERE account = '${READONLY_ACCOUNT}'`)
  const envHasReadonly = fs.existsSync(ENV_FILE) && /^IMBOY_ADMIN_E2E_READONLY_PASSWORD=.+$/m.test(fs.readFileSync(ENV_FILE, 'utf8'))
  if (existing === '0') {
    const password = randomPassword()
    const hash = adminPasswordHash(md5Hex(password))
    psql(
      DB,
      `INSERT INTO adm_user (id, account, email, nickname, password, role_id, status)
       SELECT 710000000000000301, '${READONLY_ACCOUNT}', '${READONLY_ACCOUNT}',
              'prodready E2E ReadOnly', '${hash}', ARRAY[3]::bigint[], 1
       WHERE NOT EXISTS (SELECT 1 FROM adm_user WHERE account = '${READONLY_ACCOUNT}')`,
    )
    updateEnvLine('IMBOY_ADMIN_E2E_READONLY_ACCOUNT', READONLY_ACCOUNT)
    updateEnvLine('IMBOY_ADMIN_E2E_READONLY_PASSWORD', password)
    console.log(`[seed-data] read-only 账号已建: ${READONLY_ACCOUNT}（role_id=[3]；凭据入 .env.e2e）`)
  } else if (!envHasReadonly) {
    // 自愈：账号在而本地凭据丢失 → 轮换（与超管 seed 同款路径）
    const password = randomPassword()
    const hash = adminPasswordHash(md5Hex(password))
    psql(DB, `UPDATE adm_user SET password='${hash}' WHERE account='${READONLY_ACCOUNT}'`)
    updateEnvLine('IMBOY_ADMIN_E2E_READONLY_ACCOUNT', READONLY_ACCOUNT)
    updateEnvLine('IMBOY_ADMIN_E2E_READONLY_PASSWORD', password)
    console.log(`[seed-data] read-only 账号已存在但凭据缺失——已轮换密码: ${READONLY_ACCOUNT}`)
  } else {
    console.log(`[seed-data] read-only 账号已存在（幂等跳过）: ${READONLY_ACCOUNT}`)
  }
  updateEnvLine('IMBOY_ADMIN_E2E_ORG_SEED_NAME', SEED_ORG_NAME)

  // eadm-cs-provisioning §9-4：组织 + 工作区 + 默认工作区关系 + 2 个 active member
  psql(
    DB,
    `INSERT INTO organization (id, name, owner_id, status)
     SELECT ${EADM_ORG_ID}, 'prodready-eadm-cs-org', ${SEED_USER_IDS[0]}, 'active'
     WHERE NOT EXISTS (SELECT 1 FROM organization WHERE id = ${EADM_ORG_ID});
     UPDATE organization SET status='active' WHERE id = ${EADM_ORG_ID};
     INSERT INTO workspace (id, name, owner_id, status, organization_id, type)
     SELECT ${EADM_WS_ID}, 'prodready-eadm-cs-ws', ${SEED_USER_IDS[0]}, 'active', ${EADM_ORG_ID}, 'project'
     WHERE NOT EXISTS (SELECT 1 FROM workspace WHERE id = ${EADM_WS_ID});
     UPDATE workspace SET status='active' WHERE id = ${EADM_WS_ID};
     INSERT INTO organization_default_workspace (organization_id, workspace_id)
     SELECT ${EADM_ORG_ID}, ${EADM_WS_ID}
     WHERE NOT EXISTS (SELECT 1 FROM organization_default_workspace WHERE organization_id = ${EADM_ORG_ID});
     INSERT INTO organization_member (organization_id, user_id, role, status, joined_at)
     SELECT ${EADM_ORG_ID}, uid, 'member', 'active', now()
     FROM (VALUES (${SEED_USER_IDS[0]}), (${SEED_USER_IDS[1]})) AS t(uid)
     WHERE NOT EXISTS (SELECT 1 FROM organization_member WHERE organization_id = ${EADM_ORG_ID} AND user_id = t.uid);`,
    '-1',
  )
  // owner 关系（沿用 sync 触发器语义：改 owner_id 自动 upsert owner 行）
  psql(
    DB,
    `UPDATE organization_member SET role='member' WHERE organization_id = ${EADM_ORG_ID} AND role='owner' AND user_id <> ${SEED_USER_IDS[0]};
     UPDATE organization SET owner_id=${SEED_USER_IDS[0]} WHERE id = ${EADM_ORG_ID};`,
    '-1',
  )
  updateEnvLine('IMBOY_ADMIN_E2E_EADM_ORG_ID', String(EADM_ORG_ID))
  updateEnvLine('IMBOY_ADMIN_E2E_EADM_WS_ID', String(EADM_WS_ID))
  console.log(`[seed-data] eadm-cs-provisioning org/ws 就绪: org=${EADM_ORG_ID} ws=${EADM_WS_ID}`)

  // ---- auto_test 走查锚点（AT_* 默认常量，见 round_w2r3_* spec）----
  // 走查AT甲/乙 两个 human 用户
  for (const [i, uid] of [710000000000000601n, 710000000000000602n].entries()) {
    const account = `prodready-at-u${i + 1}@local.test`
    psql(
      DB,
      `INSERT INTO "user" (id, nickname, password, account, email, reg_ip, reg_cosv, source)
       SELECT ${uid}, '${i === 0 ? '走查AT甲' : '走查AT乙'}', '${dummyHash}', '${account}', '${account}', '127.0.0.1', 'e2e-seed', 'e2e'
       WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE id = ${uid})`,
    )
  }
  // AT 工作区（id=AT_WS_ID 默认常量）+ 2 成员 + 项目 + 频道 + 关联
  psql(
    DB,
    `INSERT INTO workspace (id, name, owner_id, status, type)
     SELECT 109901865994684416, 'AT-WS-20260830210132', 710000000000000601, 'active', 'project'
     WHERE NOT EXISTS (SELECT 1 FROM workspace WHERE id = 109901865994684416);
     UPDATE workspace SET status='active', archived_at=NULL, archived_by=NULL, name='AT-WS-20260830210132' WHERE id = 109901865994684416;
     INSERT INTO workspace_member (workspace_id, user_id, role, status, joined_at) VALUES
       (109901865994684416, 710000000000000601, 'owner', 'active', now()),
       (109901865994684416, 710000000000000602, 'member', 'active', now())
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET status='active';
     INSERT INTO project (id, workspace_id, name, owner_id, status)
     SELECT 109901866229565440, 109901865994684416, 'AT-项目-20260830210132', 710000000000000601, 'active'
     WHERE NOT EXISTS (SELECT 1 FROM project WHERE id = 109901866229565440);
     INSERT INTO channel (id, name, creator_uid, status, scope, workspace_id)
     SELECT 109901866059696128, 'Announcements', 710000000000000601, 1, 'workspace', 109901865994684416
     WHERE NOT EXISTS (SELECT 1 FROM channel WHERE id = 109901866059696128);
     UPDATE channel SET scope='workspace', workspace_id=109901865994684416 WHERE id = 109901866059696128;
     INSERT INTO project_channel_rel (workspace_id, project_id, channel_id, created_by)
     SELECT 109901865994684416, 109901866229565440, 109901866059696128, 710000000000000601
     WHERE NOT EXISTS (SELECT 1 FROM project_channel_rel WHERE project_id = 109901866229565440);
     INSERT INTO project_member (workspace_id, project_id, user_id, status) VALUES
       (109901865994684416, 109901866229565440, 710000000000000601, 'active'),
       (109901865994684416, 109901866229565440, 710000000000000602, 'active')
     ON CONFLICT (project_id, user_id) DO UPDATE SET status='active';
     INSERT INTO project_milestone (id, workspace_id, project_id, name, due_date, status, reached_at)
     SELECT 109901866059697001, 109901865994684416, 109901866229565440, 'AT 里程碑-规划', CURRENT_DATE + 7, 'planned', NULL
     WHERE NOT EXISTS (SELECT 1 FROM project_milestone WHERE id = 109901866059697001);
     INSERT INTO project_milestone (id, workspace_id, project_id, name, due_date, status, reached_at)
     SELECT 109901866059697002, 109901865994684416, 109901866229565440, 'AT 里程碑-达成', CURRENT_DATE - 7, 'reached', now()
     WHERE NOT EXISTS (SELECT 1 FROM project_milestone WHERE id = 109901866059697002);
     INSERT INTO "group" (id, title, owner_uid, creator_uid, workspace_id, status, scope)
     SELECT 109901866059697101, 'General', 710000000000000601, 710000000000000601, 109901865994684416, 1, 'workspace'
     WHERE NOT EXISTS (SELECT 1 FROM "group" WHERE id = 109901866059697101);`,
    '-1',
  )
  // org15 种子组织的默认工作区（enterprise-business scope 选择用；旅程⑥只断言端点返回 list）
  psql(
    DB,
    `INSERT INTO workspace (id, name, owner_id, status, type, organization_id)
     SELECT 710000000000000202, 'org15-e2e-ws', ${SEED_USER_IDS[0]}, 'active', 'project', ${SEED_ORG_ID}
     WHERE NOT EXISTS (SELECT 1 FROM workspace WHERE id = 710000000000000202);
     INSERT INTO organization_default_workspace (organization_id, workspace_id)
     SELECT ${SEED_ORG_ID}, 710000000000000202
     WHERE NOT EXISTS (SELECT 1 FROM organization_default_workspace WHERE organization_id = ${SEED_ORG_ID});`,
    '-1',
  )
  // 11 个 bot（w2r3_bots_verify: 共 11 条 + 抽屉 + 翻页）
  const botSql: string[] = []
  for (let i = 1; i <= 11; i++) {
    const uid = 710000000000000700n + BigInt(i)
    botSql.push(
      `INSERT INTO "user" (id, nickname, password, account, reg_ip, reg_cosv, source, account_type)
       SELECT ${uid}, 'prodready-bot-${i}', '${dummyHash}', 'prodready_bot_${i}', '127.0.0.1', 'e2e-seed', 'e2e', 1
       WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE id = ${uid});`,
      `INSERT INTO bot (user_id, name, owner_uid, status, is_public)
       SELECT ${uid}, 'prodready-bot-${i}', ${SEED_USER_IDS[0]}, 1, true
       WHERE NOT EXISTS (SELECT 1 FROM bot WHERE user_id = ${uid});`,
    )
  }
  psql(DB, botSql.join('\n'), '-1')
  // eadm-v21 §734 过滤 Oracle 唯一命中锚点
  psql(
    DB,
    `INSERT INTO organization (id, name, owner_id, status)
     SELECT 710000000000000801, 'cs01-org-113731092317734917', ${SEED_USER_IDS[0]}, 'active'
     WHERE NOT EXISTS (SELECT 1 FROM organization WHERE name = 'cs01-org-113731092317734917');`,
  )
  console.log('[seed-data] auto_test AT 锚点/org15 工作区/11 bots/cs01-org 就绪')

  // ---- 举报中心 + 频道消息治理（scenario manifest 数据锚，固定 TSID → 清单静态）----
  // 每次运行处置工单（status 0→1/2），故先清旧再插，保证 spec 可重跑。
  // 违规确认（violation）会处置目标实体 → 全部用一次性目标（901 频道/902 群/903 用户）。
  psql(
    DB,
    `DELETE FROM report_ticket WHERE id BETWEEN 710000000000001001 AND 710000000000001009;
     INSERT INTO "user" (id, nickname, password, account, reg_ip, reg_cosv, source)
     SELECT uid, 'prodready-report-' || role, '${dummyHash}', 'prodready-report-' || role || '@local.test', '127.0.0.1', 'e2e-seed', 'e2e'
     FROM (VALUES (710000000000000903, 'target'), (710000000000000905, 'r2'), (710000000000000906, 'r3')) AS t(uid, role)
     WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE id = t.uid);
     INSERT INTO channel (id, name, creator_uid, status, scope)
     SELECT 710000000000000901, 'prodready-report-channel', ${SEED_USER_IDS[0]}, 1, 'personal'
     WHERE NOT EXISTS (SELECT 1 FROM channel WHERE id = 710000000000000901);
     INSERT INTO "group" (id, title, owner_uid, creator_uid, status, scope)
     SELECT 710000000000000902, 'prodready-report-group', ${SEED_USER_IDS[0]}, ${SEED_USER_IDS[0]}, 1, 'personal'
     WHERE NOT EXISTS (SELECT 1 FROM "group" WHERE id = 710000000000000902);
     INSERT INTO report_ticket (id, target_type, target_id, reporter_uid, reason, description, status)
     VALUES
       (710000000000001001, 'group',   710000000000000902, 710000000000000601, 'spam', 'prodready e2e 单条-群组', 0),
       (710000000000001002, 'channel', 710000000000000901, 710000000000000601, 'spam', 'prodready e2e 单条-频道', 0),
       (710000000000001003, 'user',    710000000000000903, 710000000000000601, 'spam', 'prodready e2e 单条-用户', 0),
       (710000000000001004, 'group',   710000000000000902, 710000000000000602, 'spam', 'prodready e2e 批量-群组 1', 0),
       (710000000000001005, 'group',   710000000000000902, 710000000000000905, 'abuse', 'prodready e2e 批量-群组 2', 0),
       (710000000000001006, 'channel', 710000000000000901, 710000000000000602, 'spam', 'prodready e2e 批量-频道 1', 0),
       (710000000000001007, 'channel', 710000000000000901, 710000000000000905, 'abuse', 'prodready e2e 批量-频道 2', 0),
       (710000000000001008, 'user',    710000000000000903, 710000000000000602, 'spam', 'prodready e2e 批量-用户 1', 0),
       (710000000000001009, 'user',    710000000000000903, 710000000000000905, 'abuse', 'prodready e2e 批量-用户 2', 0);`,
    '-1',
  )
  // 频道消息治理锚点：904 频道 + 置顶/删除两条消息
  psql(
    DB,
    `INSERT INTO channel (id, name, creator_uid, status, scope)
     SELECT 710000000000000904, 'prodready-govern-channel', ${SEED_USER_IDS[0]}, 1, 'personal'
     WHERE NOT EXISTS (SELECT 1 FROM channel WHERE id = 710000000000000904);
     DELETE FROM channel_message WHERE id IN (710000000000001101, 710000000000001102);
     INSERT INTO channel_message (id, channel_id, author_id, author_name, content, is_pinned, status)
     VALUES
       (710000000000001101, 710000000000000904, 710000000000000601, '走查AT甲', 'prodready e2e 置顶锚点消息', false, 1),
       (710000000000001102, 710000000000000904, 710000000000000601, '走查AT甲', 'prodready e2e 删除锚点消息', false, 1);`,
    '-1',
  )
  const manifest = {
    version: 1,
    _comment: 'PR-W2-C05 隔离后端种子锚点（scripts/e2e-backend.mts seed-data 生成；固定 TSID，可重跑）',
    scenarios: {
      adm_e2e_02_report_center_resolve: {
        group: { reportId: '710000000000001001', targetId: '710000000000000902', expectedResult: 'reject' },
        channel: { reportId: '710000000000001002', targetId: '710000000000000901', expectedResult: 'violation' },
        user: { reportId: '710000000000001003', targetId: '710000000000000903', expectedResult: 'reject' },
      },
      adm_e2e_03_report_center_batch: {
        group: { reportIds: ['710000000000001004', '710000000000001005'], targetId: '710000000000000902', expectedResult: 'reject' },
        channel: { reportIds: ['710000000000001006', '710000000000001007'], targetId: '710000000000000901', expectedResult: 'violation' },
        user: { reportIds: ['710000000000001008', '710000000000001009'], targetId: '710000000000000903', expectedResult: 'reject' },
      },
      adm_e2e_05_channel_message_govern: {
        channelId: '710000000000000904',
        pinMessageId: '710000000000001101',
        deleteMessageId: '710000000000001102',
      },
    },
  }
  const manifestPath = path.join(ROOT, 'tests', 'e2e', 'fixtures', 'three-end-first-batch.local.json')
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  updateEnvLine('IMBOY_TEST_SCENARIO_MANIFEST', manifestPath)
  console.log('[seed-data] 举报中心/频道消息治理 manifest 锚点就绪')
}

// ---------------------------------------------------------------------------
// status / stop
// ---------------------------------------------------------------------------
async function cmdStatus(): Promise<void> {
  let backend = 'DOWN'
  try {
    const res = await fetch(`${backendBaseUrl()}/healthz`, { signal: AbortSignal.timeout(2000) })
    backend = res.ok ? `UP (${backendBaseUrl()})` : `BROKEN (healthz ${res.status})`
  } catch { /* DOWN */ }
  let setup = 'unknown'
  if (backend.startsWith('UP')) {
    const res = await api('/api/adm/setup/status')
    setup = String(((await readEnvelope(res)) as { initialized: boolean }).initialized)
  }
  const admCount = (() => {
    try {
      return psql(DB, 'SELECT count(*) FROM adm_user')
    } catch {
      return 'n/a'
    }
  })()
  console.log(
    `[status] backend=${backend} db=${DB}@${PGHOST}:${PGPORT} adm_user_rows=${admCount} setup_initialized=${setup} env_file=${fs.existsSync(ENV_FILE)}`,
  )
}

function cmdStop(): void {
  const dir = requireBackendDir()
  const bin = path.join(dir, '_rel', 'imboy', 'bin', 'imboy')
  // rel 脚本会 setid/派生 heart；直接 stop 目标节点（名字唯一，不会误伤主树 imboy_local）
  try {
    execFileSync(bin, ['stop'], {
      cwd: dir,
      env: { ...process.env, NODE_NAME: NODE_NAME },
      encoding: 'utf8',
      timeout: 30_000,
    })
    console.log(`[stop] 已停止节点 ${NODE_NAME}`)
  } catch (err) {
    console.warn(`[stop] rel stop 失败（可能已停）：${String(err)}`)
  }
  if (fs.existsSync(PID_FILE)) fs.rmSync(PID_FILE)
}

// ---------------------------------------------------------------------------

const command = process.argv[2] ?? ''
switch (command) {
  case 'db': cmdDb(); break
  case 'start': cmdStart(); break
  case 'seed': await cmdSeed(); break
  case 'seed-data': cmdSeedData(); break
  case 'status': await cmdStatus(); break
  case 'stop': cmdStop(); break
  default:
    console.log('用法: bun scripts/e2e-backend.mts <db|start|seed|seed-data|status|stop>')
    process.exit(command ? 1 : 0)
}
