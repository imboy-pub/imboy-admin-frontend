const dayFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Conversation timestamps use the reader's local timezone; wire timestamps remain unchanged. */
export function messageTime(value: string | null) {
  if (value === null) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return { day: dayFormat.format(date), time: timeFormat.format(date), iso: date.toISOString() }
}
