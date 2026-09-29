/**
 * SC-E2E — REVIEW-4 F4（B-8）：Admin「生成 snippet → 部署」真实浏览器旅程。
 *
 * 此前 E2E 的宿主 iframe 全是手写 fixture（host-shop.html），「运营者在网站
 * 接入页拿到 snippet → 部署到商城后台」的生成端零浏览器覆盖。本 spec 补上
 * 生成端：Admin SPA 真实登录 → 网站接入页 seat console 卡 → 读取 iframe 接入
 * 代码 → 断言其 src 与 frame URL 合同（expectedFrameUrl 同一 origin/路径模板）
 * 一致 → 真实剪贴板复制回读一致 —— 与 journey A01 的宿主 iframe 拼成
 * 「生成端 → 消费端」端到端闭环。
 *
 * ⛔ EXECUTE-GATED：同 journey.spec.ts（SC153_E2E_EXECUTE=1 才执行）。
 */
import { expect, test } from '@playwright/test'
import { ADMIN_ORIGIN, CONSOLE_PUBLIC_ID, CS_ORIGIN, EXECUTE_ENABLED } from './helpers/env'
import { adminLogin } from './helpers/admin-ui'

test.skip(!EXECUTE_ENABLED, 'EXECUTE-GATED: A0 sets SC153_E2E_EXECUTE=1 after SC-INT PASS + frozen candidate manifest')

test.describe('SC-E2E snippet 旅程（EXECUTE-GATED）', () => {
  test('F4 网站接入页：embed code 的 src 与 frame URL 合同一致 + 剪贴板复制保真', async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const page = await ctx.newPage()
    try {
      await adminLogin(page)
      await page.goto(`${ADMIN_ORIGIN}/customer-service/widgets`, { waitUntil: 'domcontentloaded' })
      // 运营页到达（A08 已断言「网站接入」标题，这里直接等工作台卡片就绪）。
      const seatCard = page.getByTestId('sc-seat-card')
      await expect(seatCard).toBeVisible({ timeout: 30_000 })

      // —— 生成端一致性：卡上 public id ↔ embed code 的 src ——
      const publicId = (await page.getByTestId('sc-seat-public-id').textContent())?.trim() ?? ''
      expect(publicId.length, 'seat console 卡必须展示 public id').toBeGreaterThan(0)
      const embedCode = await page.getByTestId('sc-seat-embed-code').inputValue()
      expect(embedCode, 'iframe 接入代码必须已生成').toContain('<iframe')
      const srcMatch = /src="([^"]+)"/.exec(embedCode)
      expect(srcMatch, 'embed code 必须含 src 属性').toBeTruthy()
      // frame URL 合同：同一 origin（CS_ORIGIN）+ 同一 /seat/<public id> 路径模板
      // ——与 journey A01 宿主 iframe 的 src（expectedFrameUrl）同构，只是 id 来源
      // 是本卡的 UI 状态而非种子常量（生成端与消费端由同一合同拼接）。
      expect(srcMatch![1], 'snippet src 必须与 frame URL 合同一致').toBe(`${CS_ORIGIN}/seat/${publicId}`)
      // sandbox 三值冻结合同在生成端同样成立（S7/S8）。
      expect(embedCode).toContain('allow-scripts allow-same-origin allow-downloads')

      // —— 复制链：真实按钮 → 剪贴板 → 回读逐字一致 ——
      await page.getByRole('button', { name: '复制 iframe 代码' }).click()
      const clipboard = await page.evaluate(() => navigator.clipboard.readText())
      expect(clipboard, '剪贴板内容必须与 embed code 逐字一致').toBe(embedCode)
      // 与 A01 消费端的闭环：种子 console 的 public id 即 journey 全套用的
      // CONSOLE_PUBLIC_ID —— 同一 console 的 snippet 正是宿主 iframe 的来源。
      expect(publicId).toBe(CONSOLE_PUBLIC_ID)
    } finally {
      await ctx.close()
    }
  })
})
