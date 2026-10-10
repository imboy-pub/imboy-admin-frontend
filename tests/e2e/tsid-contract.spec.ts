import { expect, test } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

// TSID V10 契约（W5）Admin 端浏览器级锚：
// 后端 PG BIGINT（>2^53）以 JSON 裸整数到达网络层；safeParseBigIntJson 把
// ≥16 位整数转 string 后进业务面。本用例在真实浏览器里同时验证两端：
//  1) 网络层原始响应中 id 为 16~19 位裸整数（未丢引号前形态）；
//  2) DOM 渲染的 ID 文本与网络层整数逐字一致（64-bit 精度无损，
//     未发生 float 截断/科学计数法）。
test('Admin 端 TSID 整数 ID 经解析层以字符串形态无损渲染', async ({ page }) => {
  const credentials = requireAdminCredentials()

  let wireId: string | undefined
  await page.route('**/api/adm/admin/list**', async (route) => {
    const resp = await route.fetch()
    const body = await resp.text()
    const m = body.match(/"id":(\d{16,19})/)
    if (m) wireId = m[1]
    await route.fulfill({ response: resp, body })
  })

  await loginAsAdmin(page, credentials)
  await page.goto('/admins')

  await expect
    .poll(async () => wireId, { timeout: 15_000 })
    .toMatch(/^\d{16,19}$/)
  const tsid = wireId as string

  // DOM 必须逐字渲染同一数字串：有精度损毁（float 化）时 2^53 以上的
  // 数字串末位会变化，此断言即失败。
  await expect(page.getByText(tsid, { exact: true }).first()).toBeVisible()
})
