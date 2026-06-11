#!/usr/bin/env node
// 校验管理后台三端 E2E 场景清单（IMBOY_TEST_SCENARIO_MANIFEST 指向的 JSON）。
// 用法: node tests/e2e/scripts/check_scenario_manifest.mjs [--strict] <manifest.json>
//   - 默认模式: 校验结构（缺字段时警告，退出码 0），便于先跑 test.skip 流程。
//   - --strict : 缺字段或仍含 <...> 占位符时报错并退出码 1，用于 CI / 正式回归前 preflight。
// 结构契约见 tests/e2e/support/scenarioManifest.ts。

import fs from 'node:fs'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const manifestPath = args.find((a) => !a.startsWith('--'))

const problems = []
const fail = (msg) => problems.push(msg)

function isPlaceholder(value) {
  return typeof value === 'string' && /^<.*>$/.test(value.trim())
}

function checkId(scenarioId, fieldPath, value) {
  if (value === undefined || value === null || value === '') {
    fail(`${scenarioId}: 缺少 ${fieldPath}`)
    return
  }
  if (isPlaceholder(value)) {
    fail(`${scenarioId}: ${fieldPath} 仍是占位符 ${value}，请替换为真实 TSID`)
  }
}

function checkIdList(scenarioId, fieldPath, value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${scenarioId}: 缺少 ${fieldPath}（应为非空数组）`)
    return
  }
  value.forEach((item, i) => checkId(scenarioId, `${fieldPath}[${i}]`, item))
}

if (!manifestPath) {
  console.error('用法: node tests/e2e/scripts/check_scenario_manifest.mjs [--strict] <manifest.json>')
  process.exit(2)
}

if (!fs.existsSync(manifestPath)) {
  console.error(`场景清单不存在: ${manifestPath}`)
  process.exit(2)
}

let manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
} catch (e) {
  console.error(`场景清单不是合法 JSON: ${e.message}`)
  process.exit(2)
}

const scenarios = manifest?.scenarios
if (typeof scenarios !== 'object' || scenarios === null) {
  console.error('场景清单缺少顶层 scenarios 对象')
  process.exit(2)
}

const RESOLVE = 'adm_e2e_02_report_center_resolve'
const BATCH = 'adm_e2e_03_report_center_batch'
const GOVERN = 'adm_e2e_05_channel_message_govern'
const TARGETS = ['group', 'channel', 'user']

const resolve = scenarios[RESOLVE]
if (!resolve) {
  fail(`缺少场景 ${RESOLVE}`)
} else {
  for (const t of TARGETS) checkId(RESOLVE, `${t}.reportId`, resolve[t]?.reportId)
}

const batch = scenarios[BATCH]
if (!batch) {
  fail(`缺少场景 ${BATCH}`)
} else {
  for (const t of TARGETS) checkIdList(BATCH, `${t}.reportIds`, batch[t]?.reportIds)
}

const govern = scenarios[GOVERN]
if (!govern) {
  fail(`缺少场景 ${GOVERN}`)
} else {
  checkId(GOVERN, 'channelId', govern.channelId)
}

if (problems.length === 0) {
  console.log(`✔ 场景清单结构与必填字段校验通过: ${manifestPath}`)
  process.exit(0)
}

const label = strict ? 'ERROR' : 'WARN'
for (const p of problems) console.error(`[${label}] ${p}`)
if (strict) {
  console.error(`✖ 严格模式下场景清单未就绪（${problems.length} 项），请补全后重试。`)
  process.exit(1)
}
console.error(`⚠ 场景清单存在 ${problems.length} 项缺失，相关用例将被 test.skip。`)
process.exit(0)
