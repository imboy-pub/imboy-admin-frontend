/**
 * SEAT-02/03：坐席登录设备标识（QR create 合同必填 device_id）。
 *
 * SEAT-01 遗留缺口⑤：QR create 需 device_id——登录页生成并 localStorage
 * 持久化随机 device_id（非敏感）：随机 UUID 形状的设备柄，不携带用户/租户
 * 任何信息，不属于凭证（泄漏无危害，仅用于 QR 会话去重）。
 * 红线不变：JWT/access token 永不进 localStorage（seatAuthStore A03）。
 */
const SEAT_DEVICE_ID_KEY = 'imboy_seat_device_id'

function randomDeviceId(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  // randomUUID 不可用的环境：退化为 getRandomValues 四段十六进制。
  const bytes = new Uint8Array(16)
  cryptoApi.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 读取（惰性生成并持久化）本浏览器坐席设备标识；幂等。 */
export function getOrCreateSeatDeviceId(): string {
  try {
    const existing = globalThis.localStorage?.getItem(SEAT_DEVICE_ID_KEY)
    if (typeof existing === 'string' && /^[0-9a-f-]{16,64}$/.test(existing)) return existing
    const next = randomDeviceId()
    globalThis.localStorage?.setItem(SEAT_DEVICE_ID_KEY, next)
    return next
  } catch {
    // 隐私模式/存储不可用：会话内临时 id（QR create 仍可发，刷新后换新 id 无害）。
    return randomDeviceId()
  }
}

/** 测试辅助：清除持久化设备标识。 */
export function resetSeatDeviceIdForTest(): void {
  try {
    globalThis.localStorage?.removeItem(SEAT_DEVICE_ID_KEY)
  } catch {
    /* ignore */
  }
}
