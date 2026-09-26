/**
 * CS-INT-03（a09b 附件门）专用 Playwright 配置。
 *
 * 与主 config 的差异（附件链路的浏览器侧要求，全部环境层，零业务 mock）：
 *  - testMatch 只匹配 a09b（a08/a09 仍走主 config）；
 *  - Chromium --host-resolver-rules：后端 presign 下发的 upload.url 基址是
 *    base_url（https://dev.imboy.pub:8443，fail-closed 要求 https）——把
 *    dev.imboy.pub MAP 到 127.0.0.1，由 static-host 的 https 落点（自签证书，
 *    CN=dev.imboy.pub）透明反代回真实 Cowboy 19802；ignoreHTTPSErrors 接受
 *    本地自签证书；
 *  - --no-proxy-server：本机系统代理（PAC）会绕过 host-resolver-rules，
 *    测试域必须直连本地（P1-E2E-01 同款实证）；
 *  - webServer = vite dev :8904（Web Seat 工作台真实渲染，API 经 vite proxy
 *    同源转发到 19802；SSE 流式转发已冒烟验证）。
 */
import { defineConfig, devices } from '@playwright/test'

const ADMIN_PORT = Number(process.env.CSINT03_ADMIN_PORT ?? 8904)
const PROXY_TARGET = process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:19802'
// 附件裸 PUT 落点（base_url）进 dev CSP connect-src（生产由 docker entrypoint
// 注入 __IMBOY_API_HOST__；dev 缺省 'self' 会拦服务端下发的绝对上传地址）。
const CSP_API_HOST = process.env.IMBOY_DEV_CSP_API_HOST ?? 'https://dev.imboy.pub:8443'

export default defineConfig({
  testDir: 'tests/e2e/customer-service-int02',
  testMatch: /a09b-.*\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['json', { outputFile: 'tests/e2e/customer-service-int02/.artifacts-a09b/report.json' }]],
  outputDir: 'tests/e2e/customer-service-int02/.artifacts-a09b/results',
  use: {
    ...devices['Desktop Chrome'],
    headless: process.env.PLAYWRIGHT_HEADLESS !== '0',
    ignoreHTTPSErrors: true,
    // 完整 chromium 二进制（本机缺 headless_shell 构建）。
    channel: 'chromium',
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP dev.imboy.pub 127.0.0.1',
        '--no-proxy-server',
      ],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: `VITE_PROXY_TARGET=${PROXY_TARGET} IMBOY_DEV_CSP_API_HOST=${CSP_API_HOST} bun run dev -- --host 127.0.0.1 --port ${ADMIN_PORT}`,
      url: `http://127.0.0.1:${ADMIN_PORT}/`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
