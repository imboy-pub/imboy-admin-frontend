/**
 * P2-E2E-01（A7）：真实后端与种子环境常量（P2 专用；端口 8911/8943，与 P1 的
 * 8901/8443 完全隔离）。种子由 run 环境提供（csww_e2e_chain.sh 配方 +
 * setup/init 管理员首启），这里只固化事实值，不构造任何替身。
 */
export const BACKEND_BASE = process.env.CSWW_P2_BACKEND ?? 'http://127.0.0.1:9802'

/** P2 静态承载（Host 路由）：shop.test=widget 宿主、admin.test=管理面 SPA，
 * 双双走 https 自签落点（8943）：SPA 登录 RSA 与 widget 附件 SHA-256 哈希都
 * 依赖 crypto.subtle —— 仅 secure context 可用，http 自定义域不可用；localhost
 * 豁免是 P1 能用 http 的原因，本套件四域必须全 https + ignoreHTTPSErrors。 */
export const SHOP_ORIGIN = process.env.CSWW_P2_SHOP_ORIGIN ?? 'https://shop.test:8943'
export const ADMIN_ORIGIN = process.env.CSWW_P2_ADMIN_ORIGIN ?? 'https://admin.test:8943'

/** 管理员治理面账号（经真实首启端点 /api/adm/setup/init 创建；captcha 1234 为
 * local 环境合同测试码，见 adm_passport_handler ?ADM_TEST_CAPTCHA）。 */
export const ADMIN = {
  account: 'csww-admin-e2e@imboy.local',
  password: 'CswwAdmE2e2026',
  captcha: '1234',
}

export const ORG_ID = '1603940848519155'
export const WORKSPACE_ID = '1776025844701027'
export const INSTALLATION_ID = '5837897154422619'
export const PUBLIC_WIDGET_ID = 'csww-e2e-widget-77729338'

/** 合成坐席（A=org owner 具治理面权限；B=转接目标；种子来自 chain 配方）。 */
export const SEAT_A = { account: '19900000001', identityId: '1812620870393267' }
export const SEAT_B = { account: '19900000002', identityId: '8304657945488544' }
export const SEAT_PASSWORD = 'CswwE2e2026'

/** csww run 的 scratch PG（docker 容器 imboy_pg18；与 P1 共库）。 */
export const PG = {
  container: 'imboy_pg18',
  user: 'imboy_user',
  database: process.env.CSWW_P2_PG_DB ?? 'csww_20260920T051447Z',
}
