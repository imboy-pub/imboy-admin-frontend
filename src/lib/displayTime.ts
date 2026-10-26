/**
 * R14 展示时区一致：公共时间展示 formatter（纯函数 + 模块级缓存）。
 *
 * 纪律：
 * - 零依赖（不 import React/store/client）——seat 工作台与 widget 独立
 *   构建链均可消费（verify:widget 门禁要求零 Admin chunk）；
 * - formatter 按 (locale + 有效 zone + formatKind) 缓存（Map，上限 32 条
 *   LRU 淘汰），绝不每条消息重建，也绝不把 zone 永久绑定在模块加载时刻：
 *   缓存键中的 zone 来自**当前生效 zone**（显式参数优先，否则 zone
 *   resolver 的 memo 值），zone 变化经 recheckDisplayZone() 失效后重建；
 * - 查看者 zone 来源可注入（setDisplayZoneResolver）：默认读宿主
 *   Intl.DateTimeFormat().resolvedOptions().timeZone；R14 生命周期事件
 *   （focus / visibilitychange / resume）由 seat/widget 侧各自挂监听调用
 *   recheckDisplayZone()，zone 变化 → 缓存失效 + 返回 true 供上层 bump
 *   state 触发重渲染（不逐条消息常驻 timer）。
 */
type DisplayFormatKind = 'day' | 'time' | 'full'

/** zone 解析器：返回 IANA zone 名；undefined = 跟随宿主默认（无法解析时）。 */
type DisplayZoneResolver = () => string | undefined

/** 缓存上限：locale × zone × kind 组合的实际上限远小于此，超限按 LRU 淘汰。 */
const FORMATTER_CACHE_LIMIT = 32

const FORMAT_OPTIONS: Record<DisplayFormatKind, Intl.DateTimeFormatOptions> = {
  day: { year: 'numeric', month: '2-digit', day: '2-digit' },
  time: { hour: '2-digit', minute: '2-digit', hour12: false },
  full: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

/** 默认 zone resolver：读宿主 IANA zone；环境不支持时回退 undefined（跟随宿主）。 */
function defaultHostZoneResolver(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

let zoneResolver: DisplayZoneResolver = defaultHostZoneResolver
/** resolver memo：null = 未解析过（下次 resolvedDisplayZone() 时调用 resolver）。 */
let resolvedZoneMemo: { zone: string | undefined } | null = null

/** 注入 zone resolver（用户设置等来源）；立即失效既有缓存与 memo。 */
export function setDisplayZoneResolver(resolver: DisplayZoneResolver): void {
  zoneResolver = resolver
  resolvedZoneMemo = null
  invalidateDisplayFormatters()
}

/** 恢复默认宿主 resolver（测试清理用）。 */
export function resetDisplayZoneResolver(): void {
  setDisplayZoneResolver(defaultHostZoneResolver)
}

/**
 * 当前生效查看者 zone（memo 化，避免每次格式化都构造 probe formatter）。
 * memo 仅被 recheckDisplayZone()/setDisplayZoneResolver() 推进——这正是
 * R14「生命周期事件触发 zone 核对」的合同：两次核对之间 zone 视为稳定。
 */
function resolvedDisplayZone(): string | undefined {
  if (resolvedZoneMemo === null) resolvedZoneMemo = { zone: zoneResolver() }
  return resolvedZoneMemo.zone
}

/** 清空 formatter 缓存（zone 变化 / resolver 切换后调用；条目按需重建）。 */
function invalidateDisplayFormatters(): void {
  formatterCache.clear()
}

/**
 * 重核查看者 zone：重新调用 resolver，与 memo 不同 → 更新 memo、失效
 * formatter 缓存并返回 true（上层据此 bump state 触发重渲染）；相同 → false。
 */
export function recheckDisplayZone(): boolean {
  const next = zoneResolver()
  if (resolvedZoneMemo !== null && resolvedZoneMemo.zone === next) return false
  resolvedZoneMemo = { zone: next }
  invalidateDisplayFormatters()
  return true
}

/**
 * 取（或建）缓存的 Intl.DateTimeFormat。
 * timeZone 显式传入时以其为准（多浏览器 context 各自断言场景）；
 * 省略时使用当前生效查看者 zone（resolver memo）。
 */
export function displayFormatter(
  locale: string,
  timeZone: string | undefined,
  kind: DisplayFormatKind,
): Intl.DateTimeFormat {
  const effectiveZone = timeZone !== undefined ? timeZone : resolvedDisplayZone()
  const key = `${locale}|${effectiveZone ?? ''}|${kind}`
  const cached = formatterCache.get(key)
  if (cached !== undefined) {
    // Map 按插入序迭代：delete+set 把命中项挪到「最新」端实现 LRU 触碰。
    formatterCache.delete(key)
    formatterCache.set(key, cached)
    return cached
  }
  const created = new Intl.DateTimeFormat(locale, { ...FORMAT_OPTIONS[kind], timeZone: effectiveZone })
  if (formatterCache.size >= FORMATTER_CACHE_LIMIT) {
    const oldest = formatterCache.keys().next().value
    if (oldest !== undefined) formatterCache.delete(oldest)
  }
  formatterCache.set(key, created)
  return created
}

/** epoch 毫秒 → 展示文案（缓存 formatter；NaN/非有限数原样 format 由调用方防御）。 */
export function formatDisplayInstant(
  ms: number,
  locale: string,
  timeZone: string | undefined,
  kind: DisplayFormatKind,
): string {
  return displayFormatter(locale, timeZone, kind).format(ms)
}

/** 规范 ISO 字符串 → 展示文案；null/非法 → null（不伪造时间，fail-closed）。 */
export function formatDisplayInstantIso(
  iso: string | null,
  locale: string,
  timeZone: string | undefined,
  kind: DisplayFormatKind,
): string | null {
  if (iso === null) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return formatDisplayInstant(ms, locale, timeZone, kind)
}
