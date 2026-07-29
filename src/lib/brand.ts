/**
 * 白标品牌配置（C0-BRAND-01）
 *
 * 单一真源：后端 `GET /brand`。字段名、默认值与校验规则必须与
 * `imboy/src/api/brand_handler.erl` 的 `defaults/0` / `normalize/1`
 * 以及 `imboyapp/lib/config/brand_config.dart` 逐条对齐——
 * 三端任一侧改动都要同步另外两侧的 fixture 测试。
 *
 * 容错原则：拿不到配置、字段缺失或值非法，都逐字段回退默认值，
 * 绝不因为一个坏字段导致整个管理台不可用。
 */

export type BrandTheme = 'light' | 'dark';

export interface BrandConfig {
  siteName: string;
  logoUrl: string;
  splashUrl: string;
  /** `#RRGGBB` */
  primaryColor: string;
  /** `#RRGGBB`，未配置为空串 */
  accentColor: string;
  theme: BrandTheme;
  slogan: string;
  copyright: string;
  company: string;
  /**
   * 客服入口地址。默认必须为空——对外联系方式只能由部署方人工填写，
   * 代码不得预置任何邮箱、电话或 IM 账号。
   */
  supportUrl: string;
  /** 隐私政策地址，同上，默认为空 */
  privacyUrl: string;
  edition: string;
}

/** 默认品牌 = 未配置任何 brand_* 时的开源 imboy 形态 */
export const BRAND_FALLBACK: Readonly<BrandConfig> = Object.freeze({
  siteName: 'imboy',
  logoUrl: '',
  splashUrl: '',
  // 与 imboyapp AppColors.primary 及后端 DEFAULT_PRIMARY_COLOR 一致
  primaryColor: '#2474E5',
  accentColor: '',
  theme: 'light',
  slogan: '',
  copyright: '',
  company: '',
  supportUrl: '',
  privacyUrl: '',
  edition: 'community',
});

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function text(value: unknown, fallback: string, allowEmpty = true): string {
  if (typeof value !== 'string') return fallback;
  if (!allowEmpty && value.length === 0) return fallback;
  return value;
}

/**
 * 只接受 http(s) 绝对地址；其余（javascript:/data:/相对路径等）一律视为未配置。
 * 这是防止后端配置被污染后注入管理台的最后一道闸。
 */
function httpUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  const ok =
    (value.startsWith('https://') && value.length > 'https://'.length) ||
    (value.startsWith('http://') && value.length > 'http://'.length);
  return ok ? value : '';
}

function hexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback;
}

function brandTheme(value: unknown): BrandTheme {
  return value === 'light' || value === 'dark' ? value : BRAND_FALLBACK.theme;
}

/** 解析后端 `GET /brand` 的 data 段；入参非对象时整体回退默认 */
export function parseBrandConfig(raw: unknown): BrandConfig {
  if (raw === null || typeof raw !== 'object') return { ...BRAND_FALLBACK };
  const j = raw as Record<string, unknown>;
  return {
    siteName: text(j.site_name, BRAND_FALLBACK.siteName, false),
    logoUrl: httpUrl(j.logo_url),
    splashUrl: httpUrl(j.splash_url),
    primaryColor: hexColor(j.primary_color, BRAND_FALLBACK.primaryColor),
    accentColor: hexColor(j.accent_color, BRAND_FALLBACK.accentColor),
    theme: brandTheme(j.theme),
    slogan: text(j.slogan, BRAND_FALLBACK.slogan),
    copyright: text(j.copyright, BRAND_FALLBACK.copyright),
    company: text(j.company, BRAND_FALLBACK.company),
    supportUrl: httpUrl(j.support_url),
    privacyUrl: httpUrl(j.privacy_url),
    edition: text(j.edition, BRAND_FALLBACK.edition, false),
  };
}

/** 站点名被改过即视为已换品牌 */
export function isWhiteLabelled(brand: BrandConfig): boolean {
  return brand.siteName !== BRAND_FALLBACK.siteName;
}
