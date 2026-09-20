/**
 * 客服 Widget installation 管理面纯函数（CSW-01）。
 *
 * 安全要点（CSW-01-A04/A06）：
 * - installation 投影走「白名单 + 敏感键熔断」双层（复用 CS-03 的 isSensitiveKey），
 *   即便后端误把 shop_key 塞进列表行也进不了展示视图；
 * - 接入代码只含 `<script>` 标签 + public widget_id（PUBLIC 标识），绝不出现任何
 *   secret/签名密钥/长期 token；
 * - allowed_origins 逐行校验（http(s) origin，禁通配/路径），非法行报错不落库。
 */
import { isSensitiveKey } from './pureFunctions'

export type WidgetInstallation = {
  id: string
  organization_id: string
  // installation 是 Org 级公开接入面；workspace_id 只属于管理接口请求上下文。
  display_name: string
  public_widget_id: string
  allowed_origins: string[]
  branding: { display_name: string | null; primary_color: string | null }
  consent_version: string
  status: 'active' | 'revoked' | string
  created_at: string | null
}

/** installation 展示白名单（branding 子键单独投影）。 */
export const WIDGET_INSTALLATION_SAFE_KEYS = [
  'id',
  'organization_id',
  'display_name',
  'public_widget_id',
  'allowed_origins',
  'consent_version',
  'status',
  'created_at',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 严格 origin 规范化（ADM-01 复用导出）：http(s) + 精确 protocol/host/port，
 * 拒绝路径/查询串/hash/通配；非法返回 null。开通向导与 installation 共用同一实现，
 * 避免出现第二套 origin 校验口径。
 */
export function originOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\/+$/, '')
  if (trimmed.length === 0) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    // 只接受裸 origin：拒绝路径 / 查询串 / hash / 通配
    if ((url.pathname !== '' && url.pathname !== '/') || url.search !== '' || url.hash !== '') return null
    if (url.hostname.includes('*')) return null
    return url.origin
  } catch {
    return null
  }
}

/** installation 层附加敏感键（shop_key / identity key / 一次性 secret 包装）。 */
const INSTALLATION_SENSITIVE_EXTRA = /shop_key|identity_key|one_time_secret/i

/** 行投影：白名单 + 敏感键熔断双层；缺 id 或 public_widget_id 返回 null（fail-closed）。 */
export function toWidgetInstallation(raw: unknown): WidgetInstallation | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const publicWidgetId = str(raw.public_widget_id)
  if (id.length === 0 || publicWidgetId.length === 0) return null
  for (const key of Object.keys(raw)) {
    if (key === 'public_widget_id') continue
    // 熔断：命中敏感键（CS-03 模式或 shop_key/identity_key/一次性 secret）的行整体丢弃
    if (isSensitiveKey(key) || INSTALLATION_SENSITIVE_EXTRA.test(key)) {
      return null
    }
  }
  const originsRaw = Array.isArray(raw.allowed_origins) ? raw.allowed_origins : []
  const brandingRaw = isRecord(raw.branding) ? raw.branding : {}
  const color = typeof brandingRaw.primary_color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(brandingRaw.primary_color) ? brandingRaw.primary_color : null
  return {
    id,
    organization_id: str(raw.organization_id),
    display_name: str(raw.display_name),
    public_widget_id: publicWidgetId,
    allowed_origins: originsRaw.map(originOrNull).filter((o): o is string => o !== null),
    branding: {
      display_name: typeof brandingRaw.display_name === 'string' ? brandingRaw.display_name : null,
      primary_color: color,
    },
    consent_version: str(raw.consent_version),
    status: str(raw.status) || 'active',
    // 后端全 API 惯例：时间为 epoch 秒 number（sv_ts/created_at 同口径）。
    // number 规范化为 string 以满足 WidgetInstallation 类型合同；仅 null/undefined 落 null。
    created_at: raw.created_at == null ? null : String(raw.created_at),
  }
}

export function toWidgetInstallationList(raw: unknown): WidgetInstallation[] {
  const list = isRecord(raw) && Array.isArray(raw.installations) ? raw.installations : Array.isArray(raw) ? raw : []
  return list.map(toWidgetInstallation).filter((item): item is WidgetInstallation => item !== null)
}

/** public widget id 形状校验（PUBLIC 标识；防止把任意文本拼进接入代码片段）。 */
export function isValidPublicWidgetId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value)
}

/** organization_id（TSID 十进制串）形状校验——widget 面每条请求的必填申报键。 */
export function isValidOrganizationId(value: string): boolean {
  return /^[0-9]{1,20}$/.test(value) && Number(value) > 0
}

/**
 * 生成商家接入代码：script 标签 + public widget_id + organization_id
 * （widget 面每条请求的必填申报键，org_source=param）。
 * 绝不包含 shop_key / 签名 secret / visit token——由单测负例锁死。
 */
export function buildEmbedCode(
  publicWidgetId: string,
  options: {
    widgetOrigin: string
    organizationId: string
    locale?: string | null
    position?: string | null
  }
): string {
  if (!isValidPublicWidgetId(publicWidgetId)) {
    throw new Error('public_widget_id 形状非法，拒绝生成接入代码')
  }
  if (!isValidOrganizationId(options.organizationId)) {
    throw new Error('organization_id 形状非法，拒绝生成接入代码')
  }
  const origin = originOrNull(options.widgetOrigin)
  if (origin === null) throw new Error('Widget 域名非法，拒绝生成接入代码')
  const attrs: string[] = [
    'async',
    `src="${origin}/loader.js"`,
    `data-widget-id="${publicWidgetId}"`,
    `data-org-id="${options.organizationId}"`,
  ]
  if (typeof options.locale === 'string' && /^[A-Za-z-]{2,10}$/.test(options.locale)) {
    attrs.push(`data-locale="${options.locale}"`)
  }
  if (options.position === 'bottom-left' || options.position === 'bottom-right') {
    attrs.push(`data-position="${options.position}"`)
  }
  return `<script ${attrs.join(' ')}></script>`
}

/** allowed_origins 表单解析：逐行（或逗号）分隔，非法 origin 返回错误列表。 */
export function parseAllowedOriginsInput(input: string): { origins: string[]; errors: string[] } {
  const origins: string[] = []
  const errors: string[] = []
  for (const piece of input.split(/[\n,]/)) {
    const trimmed = piece.trim()
    if (trimmed.length === 0) continue
    const origin = originOrNull(trimmed)
    if (origin === null) {
      errors.push(trimmed)
      continue
    }
    if (!origins.includes(origin)) origins.push(origin)
  }
  return { origins, errors }
}
