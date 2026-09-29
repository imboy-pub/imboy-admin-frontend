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
 * 配对面：
 *   face = public_frame（hosted-widget-contract S4）：
 *     后端  cs_widget_handler.erl   -define(PUBLIC_FRAME_ASSET_JS, <<"/widget-assets/cs-widget.v2.js">>)
 *     admin widget-manifest.mts     const STABLE_ASSET_ALIAS = 'widget-assets/cs-widget.v2.js'
 *     admin widget-verify.mts       const STABLE_ASSET_ENTRY = 'widget-assets/cs-widget.v2.js'
 *   face = seat_console（SC-BLD 冻结合同；后端面已由 SC-INT 落地）：
 *     后端  cs_seat_console_handler.erl -define(SEAT_FRAME_ASSET_JS, <<"/seat-assets/cs-seat.v1.js">>)
 *     admin widget-manifest.mts       const STABLE_SEAT_ASSET_ALIAS = 'seat-assets/cs-seat.v1.js'
 *     admin widget-verify.mts         const STABLE_SEAT_ASSET_ENTRY = 'seat-assets/cs-seat.v1.js'
 * （后端常量带前导 /，比对前归一。CSS 别名由 JS 常量单真源派生，无独立后端宏；
 *   对 seat_console 面做派生自洽检查：manifest.mts 的 .js→.css 派生表达式 +
 *   verify.mts 的 CSS 字面量 const 必须与 JS 配对值一致。）
 *
 * 配对表接线交叉核对（single source of truth）：priv/cs_widget_asset_pairing.json
 * （经 IMBOY_REPO_DIR 定位）登记了 face → 后端文件/宏 与 admin 文件/常量的接线。
 * 本脚本在 JSON 可读且已登记某 face 时，核对两边接线一致（漂移即 FAIL，只加强
 * 不放宽）；seat_console 已于 SC-INT 落地同步登记（REVIEW-1 N-1 修正接线漂移：
 * 真实处理器为 cs_seat_console_handler.erl）。JSON 不可读
 * 或某 face 未登记时，仅提示、不改变该 face 既有判定（不引入新的失败面）。
 *
 * 退出码：0 = 全部配对一致（若存在 PENDING 面——仅限 pending_ok 面、且只可能是
 *             「后端面尚未落地」——输出明确 [PENDING] 行，不冒充全绿）；
 *         2 = 漂移或配对项缺失（缺宏/缺 const/值不等/接线漂移；pending_ok 面的
 *             「宏存在但值不等」同样 FAIL，PENDING 只豁免「尚未落地」）；
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
const PAIRING_JSON_REL = 'priv/cs_widget_asset_pairing.json'

interface AdminSource {
  file: string
  const: string
}
interface Face {
  face: string
  note: string
  /** 合同产物名形状前缀：本 face 全部 admin 常量值必须以它开头。 */
  shape: string
  /** true = 后端面允许尚未落地（记 PENDING，不 FAIL）；宏已落地时的值漂移仍 FAIL。 */
  pending_ok?: boolean
  backend: { file: string; macro: string }
  admin: AdminSource[]
  /** CSS 别名派生自 JS 常量的自洽检查（可选；无后端值，不引第二真源）。 */
  css?: {
    /** JS 常量名（必须已出现在 admin 列表中）。 */
    from_const: string
    /** manifest.mts 必须包含的 .js→.css 派生表达式子串。 */
    manifest_derivation: string
    /** verify.mts 中 CSS 字面量 const 名。 */
    verify_css_const: string
  }
}

/** 配对接线（只登记读取位置，不登记值——值以两仓源文件实时提取为准）。 */
const FACES: Face[] = [
  {
    face: 'public_frame',
    note: '/w/ frame 引用的版本化入口 JS（hosted-widget-contract S4）',
    shape: 'widget-assets/cs-widget.',
    backend: {
      file: 'src/features/customer_service/interfaces/cs_widget_handler.erl',
      macro: 'PUBLIC_FRAME_ASSET_JS',
    },
    admin: [
      { file: 'scripts/widget-manifest.mts', const: 'STABLE_ASSET_ALIAS' },
      { file: 'scripts/widget-verify.mts', const: 'STABLE_ASSET_ENTRY' },
    ],
  },
  {
    face: 'seat_console',
    note: '/seat/:public_seat_console_id frame 引用的版本化坐席工作台入口（SC-BLD；后端面已由 SC-INT 落地：cs_seat_console_handler.erl）',
    shape: 'seat-assets/cs-seat.',
    backend: {
      file: 'src/features/customer_service/interfaces/cs_seat_console_handler.erl',
      macro: 'SEAT_FRAME_ASSET_JS',
    },
    admin: [
      { file: 'scripts/widget-manifest.mts', const: 'STABLE_SEAT_ASSET_ALIAS' },
      { file: 'scripts/widget-verify.mts', const: 'STABLE_SEAT_ASSET_ENTRY' },
    ],
    css: {
      from_const: 'STABLE_SEAT_ASSET_ALIAS',
      manifest_derivation: "STABLE_SEAT_ASSET_ALIAS.replace(/\\.js$/, '.css')",
      verify_css_const: 'STABLE_SEAT_ASSET_ENTRY_CSS',
    },
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
let pending = 0
function fail(msg: string): void {
  console.error(`  [FAIL] ${msg}`)
  failed++
}
function ok(msg: string): void {
  console.log(`  [ OK ] ${msg}`)
}
function pend(msg: string): void {
  console.log(`  [PENDING] ${msg}`)
  pending++
}

async function readText(file: string): Promise<string> {
  return readFile(file, 'utf8')
}

/** admin 源文件整读缓存（faces 可能共用同一文件）。 */
const adminCache = new Map<string, string>()
async function readAdminText(rel: string): Promise<string> {
  let src = adminCache.get(rel)
  if (src === undefined) {
    src = await readText(path.join(ADMIN_ROOT, rel))
    adminCache.set(rel, src)
  }
  return src
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

  // 配对表接线（single source of truth）：可读则做接线交叉核对；不可读仅提示。
  let pairingPairs: Array<{
    face: string
    backend?: { source?: string; macro?: string }
    admin?: { sources?: AdminSource[] } | null
  }> = []
  try {
    const json = JSON.parse(await readText(path.join(imboyRoot, PAIRING_JSON_REL)))
    pairingPairs = Array.isArray(json?.pairs) ? json.pairs : []
  } catch {
    console.log(`[pairing] note: ${PAIRING_JSON_REL} 不可读——跳过配对表接线交叉核对（不改变各 face 既有判定）`)
  }

  // 后端源文件整读一次缓存（faces 可能共用）
  const backendCache = new Map<string, string>()

  for (const f of FACES) {
    console.log(`[pairing] face=${f.face} — ${f.note}`)

    // ---- 配对表接线交叉核对（只加强不放宽；未登记面仅提示）--------------
    const jsonPair = pairingPairs.find((p) => p.face === f.face)
    if (jsonPair) {
      if (jsonPair.backend?.source !== f.backend.file || jsonPair.backend?.macro !== f.backend.macro) {
        fail(
          `[${f.face}] 配对表接线漂移：${PAIRING_JSON_REL} backend=${JSON.stringify(jsonPair.backend)} ` +
            `!= 本脚本接线 ${f.backend.file}/${f.backend.macro}`,
        )
      } else {
        ok(`[${f.face}] 配对表接线一致（backend ${f.backend.file} / ${f.backend.macro}）`)
      }
      for (const s of jsonPair.admin?.sources ?? []) {
        if (!f.admin.some((a) => a.file === s.file && a.const === s.const)) {
          fail(`[${f.face}] 配对表接线漂移：${PAIRING_JSON_REL} admin ${s.file}#${s.const} 未在本脚本登记`)
        }
      }
    } else if (f.pending_ok) {
      pend(`[${f.face}] ${PAIRING_JSON_REL} 尚未登记该 face（SC-INT 落地后同步登记）`)
    } else {
      console.log(`  [note] [${f.face}] ${PAIRING_JSON_REL} 未登记该 face——维持既有判定`)
    }

    // ---- 后端侧常量 ------------------------------------------------------
    let backendPending = false
    let backendSrc = backendCache.get(f.backend.file)
    if (backendSrc === undefined) {
      try {
        backendSrc = await readText(path.join(imboyRoot, f.backend.file))
      } catch {
        backendSrc = ''
      }
      backendCache.set(f.backend.file, backendSrc)
    }
    const backendRaw = backendSrc === '' ? null : extractBackendMacro(backendSrc, f.backend.macro)
    if (backendRaw === null) {
      if (f.pending_ok) {
        pend(
          `[${f.face}] 后端面尚未落地：${path.join(imboyRoot, f.backend.file)} 未找到 ` +
            `-define(${f.backend.macro}, <<"...">>)（SC-INT 落地后复核）`,
        )
        backendPending = true
      } else {
        fail(`[${f.face}] 缺配对项：后端 ${f.backend.file} 未找到 -define(${f.backend.macro}, <<"...">>)`)
      }
    }
    const backendValue = backendRaw === null ? null : backendRaw.replace(/^\//, '')

    // ---- admin 侧常量（每个都必须等于后端值）-----------------------------
    const adminValues: Array<{ src: AdminSource; value: string | null }> = []
    for (const s of f.admin) {
      let src: string
      try {
        src = await readAdminText(s.file)
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
      if (!value.startsWith(f.shape)) {
        fail(`[${f.face}] ${s.const}=${value} 不是 ${f.shape}<N>.<ext> 形状的合同产物名`)
        continue
      }
      if (backendPending) {
        ok(`[${f.face}] 本仓 ${s.const}=${value}（形状合法；后端面 PENDING，相等性比对延后 SC-INT）`)
      } else if (backendValue !== null && value !== backendValue) {
        fail(`[${f.face}] 字段不匹配：本仓 ${s.const}=${value} != 后端 ${f.backend.macro}=${backendRaw}`)
      } else {
        ok(`[${f.face}] 本仓 ${s.const} == 后端 ${f.backend.macro} == ${value}`)
      }
    }
    if (!backendPending && backendValue !== null && adminValues.every((a) => a.value === null)) {
      fail(`[${f.face}] 缺配对项：后端 ${f.backend.macro}=${backendRaw} 在本仓无任何可配对常量`)
    }

    // ---- CSS 别名派生自洽（可选 face 级；JS 常量为单真源）----------------
    if (f.css) {
      const jsValue = adminValues.find((a) => a.src.const === f.css!.from_const)?.value ?? null
      let manifestSrc = ''
      try {
        manifestSrc = await readAdminText('scripts/widget-manifest.mts')
      } catch {
        fail(`[${f.face}] 缺配对项：本仓源文件缺失 scripts/widget-manifest.mts`)
      }
      if (manifestSrc !== '' && !manifestSrc.includes(f.css.manifest_derivation)) {
        fail(
          `[${f.face}] CSS 别名派生缺失：scripts/widget-manifest.mts 未包含 ` +
            `${f.css.manifest_derivation}（CSS 别名必须由 ${f.css.from_const} 单真源派生）`,
        )
      } else if (manifestSrc !== '') {
        ok(`[${f.face}] CSS 别名单真源派生：manifest.mts ${f.css.from_const}.replace(/.js/→.css)`)
      }
      let cssValue: string | null = null
      try {
        cssValue = extractAdminConst(await readAdminText('scripts/widget-verify.mts'), f.css.verify_css_const)
      } catch {
        fail(`[${f.face}] 缺配对项：本仓源文件缺失 scripts/widget-verify.mts`)
      }
      if (jsValue !== null && cssValue === null) {
        fail(`[${f.face}] 缺配对项：scripts/widget-verify.mts 未找到 const ${f.css.verify_css_const} = '...'`)
      } else if (jsValue !== null && cssValue !== jsValue.replace(/\.js$/, '.css')) {
        fail(
          `[${f.face}] 字段不匹配：${f.css.verify_css_const}=${cssValue} ` +
            `!= ${f.css.from_const} 派生 ${jsValue.replace(/\.js$/, '.css')}`,
        )
      } else if (cssValue !== null) {
        ok(`[${f.face}] CSS 别名配对自洽：${f.css.verify_css_const} == ${f.css.from_const}.js→.css == ${cssValue}`)
      }
    }
  }

  if (failed > 0) {
    console.error(`[pairing] FAIL：${failed} 处漂移/缺失——后端资产常量与 Admin manifest 输出名不一致`)
    process.exit(2)
  }
  if (pending > 0) {
    console.log(`[pairing] PASS：互验一致；${pending} 项 PENDING（后端面尚未落地，由 SC-INT 落地后复核——未核对项已逐条标注，不冒充全绿）`)
    process.exit(0)
  }
  console.log('[pairing] PASS：后端资产常量与 Admin manifest 输出名互验一致')
}

main()
