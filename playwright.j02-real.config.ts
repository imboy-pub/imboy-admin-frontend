import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Deliberately independent: never load .env.e2e or inherit production settings.
// 独立入口：不加载 .env.e2e；实际执行必须经 j02-acceptance.mjs 审批及运行态预检。
const baseURL = process.env.IMBOY_ADMIN_E2E_BASE_URL || 'http://127.0.0.1:18082'
const runId = process.env.IMBOY_J02_RUN_ID || 'discovery-only'
const output = path.resolve('test-results/j02', runId)

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'j02-role-permission-lifecycle.spec.ts',
  grep: /J02-c /,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  repeatEach: 1,
  maxFailures: 1,
  forbidOnly: true,
  timeout: 180_000,
  globalTimeout: 300_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(output, 'playwright.json') }],
    ['html', { outputFolder: path.join(output, 'html'), open: 'never' }],
  ],
  outputDir: path.join(output, 'artifacts'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    headless: true,
    storageState: { cookies: [], origins: [] },
    serviceWorkers: 'block',
    ignoreHTTPSErrors: false,
    // Reports may contain credentials if traces are enabled. Prefer sanitized JSON.
    trace: 'off', video: 'off', screenshot: 'off',
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config vite.j02.config.ts --mode j02-real --host 127.0.0.1 --port ${new URL(baseURL).port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'j02-real-chromium' }],
})
