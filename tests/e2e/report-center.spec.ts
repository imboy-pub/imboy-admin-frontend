import { expect, type Page, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'
import {
  requireReportBatchFixture,
  requireReportResolveFixture,
  type ReportMutationResult,
  type ReportTargetType,
} from './support/scenarioManifest'

const TARGET_LABEL_MAP: Record<ReportTargetType, string> = {
  group: '群组',
  channel: '频道',
  user: '用户',
}

function resolveResultLabel(result: ReportMutationResult): string {
  return result === 'violation' ? '违规确认' : '已驳回'
}

function resolveActionTitle(result: ReportMutationResult): string {
  return result === 'violation' ? '确认违规' : '驳回举报'
}

function resolveBatchActionLabel(result: ReportMutationResult): string {
  return result === 'violation' ? '批量确认违规' : '批量驳回'
}

function getReportRow(page: Page, reportId: string) {
  return page.locator('tbody tr').filter({
    has: page.getByLabel(`选择举报 ${reportId}`),
  }).first()
}

async function openReportCenter(page: Page, targetType: ReportTargetType): Promise<void> {
  await page.goto(`/reports?target_type=${targetType}`)
  await expect(page.getByRole('heading', { name: '举报中心' })).toBeVisible()
}

async function applyTargetFilter(
  page: Page,
  targetLabel: string,
  targetId: string | undefined
): Promise<void> {
  if (!targetId) return

  await page.getByPlaceholder(`输入${targetLabel}ID快速筛选...`).fill(targetId)
  await page.getByRole('button', { name: '应用筛选' }).click()
}

test('举报中心可以切换目标类型并展示治理入口', async ({ page }) => {
  const credentials = requireAdminCredentials()

  await loginAsAdmin(page, credentials)
  await page.goto('/reports?target_type=group')

  await expect(page.getByRole('heading', { name: '举报中心' })).toBeVisible()
  await expect(page.getByRole('button', { name: /群组举报/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /频道举报/ })).toBeVisible()

  await page.getByRole('button', { name: /频道举报/ }).click()
  await expect(page).toHaveURL(/target_type=channel/)

  await page.getByRole('button', { name: /用户举报/ }).click()
  await expect(page).toHaveURL(/target_type=user/)

  await expect(page.getByRole('button', { name: /前往/ })).toBeVisible()
})

for (const targetType of ['group', 'channel', 'user'] as const) {
  test(`${TARGET_LABEL_MAP[targetType]}举报可对固定工单执行单条处理`, async ({ page }) => {
    const credentials = requireAdminCredentials()
    const fixture = requireReportResolveFixture(targetType)
    const targetLabel = TARGET_LABEL_MAP[targetType]
    const actionTitle = resolveActionTitle(fixture.expectedResult)
    const resultLabel = resolveResultLabel(fixture.expectedResult)

    await loginAsAdmin(page, credentials)
    await openReportCenter(page, targetType)
    await applyTargetFilter(page, targetLabel, fixture.targetId)

    const row = getReportRow(page, fixture.reportId)
    await expect(row).toBeVisible()

    page.once('dialog', async (dialog) => {
      await dialog.accept(`playwright_${targetType}_${fixture.reportId}`)
    })

    await row.getByTitle(actionTitle).click()

    await expect(page.getByText('举报处理成功')).toBeVisible()
    await expect(row).toContainText(resultLabel)
  })
}

for (const targetType of ['group', 'channel', 'user'] as const) {
  test(`${TARGET_LABEL_MAP[targetType]}举报可对固定工单执行批量处理`, async ({ page }) => {
    const credentials = requireAdminCredentials()
    const fixture = requireReportBatchFixture(targetType)
    const targetLabel = TARGET_LABEL_MAP[targetType]
    const actionLabel = resolveBatchActionLabel(fixture.expectedResult)
    const resultLabel = resolveResultLabel(fixture.expectedResult)

    await loginAsAdmin(page, credentials)
    await openReportCenter(page, targetType)
    await applyTargetFilter(page, targetLabel, fixture.targetId)

    for (const reportId of fixture.reportIds) {
      await page.getByLabel(`选择举报 ${reportId}`).check()
    }

    await expect(page.getByText(`${fixture.reportIds.length} 项已选中`)).toBeVisible()
    await page.getByRole('button', { name: new RegExp(actionLabel) }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder('请输入本次批量操作原因...').fill(
      `playwright batch ${targetType} ${fixture.reportIds.join(',')}`
    )

    if (fixture.expectedResult === 'violation') {
      await dialog.getByPlaceholder('输入 VIOLATION 继续').fill('VIOLATION')
    }

    await dialog.getByRole('button', { name: '确认执行' }).click()

    await expect(
      page.getByText(new RegExp(`批量处理完成：成功\\s+${fixture.reportIds.length}\\s+条举报`))
    ).toBeVisible()

    for (const reportId of fixture.reportIds) {
      await expect(getReportRow(page, reportId)).toContainText(resultLabel)
    }

    await expect(page.getByText(`${fixture.reportIds.length} 项已选中`)).not.toBeVisible()
  })
}
