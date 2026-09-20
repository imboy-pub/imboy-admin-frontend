/**
 * FE-W01：iframe origin `sessionStorage` 访客恢复存储。
 *
 * 合同（cors-auth-matrix.widget_session_storage / 计划 FE-W01）：
 * - 只保存 **installation 作用域**的匿名 subject 与短期 visit 恢复状态；
 * - 键按 organization_id + public_widget_id 命名空间化（客户端侧安装作用域）；
 * - TTL 过期 / 吊销(401/403) / 退出(关闭聊天) / 拒绝 consent 一律清理；
 * - access/refresh JWT 绝不进入该存储：本模块只接受匿名 subjectId，
 *   且写入前做 JWT 形状防御校验（三段 base64url / eyJ 前缀一律拒绝）；
 * - visit token 本身绝不落盘（visit token 只在内存与 header，见 widgetApi）。
 */

export type VisitScope = { organizationId: string; widgetId: string }

/** 最小存储接口（默认 sessionStorage；测试可注入内存实现）。 */
export type StorageLike = {
  getItem: (_key: string) => string | null
  setItem: (_key: string, _value: string) => void
  removeItem: (_key: string) => void
}

export type VisitRecoveryRecord = {
  subjectId: string
  savedAtMs: number
  expiresAtMs: number
}

/** 「短期」缺省 TTL：30 分钟。浏览器关闭后 sessionStorage 本就不承诺持续。 */
export const SUBJECT_TTL_MS_DEFAULT = 30 * 60 * 1000

const KEY_PREFIX = 'imboy-cs:subject:'

/** installation 作用域键（org + public widget id 唯一确定客户端侧 installation）。 */
export function subjectStorageKey(scope: VisitScope): string {
  return `${KEY_PREFIX}${scope.organizationId}:${scope.widgetId}`
}

/** JWT 形状防御：三段 base64url（xxx.yyy.zzz）或 eyJ 开头一律视为 JWT，禁止落盘。 */
export function looksLikeJwt(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.startsWith('eyJ')) return true
  const segments = trimmed.split('.')
  if (segments.length !== 3) return false
  return segments.every((segment) => segment.length > 0 && /^[A-Za-z0-9_-]+$/.test(segment))
}

/** 保存匿名 subject（安装作用域 + TTL）。非法/JWT 形状输入直接拒绝（fail-closed）。 */
export function saveVisitSubject(
  storage: StorageLike,
  scope: VisitScope,
  subjectId: string,
  nowMs: number,
  ttlMs: number = SUBJECT_TTL_MS_DEFAULT
): void {
  const id = subjectId.trim()
  if (id.length === 0 || looksLikeJwt(id)) return
  if (!(Number.isSafeInteger(nowMs) && Number.isSafeInteger(ttlMs) && ttlMs > 0)) return
  const record: VisitRecoveryRecord = { subjectId: id, savedAtMs: nowMs, expiresAtMs: nowMs + ttlMs }
  try {
    storage.setItem(subjectStorageKey(scope), JSON.stringify(record))
  } catch {
    /* 存储不可用（隐私模式等）：恢复能力降级，不影响主流程 */
  }
}

/**
 * 读取可恢复 subject。TTL 已过 → 清除并返回 null（过期不可恢复）。
 * 任何形状异常 → 清除并返回 null（fail-closed）。
 */
export function loadVisitSubject(storage: StorageLike, scope: VisitScope, nowMs: number): string | null {
  let raw: string | null
  try {
    raw = storage.getItem(subjectStorageKey(scope))
  } catch {
    return null
  }
  if (raw === null) return null
  const cleared = (): null => {
    try {
      storage.removeItem(subjectStorageKey(scope))
    } catch {
      /* 清理失败不致命 */
    }
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<VisitRecoveryRecord> | null
    if (parsed === null || typeof parsed !== 'object') return cleared()
    if (typeof parsed.subjectId !== 'string' || parsed.subjectId.length === 0) return cleared()
    if (typeof parsed.expiresAtMs !== 'number' || !Number.isFinite(parsed.expiresAtMs)) return cleared()
    if (parsed.expiresAtMs <= nowMs) return cleared()
    if (looksLikeJwt(parsed.subjectId)) return cleared()
    return parsed.subjectId
  } catch {
    return cleared()
  }
}

/** 显式清理（拒绝 consent / 吊销 / 退出 / 关闭聊天时调用）。 */
export function clearVisitSubject(storage: StorageLike, scope: VisitScope): void {
  try {
    storage.removeItem(subjectStorageKey(scope))
  } catch {
    /* 清理失败不致命 */
  }
}
