/**
 * SC-E2E：网关 curl 预检（EXECUTE 阶段旅程开跑前的快速环境探测）。
 *
 * curl --resolve 把测试域钉在 127.0.0.1（与 Chromium host-resolver-rules 同一
 * 口径），只读探测，不做任何写操作；失败只返回结构化事实，不重试不代修复。
 */
import { execFileSync } from 'node:child_process'
import { CONSOLE_PUBLIC_ID, CS_ORIGIN } from './env'

export interface ProbeResult {
  ok: boolean
  detail: string
}

function curlCode(url: string, host: string): { code: string; error?: string } {
  try {
    const out = execFileSync(
      'curl',
      ['-sk', '-o', '/dev/null', '-w', '%{http_code}', '--resolve', `${host}:18443:127.0.0.1`, url],
      { encoding: 'utf8', timeout: 15_000 },
    ).trim()
    return { code: out }
  } catch (err) {
    return { code: 'ERR', error: err instanceof Error ? err.message : String(err) }
  }
}

/** cs 网关静态面（loader.js 200 = nginx 拓扑 + dist-widget 就绪）。 */
export function probeStaticFace(): ProbeResult {
  const r = curlCode(`${CS_ORIGIN}/v1/loader.js`, 'cs.test')
  return { ok: r.code === '200', detail: `GET /v1/loader.js -> ${r.code}${r.error ? ' (' + r.error + ')' : ''}` }
}

/** seat frame 面（200 = backend seat 路由 + console active）。 */
export function probeSeatFrame(): ProbeResult {
  const r = curlCode(`${CS_ORIGIN}/seat/${CONSOLE_PUBLIC_ID}`, 'cs.test')
  return {
    ok: r.code === '200',
    detail: `GET /seat/${CONSOLE_PUBLIC_ID} -> ${r.code}${r.error ? ' (' + r.error + ')' : ''}`,
  }
}

/** 宿主页（shop.test 200 = 宿主 snippet 就绪）。 */
export function probeShopHost(): ProbeResult {
  const r = curlCode('https://shop.test:18443/', 'shop.test')
  return { ok: r.code === '200', detail: `GET shop.test/ -> ${r.code}${r.error ? ' (' + r.error + ')' : ''}` }
}

/** 三探针一次跑完（旅程 spec 的 test.beforeAll 前置日志用）。 */
export function probeGatewayTopology(): ProbeResult[] {
  return [probeStaticFace(), probeSeatFrame(), probeShopHost()]
}
