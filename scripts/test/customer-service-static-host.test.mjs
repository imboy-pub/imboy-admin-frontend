import assert from 'node:assert/strict'
import http from 'node:http'
import https from 'node:https'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import test from 'node:test'

const helper = '../../tests/e2e/customer-service-real/helpers/static-host.mjs'
const listen = async (server) => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}
const close = (server) => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve())
  server.closeAllConnections()
})

for (const protocol of ['http', 'https']) {
  test(`${protocol} proxy rejects every 300–399 before client headers and preserves 200 SSE streaming`, { timeout: 30000 }, async (context) => {
    const closures = []
    const trackClose = (stream) => closures.push(new Promise((resolve) => stream.once('close', resolve)))
    let targetRequests = 0
    const target = http.createServer((req, res) => {
      targetRequests += 1
      trackClose(req)
      trackClose(res)
      req.resume()
      res.end('synthetic target')
    })
    let targetPort
    const upstream = http.createServer((req, res) => {
      trackClose(req)
      trackClose(res)
      req.resume()
      if (req.url === '/api/transport-stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write('data: synthetic first event\n\n')
        return
      }
      const status = Number(new URL(req.url, 'http://127.0.0.1').searchParams.get('status'))
      res.writeHead(status, { location: `http://127.0.0.1:${targetPort}/synthetic-target`, 'x-upstream-redirect': 'synthetic' })
      res.end('synthetic redirect body')
    })
    const previous = { host: process.env.CSWW_E2E_BACKEND_HOST, port: process.env.CSWW_E2E_BACKEND_PORT, widget: process.env.CSWW_E2E_WIDGET_ID }
    let host
    let certDir
    try {
      targetPort = await listen(target)
      process.env.CSWW_E2E_BACKEND_HOST = '127.0.0.1'
      process.env.CSWW_E2E_BACKEND_PORT = String(await listen(upstream))
      process.env.CSWW_E2E_WIDGET_ID = '700200000000000001'
      const module = await import(`${helper}?redirect-regression-${protocol}`)
      if (protocol === 'https') certDir = await mkdtemp(path.join(tmpdir(), 'cs-static-host-cert-'))
      host = protocol === 'https' ? module.createSecureStaticHost(certDir) : module.createStaticHost()
      const port = await listen(host)
      const transport = protocol === 'https' ? https : http
      const options = { hostname: '127.0.0.1', port, agent: false, ...(protocol === 'https' ? { rejectUnauthorized: false } : {}) }
      const statuses = [301, 302, 303, 304, 307, 308, ...Array.from({ length: 100 }, (_, index) => 300 + index).filter((status) => ![301, 302, 303, 304, 307, 308].includes(status))]
      const expectedAudit = []
      for (const status of statuses) {
        for (const method of ['GET', 'POST', 'PUT', 'HEAD']) {
          await context.test(`${method} upstream ${status}`, async () => {
            const route = ['/api/redirect-proof', '/w/700200000000000001', '/seat/700200000000000002'][status % 3]
            const requestPath = `${route}?status=${status}&probe=synthetic%20%E6%B5%8B%E8%AF%95`
            const response = await new Promise((resolve, reject) => {
              const request = transport.request({ ...options, method, path: requestPath }, (incoming) => {
                trackClose(incoming)
                const chunks = []
                incoming.on('data', (chunk) => chunks.push(chunk))
                incoming.once('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks).toString() }))
                incoming.once('error', reject)
              })
              trackClose(request)
              request.once('error', reject)
              request.setTimeout(2000, () => request.destroy(new Error('synthetic redirect request timed out')))
              request.end(method === 'POST' || method === 'PUT' ? 'synthetic payload' : undefined)
            })
            await Promise.all(closures)
            assert.equal(response.status, 599, `${protocol} ${method} upstream ${status} must be rejected`)
            assert.equal(response.headers.location, undefined)
            assert.equal(response.headers['x-upstream-redirect'], undefined)
            assert.doesNotMatch(response.body, /synthetic redirect body/)
            assert.equal(targetRequests, 0)
            expectedAudit.push({ method, status, pathSha256: createHash('sha256').update(requestPath).digest('hex') })
            assert.equal(typeof module.getRedirectAudit, 'function')
            assert.deepEqual(module.getRedirectAudit(), expectedAudit)
            const snapshot = module.getRedirectAudit()
            snapshot[0].status = 200
            snapshot.length = 0
            assert.deepEqual(module.getRedirectAudit(), expectedAudit)
          })
        }
      }
      await context.test('200 SSE delivers an event while upstream remains open', async () => {
        let upstreamEnded = false
        let clientRequest
        let clientResponse
        try {
          await new Promise((resolve, reject) => {
            clientRequest = transport.get({ ...options, path: '/api/transport-stream' }, (incoming) => {
              clientResponse = incoming
              trackClose(incoming)
              incoming.once('end', () => { upstreamEnded = true })
              incoming.once('error', reject)
              incoming.once('data', (chunk) => {
                try {
                  assert.equal(incoming.statusCode, 200)
                  assert.match(incoming.headers['content-type'], /^text\/event-stream/)
                  assert.equal(chunk.toString(), 'data: synthetic first event\n\n')
                  assert.equal(upstreamEnded, false)
                  resolve()
                } catch (error) { reject(error) }
              })
            })
            trackClose(clientRequest)
            clientRequest.once('error', reject)
            clientRequest.setTimeout(2000, () => clientRequest.destroy(new Error('SSE first event was buffered')))
          })
        } finally {
          clientResponse?.destroy()
          clientRequest?.destroy()
          await Promise.all(closures)
        }
      })
    } finally {
      if (host) await close(host)
      await close(upstream)
      await close(target)
      await Promise.all(closures)
      if (certDir) await rm(certDir, { recursive: true, force: true })
      for (const [key, value] of Object.entries({ CSWW_E2E_BACKEND_HOST: previous.host, CSWW_E2E_BACKEND_PORT: previous.port, CSWW_E2E_WIDGET_ID: previous.widget })) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      assert.equal(targetRequests, 0, `${protocol} final target request count after every request closed`)
      context.diagnostic(`${protocol}: all ${closures.length} tracked request/response close events settled; final target requests=${targetRequests}`)
    }
  })
}

test('current build assets and public frame are reachable through the real host', async () => {
  // Transport oracle only: this native upstream is not a customer-service business fixture.
  const upstream = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    res.writeHead(202, { 'content-type': 'application/json', 'x-transport-proof': 'native' })
    res.end(JSON.stringify({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString(), token: req.headers['x-cs-visit-token'] }))
  })
  let host
  try {
    process.env.CSWW_E2E_BACKEND_PORT = String(await listen(upstream))
    process.env.CSWW_E2E_WIDGET_ID = '700200000000000001'
    const { createStaticHost } = await import(helper)
    host = createStaticHost()
    const base = `http://127.0.0.1:${await listen(host)}`
    const html = await (await fetch(base)).text()
    assert.match(html, /data-widget-id="700200000000000001"/)
    assert.doesNotMatch(html, /data-org-id|data-widget-path/)
    const manifest = JSON.parse(await readFile(new URL('../../dist-widget/manifest.json', import.meta.url)))
    for (const name of ['loader.js', 'widget-assets/cs-widget.v2.js', 'seat-assets/cs-seat.v1.js', 'seat-assets/cs-seat.v1.css', ...manifest.files.map((file) => file.path).filter((name) => name.startsWith('assets/'))]) {
      const route = name === 'loader.js' ? 'widget-assets/loader.js' : name
      const response = await fetch(`${base}/${route}`)
      assert.equal(response.status, 200, route)
      assert.match(response.headers.get('content-type'), name.endsWith('.css') ? /^text\/css/ : /^text\/javascript/)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(`../../dist-widget/${name}`, import.meta.url)))
    }
    for (const route of ['/w/700200000000000001?probe=1', '/api/transport-proof?probe=2', '/seat/700200000000000002?probe=3']) {
      const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'x-cs-visit-token': 'synthetic-transport-only' }, body: 'preserved' })
      assert.equal(response.status, 202)
      assert.equal(response.headers.get('x-transport-proof'), 'native')
      assert.deepEqual(await response.json(), { method: 'POST', url: route, body: 'preserved', token: 'synthetic-transport-only' })
    }
    assert.equal((await fetch(`${base}/assets/%2e%2e/package.json`)).status, 404)
  } finally {
    if (host) await close(host)
    await close(upstream)
  }
})

test('legacy or missing public widget identifiers fail before serving', () => {
  for (const value of ['', 'csww-e2e-widget-77729338', '" onload="bad']) {
    assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(new URL(helper, import.meta.url).href)})`], {
      env: { ...process.env, CSWW_E2E_WIDGET_ID: value }, stdio: 'pipe',
    }), /CSWW_E2E_WIDGET_ID must be the decimal/)
  }
})

test('disconnecting an SSE consumer closes its upstream TCP response', async () => {
  let upstreamClosed
  const closed = new Promise((resolve) => { upstreamClosed = resolve })
  const upstream = http.createServer((_req, res) => {
    res.once('close', upstreamClosed)
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: native transport proof\n\n')
  })
  let host
  let timeout
  try {
    process.env.CSWW_E2E_BACKEND_PORT = String(await listen(upstream))
    process.env.CSWW_E2E_WIDGET_ID = '700200000000000001'
    const { createStaticHost } = await import(`${helper}?disconnect-check`)
    host = createStaticHost()
    const abort = new AbortController()
    const response = await fetch(`http://127.0.0.1:${await listen(host)}/api/transport-stream`, { signal: abort.signal })
    await response.body.getReader().read()
    abort.abort()
    await Promise.race([closed, new Promise((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('upstream TCP stayed open after consumer disconnect')), 1000)
    })])
  } finally {
    clearTimeout(timeout)
    if (host) await close(host)
    await close(upstream)
  }
})
