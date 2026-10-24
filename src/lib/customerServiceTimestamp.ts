/** CS message created_at is Unix seconds; older responses use RFC3339. */
export function customerServiceTimestamp(value: unknown): string | null {
  const seconds = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^-?\d+$/.test(value)
      ? Number(value)
      : null
  if (seconds !== null) {
    if (!Number.isSafeInteger(seconds)) return null
    const date = new Date(seconds * 1000)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/i.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    offsetHourText, offsetMinuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59
    || Number(offsetHourText ?? 0) > 23 || Number(offsetMinuteText ?? 0) > 59) {
    return null
  }
  return Number.isFinite(Date.parse(value)) ? value : null
}
