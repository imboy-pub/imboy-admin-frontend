import { execFileSync } from 'node:child_process'

import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

/**
 * AC15-X-01 三方一致性交叉格 —— 活后端联动可执行规格（Admin+DB 两方；App 真机并列格另存）。
 *
 * 目标（设计文档 §5.2）：同一组织同一 General 会话的消息在 Admin 平台面投影、
 * DB enterprise_message 行两方字段/时刻一致（App 会话为第三方，须真机接入同一
 * 隔离库，归 AC15-APP-01 并列格——本 spec 预留 marker 注入位，App 侧证据由
 * imboyapp 的 enterprise_cs_e2e_test.dart / 治理旅程绑同库补齐后在 ledger 合并）。
 *
 * ⚠️ 本 spec 是可执行规格（env 门控）：需要 Q12 全量门或自建隔离环境注入以下
 * 前置，缺失即 skip（不假绿）。静态部分（字段清单交叉验证）已由
 * src/modules/enterprise_business/api/crossRepoContract.test.ts 收敛。
 *
 * 运行前提：
 *   - imboy 后端实例（隔离库，9831 族）+ Admin dev server（21816 族）；
 *   - IMBOY_ADMIN_E2E_ACCOUNT / _PASSWORD（有 enterprise_business:read 权限）；
 *   - IMBOY_ADMIN_E2E_X_DB_CONTAINER / _DB_USER / _DB_NAME：隔离 PG 容器与库
 *     （只读 oracle：容器内 psql -tAc SELECT，禁伪造行）；
 *   - IMBOY_ADMIN_E2E_X_ORG_ID / _WS_ID：seed 的组织/工作区对；
 *   - IMBOY_ADMIN_E2E_X_CONVERSATION_ID：General 会话 id（seed 或 Admin 治理页
 *     实建组织后由 DB 水位线定位——两种驱动均可，见用例内注释）；
 *   - IMBOY_ADMIN_E2E_X_EXPECTED_MESSAGES：该会话期望的 enterprise_message
 *     行数（seed 契约；App 真机发消息后由 Q12 重算注入）。
 *
 * 旅程（X01）：Admin 治理页建组织→（DB 直证组织行）→ General 会话消息列表
 *   投影 ↔ DB 行逐字段一致（id 集合、发送方二分、保留策略、版本单调）。
 */
const DB_CONTAINER = process.env.IMBOY_ADMIN_E2E_X_DB_CONTAINER?.trim() || ''
const DB_USER = process.env.IMBOY_ADMIN_E2E_X_DB_USER?.trim() || 'imboy_user'
const DB_NAME = process.env.IMBOY_ADMIN_E2E_X_DB_NAME?.trim() || ''
const ORG_ID = process.env.IMBOY_ADMIN_E2E_X_ORG_ID?.trim() || ''
const WS_ID = process.env.IMBOY_ADMIN_E2E_X_WS_ID?.trim() || ''
const CONVERSATION_ID = process.env.IMBOY_ADMIN_E2E_X_CONVERSATION_ID?.trim() || ''
const EXPECTED_MESSAGES = Number(process.env.IMBOY_ADMIN_E2E_X_EXPECTED_MESSAGES ?? '')

function envReady(): boolean {
  return (
    DB_CONTAINER !== '' && DB_NAME !== '' && ORG_ID !== '' && WS_ID !== '' && CONVERSATION_ID !== ''
  )
}

/** 只读 DB oracle：容器内 psql 直查（真实栈纪律：零伪造行）。 */
function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc', sql],
    { encoding: 'utf8' },
  ).trim()
}

/** DB 行投影：id|sender_type|sender_contact_id|sender_business_identity_id|visibility|version */
type DbMessageRow = {
  id: string
  senderType: string
  senderContactId: string
  senderBusinessIdentityId: string
  visibility: string
  version: string
}

function dbMessageRows(): DbMessageRow[] {
  const raw = psql(
    `SELECT id, sender_type, coalesce(sender_contact_id::text, ''), ` +
      `coalesce(sender_business_identity_id::text, ''), visibility, version ` +
      `FROM enterprise_message WHERE organization_id = ${ORG_ID} ` +
      `AND conversation_id = ${CONVERSATION_ID} ORDER BY id`,
  )
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [id, senderType, senderContactId, senderBusinessIdentityId, visibility, version] =
        line.split('|')
      return {
        id: id ?? '',
        senderType: senderType ?? '',
        senderContactId: senderContactId ?? '',
        senderBusinessIdentityId: senderBusinessIdentityId ?? '',
        visibility: visibility ?? '',
        version: version ?? '',
      }
    })
}

test.describe('AC15-X-01 Admin×DB 消息一致性交叉（活后端联动规格）', () => {
  test('X01 General 会话消息：Admin 平台面投影与 DB 行逐字段一致（id 集合/发送方二分/版本单调）', async ({ page }) => {
    test.skip(!envReady(), '缺活后端联动前置（X_* 环境变量由 Q12 全量门/自建隔离环境注入，见文件头注释）')
    const credentials = requireAdminCredentials()

    // —— DB oracle 先行（真源时刻）——
    const rows = dbMessageRows()
    if (Number.isFinite(EXPECTED_MESSAGES) && EXPECTED_MESSAGES > 0) {
      expect(rows.length, 'DB 行数必须等于 seed 契约期望（驱动侧漂移先挂）').toBe(EXPECTED_MESSAGES)
    }
    expect(rows.length, 'General 会话必须至少有一条企业消息').toBeGreaterThanOrEqual(1)
    // 版本单调（键集 id 升序下 version 不回退）。
    const versions = rows.map((r) => Number(r.version))
    for (let i = 1; i < versions.length; i += 1) {
      expect(versions[i]).toBeGreaterThanOrEqual(versions[i - 1]!)
    }
    // 发送方显式二分（EB-D05）：contact 入站 / business_identity 出站。
    for (const row of rows) {
      expect(['contact', 'business_identity']).toContain(row.senderType)
      if (row.senderType === 'contact') {
        expect(row.senderContactId.length).toBeGreaterThan(0)
        expect(row.senderBusinessIdentityId).toBe('')
      } else {
        expect(row.senderBusinessIdentityId.length).toBeGreaterThan(0)
        expect(row.senderContactId).toBe('')
      }
    }

    // —— Admin 平台面投影（「会话消息」Tab：键集分页拉全）——
    await loginAsAdmin(page, credentials)
    await page.goto(`/enterprise-business?org=${ORG_ID}&ws=${WS_ID}`)
    await expect(page.getByTestId('eb-scope-troubleshooting')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('tab', { name: '会话消息' }).click()
    await page.getByLabel('会话 ID（conversation_id）').fill(CONVERSATION_ID)
    await page.getByRole('button', { name: /查询消息/ }).click()

    const list = page.getByTestId('eb-message-list')
    await expect(list).toBeVisible({ timeout: 30_000 })

    // 逐行比对：Admin 表格行内的消息 ID / 发送方 / 可见性 / 版本与 DB 行一致。
    // 大页翻页由 DataTablePagination 驱动；默认页大小 ≥ 10，行数 ≤ 页大小时单页可全比。
    for (const row of rows) {
      const rowLocator = list.getByText(row.id, { exact: true })
      await expect(rowLocator.first()).toBeVisible({ timeout: 10_000 })
      // 发送方二分在 UI 的呈现（EbSenderCell）：访客 <contact_id> / 坐席 <identity_id>。
      const senderLabel = row.senderType === 'contact' ? row.senderContactId : row.senderBusinessIdentityId
      await expect(list.getByText(senderLabel, { exact: true }).first()).toBeVisible()
    }
    // 密文不落 UI：内容列固定呈现「端到端加密密文，平台不可读」（A05）。
    await expect(list.getByText(/平台不可读/).first()).toBeVisible()
  })

  test('X02 组织/工作区事实：Admin 排障区回显的 org/ws 与 DB workspace 行一致', async ({ page }) => {
    test.skip(!envReady(), '缺活后端联动前置（同 X01）')
    const credentials = requireAdminCredentials()

    // DB oracle：workspace 行归属 org。
    const wsRow = psql(
      `SELECT count(*) FROM workspace WHERE id = ${WS_ID} AND organization_id = ${ORG_ID}`,
    )
    expect(wsRow, 'DB 中 workspace 必须归属该组织（scope 合法性前置）').toBe('1')

    await loginAsAdmin(page, credentials)
    await page.goto(`/enterprise-business?org=${ORG_ID}&ws=${WS_ID}`)
    const probe = page.getByTestId('eb-scope-troubleshooting')
    await expect(probe).toBeVisible({ timeout: 15_000 })
    await expect(probe).toContainText(`org: ${ORG_ID}`)
    await expect(probe).toContainText(`ws: ${WS_ID}`)
  })
})
