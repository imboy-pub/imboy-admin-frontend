import { displayFormatter } from '@/lib/displayTime'

type MessageTimeOptions = {
  /** 缺省 zh-CN（坐席面既有展示合同）。 */
  locale?: string
  /** 显式 IANA zone（多浏览器 context 各自本地断言用）；缺省 = 查看者本地
   * （zone resolver memo，随 R14 生命周期事件核对刷新）。 */
  timeZone?: string
}

/** Conversation timestamps use the reader's local timezone; wire timestamps remain unchanged. */
export function messageTime(value: string | null, options: MessageTimeOptions = {}) {
  if (value === null) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const locale = options.locale ?? 'zh-CN'
  // R14：formatter 经 displayTime 按 (locale+zone+kind) 缓存复用；zone 来源
  // 随生命周期核对失效重建，不再把 zone 永久绑定在模块加载时刻。
  return {
    day: displayFormatter(locale, options.timeZone, 'day').format(date),
    time: displayFormatter(locale, options.timeZone, 'time').format(date),
    iso: date.toISOString(),
  }
}
