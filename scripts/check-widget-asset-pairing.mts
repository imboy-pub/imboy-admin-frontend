#!/usr/bin/env bun
/**
 * 跨仓 Widget 资产配对门（计划 CP-ASSET-04，admin 侧执行者）。
 *
 * 计划口径（CP-ASSET-A07/A08）：检查后端资产常量与 Admin manifest 输出名一致；
 * 两个仓库 CI 调用同一合同数据或互验产物，避免复制常量成为双真源。
 *
 * 本脚本采用「互验」路径：配对常量的值不在本脚本登记，而是运行时分别从
 * imboyadmin（本仓）与 imboy（后端仓）的源文件实时提取后比对——脚本只登记
 * 「去哪个文件读哪个名字」的接线，不携带第二份常量值，无双真源。
 *
 * 配对面（face = public_frame，hosted-widget-contract S4）：
 *   后端  cs_widget_handler.erl   -define(PUBLIC_FRAME_ASSET_JS, <<"/widget-assets/cs-widget.v2.js">>)
 *   admin widget-manifest.mts     const STABLE_ASSET_ALIAS = 'widget-assets/cs-widget.v2.js'
 *   admin widget-verify.mts       const STABLE_ASSET_ENTRY = 'widget-assets/cs-widget.v2.js'
 * （后端常量带前导 /，比对前归一。）
 *
 * 退出码：0 = 全部配对一致；
 *         2 = 漂移或配对项缺失（缺宏/缺 const/值不等）；
 *         3 = 后端仓不可达（显式 SKIPPED——「没核对」不冒充「一致」）。
 *
 * 用法：bun scripts/check-widget-asset-pairing.mts
 *   admin 根默认 = 本脚本上两级目录；可用 ADMIN_REPO_DIR 覆盖（负例 fixture 用）。
 *   imboy 根探测顺序：IMBOY_REPO_DIR 环境变量 → <admin>/../imboy（标准三仓布局）
 *   → <admin>/../../imboy/integration（RUN_ROOT worktree 布局）。
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ADMIN_ROOT = path.resolve(process.env.ADMIN_REPO_DIR ?? path.join(import.meta.dirname, '..'))
const CONTRACT_WIDGET_ASSET = 'widget-assets/cs-widget.'

interface AdminSource {
  file: string
  const: string
}
interface Face {
  face: string
  note: string
  backend: { file: string; macro: string }
  admin: AdminSource[]
}

/** 配对接线（只登记读取位置，不登记值——值以两仓源文件实时提取为准）。 */
const FACES: Face[] = [
  {
    face: 'public_frame',
    note: '/w/ frame 引用的版本化入口 JS（hosted-widget-contract S4）',
    backend: {
      file: 'src/features/customer_service/interfaces/cs_widget_handler.erl',
      macro: 'PUBLIC_FRAME_ASSET_JS',
    },
    admin: [
      { file: 'scripts/widget-manifest.mts', const: 'STABLE_ASSET_ALIAS' },
      { file: 'scripts/widget-verify.mts', const: 'STABLE_ASSET_ENTRY' },
    ],
  },
]

function resolveImboyRoot(): string | null {
  const candidates: string[] = []
  if (process.env.IMBOY_REPO_DIR) candidates.push(process.env.IMBOY_REPO_DIR)
  candidates.push(path.join(ADMIN_ROOT, '..', 'imboy'))
  candidates.push(path.join(ADMIN_ROOT, '..', '..', 'imboy', 'integration'))
  for (const c of candidates) {
    if (existsSync(path.join(c, 'src', 'features', 'customer_service'))) return path.resolve(c)
  }
  return null
}

let failed = 0
function fail(msg: string): void {
  console.error(`  [FAIL] ${msg}`)
  failed++
}
function ok(msg: string): void {
  console.log(`  [ OK ] ${msg}`)
}

async function readText(file: string): Promise<string> {
  return readFile(file, 'utf8')
}

/** 从 admin TS 源提取 const NAME = '...' 的字面值。 */
function extractAdminConst(src: string, name: string): string | null {
  const m = src.match(new RegExp(`const ${name}\\s*(?::\\s*[^=]+)?=\\s*['"]([^'"]+)['"]`))
  return m?.[1] ?? null
}

/** 从后端 .erl 提取 -define(NAME, <<"...">>) 的字面值。 */
function extractBackendMacro(src: string, name: string): string | null {
  const m = src.match(new RegExp(`^-define\\(${name},\\s*<<"([^"]+)">>`, 'm'))
  return m?.[1] ?? null
}

async function main(): Promise<void> {
  const imboyRoot = resolveImboyRoot()
  if (!imboyRoot) {
    console.error(
      `[SKIPPED] imboy 仓不可达（探测过：IMBOY_REPO_DIR、${path.join(ADMIN_ROOT, '..', 'imboy')}、` +
        `${path.join(ADMIN_ROOT, '..', '..', 'imboy', 'integration')}）——后端侧未核对，不视为通过`,
    )
    console.error('  指定：IMBOY_REPO_DIR=/path/to/imboy bun scripts/check-widget-asset-pairing.mts')
    process.exit(3)
  }

  console.log(`[pairing] admin root = ${ADMIN_ROOT}`)
  console.log(`[pairing] imboy root = ${imboyRoot}`)

  // 后端源文件整读一次缓存（faces 可能共用）
  const backendCache = new Map<string, string>()

  for (const f of FACES) {
    console.log(`[pairing] face=${f.face} — ${f.note}`)

    // ---- 后端侧常量 ------------------------------------------------------
    let backendSrc = backendCache.get(f.backend.file)
    if (backendSrc === undefined) {
      try {
        backendSrc = await readText(path.join(imboyRoot, f.backend.file))
      } catch {
        fail(`[${f.face}] 后端源文件缺失：${path.join(imboyRoot, f.backend.file)}`)
        backendSrc = ''
      }
      backendCache.set(f.backend.file, backendSrc)
    }
    const backendRaw = backendSrc === '' ? null : extractBackendMacro(backendSrc, f.backend.macro)
    if (backendRaw === null) {
      fail(`[${f.face}] 缺配对项：后端 ${f.backend.file} 未找到 -define(${f.backend.macro}, <<"...">>)`)
    }
    const backendValue = backendRaw === null ? null : backendRaw.replace(/^\//, '')

    // ---- admin 侧常量（每个都必须等于后端值）-----------------------------
    const adminValues: Array<{ src: AdminSource; value: string | null }> = []
    for (const s of f.admin) {
      let src: string
      try {
        src = await readText(path.join(ADMIN_ROOT, s.file))
      } catch {
        fail(`[${f.face}] 缺配对项：本仓源文件缺失 ${s.file}`)
        adminValues.push({ src: s, value: null })
        continue
      }
      const v = extractAdminConst(src, s.const)
      if (v === null) {
        fail(`[${f.face}] 缺配对项：${s.file} 未找到 const ${s.const} = '...'`)
      }
      adminValues.push({ src: s, value: v })
    }

    // ---- 比对：任一 admin 值存在时，与后端值及彼此必须一致 ----------------
    for (const { src: s, value } of adminValues) {
      if (value === null) continue
      if (!value.startsWith(CONTRACT_WIDGET_ASSET)) {
        fail(`[${f.face}] ${s.const}=${value} 不是 widget-assets/cs-widget.v<N>.js 形状的合同产物名`)
        continue
      }
      if (backendValue !== null && value !== backendValue) {
        fail(`[${f.face}] 字段不匹配：本仓 ${s.const}=${value} != 后端 ${f.backend.macro}=${backendRaw}`)
      } else {
        ok(`[${f.face}] 本仓 ${s.const} == 后端 ${f.backend.macro} == ${value}`)
      }
    }
    if (backendValue !== null && adminValues.every((a) => a.value === null)) {
      fail(`[${f.face}] 缺配对项：后端 ${f.backend.macro}=${backendRaw} 在本仓无任何可配对常量`)
    }
  }

  if (failed > 0) {
    console.error(`[pairing] FAIL：${failed} 处漂移/缺失——后端资产常量与 Admin manifest 输出名不一致`)
    process.exit(2)
  }
  console.log('[pairing] PASS：后端资产常量与 Admin manifest 输出名互验一致')
}

main()
