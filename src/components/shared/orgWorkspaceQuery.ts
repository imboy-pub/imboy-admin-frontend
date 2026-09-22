/**
 * org/ws URL 查询参数 codec（EADM-06 / A6 共享件，W1 独占）。
 *
 * 语义：在页面 URL 的查询串里读写 `org` 与 `ws` 两个参数，承载
 * "当前选中的组织 / 工作区"上下文，使刷新与分享后不丢失选择，
 * 且不依赖任何内存状态。
 *
 * 设计要点（与 CONTRACT.md 对齐）：
 * - 纯函数，无副作用；解析/序列化都安全降级（非法/缺失/空串/非 TSID
 *   形态 → null，绝不抛异常，绝不把 `undefined` 字面量写进 URL）。
 * - round-trip 幂等：`parse(serialize(parse(q))) === parse(q)`。
 * - 序列化时只动 `org`/`ws`，其他查询参数原样保留（不污染）。
 * - 复用 `@/types/common` 的 EntityId（全程 string，避免 BIGINT TSID 精度丢）。
 */
import type { EntityId } from '@/types/common'

/** 由 URL 恢复的上下文；两个字段任一为 null 表示"未选/非法已降级"。 */
export interface OrgWorkspaceQuery {
  org: EntityId | null
  ws: EntityId | null
}

/**
 * TSID 形态判定：非空、仅含 URL 安全标识字符
 * （大小写字母 / 数字 / 连字符 / 下划线），长度 1..64。
 * 与既有 EntityId（Bigint TSID / Crockford base32）兼容，且不接受
 * 空格、引号、`<>` 等可造成注入或解析歧义的字符。
 */
const TSID_RE = /^[A-Za-z0-9_-]{1,64}$/

export function isTsidLike(value: unknown): value is EntityId {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length > 0 && TSID_RE.test(trimmed)
}

/**
 * 安全降级：任何非法输入（null/undefined/非 string/空串/非 TSID 形态）
 * 一律收敛为 null，绝不抛异常，绝不产生 undefined。
 */
function sanitize(value: unknown): EntityId | null {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (!TSID_RE.test(trimmed)) return null
  return trimmed
}

/**
 * 从查询串解析 org/ws。
 * @param search 原始 location.search（可带前导 `?`）或现成 URLSearchParams。
 *               传入 URLSearchParams 时**只读、不修改**调用方对象。
 */
export function parseOrgWorkspaceQuery(
  search: string | URLSearchParams
): OrgWorkspaceQuery {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search
  return {
    org: sanitize(params.get('org')),
    ws: sanitize(params.get('ws')),
  }
}

/**
 * 序列化 org/ws 到查询串（不含前导 `?`）。
 * @param state 要写入的 {org, ws}（任一为 null/非法 → 该参数被省略）。
 * @param base  既有查询串或 URLSearchParams；其上的其他参数被**原样保留**。
 *              传入 URLSearchParams 时**复制、不修改**调用方对象。
 * @returns 新的查询串；无参数时为空字符串。
 */
export function serializeOrgWorkspaceQuery(
  state: Partial<OrgWorkspaceQuery>,
  base?: string | URLSearchParams
): string {
  const params: URLSearchParams =
    base == null
      ? new URLSearchParams()
      : typeof base === 'string'
        ? new URLSearchParams(base)
        : new URLSearchParams(base)

  // 先移除旧值，避免重复键；仅当新值合法时写回。
  params.delete('org')
  params.delete('ws')

  const org = sanitize(state.org)
  const ws = sanitize(state.ws)
  if (org != null) params.set('org', org)
  if (ws != null) params.set('ws', ws)

  return params.toString()
}
