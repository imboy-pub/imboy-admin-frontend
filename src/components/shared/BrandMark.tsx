import { useBrandStore } from '@/stores/brandStore'
import { adminTitle } from '@/lib/brandRuntime'

/**
 * 顶栏品牌标识（白标接线点②，C0-BRAND-01 / ADM-01）。
 *
 * brand.logoUrl 配置了 http(s) logo 时渲染图片（CSP img-src 已允许 https），
 * 未配置则纯文本；标题文本始终来自 brand.siteName——默认品牌下即
 * "imboy 管理后台"，白标部署无需改前端源码重新构建。
 */
export function BrandMark() {
  const brand = useBrandStore((state) => state.brand)
  return (
    <div className="flex items-center gap-2">
      {brand.logoUrl !== '' && (
        <img
          src={brand.logoUrl}
          alt={brand.siteName}
          className="h-8 w-auto max-w-32 object-contain"
        />
      )}
      <h1 className="text-lg font-semibold">{adminTitle(brand)}</h1>
    </div>
  )
}
