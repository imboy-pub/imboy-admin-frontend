/**
 * P2-E2E-01（A7）：客服域四域真链 Playwright 配置（独立 config，独立于 P1）。
 *
 * - 只匹配 tests/e2e/customer-service-p2/**；
 * - --host-resolver-rules 四域解析（admin.test/cs.test/shop.test/api.test →
 *   127.0.0.1；dev.imboy.pub → 本进程 https 落点 8943），不改 /etc/hosts；
 * - 系统代理会整体绕过 host-resolver-rules —— 必须显式 --no-proxy-server
 *   （P1 实证口径，proxy: direct:// 无效）；
 * - webServer 起 shop.test/admin.test 静态承载 + /api 透明反代（不伪造任何
 *   响应，mock 禁令见 a06 自检）；
 * - 单 worker 串行：主链是有状态长流程（QR 登录→接单→回复→转接→关闭→评分）。
 */
import { defineConfig, devices } from '@playwright/test'

const HOST_PORT = Number(process.env.CSWW_P2_HOST_PORT ?? 8911)
const HTTPS_PORT = Number(process.env.CSWW_P2_HTTPS_PORT ?? 8943)

export default defineConfig({
  testDir: 'tests/e2e/customer-service-p2',
  testMatch: /.*\.spec\.ts$/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['json', { outputFile: 'tests/e2e/customer-service-p2/.artifacts/report.json' }]],
  outputDir: 'tests/e2e/customer-service-p2/.artifacts/results',
  use: {
    baseURL: `http://shop.test:${HOST_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // 自签测试证书仅用于本地 dev.imboy.pub 落点（附件裸 PUT 的反代回环）。
    ignoreHTTPSErrors: true,
    // 完整 chromium 二进制（本机缺 headless_shell 构建）。
    channel: 'chromium',
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP admin.test 127.0.0.1,MAP cs.test 127.0.0.1,MAP shop.test 127.0.0.1,MAP api.test 127.0.0.1,MAP dev.imboy.pub 127.0.0.1:' +
          HTTPS_PORT,
        '--no-proxy-server',
      ],
    },
  },
  projects: [
    {
      name: 'csww-p2-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `node tests/e2e/customer-service-p2/helpers/static-host-p2.mjs ${HOST_PORT} ${HTTPS_PORT}`,
      url: `http://localhost:${HOST_PORT}/`,
      reuseExistingServer: true,
      timeout: 20_000,
    },
  ],
})
