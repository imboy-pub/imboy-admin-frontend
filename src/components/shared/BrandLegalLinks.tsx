import { useBrandStore } from '@/stores/brandStore'
import { brandLegalLinks } from '@/lib/brandRuntime'

/**
 * 品牌合法/客服外链（白标接线点④，C0-BRAND-01 / ADM-01）。
 *
 * 隐私政策/客服支持地址完全来自部署方的 brand_* 配置（后端 GET /brand），
 * URL 已在 parseBrandConfig 清洗为 http(s) 绝对地址；未配置任何一项时
 * 整体不渲染——代码不预置任何联系方式。
 */
export function BrandLegalLinks() {
  const brand = useBrandStore((state) => state.brand)
  const links = brandLegalLinks(brand)
  if (links.length === 0) {
    return null
  }
  return (
    <nav
      aria-label="品牌链接"
      className="flex items-center justify-center gap-3 text-xs text-sidebar-foreground/70"
    >
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-sidebar-foreground hover:underline"
        >
          {link.label}
        </a>
      ))}
    </nav>
  )
}
