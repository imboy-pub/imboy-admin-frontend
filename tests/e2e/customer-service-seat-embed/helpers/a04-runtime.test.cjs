const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

const journey = readFileSync(path.join(__dirname, '../journey.spec.ts'), 'utf8')
const syntax = ts.createSourceFile('journey.spec.ts', journey, ts.ScriptTarget.Latest, true)
const observeSource = syntax.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'observeStream')
assert.ok(observeSource)
const observeStream = vm.runInNewContext(`${compile(observeSource.getText(syntax))}; observeStream`, {
  expect: (actual, message) => ({ toBe: expected => assert.equal(actual, expected, message) }),
  setTimeout, clearTimeout,
})

function deferred() {
  let resolve, reject
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

async function observerHarness(readerOrResponse, onReport = async () => {}) {
  const window = new EventTarget()
  window.fetch = async () => readerOrResponse instanceof Response ? readerOrResponse : ({
    headers: { get: () => 'text/event-stream' },
    clone: () => ({ body: { getReader: () => readerOrResponse } }),
  })
  const sandbox = vm.createContext({ window, TextDecoder, DOMException })
  const frame = { evaluate: (callback, arg) => vm.runInContext(`(${callback.toString()})(${JSON.stringify(arg)})`, sandbox) }
  const context = {
    exposeBinding: async (name, callback) => {
      window[name] = async value => { await onReport(value); return callback({}, value) }
    },
    addInitScript: async callback => { vm.runInContext(`(${callback.toString()})()`, sandbox) },
    pages: () => [{ frames: () => [frame] }],
  }
  const observer = await observeStream(context, [])
  await window.fetch()
  return observer
}

test('native tee flush completes while the application branch stays readable', { timeout: 3000 }, async () => {
  let controller
  let sourceCancels = 0
  const response = new Response(new ReadableStream({
    start(streamController) { controller = streamController },
    cancel() { sourceCancels += 1 },
  }), { headers: { 'content-type': 'text/event-stream' } })
  const observer = await observerHarness(response)
  const applicationReader = response.body.getReader()
  let flushed, timer
  try {
    flushed = observer.flush(true)
    await Promise.race([
      flushed,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('flush waited for the application tee branch')), 1000) }),
    ])
    assert.equal(observer.errors, 0)
    assert.equal(sourceCancels, 0)
    const chunk = new Uint8Array([1, 2, 3])
    controller.enqueue(chunk)
    assert.deepEqual(await applicationReader.read(), { value: chunk, done: false })
    assert.equal(sourceCancels, 0)
  } finally {
    clearTimeout(timer)
    controller.close()
    await flushed
    await applicationReader.read().finally(() => applicationReader.releaseLock())
  }
  assert.equal(sourceCancels, 0)
})

test('serialized observer reports a native tee read failure', { timeout: 3000 }, async () => {
  let controller
  const response = new Response(new ReadableStream({
    start(streamController) { controller = streamController },
  }), { headers: { 'content-type': 'text/event-stream' } })
  const observer = await observerHarness(response)
  const applicationReader = response.body.getReader()
  try {
    const applicationRead = assert.rejects(applicationReader.read(), /native SSE read failure/)
    controller.error(new TypeError('native SSE read failure'))
    await applicationRead
    await new Promise(resolve => setImmediate(resolve))
    await assert.rejects(observer.flush(true), /stream observation errors/)
    assert.equal(observer.errors, 1)
    assert.match(observer.reasons[0], /^read:TypeError: native SSE read failure/)
  } finally {
    applicationReader.releaseLock()
  }
})

test('serialized observer reports read errors and flush waits for their binding', async () => {
  const read = deferred(), entered = deferred(), acknowledged = deferred()
  const observer = await observerHarness({
    read: () => read.promise,
    cancel: async () => { read.resolve({ done: true }) },
    releaseLock() {},
  }, async value => {
    if (value.kind === 'error') { entered.resolve(); await acknowledged.promise }
  })
  read.reject(new TypeError('synthetic read failure'))
  await entered.promise
  let finished = false
  const flushed = observer.flush(true)
  const outcome = assert.rejects(flushed, /stream observation errors/).finally(() => { finished = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(finished, false)
  acknowledged.resolve()
  await outcome
  assert.equal(observer.errors, 1)
  assert.match(observer.reasons[0], /^read:/)
})

test('stopping a pending observation releases its lock without cancelling the source', async () => {
  const read = deferred()
  let cancelled = false, released = false
  const observer = await observerHarness({
    read: () => read.promise,
    cancel: async () => { cancelled = true; throw new Error('source must not be cancelled') },
    releaseLock() { released = true; read.reject(new TypeError('reader lock released')) },
  })
  await observer.flush(true)
  assert.equal(cancelled, false)
  assert.equal(released, true)
  assert.equal(observer.errors, 0)
})

test('an AbortError received while observing is reported', async () => {
  const read = deferred()
  const observer = await observerHarness({
    read: () => read.promise,
    releaseLock() {},
  })
  read.reject(new DOMException('synthetic read abort', 'AbortError'))
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(observer.flush(true), /stream observation errors/)
  assert.match(observer.reasons[0], /^read:AbortError:/)
})

test('reader lock release failures remain observation errors', async () => {
  const read = deferred()
  const observer = await observerHarness({
    read: () => read.promise,
    releaseLock() { throw new Error('synthetic lock release failure') },
  })
  await assert.rejects(observer.flush(true), /stream observation errors/)
  assert.match(observer.reasons[0], /^observer:Error: synthetic lock release failure/)
})

test('failed observation delivery is retained by the local flush counter', async () => {
  const read = deferred()
  const observer = await observerHarness({
    read: () => read.promise,
    cancel: async () => { read.resolve({ done: true }) },
    releaseLock() { throw new Error('synthetic release failure') },
  }, async () => { throw new Error('synthetic binding failure') })
  await assert.rejects(observer.flush(true), /all observation bindings completed without failure/)
})

function a04CleanupRunner(bindings) {
  let callback
  const findA04 = node => {
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith('A04 ')) callback = node.arguments[1]
    ts.forEachChild(node, findA04)
  }
  findA04(syntax)
  assert.ok(callback)
  const statement = callback.body.statements.find(ts.isTryStatement)
  assert.ok(statement)
  const source = callback.getText(syntax)
  const start = callback.getStart(syntax)
  const cleanupSource = source.slice(0, statement.tryBlock.getStart(syntax) - start)
    + '{ await newVisitorSession() }'
    + source.slice(statement.tryBlock.end - start)
  return vm.runInNewContext(compile(`const runA04 = ${cleanupSource}; runA04`), bindings)
}

test('A04 keeps its body error and attempts close after a failed observer drain', async () => {
  const bodyError = new Error('synthetic body failure')
  const drainError = new Error('synthetic drain failure')
  const closeError = new Error('synthetic close failure')
  let closed = false, stopped = false
  const context = { newPage: async () => ({}), close: async () => { closed = true; throw closeError } }
  const runA04 = a04CleanupRunner({
    test: { setTimeout() {} }, closeStaleActiveSessions() {}, RUN_SINCE: new Date(),
    observeStream: async () => ({ flush: async stop => { assert.equal(stop, true); throw drainError } }),
    watchMessageTimes: () => ({ stop: () => { stopped = true } }),
    newVisitorSession: async () => { throw bodyError },
  })
  await assert.rejects(runA04({ browser: { newContext: async () => context } }), error => {
    assert.equal(error.name, 'AggregateError')
    assert.deepEqual(Array.from(error.errors), [bodyError, drainError, closeError])
    return true
  })
  assert.equal(stopped, true)
  assert.equal(closed, true)
})

for (const failure of ['body', 'cleanup']) {
  test(`A04 propagates a ${failure}-only failure after attempting cleanup`, async () => {
    const failureError = new Error(`synthetic ${failure} failure`)
    let closed = false, stopped = false, drained = false
    const context = {
      newPage: async () => ({}),
      close: async () => { closed = true; if (failure === 'cleanup') throw failureError },
    }
    const runA04 = a04CleanupRunner({
      test: { setTimeout() {} }, closeStaleActiveSessions() {}, RUN_SINCE: new Date(),
      observeStream: async () => ({ flush: async stop => { assert.equal(stop, true); drained = true } }),
      watchMessageTimes: () => ({ stop: () => { stopped = true } }),
      newVisitorSession: async () => { if (failure === 'body') throw failureError },
    })
    await assert.rejects(runA04({ browser: { newContext: async () => context } }), error => {
      if (failure === 'body') {
        assert.equal(error, failureError)
      } else {
        assert.equal(error.name, 'AggregateError')
        assert.deepEqual(Array.from(error.errors), [failureError])
      }
      return true
    })
    assert.equal(stopped, true)
    assert.equal(drained, true)
    assert.equal(closed, true)
  })
}

function qrHarness(failure) {
  const requests = []
  let clock = 0
  const locator = {
    locator() { return this }, or() { return this }, first() { return this },
    getAttribute: async () => 'imboy://qr_login?qr_token=synthetic',
    waitFor: async () => {}, count: async () => 0,
  }
  const frame = { getByTestId: () => locator, getByText: () => locator }
  const page = { frameLocator: () => frame, on() {}, off() {}, waitForTimeout: async () => {} }
  const sandbox = {
    exports: {}, Date: { now: () => { clock += 3000; return clock } },
    require: name => {
      if (name === '@playwright/test') return { expect: () => ({ toBeVisible: async () => {}, toHaveAttribute: async () => {} }) }
      if (name === './env') return { BE_MAIN: 'http://synthetic.invalid', SEAT: { account: 'synthetic' }, seatPassportLogin: async () => 'synthetic' }
      throw new Error(`Unexpected import: ${name}`)
    },
    fetch: async url => {
      const action = url.split('/').at(-1)
      assert.ok(['scan', 'confirm'].includes(action))
      requests.push(action)
      return { json: async () => ({ code: action === failure ? 5200 : 0 }) }
    },
  }
  vm.runInNewContext(compile(readFileSync(path.join(__dirname, 'qr-embed.ts'), 'utf8')), sandbox)
  return { requests, login: (limit, budget) => sandbox.exports.qrLoginSeatInFrame(page, 'synthetic', limit, budget) }
}

test('one QR budget is shared across initial and reloaded login calls', async () => {
  const harness = qrHarness()
  const budget = { scan: 0, confirm: 0 }
  await harness.login(1, budget)
  assert.deepEqual(budget, { scan: 1, confirm: 1 })
  await assert.rejects(harness.login(1, budget), /journey QR scan\/confirm budget exhausted/)
  assert.deepEqual(harness.requests, ['scan', 'confirm'])
})

for (const failure of ['scan', 'confirm']) {
  test(`failed ${failure} consumes the shared budget before issuing a request`, async () => {
    const harness = qrHarness(failure)
    const budget = { scan: 0, confirm: 0 }
    await assert.rejects(harness.login(1, budget), new RegExp(`qr ${failure} failed`))
    const requests = [...harness.requests]
    await assert.rejects(harness.login(1, budget), /budget exhausted/)
    assert.deepEqual(harness.requests, requests)
    assert.deepEqual(budget, { scan: 1, confirm: failure === 'confirm' ? 1 : 0 })
  })
  test(`other callers keep four default attempts after ${failure} failure`, async () => {
    const harness = qrHarness(failure)
    await assert.rejects(harness.login(), new RegExp(`qr ${failure} failed`))
    assert.equal(harness.requests.filter(action => action === 'scan').length, 4)
    assert.equal(harness.requests.filter(action => action === 'confirm').length, failure === 'confirm' ? 4 : 0)
  })
}
