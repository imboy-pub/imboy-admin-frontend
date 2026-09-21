/**
 * P1-E2E-01（A6-E2E）：客服域四域跨域真实链 Playwright 配置（独立 config）。
 *
 * - 与既有 e2e config 完全隔离：只匹配 tests/e2e/customer-service-real/**；
 * - Chromium 用 --host-resolver-rules 做四域解析（admin.test/cs.test/shop.test/
 *   api.test → 127.0.0.1），不改 /etc/hosts；
 * - webServer 起宿主站点服务（静态宿主页 + /api/v1 透明反代到真后端 9802），
 *   本身不伪造任何响应（mock 禁令见 a06 自检）；
 * - 单 worker 串行：主链是有状态长流程（排队→认领→回复→转接→关闭→评分）。
 */
import { defineConfig, devices } from '@playwright/test'

const HOST_PORT = Number(process.env.CSWW_E2E_HOST_PORT ?? 8901)
const HTTPS_PORT = Number(process.env.CSWW_E2E_HTTPS_PORT ?? 8443)

export default defineConfig({
  testDir: 'tests/e2e/customer-service-real',
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['json', { outputFile: 'tests/e2e/customer-service-real/.artifacts/report.json' }]],
  outputDir: 'tests/e2e/customer-service-real/.artifacts/results',
  use: {
    baseURL: `http://localhost:${HOST_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // 自签测试证书仅用于本地 dev.imboy.pub 落点（附件裸 PUT 的反代回环）。
    ignoreHTTPSErrors: true,
    // 完整 chromium 二进制（new headless）——本机缺 headless_shell 构建。
    channel: 'chromium',
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP admin.test 127.0.0.1,MAP cs.test 127.0.0.1,MAP shop.test 127.0.0.1,MAP api.test 127.0.0.1,MAP dev.imboy.pub 127.0.0.1:' +
          HTTPS_PORT,
        // 本机系统代理（http/https/socks → 127.0.0.1 + PAC）会绕过
        // host-resolver-rules（连接由代理端发起）——测试域全部本地映射，
        // 禁用代理后四域 MAP 才真正生效（实测：Playwright proxy direct://
        // 在系统代理+PAC 环境不生效，--no-proxy-server 生效）。
        '--no-proxy-server',
      ],
    },
  },
  projects: [
    {
      name: 'csww-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `node tests/e2e/customer-service-real/helpers/static-host.mjs ${HOST_PORT} ${HTTPS_PORT}`,
      url: `http://localhost:${HOST_PORT}/`,
      reuseExistingServer: true,
      timeout: 20_000,
    },
  ],
})
