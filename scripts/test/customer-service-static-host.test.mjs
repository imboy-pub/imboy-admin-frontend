import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
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
