/**
 * P2-E2E-01（A7）：四域静态承载 + 后端透明反代（Host 头路由）。
 *
 * 职责（不是 mock，与 P1 static-host.mjs 同纪律）：
 * - shop.test（含 localhost 健康探活）：商家宿主页 + widget 前端产物
 *   （dist-widget/loader.js、assets/cs-widget.js）；
 * - admin.test：管理后台 SPA dist（含 /customer-service/workspace 坐席工作台
 *   与 /login 治理面登录页），非 /api 路径 SPA fallback 到 index.html；
 * - cs.test / api.test：仅反代与负例打点用（同源 /api 透明转发）；
 * - /api/*（全部域）：透明反代到真实后端（默认 127.0.0.1:9802），方法/头/体
 *   原样转发，响应（含 SSE 流式）原样回传；业务逻辑、认证、数据 100% 真后端；
 * - https 落点（默认 8943，CN=dev.imboy.pub）：运行时 openssl 自签（落
 *   .artifacts，git 忽略），承接 presign upload.url 裸 PUT 回环 + 部署层 CORS
 *   补齐（照抄 P1 口径）。
 *
 * 用法：node static-host-p2.mjs <httpPort> <httpsPort>
 */
import http from 'node:http'
import https from 'node:https'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// 仓库根：helpers/ 的上一级是 spec 目录，再上一级是 tests/e2e，仓库根在其上。
const REPO_ROOT = path.resolve(HERE, '../../../..')
const DIST_WIDGET = path.join(REPO_ROOT, 'dist-widget')
const DIST_ADMIN = path.join(REPO_ROOT, 'dist')

const BACKEND_HOST = process.env.CSWW_E2E_BACKEND_HOST ?? '127.0.0.1'
const BACKEND_PORT = Number(process.env.CSWW_E2E_BACKEND_PORT ?? 9802)

function hostOf(req) {
  return (req.headers.host ?? '').split(':')[0]
}

/** 商家宿主页：plain HTML；loader 从 script.src 推导 origin（shop.test）。 */
function hostHtml() {
  const installationId = process.env.CSWW_E2E_INSTALLATION_ID ?? '5837897154422619'
  const organizationId = process.env.CSWW_E2E_ORG_ID ?? '1603940848519155'
  const publicWidgetId = process.env.CSWW_E2E_WIDGET_ID ?? 'csww-e2e-widget-77729338'
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8"><title>CSWW P2 Shop</title></head>',
    '<body>',
    '  <h1 data-testid="shop-title">CSWW P2 Merchant Shop</h1>',
    '  <div data-testid="shop-marker">merchant host page (shop.test)</div>',
    '  <script src="/widget-assets/loader.js"',
    `    data-org-id="${organizationId}"`,
    `    data-widget-id="${publicWidgetId}"`,
    `    data-widget-path="/api/v1/cs/widget/frame/${installationId}?organization_id=${organizationId}"></script>`,
    '</body>',
    '</html>',
  ].join('\n')
}

const MIME = new Map([
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.woff2', 'font/woff2'],
  ['.json', 'application/json'],
])

async function serveDistFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  try {
    const buf = await readFile(filePath)
    // 部署层占位符注入（与 docker 镜像 entrypoint 的 sed 同一环节）：
    // 产物把 API 基址/CSP 目标烘焙为 __IMBOY_API_HOST__ 占位符，部署时替换为
    // 真实 API 域；本测试承载同源反代，替换为空串 = API 同源（connect-src 'self'）。
    // 这是部署配置注入，不是 mock：所有业务响应仍 100% 来自真实后端。
    const text = buf.toString('utf8').replace(/__IMBOY_API_HOST__/g, '')
    res.writeHead(200, { 'content-type': MIME.get(ext) ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(text)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('dist asset missing')
  }
}

/** admin.test：SPA dist 静态 + 非 /api 路径 fallback 到 index.html（SPA 路由）。 */
async function serveAdmin(req, res, urlPath) {
  const safePath = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '')
  const candidate = path.join(DIST_ADMIN, safePath)
  if (candidate.startsWith(DIST_ADMIN) && safePath !== '/' && existsSync(candidate) && !candidate.endsWith('/')) {
    const stat = await readdir(path.dirname(candidate)).then((files) => files.includes(path.basename(candidate))).catch(() => false)
    if (stat) {
      await serveDistFile(res, candidate)
      return
    }
  }
  await serveDistFile(res, path.join(DIST_ADMIN, 'index.html'))
}

/** 透明反代：原样转发；响应流式回传（SSE 友好，禁缓冲）。cors=true 时补部署层 CORS。 */
function proxyToBackend(req, res, cors) {
  const headers = { ...req.headers }
  delete headers.host
  delete headers.connection
  const upstream = http.request(
    { host: BACKEND_HOST, port: BACKEND_PORT, path: req.url, method: req.method, headers },
    (up) => {
      const outHeaders = { ...up.headers }
      if (cors && up.headers['access-control-allow-origin'] === undefined) {
        const origin = req.headers.origin
        outHeaders['access-control-allow-origin'] = typeof origin === 'string' ? origin : '*'
        outHeaders['access-control-allow-headers'] = 'Content-Type, x-cs-visit-token, Authorization'
        outHeaders['access-control-allow-methods'] = 'GET, POST, PUT, OPTIONS'
        outHeaders['access-control-max-age'] = '3600'
      }
      res.writeHead(up.statusCode ?? 502, outHeaders)
      up.pipe(res)
    }
  )
  upstream.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 502, msg: 'upstream unavailable: ' + err.message }))
  })
  req.pipe(upstream)
}

function replyPreflight(req, res) {
  const origin = req.headers.origin
  res.writeHead(204, {
    'access-control-allow-origin': typeof origin === 'string' ? origin : '*',
    'access-control-allow-headers': 'Content-Type, x-cs-visit-token, Authorization',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-max-age': '3600',
  })
  res.end()
}

const STATIC_ROUTES = new Map([
  ['/widget-assets/loader.js', [path.join(DIST_WIDGET, 'loader.js'), 'text/javascript; charset=utf-8']],
  ['/widget-assets/cs-widget.v1.js', [path.join(DIST_WIDGET, 'assets', 'cs-widget.js'), 'text/javascript; charset=utf-8']],
])

async function handleRequest(req, res, cors) {
  const urlPath = (req.url ?? '/').split('?')[0]
  if (process.env.CSWW_HOST_DEBUG) console.log('[csww-p2-host]', cors ? 'https' : 'http ', req.method, req.headers.host ?? '-', urlPath)
  if (cors && req.method === 'OPTIONS' && urlPath.startsWith('/api/')) {
    replyPreflight(req, res)
    return
  }
  const host = hostOf(req)
  if (urlPath.startsWith('/api/')) {
    proxyToBackend(req, res, cors)
    return
  }
  const staticRoute = STATIC_ROUTES.get(urlPath)
  if (staticRoute) {
    readFile(staticRoute[0])
      .then((buf) => {
        res.writeHead(200, { 'content-type': staticRoute[1], 'content-length': buf.length, 'cache-control': 'no-store' })
        res.end(buf)
      })
      .catch(() => {
        res.writeHead(500, { 'content-type': 'text/plain' })
        res.end('static asset missing: ' + path.basename(staticRoute[0]))
      })
    return
  }
  if (host === 'admin.test') {
    await serveAdmin(req, res, urlPath === '/' ? '/index.html' : urlPath)
    return
  }
  // shop.test / localhost（webServer 健康探活）/ 其他：商家宿主页。
  const html = Buffer.from(hostHtml())
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length, 'cache-control': 'no-store' })
  res.end(html)
}

/** 运行时自签证书（.artifacts/dev-cert/，git 忽略；私钥不入库）。 */
function ensureDevCert() {
  const dir = path.join(HERE, '..', '.artifacts', 'dev-cert')
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

export function startStack(httpPort, httpsPort) {
  const httpServer = http.createServer((req, res) => { void handleRequest(req, res, false) })
  const tls = ensureDevCert()
  const httpsServer = https.createServer(tls, (req, res) => { void handleRequest(req, res, true) })
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
  const httpPort = Number(process.argv[2] ?? 8911)
  const httpsPort = Number(process.argv[3] ?? 8943)
  const stack = startStack(httpPort, httpsPort)
  stack.listen().then(() => {
    console.log(`[csww-p2-host] http  http://admin.test:${httpPort} + http://shop.test:${httpPort} (host-routed)`)
    console.log(`[csww-p2-host] https https://127.0.0.1:${httpsPort} (dev.imboy.pub PUT landing, self-signed)`)
    console.log(`[csww-p2-host] backend ${BACKEND_HOST}:${BACKEND_PORT}`)
  })
  const shutdown = () => stack.close()
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
