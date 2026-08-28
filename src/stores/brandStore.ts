import { create } from 'zustand'
import { BRAND_FALLBACK, type BrandConfig } from '@/lib/brand'

/**
 * 白标品牌运行时状态（C0-BRAND-01 / ADM-01）。
 *
 * 初始值 = BRAND_FALLBACK（未配置任何 brand_* 的开源 imboy 形态）；
 * 启动时由 `initBrandRuntime()`（src/lib/brandRuntime.ts）拉取后端
 * `GET /brand` 成功后覆盖。任何拉取失败都停留默认，绝不阻塞管理台可用。
 */
interface BrandState {
  brand: BrandConfig
  setBrand: (_brand: BrandConfig) => void
}

export const useBrandStore = create<BrandState>((set) => ({
  brand: { ...BRAND_FALLBACK },
  setBrand: (brand) => set({ brand }),
}))
