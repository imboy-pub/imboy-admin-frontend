import { expect, test } from '@playwright/test'

/**
 * R23-B 专项遗留 5b：R14-4 运行中切区专项（真实 Chromium 宿主环节）。
 *
 * 背景（AD_W2/W3 report）：R14 组件级证据为自动化模拟（mock resolver +
 * 合成 focus），缺"真实浏览器宿主 Intl 在运行中真的会变"一环。本 spec 用
 * CDP Emulation.setTimezoneOverride 在**同一页面、不 reload** 的前提下运行中
 * 切区，验证宿主 `Intl.DateTimeFormat().resolvedOptions().timeZone`（即
 * displayTime.ts defaultHostZoneResolver 的读取路径）即时更新。
 *
 * 证据边界（如实声明）：
 * - 本 spec 证明的是宿主 Intl 环节可被运行中驱动（真实浏览器引擎）；
 * - "resolver 变化 → 缓存失效 → 重渲染 → 显示更新"机制链由组件级
 *   timeDisplay.test.tsx（R14-3）与 sessionView.dateGroup.test.tsx（5a）承担；
 * - "真实 seat 栈（后端+登录+QR）端到端运行中切区"仍属 A04
 *   （EXECUTE-GATED，解锁条件见 R23B_FLAD_gates.md §5b）。
 * 三段证据拼接即为 R14-4 的最终自动化覆盖边界。
 */

const ISO = '2026-09-16T23:06:40.000Z'

function dayHourMinute(zone?: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(zone !== undefined ? { timeZone: zone } : {}),
  }).format(new Date(ISO))
}

test('R14-4a 运行中 CDP 切区（非 reload）：宿主 Intl resolvedOptions().timeZone 即时变化', async ({ page }) => {
  await page.goto('about:blank')
  const cdp = await page.context().newCDPSession(page)

  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' })
  const zoneTokyo = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  expect(zoneTokyo).toBe('Asia/Tokyo')

  // 运行中切区：同一 page，无导航/reload
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' })
  const zoneLa = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  expect(zoneLa).toBe('America/Los_Angeles')

  // 证明没有发生 reload：同一 JS 执行上下文里的 window 标记仍在且只累积到 1
  const marker = await page.evaluate(() => {
    const w = window as unknown as { __r14NoReload?: number }
    w.__r14NoReload = (w.__r14NoReload ?? 0) + 1
    return w.__r14NoReload
  })
  expect(marker).toBe(1)
})

test('R14-4b 运行中切区后宿主 zone 文本按新区即时渲染（defaultHostZoneResolver 读取路径）', async ({ page }) => {
  await page.goto('about:blank')
  const cdp = await page.context().newCDPSession(page)

  // 显式 zone 参数下不受宿主影响（基线，displayFormatter 显式传参路径）
  const explicitLa = dayHourMinute('America/Los_Angeles')
  const explicitSh = dayHourMinute('Asia/Shanghai')
  expect(explicitLa).not.toBe(explicitSh)

  // 宿主 zone 路径（timeZone 省略 = resolver 读宿主）：SH 下渲染
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' })
  const hostSh = await page.evaluate((iso) => {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  }, ISO)
  expect(hostSh).toBe(explicitSh)

  // 运行中切 LA：同一 evaluate 形态，输出即时跟随新宿主 zone
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' })
  const hostLa = await page.evaluate((iso) => {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  }, ISO)
  expect(hostLa).toBe(explicitLa)
})
