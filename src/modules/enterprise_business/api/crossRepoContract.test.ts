/**
 * AC15-X-01 三方一致性交叉格 —— 静态契约比对（本地可做部分）。
 *
 * 目标：把「同一 enterprise_message / identity / contact 行」在后端 SQL 出站列、
 * Admin 平台面展示白名单、App 线缆消费键三侧的字段一致性，固化为可重复执行的
 * 单测（漂移即挂），而不是停留在人工评审。
 *
 * 三个真源与提取方式：
 *   ① 后端：`imboy/src/features/enterprise_business/infrastructure/eb_pg_store_sql.erl`
 *      —— 文本级包含性检查（登记列必须在 SQL 文本中出现；后端删列/改名即挂）。
 *      IMBOY_REPO_DIR 可指定后端路径，默认同级 ../imboy。
 *      普通本地缺源时说明原因并 skip；正式 CI / 严格模式缺源必须失败。
 *      Local missing sources may skip; CI / required mode must fail closed.
 *   ② Admin：`./pureFunctions.ts` 的 EB_*_SAFE_KEYS —— 运行时 import 真源提取。
 *   ③ App：`imboyapp/lib/modules/enterprise/domain/enterprise_models.dart` 的
 *      EnterpriseMessage.fromJson 消费键 —— 人工冻结为登记矩阵（App 仓只读，
 *      本测试不跨仓 import；漂移由活后端联动规格（Q12）覆盖，见
 *      tests/e2e/enterprise-cross-consistency.spec.ts 头注释）。
 *
 * 活后端联动（Admin 治理投影 + App 会话 + DB 行三方时刻一致）不可静态完成：
 * 该部分以 tests/e2e/enterprise-cross-consistency.spec.ts（env 门控 + seed 契约）
 * 输出可执行规格，供 Q12 全量门绑定隔离环境真跑。
 */
import { describe, expect, it } from 'bun:test'

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  EB_CONTACT_SAFE_KEYS,
  EB_IDENTITY_SAFE_KEYS,
  EB_MESSAGE_SAFE_KEYS,
  isSensitiveKey,
} from './pureFunctions'

// ---------------------------------------------------------------------------
// 登记矩阵（三方冻结快照；修改任意一侧真源时必须同步本表并跑绿）
// ---------------------------------------------------------------------------

/**
 * 后端 eb_pg_store_sql.erl 出站列（SELECT 段）。
 * 锚点：SQL_LIST_MESSAGES（L49-52）/ SQL_LIST_CONTACTS（L114-116）/
 * SQL_LIST_IDENTITIES（L170-171）族。列名以 SQL 文本包含性检查绑定真源。
 */
const BACKEND_MESSAGE_COLUMNS = [
  'id',
  'organization_id',
  'workspace_id',
  'conversation_id',
  'sender_type',
  'sender_contact_id',
  'sender_business_identity_id',
  'actor_user_id',
  'client_msg_id',
  'body_cipher',
  'key_version',
  'aad_hash',
  'content_hash',
  'policy_id',
  'policy_version',
  'retention_days',
  'retain_until',
  'visibility',
  'version',
  'created_at',
] as const

const BACKEND_IDENTITY_COLUMNS = [
  'id',
  'organization_id',
  'workspace_id',
  'function_key',
  'display_name',
  'status',
  'version',
  'created_by_user_id',
] as const

const BACKEND_CONTACT_COLUMNS = [
  'id',
  'organization_id',
  'workspace_id',
  'imboy_user_id',
  'status',
  'display_name',
  'profile_cipher',
  'profile_key_version',
  'version',
] as const

/**
 * App EnterpriseMessage.fromJson 消费的线缆键（真源：
 * imboyapp/lib/modules/enterprise/domain/enterprise_models.dart L260-280）。
 * 平台面专属键（policy_snapshot 等）不入平台白名单是设计使然（App 是成员面，
 * Admin 是平台面），交叉断言只覆盖三方共有核心键。
 */
const APP_MESSAGE_WIRE_KEYS = [
  'id',
  'conversation_id',
  'organization_id',
  'sender_type',
  'sender_contact_id',
  'sender_business_identity_id',
  'sender_business_identity_name',
  'body',
  'content',
  'asset_id',
  'retain_until',
  'policy_snapshot',
  'created_at',
] as const

/** 三方共有核心键：三侧必须同时存在（任一侧漂移即一致性破坏）。 */
const SHARED_CORE_KEYS = [
  'id',
  'conversation_id',
  'sender_type',
  'sender_contact_id',
  'sender_business_identity_id',
  'retain_until',
  'created_at',
] as const

// ---------------------------------------------------------------------------
// 后端真源文件 / Backend source (explicit path or sibling checkout)
// ---------------------------------------------------------------------------
const BACKEND_SQL_PATH = resolve(
  process.env.IMBOY_REPO_DIR || '../imboy',
  'src/features/enterprise_business/infrastructure/eb_pg_store_sql.erl',
)

const backendSqlAvailable = existsSync(BACKEND_SQL_PATH)
const backendSqlRequired = process.env.IMBOY_CROSS_REPO_REQUIRED === '1'
const skipBackendSql = !backendSqlAvailable && !backendSqlRequired

if (skipBackendSql) {
  console.warn(
    `[AC15-X-01] ENV_MISSING: skipping 3 backend source checks; missing ${BACKEND_SQL_PATH}. ` +
      'Set IMBOY_REPO_DIR to the backend checkout; set IMBOY_CROSS_REPO_REQUIRED=1 to require all 7 tests.',
  )
}

describe('AC15-X-01 三方字段一致性（静态契约比对）', () => {
  it('Admin 平台面消息白名单 ⊆ 后端 SQL 出站列（悬空键 = 后端漂移）', () => {
    const backendColumns = new Set<string>(BACKEND_MESSAGE_COLUMNS)
    const dangling = EB_MESSAGE_SAFE_KEYS.filter((key) => !backendColumns.has(key))
    expect(
      dangling,
      `Admin EB_MESSAGE_SAFE_KEYS 出现后端 SQL 不存在的键（后端删列/改名漂移）：${dangling.join(', ')}`,
    ).toEqual([])
  })

  it('Admin 平台面身份/客户白名单 ⊆ 后端 SQL 出站列', () => {
    const identityColumns = new Set<string>(BACKEND_IDENTITY_COLUMNS)
    const contactColumns = new Set<string>(BACKEND_CONTACT_COLUMNS)
    expect(EB_IDENTITY_SAFE_KEYS.filter((key) => !identityColumns.has(key))).toEqual([])
    expect(EB_CONTACT_SAFE_KEYS.filter((key) => !contactColumns.has(key))).toEqual([])
  })

  it('三方共有核心键在 后端SQL列 × Admin白名单 × App线缆键 三侧同时存在', () => {
    const backendColumns = new Set<string>([...BACKEND_MESSAGE_COLUMNS])
    const adminKeys = new Set<string>(EB_MESSAGE_SAFE_KEYS)
    const appKeys = new Set<string>(APP_MESSAGE_WIRE_KEYS)
    const missing: string[] = []
    for (const key of SHARED_CORE_KEYS) {
      if (!backendColumns.has(key)) missing.push(`backend:${key}`)
      if (!adminKeys.has(key)) missing.push(`admin:${key}`)
      if (!appKeys.has(key)) missing.push(`app:${key}`)
    }
    expect(missing, `共有核心键三侧不一致：${missing.join(', ')}`).toEqual([])
  })

  it('Admin 三白名单零敏感键（CS-03-A05 熔断口径）', () => {
    for (const keys of [EB_IDENTITY_SAFE_KEYS, EB_CONTACT_SAFE_KEYS, EB_MESSAGE_SAFE_KEYS]) {
      for (const key of keys) {
        expect(isSensitiveKey(key), `${key} 不得命中敏感键熔断`).toBe(false)
      }
    }
  })

  describe.skipIf(skipBackendSql)('后端真源文本绑定（防登记矩阵与后端漂移）', () => {
    it('后端 SQL 真源文件存在（严格模式缺源失败 / required source must exist）', () => {
      expect(backendSqlAvailable, `Required backend SQL source missing: ${BACKEND_SQL_PATH}`).toBe(true)
    })

    it('登记的消息列全部出现在 eb_pg_store_sql.erl 文本中', () => {
      const sqlText = readFileSync(BACKEND_SQL_PATH, 'utf8')
      const missing = BACKEND_MESSAGE_COLUMNS.filter(
        (key) => !new RegExp(`(^|[^a-z_])${key}([^a-z_]|$)`).test(sqlText),
      )
      expect(
        missing,
        `登记列在后端 SQL 真源中不存在（后端已删列/改名，须同步登记矩阵）：${missing.join(', ')}`,
      ).toEqual([])
    })

    it('登记的身份/客户列全部出现在 eb_pg_store_sql.erl 文本中', () => {
      const sqlText = readFileSync(BACKEND_SQL_PATH, 'utf8')
      const check = (keys: readonly string[]) =>
        keys.filter((key) => !new RegExp(`(^|[^a-z_])${key}([^a-z_]|$)`).test(sqlText))
      expect(check(BACKEND_IDENTITY_COLUMNS)).toEqual([])
      expect(check(BACKEND_CONTACT_COLUMNS)).toEqual([])
    })
  })
})
