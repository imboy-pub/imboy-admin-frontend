/**
 * SC-E2E（seat console embed 真实浏览器 E2E）— 独立 Playwright config。
 *
 * 与既有入口的关系（详见 tests/e2e/customer-service-seat-embed/README.md）：
 *   * playwright.customer-service-hosted.config.ts —— hosted Widget 第三方托管面
 *     （本 config 的母版，拓扑口径原样继承）；
 *   * 本 config —— 商城管理后台 iframe 直嵌坐席工作台（/seat/<public_seat_console_id>）：
 *     cs.test:18443 = cs.imboy.pub 的本地等价网关（E2E 域名映射见 README），
 *     真实 nginx TLS + 真实 dist-widget 静态产物（含 mode=seat seat-assets）+ 真实 backend。
 *
 * 阶段门（FIXTURE_ONLY → EXECUTE）：
 *   * contract.spec.ts        —— 纯静态合同测试，FIXTURE_ONLY 即跑（无需 backend）；
 *   * journey.spec.ts (A01..A10) —— 真实业务旅程，`SC153_E2E_EXECUTE=1` 才执行
 *     （A0 在 SC-INT PASS + candidate manifest 冻结后置位）。
 *
 * 前置（harness 一键拉起，见 README.md）：
 *   backend 9801（scratch 库 sc153_e2e）+ nginx 五域 18443 + dist-widget + 种子。
 * 单 worker 串行：主链为有状态长流程（QR 登录 → 队列 → 会话 → SSE → 附件）。
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e/customer-service-seat-embed',
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['json', { outputFile: 'tests/e2e/customer-service-seat-embed/.artifacts/report.json' }]],
  outputDir: 'tests/e2e/customer-service-seat-embed/.artifacts/results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // 本地自签证书（scratch 专用），仅测试域。
    ignoreHTTPSErrors: true,
    channel: 'chromium',
    launchOptions: {
      args: [
        // 五域 loopback 解析（不改 /etc/hosts）：shop.test（合法宿主 + 访客页）、
        // cs.test（= cs.imboy.pub 本地等价 seat 网关）、evil.test（负例宿主）、
        // shop2.test（A06 origin 轮换的第二个合法宿主）、admin.test（Admin SPA 面）。
        '--host-resolver-rules=MAP shop.test 127.0.0.1,MAP cs.test 127.0.0.1,MAP evil.test 127.0.0.1,MAP shop2.test 127.0.0.1,MAP admin.test 127.0.0.1',
        // 本机系统代理会绕过 host-resolver-rules —— 禁用代理后 MAP 才真正生效
        // （与 customer-service-hosted 同款结论）。
        '--no-proxy-server',
      ],
    },
    baseURL: 'https://shop.test:18443',
  },
  projects: [{ name: 'seat-embed-chromium', use: { ...devices['Desktop Chrome'] } }],
})
