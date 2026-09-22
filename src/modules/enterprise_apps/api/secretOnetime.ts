/**
 * Secret 一次性展示仓（Admin 企业应用治理面）。
 *
 * 合同（plan-full §3.2 / §7「secret only-once、无 secret hydration」）：
 *  1. credential 的明文 secret **只在**「签发 / 轮换」响应里出现过一次；
 *     列表 / 详情 / 审计 / 投递任何读面都不含 secret（由 `assertNoSecretFields` 熔断）。
 *  2. 本仓是**纯内存**（module scope），**绝不**写入 localStorage / sessionStorage /
 *     IndexedDB / cookie / URL / React Query 缓存 —— 页面刷新后仓为空，
 *     secret 不可再见（这是「刷新后不可再见」的实现机制，不是 UI 隐藏）。
 *  3. 展示窗口可被显式销毁（用户点「我已保存」/ 离开页面）：销毁后 `readOnce`
 *     对该 credential 恒返回 null（墓碑），即使是同一页面会话内。
 *  4. 每次 `armOnce` 生成新的 windowId 并**顶替**同一 credential 的旧窗口
 *     （轮换场景）——旧 secret 不可能被再次读出。
 *
 * 本文件禁止 import 任何持久化设施；`secretOnetime.test.ts` 用源码扫描钉住该约束。
 */

export type SecretRevealMode = 'issue' | 'rotate'

export type SecretRevealWindow = {
  /** 单调递增窗口号：用于把「同一个 credential 的不同次签发」严格区分开。 */
  windowId: number
  credentialId: string
  credentialPrefix: string
  secret: string
  mode: SecretRevealMode
  armedAt: number
}

export type SecretRevealRead = {
  windowId: number
  credentialId: string
  credentialPrefix: string
  secret: string
  mode: SecretRevealMode
}

let nextWindowId = 1
const windows = new Map<string, SecretRevealWindow>()
const tombstones = new Set<string>()
let readCount = 0

function normalizeId(value: string): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 登记一个一次性展示窗口。
 *
 * - 同一 credential 的旧窗口被顶替（不存在「两个 secret 同时可见」）；
 * - 清除该 credential 的墓碑（轮换是**新一次**签发，允许一次新的展示窗口）。
 */
export function armOnce(input: {
  credentialId: string
  credentialPrefix?: string
  secret: string
  mode: SecretRevealMode
  now?: number
}): number {
  const credentialId = normalizeId(input.credentialId)
  const secret = typeof input.secret === 'string' ? input.secret : ''
  if (credentialId.length === 0 || secret.length === 0) {
    return 0
  }
  const windowId = nextWindowId
  nextWindowId += 1
  windows.set(credentialId, {
    windowId,
    credentialId,
    credentialPrefix: normalizeId(input.credentialPrefix ?? ''),
    secret,
    mode: input.mode,
    armedAt: input.now ?? Date.now(),
  })
  tombstones.delete(credentialId)
  return windowId
}

/**
 * 读取一次性 secret 展示窗口。
 * 已销毁（墓碑）/ 从未登记 / 刷新后（内存已空）→ null。
 */
export function readOnce(credentialId: string): SecretRevealRead | null {
  const id = normalizeId(credentialId)
  if (id.length === 0) return null
  if (tombstones.has(id)) return null
  const window = windows.get(id)
  if (!window) return null
  readCount += 1
  return {
    windowId: window.windowId,
    credentialId: window.credentialId,
    credentialPrefix: window.credentialPrefix,
    secret: window.secret,
    mode: window.mode,
  }
}

/** 销毁展示窗口（永久；同一会话内不可再见）。 */
export function dismissOnce(credentialId: string): boolean {
  const id = normalizeId(credentialId)
  if (id.length === 0) return false
  const existed = windows.delete(id)
  tombstones.add(id)
  return existed
}

/** 是否已经销毁过（UI 用它把按钮换成不可逆提示）。 */
export function isDismissed(credentialId: string): boolean {
  return tombstones.has(normalizeId(credentialId))
}

/** 当前是否有可见窗口（不含墓碑）。 */
export function hasVisibleSecret(credentialId: string): boolean {
  const id = normalizeId(credentialId)
  if (tombstones.has(id)) return false
  return windows.has(id)
}

/**
 * 清空全部窗口与墓碑。
 * 路由离开 / 登出时调用；测试用它构造「刷新」场景（内存仓重建 = 刷新后状态）。
 */
export function clearAllSecrets(): void {
  windows.clear()
  tombstones.clear()
}

/** 读出计数（证据用：证明「同一次签发只被读一次」而不是被反复 hydration）。 */
export function secretReadCount(): number {
  return readCount
}

/** 测试/证据辅助：当前窗口数（不含墓碑）。 */
export function armedWindowCount(): number {
  return windows.size
}

/** 脱敏展示：只保留前缀，永不回显全量 secret。 */
export function maskSecretPrefix(credentialPrefix: string): string {
  const prefix = normalizeId(credentialPrefix)
  if (prefix.length === 0) return 'ib_int_****'
  return `${prefix}****`
}
