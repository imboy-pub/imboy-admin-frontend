import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

function loadEnvFile(fileName: string): void {
  const filePath = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(filePath)) return

  const content = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key || process.env[key] !== undefined) continue

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

loadEnvFile('.env.e2e')

const e2ePort = Number(process.env.IMBOY_ADMIN_E2E_PORT || 8082)
const baseURL = process.env.IMBOY_ADMIN_E2E_BASE_URL || `http://127.0.0.1:${e2ePort}`
const disableWebServer = process.env.PLAYWRIGHT_DISABLE_WEBSERVER === '1'
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH

export default defineConfig({
  testDir: './tests/e2e',
  // 生产健康检查属 prod 专用套件（test:e2e:prod → playwright.prod-check.config.ts，
  // 依赖生产凭据/域名）。默认 test:e2e 收集它属范围错配：V1.2 曾把「外部生产登录
  // 被拒」记成默认套件失败（CP-FINAL-A03 F 类）。prod config 用 testMatch 精选，
  // 此处 testIgnore 只影响默认收集。
  //
  // PR-W2-C05：同理排除**专属集成栈套件**——它们硬依赖各自的专用运行环境
  // （宿主 origin/DB 直种坐席/QR 登录 Token/专用种子组织），任何单节点隔离
  // 后端都无法满足，在默认收集里只能产生环境性红（V1.2 B 类 23 败的根源）。
  // 各自的专属入口保留：
  //   customer-service-real/  → bun run test:e2e:customer-service:real（专属 config）
  //   customer-service-p2/    → bun run test:e2e:customer-service:p2（专属 config）
  //   customer-service-hosted/→ playwright.customer-service-hosted.config.ts（专属 config）
  //   customer-service-int02/ → playwright.customer-service-int03.config.ts（a09b）+
  //                             a08/a09 需 INT02_* 专属种子环境（ent-int01 同源栈）
  //   enterprise-ent-int01/   → ENT-INT-01 专用运行环境（数据锚 int02-org1/org2、
  //                             int02-94213488575060 等硬编码，见各 spec 头注释）
  testIgnore: [
    '**/prod-health-check.spec.ts',
    '**/customer-service-real/**',
    '**/customer-service-p2/**',
    '**/customer-service-hosted/**',
    '**/customer-service-int02/**',
    '**/enterprise-ent-int01/**',
  ],
  fullyParallel: false,
  workers: process.env.CI ? 2 : '50%',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results/playwright',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    headless: process.env.PLAYWRIGHT_HEADLESS !== '0',
    launchOptions: executablePath ? { executablePath } : undefined,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // video 录制依赖 ms-playwright 自带的 ffmpeg 二进制（缺失时 browserContext.newPage
    // 直接失败，整个套件被挡）。默认关闭消除该环境依赖；需要录像取证时显式
    // PLAYWRIGHT_VIDEO=1 并先 `npx playwright install ffmpeg`。
    video: process.env.PLAYWRIGHT_VIDEO === '1' ? 'retain-on-failure' : 'off',
  },
  webServer: disableWebServer
    ? undefined
    : {
        command: `bun run dev -- --host 127.0.0.1 --port ${e2ePort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
    },
  ],
})
