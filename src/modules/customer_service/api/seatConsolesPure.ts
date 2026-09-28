/**
 * 客服坐席工作台（seat console）管理面纯函数（SC-FE）。
 *
 * 安全要点（对齐 CSW-01 widgetInstallationsPure 的双层纪律）：
 * - console 投影走「白名单 + 敏感键熔断」双层（复用 CS-03 的 isSensitiveKey），
 *   即便后端误把 secret/token 塞进列表行也进不了展示视图；
 * - 嵌入代码只是一个指向 cs 域的 `<iframe>` + public_seat_console_id（PUBLIC
 *   标识），绝不出现 script loader、token、secret、organization_id、
 *   workspace_id 或 API base（由单测负例锁死）；
 * - iframe 域名只有一个真源：widgetConfig.ts 的 CUSTOMER_SERVICE_WIDGET_ORIGIN，
 *   不引入第二套 origin 口径；
 * - allowed_origins 解析复用 widget 侧导出的 parseAllowedOriginsInput
 *   （同一校验实现，不开第二套口径）。
 */
import { isSensitiveKey } from './pureFunctions'
import { originOrNull, parseAllowedOriginsInput } from './widgetInstallationsPure'
import { CUSTOMER_SERVICE_WIDGET_ORIGIN } from '../widgetConfig'

/** 复用 widget 侧导出，保证 origin 表单解析只有一套实现。 */
export { parseAllowedOriginsInput }

export type SeatConsole = {
  id: string
  organization_id: string
  workspace_id: string
  /** 公开坐席工作台标识（TSID 十进制串；嵌入代码唯一可变部分）。 */
  public_seat_console_id: string
  allowed_origins: string[]
  status: 'active' | 'revoked' | string
  version: number
  created_at: string | null
  updated_at: string | null
}

/** console 展示白名单（无 branding 子结构，纯扁平键）。 */
export const SEAT_CONSOLE_SAFE_KEYS = [
  'id',
  'organization_id',
  'workspace_id',
  'public_seat_console_id',
  'allowed_origins',
  'status',
  'version',
  'created_at',
  'updated_at',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** console 层附加敏感键（与 widget installation 同口径）。 */
const SEAT_CONSOLE_SENSITIVE_EXTRA = /shop_key|identity_key|one_time_secret/i

/** 行投影：白名单 + 敏感键熔断双层；缺 id 或 public_seat_console_id 返回 null（fail-closed）。 */
export function toSeatConsole(raw: unknown): SeatConsole | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const publicSeatConsoleId = str(raw.public_seat_console_id)
  if (id.length === 0 || publicSeatConsoleId.length === 0) return null
  for (const key of Object.keys(raw)) {
    if (key === 'public_seat_console_id') continue
    // 熔断：命中敏感键（CS-03 模式或 shop_key/identity_key/一次性 secret）的行整体丢弃
    if (isSensitiveKey(key) || SEAT_CONSOLE_SENSITIVE_EXTRA.test(key)) {
      return null
    }
  }
  const originsRaw = Array.isArray(raw.allowed_origins) ? raw.allowed_origins : []
  return {
    id,
    organization_id: str(raw.organization_id),
    workspace_id: str(raw.workspace_id),
    public_seat_console_id: publicSeatConsoleId,
    allowed_origins: originsRaw.map(originOrNull).filter((o): o is string => o !== null),
    status: str(raw.status) || 'active',
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 0,
    // 后端全 API 惯例：时间为 epoch 秒 number；规范化为 string，null/undefined 落 null。
    created_at: raw.created_at == null ? null : String(raw.created_at),
    updated_at: raw.updated_at == null ? null : String(raw.updated_at),
  }
}

/** 容忍 {list:[...]} 与裸数组两种形状；熔断行整体丢弃。 */
export function toSeatConsoleList(raw: unknown): SeatConsole[] {
  const list = isRecord(raw) && Array.isArray(raw.list) ? raw.list : Array.isArray(raw) ? raw : []
  return list.map(toSeatConsole).filter((item): item is SeatConsole => item !== null)
}

/** public seat console id 形状校验：TSID 十进制串（1..26 位）。 */
export function isValidPublicSeatConsoleId(value: string): boolean {
  return /^[0-9]{1,26}$/.test(value)
}

/**
 * 生成坐席工作台接入 iframe 代码（SC-FE 冻结形状）：
 * - src 指向 cs 域 /seat/:public_seat_console_id（origin 唯一真源 =
 *   widgetConfig.CUSTOMER_SERVICE_WIDGET_ORIGIN，本函数自行导入，不接受传入）；
 * - sandbox 收紧为 allow-scripts allow-same-origin allow-downloads，
 *   referrerpolicy=no-referrer，尺寸固定 100%×100vh；
 * - 绝不包含 script loader / token / secret / organization_id / workspace_id /
 *   API base——由单测负例锁死；非法 public id 或非法 origin 一律抛错（fail-closed）。
 */
export function buildSeatEmbedCode(publicSeatConsoleId: string): string {
  if (!isValidPublicSeatConsoleId(publicSeatConsoleId)) {
    throw new Error('public_seat_console_id 形状非法，拒绝生成接入代码')
  }
  const origin = originOrNull(CUSTOMER_SERVICE_WIDGET_ORIGIN)
  if (origin === null) throw new Error('坐席工作台域名非法，拒绝生成接入代码')
  return `<iframe\n  src="${origin}/seat/${publicSeatConsoleId}"\n  title="IMBoy 客服工作台"\n  sandbox="allow-scripts allow-same-origin allow-downloads"\n  referrerpolicy="no-referrer"\n  style="width:100%;height:100vh;border:0"\n></iframe>`
}
