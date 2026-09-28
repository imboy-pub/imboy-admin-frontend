#!/usr/bin/env bun
/**
 * CSD-IMG-01：dist-widget 产物门禁验证器（`bun run verify:widget`，build 后可重复执行）。
 *
 * 门禁（S6 + CSD-IMG-01-A02/A04 + CSD-IMG-01R）：
 * 1. 必需产物齐全：loader.js / widget/index.html / widget-assets/cs-widget.v2.js / manifest.json / manifest.sha256 / health.txt；
 * 2. assets/ 全部内容 hash 文件名（cs-widget-<hash>.js|css），零无 hash 文件、
 *    零 .map；widget-assets/ 只收版本化稳定名 cs-widget.v<N>.js（R2-F1/F3）；
 * 3. 全树零 source map（.map 文件与 sourceMappingURL 注释均不得出现）；
 * 4. widget/index.html 引用闭合（引用的相对资源必须存在于 dist-widget）；
 * 5. 零 Admin chunk：文件名不得出现 Admin 命名（index / admin / vendor- 前缀），JS 内容零 `/api/adm`；
 * 6. secret/测试 token 扫描：高置信凭证模式与 E2E stub 零命中；
 *    `token|secret|api[_-]?key` 词面命中仅列出供人工审查（loader 的 x-cs-visit-token
 *    请求头名为已知良性词面，不是值泄露）；
 * 7. manifest 自洽：manifest.sha256 == sha256(manifest.json)；files 与磁盘逐一比对
 *    （path/sha256/bytes）；cache_policy 键齐全；health.txt 指纹行可复算。
 * 8. CSD-IMG-01R + R2-F1/F3：版本化别名 widget-assets/cs-widget.v2.js 与
 *    widget/index.html 引用的唯一 cs-widget-<hash>.js 入口 chunk 内容一致
 *    （sha256 相等）——/w/ frame HTML 引用的版本化文件必须与当次构建
 *    iframe app JS 同字节。
 * 9. SC-BLD 坐席工作台门禁（seat 面，镜像 widget 面）：
 *    必需产物 seat/index.html + seat-assets/cs-seat.v1.{js,css}；seat html
 *    引用闭合；两个别名与 seat/index.html 引用的 hash chunk 逐字节一致；
 *    seat-assets/ 只收版本化稳定名；全 dist（含 seat 产物）零 /api/adm 与
 *    Admin auth 面标记（authStore/adminClient）。
 *
 * 任一门禁失败 exit 1；全部通过打印 PASS。
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const DIST = path.join(REPO_ROOT, 'dist-widget')

interface ArtifactFile {
  path: string
  sha256: string
  bytes: number
}

const failures: string[] = []
const notes: string[] = []

function fail(msg: string): void {
  failures.push(msg)
}

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

async function walkFiles(dir: string): Promise<Array<{ rel: string; abs: string }>> {
  const out: Array<{ rel: string; abs: string }> = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walkFiles(abs)))
    else if (entry.isFile()) out.push({ rel: path.relative(DIST, abs).split(path.sep).join('/'), abs })
  }
  return out
}

/** 高置信凭证模式（匹配即 FAIL）。sk- 加左边界（前一位不得是字母/数字/连字符）：
 * Tailwind v4 主题键含 mask-image-linear-* 等子串，裸 sk- 会误报。 */
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['OpenAI 风格 sk- 密钥', /(?<![\w-])sk-[A-Za-z0-9_-]{16,}/],
  ['AWS AccessKeyId', /AKIA[0-9A-Z]{16}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['JWT 形态凭证', /eyJ[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['私钥块', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['E2E 测试 token stub', /e2e-visit-token-stub/],
]

/** 词面审查模式（只列不 FAIL；命中者需在报告里确认为字段名/头名而非值）。 */
const REVIEW_PATTERN = /api[_-]?key|secret|token/gi

const ASSET_HASH_NAME = /^assets\/cs-(widget|seat)-[A-Za-z0-9_-]{8,}\.(js|css)$/
/** CSD-IMG-01R + R2-F1/F3：版本化 frame 资产（v1 归旧 frame 面，新面自 v2 起）。 */
const STABLE_ASSET_NAME = /^widget-assets\/cs-widget\.v\d+\.js$/
const STABLE_ASSET_ENTRY = 'widget-assets/cs-widget.v2.js'
/** widget/index.html 引用的 iframe 应用入口 chunk（内容 hash 文件名）。 */
const HASHED_JS_REF = /assets\/cs-widget-[A-Za-z0-9_-]+\.js/g
/** SC-BLD：坐席工作台版本化资产（配对常量 seat_console 面，值单一真源见
 * scripts/widget-manifest.mts 的 STABLE_SEAT_ASSET_ALIAS）。 */
const SEAT_ASSET_NAME = /^seat-assets\/cs-seat\.v\d+\.(js|css)$/
const STABLE_SEAT_ASSET_ENTRY = 'seat-assets/cs-seat.v1.js'
const STABLE_SEAT_ASSET_ENTRY_CSS = 'seat-assets/cs-seat.v1.css'
/** seat/index.html 引用的坐席工作台入口 chunk（内容 hash 文件名）。 */
const HASHED_SEAT_JS_REF = /assets\/cs-seat-[A-Za-z0-9_-]+\.js/g
const HASHED_SEAT_CSS_REF = /assets\/cs-seat-[A-Za-z0-9_-]+\.css/g
const ADMIN_CHUNK_NAME = /(^|\/)(index|admin|vendor-|main)\.[A-Za-z0-9]/
/** A07：Admin 认证面标记（authStore / adminClient）不得出现在任何产物。 */
const ADMIN_AUTH_MARKER = /authStore|adminClient/

async function main(): Promise<void> {
  try {
    await stat(DIST)
  } catch {
    console.error(`[widget-verify] FAIL: ${DIST} 不存在——请先运行 bun run build:widget`)
    process.exit(1)
  }

  const all = await walkFiles(DIST)
  const byRel = new Map(all.map((f) => [f.rel, f.abs]))

  // 1) 必需产物（SC-BLD：含 seat 面 seat/index.html + 两个版本化别名）
  for (const required of [
    'loader.js',
    'widget/index.html',
    STABLE_ASSET_ENTRY,
    'seat/index.html',
    STABLE_SEAT_ASSET_ENTRY,
    STABLE_SEAT_ASSET_ENTRY_CSS,
    'manifest.json',
    'manifest.sha256',
    'health.txt',
  ]) {
    if (!byRel.has(required)) fail(`缺少必需产物: ${required}`)
  }
  if (failures.length > 0) {
    console.error(`[widget-verify] FAIL:\n  - ${failures.join('\n  - ')}`)
    process.exit(1)
  }

  // 2) assets 全部 hash 文件名；widget-assets/ 只收版本化稳定名（R2-F1/F3）；
  //    seat-assets/ 只收版本化稳定名（SC-BLD，js+css）
  const assets = all.filter((f) => f.rel.startsWith('assets/'))
  if (assets.length === 0) fail('assets/ 为空：iframe 应用产物缺失')
  for (const f of assets) {
    if (!ASSET_HASH_NAME.test(f.rel)) fail(`assets 文件名非内容 hash 形态: ${f.rel}`)
  }
  const versionedAssets = all.filter((f) => f.rel.startsWith('widget-assets/'))
  for (const f of versionedAssets) {
    if (!STABLE_ASSET_NAME.test(f.rel)) fail(`widget-assets 文件名非版本化稳定形态: ${f.rel}`)
  }
  const seatAssets = all.filter((f) => f.rel.startsWith('seat-assets/'))
  for (const f of seatAssets) {
    if (!SEAT_ASSET_NAME.test(f.rel)) fail(`seat-assets 文件名非版本化稳定形态: ${f.rel}`)
  }

  // 3) 零 source map
  const maps = all.filter((f) => f.rel.endsWith('.map'))
  if (maps.length > 0) fail(`发现 source map: ${maps.map((m) => m.rel).join(', ')}`)
  const smapComment: Array<{ rel: string; abs: string }> = []
  for (const f of all.filter((x) => x.rel.endsWith('.js'))) {
    const text = await readFile(f.abs, 'utf8')
    if (/\/\/[#@]\s*sourceMappingURL=/.test(text)) smapComment.push(f)
  }
  if (smapComment.length > 0) fail(`JS 内嵌 sourceMappingURL 注释: ${smapComment.map((m) => m.rel).join(', ')}`)

  // 4) frame HTML 引用闭合（widget 与 seat 两面同规则：引用的相对资源必须存在）
  const checkHtmlRefs = async (entryRel: string, html: string): Promise<void> => {
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!)
    for (const ref of refs) {
      if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) continue
      const rel = ref.startsWith('/') ? ref.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(entryRel), ref))
      if (!byRel.has(rel)) fail(`${entryRel} 引用缺失: ${ref} (解析为 ${rel})`)
    }
  }
  const indexHtml = await readFile(byRel.get('widget/index.html')!, 'utf8')
  await checkHtmlRefs('widget/index.html', indexHtml)
  const seatHtml = await readFile(byRel.get('seat/index.html')!, 'utf8')
  await checkHtmlRefs('seat/index.html', seatHtml)

  // 8) CSD-IMG-01R：稳定版本名别名与 index.html 引用的入口 chunk 内容一致
  const entryRefs = [...new Set(indexHtml.match(HASHED_JS_REF) ?? [])]
  if (entryRefs.length !== 1) {
    fail(`widget/index.html 应引用恰好 1 个 cs-widget-<hash>.js 入口 chunk，实际=${JSON.stringify(entryRefs)}`)
  } else {
    const entryRel = entryRefs[0]!
    const entryAbs = byRel.get(entryRel)
    const stableAbs = byRel.get(STABLE_ASSET_ENTRY)
    if (!entryAbs) {
      fail(`入口 chunk 不存在: ${entryRel}`)
    } else if (!stableAbs) {
      fail(`缺少稳定版本名别名: ${STABLE_ASSET_ENTRY}`)
    } else {
      const entrySha = sha256Hex(await readFile(entryAbs))
      const stableSha = sha256Hex(await readFile(stableAbs))
      if (entrySha !== stableSha) {
        fail(`稳定别名与入口 chunk 内容不一致: ${STABLE_ASSET_ENTRY}(sha256=${stableSha.slice(0, 12)}…) ≠ ${entryRel}(sha256=${entrySha.slice(0, 12)}…)`)
      } else {
        notes.push(`稳定别名一致: ${STABLE_ASSET_ENTRY} ≡ ${entryRel} (sha256=${entrySha.slice(0, 12)}…)`)
      }
    }
  }

  // 8b) SC-BLD：坐席工作台两个版本化别名与 seat/index.html 引用的 hash chunk
  //     逐字节一致（JS + CSS；镜像 8) 的 widget 面语义）
  const seatJsRefs = [...new Set(seatHtml.match(HASHED_SEAT_JS_REF) ?? [])]
  const seatCssRefs = [...new Set(seatHtml.match(HASHED_SEAT_CSS_REF) ?? [])]
  if (seatJsRefs.length !== 1 || seatCssRefs.length !== 1) {
    fail(
      `seat/index.html 应引用恰好 1 个 cs-seat-<hash>.js 与 1 个 cs-seat-<hash>.css，` +
        `实际 js=${JSON.stringify(seatJsRefs)} css=${JSON.stringify(seatCssRefs)}`,
    )
  } else {
    for (const [entryRel, hashedRef] of [
      [STABLE_SEAT_ASSET_ENTRY, seatJsRefs[0]],
      [STABLE_SEAT_ASSET_ENTRY_CSS, seatCssRefs[0]],
    ] as const) {
      const hashedRel = hashedRef!
      const hashedAbs = byRel.get(hashedRel)
      const aliasAbs = byRel.get(entryRel)
      if (!hashedAbs) {
        fail(`坐席工作台 chunk 不存在: ${hashedRel}`)
      } else if (!aliasAbs) {
        fail(`缺少坐席工作台稳定别名: ${entryRel}`)
      } else {
        const hashedSha = sha256Hex(await readFile(hashedAbs))
        const aliasSha = sha256Hex(await readFile(aliasAbs))
        if (hashedSha !== aliasSha) {
          fail(`坐席稳定别名与 hash chunk 内容不一致: ${entryRel}(sha256=${aliasSha.slice(0, 12)}…) ≠ ${hashedRel}(sha256=${hashedSha.slice(0, 12)}…)`)
        } else {
          notes.push(`坐席稳定别名一致: ${entryRel} ≡ ${hashedRel} (sha256=${hashedSha.slice(0, 12)}…)`)
        }
      }
    }
  }

  // 5) 零 Admin chunk（widget|seat/index.html 是 S6/SC-BLD frame HTML 合法路径，
  //    不在文件名门禁之列）；零 Admin API 面 /api/adm 与 Admin 认证面标记
  //    （authStore/adminClient）——全局扫描全部 JS/CSS/HTML 产物（含 seat 面）
  for (const f of all.filter((x) => x.rel.startsWith('assets/') || x.rel.startsWith('widget-assets/') || x.rel.startsWith('seat-assets/'))) {
    if (ADMIN_CHUNK_NAME.test(f.rel)) fail(`产物文件名疑似 Admin chunk: ${f.rel}`)
  }
  for (const f of all.filter((x) => /\.(js|css|html)$/.test(x.rel))) {
    let text = await readFile(f.abs, 'utf8')
    if (f.rel.endsWith('.html')) {
      // HTML 注释是构建说明文档（非可执行面；vite 原样保留源码注释），扫描前
      // 剥离——注释里的字面示例（如「不依赖 /api/adm」）不构成 Admin API 面；
      // 可执行引用仍在标记文本中，会被命中。
      text = text.replace(/<!--[\s\S]*?-->/g, '')
    }
    if (text.includes('/api/adm')) fail(`产物含 Admin API 面 /api/adm: ${f.rel}`)
    if (ADMIN_AUTH_MARKER.test(text)) fail(`产物含 Admin 认证面标记（authStore/adminClient）: ${f.rel}`)
  }

  // 6) secret 扫描
  for (const f of all) {
    const text = await readFile(f.abs, 'utf8')
    for (const [label, re] of SECRET_PATTERNS) {
      if (re.test(text)) fail(`secret 扫描命中（${label}）: ${f.rel}`)
    }
    const reviewHits = text.match(REVIEW_PATTERN)
    if (reviewHits && reviewHits.length > 0) {
      notes.push(`词面审查（非门禁）: ${f.rel} 命中 ${reviewHits.length} 次 ${[...new Set(reviewHits.map((h) => h.toLowerCase()))].join('/')}`)
    }
  }

  // 7) manifest 自洽
  const manifestBytes = await readFile(byRel.get('manifest.json')!)
  const checksumFile = (await readFile(byRel.get('manifest.sha256')!, 'utf8')).trim()
  const actualManifestSha = sha256Hex(manifestBytes)
  if (checksumFile !== actualManifestSha) fail(`manifest.sha256 不一致: 文件=${checksumFile} 实算=${actualManifestSha}`)

  let manifest: { source_head: string; build_command: string; generated_at_utc: string; files: ArtifactFile[]; cache_policy: Record<string, string> }
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'))
  } catch (e) {
    fail(`manifest.json 解析失败: ${String(e)}`)
    console.error(`[widget-verify] FAIL:\n  - ${failures.join('\n  - ')}`)
    process.exit(1)
  }
  for (const key of ['source_head', 'build_command', 'generated_at_utc', 'files', 'cache_policy']) {
    if ((manifest as Record<string, unknown>)[key] === undefined) fail(`manifest 缺字段: ${key}`)
  }
  const policy = manifest.cache_policy ?? {}
  if (policy.loader !== 'no-cache') fail(`cache_policy.loader 应为 no-cache，实际=${String(policy.loader)}`)
  if (policy.assets !== 'public,max-age=31536000,immutable') fail(`cache_policy.assets 与 S6 不符，实际=${String(policy.assets)}`)
  if (policy.widget_assets !== 'no-cache') fail(`cache_policy.widget_assets 应为 no-cache（R2-F1：版本化入口重验证），实际=${String(policy.widget_assets)}`)
  if (policy.seat_assets !== 'no-cache, must-revalidate') fail(`cache_policy.seat_assets 应为 no-cache, must-revalidate（SC-BLD：坐席版本化资产重验证），实际=${String(policy.seat_assets)}`)
  if (policy.html !== 'no-store') fail(`cache_policy.html 应为 no-store，实际=${String(policy.html)}`)

  // manifest.files 与磁盘比对（manifest.files 覆盖除 manifest.json/manifest.sha256 外全部产物）
  const diskFiles = all.filter((f) => f.rel !== 'manifest.json' && f.rel !== 'manifest.sha256').map((f) => f.rel).sort()
  const manifestPaths = (manifest.files ?? []).map((f) => f.path).sort()
  if (diskFiles.join('\n') !== manifestPaths.join('\n')) {
    const onlyDisk = diskFiles.filter((p) => !manifestPaths.includes(p))
    const onlyManifest = manifestPaths.filter((p) => !diskFiles.includes(p))
    fail(`manifest.files 与磁盘不一致: 仅磁盘=[${onlyDisk}] 仅manifest=[${onlyManifest}]`)
  }
  for (const f of manifest.files ?? []) {
    const abs = byRel.get(f.path)
    if (!abs) {
      fail(`manifest.files 指向不存在文件: ${f.path}`)
      continue
    }
    const data = await readFile(abs)
    if (f.sha256 !== sha256Hex(data)) fail(`sha256 不符: ${f.path}`)
    if (f.bytes !== data.byteLength) fail(`bytes 不符: ${f.path} (manifest=${f.bytes} 磁盘=${data.byteLength})`)
  }

  // health.txt 指纹可复算
  const healthText = await readFile(byRel.get('health.txt')!, 'utf8')
  const artifactDigest = sha256Hex(
    Buffer.from(
      (manifest.files ?? [])
        .filter((f) => f.path !== 'health.txt')
        .sort((a, b) => (a.path < b.path ? -1 : 1))
        .map((f) => `${f.path}:${f.sha256}`)
        .join('\n'),
      'utf8',
    ),
  )
  const expectedHealth = `OK imboy-cs-widget source_head=${manifest.source_head} files_sha256=${artifactDigest}\n`
  if (healthText !== expectedHealth) {
    fail(`health.txt 指纹不复算:\n  期望=${JSON.stringify(expectedHealth)}\n  实际=${JSON.stringify(healthText)}`)
  }
  if (!/^OK imboy-cs-widget source_head=[0-9a-f]{40} files_sha256=[0-9a-f]{64}\n$/.test(healthText)) {
    fail('health.txt 指纹行格式不符（需含完整 40 位 source_head 与 64 位 files 哈希）')
  }

  if (failures.length > 0) {
    console.error(`[widget-verify] FAIL:\n  - ${failures.join('\n  - ')}`)
    process.exit(1)
  }

  console.log(
    `[widget-verify] PASS: ${all.length} files, assets hashed=${assets.length}, seat-assets=${seatAssets.length}, ` +
      `sourcemap=0, admin-chunk=0, admin-api=0, secret-pattern=0`,
  )
  for (const n of notes) console.log(`  ${n}`)
}

main()
