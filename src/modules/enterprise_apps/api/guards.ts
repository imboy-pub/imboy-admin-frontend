/**
 * 熔断守卫（Admin 企业应用治理面）：把「响应里不得出现 secret / digest / payload」
 * 变成**响亮失败**而不是静默渲染。
 *
 * 三条守卫：
 *  1. `assertNoSecretFields`  —— secret / digest / 私钥家族，读面一律拒绝；
 *     唯一豁免是签发/轮换响应（`allowSecretOnce`），且只豁免 `secret` 一个键。
 *  2. `assertNoPayloadFields` —— 投递/事件面不得出现 payload / body / content。
 *  3. `collectStringValues`   —— 指纹回显比对的公共遍历器（服务层用它把
 *     已签发 secret 的 md5 指纹与后续响应逐值比对，仓内不留明文）。
 *
 * 守卫抛出的 message 自带语义，`classifyGovernanceFailure` 会据此归到
 * `contractViolation`（UI 显示「已熔断」而不是「操作失败」）。
 */
import {
  PAYLOAD_FORBIDDEN_KEYS,
  SECRET_FORBIDDEN_KEYS,
} from './contracts'

// ---------------------------------------------------------------------------
// 1. 熔断守卫
// ---------------------------------------------------------------------------

export type ForbiddenKeyHit = { path: string; key: string }

function walkForbiddenKeys(
  value: unknown,
  forbidden: readonly string[],
  path: string,
  hits: ForbiddenKeyHit[],
  depth: number
): void {
  if (depth > 12 || value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForbiddenKeys(item, forbidden, `${path}[${index}]`, hits, depth + 1))
    return
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const lowered = key.toLowerCase()
    if (forbidden.includes(lowered)) {
      hits.push({ path: path.length > 0 ? `${path}.${key}` : key, key })
      continue
    }
    walkForbiddenKeys(child, forbidden, path.length > 0 ? `${path}.${key}` : key, hits, depth + 1)
  }
}

/** 递归收集命中的禁用键（大小写不敏感）。 */
export function collectForbiddenKeys(
  value: unknown,
  forbidden: readonly string[]
): ForbiddenKeyHit[] {
  const hits: ForbiddenKeyHit[] = []
  walkForbiddenKeys(value, forbidden.map((k) => k.toLowerCase()), '', hits, 0)
  return hits
}

/**
 * secret / digest 熔断：任何读面响应带这些键 → 抛错（fail-loud）。
 * 唯一豁免：`allowSecretOnce=true` 的签发/轮换响应，且**只允许** `secret` 一个键。
 */
export function assertNoSecretFields(payload: unknown, context: string, allowSecretOnce = false): void {
  const forbidden = allowSecretOnce
    ? SECRET_FORBIDDEN_KEYS.filter((key) => key !== 'secret')
    : SECRET_FORBIDDEN_KEYS
  const hits = collectForbiddenKeys(payload, forbidden)
  if (hits.length > 0) {
    const rendered = hits.map((hit) => `${hit.path}(${hit.key})`).join(', ')
    throw new Error(`响应含禁止的 secret/digest 字段：${rendered} (${context})`)
  }
}

/** 投递/事件面熔断：不得出现 payload / body / content 类键。 */
export function assertNoPayloadFields(payload: unknown, context: string): void {
  const hits = collectForbiddenKeys(payload, PAYLOAD_FORBIDDEN_KEYS)
  if (hits.length > 0) {
    const rendered = hits.map((hit) => `${hit.path}(${hit.key})`).join(', ')
    throw new Error(`响应含禁止的 payload/body 字段：${rendered} (${context})`)
  }
}

/**
 * 递归收集 payload 里全部的字符串值（供指纹比对／源码断言的公共遍历器）。
 * `findSecretEcho`（services 层）用它做「已签发 secret 未被二次回显」的比对。
 */
export function collectStringValues(payload: unknown, cap = 20000): string[] {
  const out: string[] = []
  const stack: unknown[] = [payload]
  let visited = 0
  while (stack.length > 0 && visited < cap) {
    visited += 1
    const current = stack.pop()
    if (typeof current === 'string') {
      out.push(current)
      continue
    }
    if (current === null || typeof current !== 'object') continue
    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }
    stack.push(...Object.values(current as Record<string, unknown>))
  }
  return out
}

