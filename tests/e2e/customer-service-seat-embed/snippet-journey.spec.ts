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
import {
  ADMIN_ORIGIN,
  CONSOLE_PUBLIC_ID,
  CS_ORIGIN,
  EXECUTE_ENABLED,
  ORG_ID,
  SHOP,
  WORKSPACE_ID,
} from './helpers/env'
import { adminLogin } from './helpers/admin-ui'
import { embedFrame } from './helpers/qr-embed'

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
      // 租户上下文必填（页面要求显式 org/ws 才渲染 seat console 卡；
      // 上下文写入 URL，刷新与分享后不丢失 —— 首次进入即带齐）。
      await page.goto(
        `${ADMIN_ORIGIN}/customer-service/widgets?org=${ORG_ID}&ws=${WORKSPACE_ID}`,
        { waitUntil: 'domcontentloaded' },
      )
      // 运营页到达（A08 已断言「网站接入」标题，这里直接等工作台卡片就绪）。
      const seatCard = page.getByTestId('sc-seat-card')
      await expect(seatCard).toBeVisible({ timeout: 30_000 })

      // —— 生成端一致性：卡上 public id ↔ embed code 的 src ——
      // 组件为防泄漏默认不回显 snippet（embedShown 缺省 false），真实旅程即
      // 「点复制按钮 → 显示 + 进剪贴板」；spec 按同一交互顺序驱动。
      const publicId = (await page.getByTestId('sc-seat-public-id').textContent())?.trim() ?? ''
      expect(publicId.length, 'seat console 卡必须展示 public id').toBeGreaterThan(0)
      await page.getByRole('button', { name: '复制 iframe 代码' }).click()
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

      // —— 剪贴板链：上一步的真实复制 → 回读逐字一致 ——
      const clipboard = await page.evaluate(() => navigator.clipboard.readText())
      expect(clipboard, '剪贴板内容必须与 embed code 逐字一致').toBe(embedCode)
      // 与 A01 消费端的闭环：种子 console 的 public id 即 journey 全套用的
      // CONSOLE_PUBLIC_ID —— 同一 console 的 snippet 正是宿主 iframe 的来源。
      expect(publicId).toBe(CONSOLE_PUBLIC_ID)
    } finally {
      await ctx.close()
    }
  })

  // ---------------------------------------------------------------- F4-B
  test('F4-B 生成→部署→消费端真闭环：复制的 snippet 注入真实宿主 origin 文档后 iframe 实际加载坐席工作台', async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const page = await ctx.newPage()
    try {
      // —— 生成端（与 F4 同一真实交互序列）：登录 → 接入页 → 复制 → 剪贴板 ——
      await adminLogin(page)
      await page.goto(
        `${ADMIN_ORIGIN}/customer-service/widgets?org=${ORG_ID}&ws=${WORKSPACE_ID}`,
        { waitUntil: 'domcontentloaded' },
      )
      await expect(page.getByTestId('sc-seat-card')).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: '复制 iframe 代码' }).click()
      const embedCode = await page.getByTestId('sc-seat-embed-code').inputValue()
      expect(embedCode, 'iframe 接入代码必须已生成').toContain('<iframe')
      const srcMatch = /src="([^"]+)"/.exec(embedCode)
      expect(srcMatch, 'embed code 必须含 src 属性').toBeTruthy()
      const clipboard = await page.evaluate(() => navigator.clipboard.readText())
      expect(clipboard, '注入对象必须是剪贴板里的复制产物（部署保真）').toBe(embedCode)

      // —— 部署：把运营者拿到的 snippet 原文注入真实 shop.test 宿主文档 ——
      // 真实导航到宿主 origin（真 nginx + TLS + 自签证书），再以复制产物替换
      // 页面主体：嵌入文档 origin = shop.test（CSP frame-ancestors 白名单成员），
      // iframe 请求经真实网关命中 /seat/<public id> 动态 frame 与真实
      // dist-widget seat 资产 —— 零 page.route、零 mock、零 fixture iframe。
      const host = await ctx.newPage()
      await host.goto(`${SHOP}/`, { waitUntil: 'domcontentloaded' })
      await host.evaluate((code) => {
        document.body.innerHTML = code
      }, embedCode)

      // —— 消费端：部署出的 iframe 实际加载坐席工作台首屏 ——
      const frameEl = host.locator('iframe[title="IMBoy 客服工作台"]')
      await expect(frameEl, '宿主文档必须恰好承载 snippet 部署出的那一个 iframe').toHaveCount(1)
      await expect(frameEl, 'iframe src 必须逐字等于 snippet src').toHaveAttribute('src', srcMatch![1])
      const frame = embedFrame(host)
      const qrCode = frame.getByTestId('seat-qr-code')
      await expect(qrCode.locator('svg'), '坐席工作台必须经真实网关加载出可扫描 QR').toBeVisible({
        timeout: 30_000,
      })
      await expect(qrCode).toHaveAttribute('data-qr-content', /imboy:\/\/qr_login\?qr_token=.+/, {
        timeout: 30_000,
      })
      await host.close()
    } finally {
      await ctx.close()
    }
  })
})
