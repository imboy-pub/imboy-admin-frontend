/**
 * CP-ASSET-02（hosted Widget 真实 E2E 入仓）— 独立 Playwright config（real 面）。
 *
 * 与既有两入口的关系（详见 tests/e2e/customer-service-hosted/README.md）：
 *   * tests/e2e/*.spec.ts / *.mock.spec.ts   —— mock/本地 dev server 面（只读，本卡不改）；
 *   * playwright.customer-service-real.config.ts —— 客服坐席域四域主链（宿主页为
 *     本测试静态服务承载）；
 *   * 本 config —— hosted Widget 第三方托管面（snippet/loader/iframe 真实网络栈，
 *     nginx TLS 网关 + 真实 dist-widget 静态产物 + 真实 backend）。
 *
 * 前置（harness 一键拉起，见 README.md）：
 *   backend 9805（scratch DB）+ nginx 四域 18443 + dist-widget 静态产物 + 种子。
 * 单 worker 串行：主链为有状态长流程（排队→坐席回复→关闭→评分）。
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e/customer-service-hosted',
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['json', { outputFile: 'tests/e2e/customer-service-hosted/.artifacts/report.json' }]],
  outputDir: 'tests/e2e/customer-service-hosted/.artifacts/results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // 本地自签证书（scratch 专用），仅测试域。
    ignoreHTTPSErrors: true,
    channel: 'chromium',
    launchOptions: {
      args: [
        // 四域 loopback 解析（不改 /etc/hosts）。
        '--host-resolver-rules=MAP cs.test 127.0.0.1,MAP shop.test 127.0.0.1,MAP shop2.test 127.0.0.1,MAP api.test 127.0.0.1',
        // 本机系统代理会绕过 host-resolver-rules —— 测试域全部本地映射，禁用
        // 代理后四域 MAP 才真正生效（与 customer-service-real 同款结论）。
        '--no-proxy-server',
      ],
    },
  },
  projects: [{ name: 'hosted-chromium', use: { ...devices['Desktop Chrome'] } }],
})
