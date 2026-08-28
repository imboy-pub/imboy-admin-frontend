/**
 * 白标品牌运行时接线（C0-BRAND-01 / ADM-01）
 *
 * 数据源：后端公开端点 `GET /brand`（imboy/src/api/brand_handler.erl，
 * 无需认证，挂在后端根路径而非 /api/adm 下）。响应包装与全部 API 一致：
 * `{code: 0, msg, payload}`，品牌字段在 payload 段（见 ApiResponse 类型）。
 *
 * 消费链（全部通过 useBrandStore 驱动，本模块只负责加载与文档副作用）：
 *   ① document.title —— applyBrandToDocument
 *   ② 顶栏 logo/站名 —— src/components/shared/BrandMark.tsx
 *   ③ 主题主色 —— `--primary` CSS 变量注入 documentElement（最小接入，
 *      不重构主题系统；明暗两套 --primary 会被 inline 值统一覆盖为品牌色）
 *   ④ 隐私/客服链接 —— src/components/shared/BrandLegalLinks.tsx
 *
 * 容错原则：fetch 失败、HTTP 非 2xx、响应非 JSON（如被 SPA fallback 返回
 * index.html）、code !== 0，一律静默回退 BRAND_FALLBACK，绝不因品牌配置
 * 不可达阻塞管理台渲染。
 */
import { BRAND_FALLBACK, parseBrandConfig, type BrandConfig } from './brand'
import { useBrandStore } from '@/stores/brandStore'

/** 后端品牌端点（根路径；dev 经 vite proxy 转发，生产需网关放行） */
const BRAND_ENDPOINT = '/brand'

const ADMIN_TITLE_SUFFIX = '管理后台'

/** 品牌化应用标题：`${siteName} 管理后台` */
export function adminTitle(brand: BrandConfig): string {
  return `${brand.siteName} ${ADMIN_TITLE_SUFFIX}`
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/

/**
 * `#RRGGBB` → `'H S% L%'`（index.css 中 `--primary` 变量的分量格式，
 * 消费方式为 `hsl(var(--primary))`）。非法输入回退默认主色的 HSL。
 */
export function hexToHslVars(hex: string): string {
  if (!HEX_COLOR_RE.test(hex)) {
    hex = BRAND_FALLBACK.primaryColor
  }
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  let h = 0
  let s = 0
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) * 60
    } else if (max === g) {
      h = ((b - r) / delta + 2) * 60
    } else {
      h = ((r - g) / delta + 4) * 60
    }
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/**
 * 把品牌副作用应用到文档：标题 + 主色 CSS 变量。
 * 幂等，可重复调用（每次 setBrand 后由订阅器触发）。
 */
export function applyBrandToDocument(brand: BrandConfig, doc: Document): void {
  doc.title = adminTitle(brand)
  doc.documentElement.style.setProperty('--primary', hexToHslVars(brand.primaryColor))
}

interface BrandLink {
  key: 'privacy' | 'support'
  label: string
  href: string
}

/**
 * 品牌合法/客服链接模型：URL 为空（未配置或非法被清洗）的项直接过滤，
 * 消费方（BrandLegalLinks）拿到空数组即不渲染——代码不预置任何联系方式。
 */
export function brandLegalLinks(brand: BrandConfig): BrandLink[] {
  const links: BrandLink[] = []
  if (brand.privacyUrl !== '') {
    links.push({ key: 'privacy', label: '隐私政策', href: brand.privacyUrl })
  }
  if (brand.supportUrl !== '') {
    links.push({ key: 'support', label: '客服支持', href: brand.supportUrl })
  }
  return links
}

interface BrandResponseShape {
  code?: unknown
  payload?: unknown
}

/**
 * 拉取后端品牌配置并解析；任何一步失败都静默回退默认品牌。
 * fetchImpl 参数仅供测试注入，生产路径用全局 fetch。
 */
export async function fetchBrandConfig(
  fetchImpl: typeof fetch = fetch
): Promise<BrandConfig> {
  try {
    const res = await fetchImpl(BRAND_ENDPOINT)
    if (!res.ok) {
      return { ...BRAND_FALLBACK }
    }
    const json = (await res.json()) as BrandResponseShape
    if (json === null || typeof json !== 'object' || json.code !== 0) {
      return { ...BRAND_FALLBACK }
    }
    return parseBrandConfig(json.payload)
  } catch {
    // 网络错误 / 响应非 JSON（如 SPA fallback 的 index.html）→ 默认品牌
    return { ...BRAND_FALLBACK }
  }
}

let subscribed = false

/**
 * 启动时调用（main.tsx，fire-and-forget）：
 * 1. 立即应用默认品牌（保证无后端时标题/主色也有正确基线，无闪烁）；
 * 2. 注册 store 订阅——此后任何 setBrand 都自动同步 document 副作用
 *    （订阅只注册一次；init 本身可重入，生产 main.tsx 仅调用一次）；
 * 3. 异步拉取 GET /brand，成功则覆盖默认（触发全站品牌重渲染）。
 */
export function initBrandRuntime(fetchImpl?: typeof fetch): void {
  if (!subscribed) {
    subscribed = true
    useBrandStore.subscribe((state) => {
      applyBrandToDocument(state.brand, document)
    })
  }
  applyBrandToDocument(useBrandStore.getState().brand, document)

  void fetchBrandConfig(fetchImpl).then((brand) => {
    useBrandStore.getState().setBrand(brand)
  })
}
