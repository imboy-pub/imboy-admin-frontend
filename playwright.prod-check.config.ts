/**
 * 生产环境健康检查专用 Playwright 配置
 * 使用本机已有的 Chrome for Testing 浏览器（非 headless shell）
 */
import { defineConfig } from '@playwright/test'

const baseURL = process.env.IMBOY_ADMIN_E2E_BASE_URL || 'https://prodadm.imboy.pub'

// 用本机已有的 headless shell（1223 版本）
const CHROME_EXEC =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  '/Users/leeyi/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/prod-health-check.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-prod', open: 'never' }],
  ],
  outputDir: 'test-results/prod-check',
  use: {
    baseURL,
    headless: true,
    screenshot: 'on',
    trace: 'off',
    video: 'off',
    launchOptions: {
      executablePath: CHROME_EXEC,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
  projects: [
    {
      name: 'chrome-prod-check',
      use: {
        launchOptions: {
          executablePath: CHROME_EXEC,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],
})
