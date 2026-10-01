/**
 * P1-E2E-01（A6-E2E）：宿主站点静态服务 + 后端透明反代。
 *
 * 职责（不是 mock）：
 * - 承载商家宿主页（plain HTML）与 widget 前端产物（dist-widget/loader.js、
 *   dist-widget/widget-assets/cs-widget.v2.js 与 /assets/ 内容哈希文件，
 *   与后端 frame 文档引用的 FRAME_ASSET_JS 常量逐字一致）；
 * - /api/*、/w/* 透明反代到真实后端（默认 127.0.0.1:9802）：方法/头/体原样转发，
 *   响应（含 SSE 流式）原样回传。所有业务逻辑、认证、数据均由真实后端处理，
 *   本进程不伪造任何 API 响应；
 * - 额外提供本地自签 HTTPS（默认 8443，CN=dev.imboy.pub）：后端 presign 的
 *   upload.url 基址来自节点配置 {imboy, base_url} = https://dev.imboy.pub
 *   （https 才 fail-open 填 url，见 cs_widget_session_app:upload_proxy_url）。
 *   Chromium 用 host-resolver-rules 把 dev.imboy.pub MAP 到本服务，附件裸 PUT
 *   经同一反代透明转发回 9802 —— 路径/查询串（upload_ref）逐字保持后端合同。
 *
 * 用法：node static-host.mjs <httpPort> <httpsPort>
 */
import http from 'node:http'
import https from 'node:https'
import { readFile } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// dist-widget 产物目录（仓库根下）。
const DIST_WIDGET = path.resolve(HERE, '../../../..', 'dist-widget')

const BACKEND_HOST = process.env.CSWW_E2E_BACKEND_HOST ?? '127.0.0.1'
const BACKEND_PORT = Number(process.env.CSWW_E2E_BACKEND_PORT ?? 9802)
const PUBLIC_WIDGET_ID = process.env.CSWW_E2E_WIDGET_ID?.trim()
if (!PUBLIC_WIDGET_ID || !/^[0-9]{1,26}$/.test(PUBLIC_WIDGET_ID)) {
  throw new Error('CSWW_E2E_WIDGET_ID must be the decimal public_widget_id of the isolated fixture')
}

/** 宿主页：plain HTML；loader.js 引自身产物；origin 由 loader 从 script.src 推导。 */
function hostHtml() {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8"><title>CSWW E2E Host</title></head>',
    '<body>',
    '  <h1 data-testid="host-title">CSWW E2E Host</h1>',
    '  <div data-testid="host-marker">merchant host page</div>',
    '  <script src="/widget-assets/loader.js"',
    `    data-widget-id="${PUBLIC_WIDGET_ID}"></script>`,
    '</body>',
    '</html>',
  ].join('\n')
}

const STATIC_ROUTES = new Map([
  ['/seat-assets/cs-seat.v1.js', [path.join(DIST_WIDGET, 'seat-assets', 'cs-seat.v1.js'), 'text/javascript; charset=utf-8']],
  ['/seat-assets/cs-seat.v1.css', [path.join(DIST_WIDGET, 'seat-assets', 'cs-seat.v1.css'), 'text/css; charset=utf-8']],
  ['/widget-assets/loader.js', [path.join(DIST_WIDGET, 'loader.js'), 'text/javascript; charset=utf-8']],
  ['/widget-assets/cs-widget.v2.js', [path.join(DIST_WIDGET, 'widget-assets', 'cs-widget.v2.js'), 'text/javascript; charset=utf-8']],
])

function sendFile(res, filePath, contentType) {
  readFile(filePath)
    .then((buf) => {
      res.writeHead(200, { 'content-type': contentType, 'content-length': buf.length, 'cache-control': 'no-store' })
      res.end(buf)
    })
    .catch(() => {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('static asset missing: ' + path.basename(filePath))
    })
}

/** 透明反代：原样转发方法/头/体；响应流式回传（SSE 友好，禁缓冲）。 */
function proxyToBackend(req, res, cors) {
  const headers = { ...req.headers }
  delete headers.host
  delete headers.connection
  const upstream = http.request(
    { host: BACKEND_HOST, port: BACKEND_PORT, path: req.url, method: req.method, headers },
    (up) => {
      const outHeaders = { ...up.headers }
      // 部署层 CORS 补齐（仅 https 落点需要）：后端 CORS 中间件 allowlist 不含
      // dev.imboy.pub 且 allow-methods 无 PUT，而 presign 的 upload.url 正是
      // https://dev.imboy.pub 的裸 PUT（BE-PATCH-01）——生产由网关/部署层补
      // CORS，本地测试由本服务补齐，业务响应体仍 100% 来自真实后端。
      if (cors && up.headers['access-control-allow-origin'] === undefined) {
        const origin = req.headers.origin
        outHeaders['access-control-allow-origin'] = typeof origin === 'string' ? origin : '*'
        outHeaders['access-control-allow-headers'] = 'Content-Type, x-cs-visit-token'
        outHeaders['access-control-allow-methods'] = 'GET, POST, PUT, OPTIONS'
        outHeaders['access-control-max-age'] = '3600'
      }
      res.writeHead(up.statusCode ?? 502, outHeaders)
      up.pipe(res)
    }
  )
  res.once('close', () => upstream.destroy())
  upstream.on('error', (err) => {
    if (res.destroyed) return
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' })
    }
    res.end(JSON.stringify({ code: 502, msg: 'upstream unavailable: ' + err.message }))
  })
  req.pipe(upstream)
}

/** CORS preflight（仅 https 落点需要；OPTIONS 无业务语义，本地应答）。 */
function replyPreflight(req, res) {
  const origin = req.headers.origin
  res.writeHead(204, {
    'access-control-allow-origin': typeof origin === 'string' ? origin : '*',
    'access-control-allow-headers': 'Content-Type, x-cs-visit-token',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-max-age': '3600',
  })
  res.end()
}

function handleRequest(req, res, cors) {
  const urlPath = (req.url ?? '/').split('?')[0]
  if (process.env.CSWW_HOST_DEBUG) console.log('[csww-static-host]', cors ? 'https' : 'http ', req.method, req.headers.host ?? '-', urlPath)
  if (cors && req.method === 'OPTIONS' && urlPath.startsWith('/api/')) {
    replyPreflight(req, res)
    return
  }
  if (urlPath === '/' || urlPath === '/index.html') {
    const html = Buffer.from(hostHtml())
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length, 'cache-control': 'no-store' })
    res.end(html)
    return
  }
  const staticRoute = STATIC_ROUTES.get(urlPath)
  if (staticRoute) {
    sendFile(res, staticRoute[0], staticRoute[1])
    return
  }
  if (/^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(urlPath)) {
    sendFile(res, path.join(DIST_WIDGET, urlPath), urlPath.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8')
    return
  }
  if (urlPath.startsWith('/api/') || urlPath.startsWith('/w/') || urlPath.startsWith('/seat/')) {
    proxyToBackend(req, res, cors)
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
}

export function createStaticHost(httpPort) {
  return http.createServer((req, res) => handleRequest(req, res, false))
}

/** 生产入口：同进程起 http（宿主/反代）+ https（dev.imboy.pub 裸 PUT 落点）。 */
/**
 * 本地自签测试证书：运行时生成（openssl），落 .artifacts/dev-cert/（git 忽略，
 * P1-FINAL-A04 无产物纪律——任何形态的私钥不入库；gitleaks 门亦拦截）。
 * 证书仅用于本进程 https 落点（CN=dev.imboy.pub，30 天），非凭证非 secret。
 */
function ensureDevCert(dir = path.join(HERE, '..', '.artifacts', 'dev-cert')) {
  const key = path.join(dir, 'dev-only-key.pem')
  const cert = path.join(dir, 'dev-only-cert.pem')
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true })
    const r = spawnSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert, '-days', '30', '-nodes', '-subj', '/CN=dev.imboy.pub', '-addext', 'subjectAltName=DNS:dev.imboy.pub'],
      { stdio: 'ignore' }
    )
    if (r.status !== 0) throw new Error('openssl dev-cert generation failed (exit ' + r.status + ')')
  }
  return { key: readFileSync(key), cert: readFileSync(cert) }
}

export function createSecureStaticHost(certDir) {
  const tls = ensureDevCert(certDir)
  return https.createServer(tls, (req, res) => handleRequest(req, res, false))
}

export function startStack(httpPort, httpsPort) {
  const httpServer = http.createServer((req, res) => handleRequest(req, res, false))
  const tls = ensureDevCert()
  const httpsServer = https.createServer(tls, (req, res) => handleRequest(req, res, true))
  return {
    listen: () =>
      Promise.all([
        new Promise((ok) => httpServer.listen(httpPort, '127.0.0.1', ok)),
        new Promise((ok) => httpsServer.listen(httpsPort, '127.0.0.1', ok)),
      ]),
    close: () => {
      httpServer.close()
      httpsServer.close()
    },
  }
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const httpPort = Number(process.argv[2] ?? 8901)
  const httpsPort = Number(process.argv[3] ?? 8443)
  const stack = startStack(httpPort, httpsPort)
  stack.listen().then(() => {
    console.log(`[csww-static-host] http  http://localhost:${httpPort}`)
    console.log(`[csww-static-host] https https://127.0.0.1:${httpsPort} (dev.imboy.pub stub, CN=self-signed)`)
    console.log(`[csww-static-host] backend ${BACKEND_HOST}:${BACKEND_PORT}`)
  })
  const shutdown = () => stack.close()
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
