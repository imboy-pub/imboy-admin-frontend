#!/usr/bin/env bun
/**
 * CSD-IMG-01：dist-widget 发布 manifest 生成器（`bun run build:widget` 的最后一步）。
 *
 * 产物合同（冻结合同 v1 S6 + 计划卡 CSD-IMG-01）：
 * - dist-widget/manifest.json：
 *   { source_head, build_command, generated_at_utc,
 *     files: [{ path, sha256, bytes }],
 *     cache_policy: { loader, assets, html } }
 * - dist-widget/manifest.sha256：manifest.json 字节的 SHA-256（hex）。
 * - dist-widget/health.txt：稳定构建指纹行（不含时间戳 → 两次同输入构建字节一致）。
 *
 * 可重复性口径（CSD-IMG-01-A04）：相同输入的两次构建，files 内全部 sha256 与
 * health.txt 完全一致；generated_at_utc 允许不同（每次构建时刻），单独字段注明。
 *
 * CSD-IMG-01R + R2-F1/F3：在 manifest 生成前，把 widget/index.html 引用的内容
 * hash 入口 chunk（assets/cs-widget-<hash>.js）原样复制为版本化稳定名
 * widget-assets/cs-widget.v2.js——/w/ frame HTML 固定引用该版本化路径（合同 S4
 * 字面形状；v1 归旧 frame 面，新面取 v2 避免同名互踩）。内容随发布原位更新，
 * 部署层对该 location 下发 no-cache 重验证：热修对已缓存访客立即可达，不依赖
 * 跨仓改名纪律；升级改名 v3 只是可选优化。别名照常进入 manifest.files
 * （含 sha256/bytes），verify:widget 校验其存在且与入口 chunk 内容一致。
 *
 * 只读业务源码、只写 dist-widget/{manifest.json,manifest.sha256,health.txt}
 * 与版本化别名 widget-assets/cs-widget.v2.js。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const DIST = path.join(REPO_ROOT, 'dist-widget')

/** manifest 自身与校验文件不纳入 files（无法自洽包含自身）。 */
const MANIFEST_NAME = 'manifest.json'
const CHECKSUM_NAME = 'manifest.sha256'
const HEALTH_NAME = 'health.txt'

/** CSD-IMG-01R + R2-F1/F3：版本化 frame 资产别名（合同 S4 字面路径；v1 归旧 frame 面）。 */
const STABLE_ASSET_ALIAS = 'widget-assets/cs-widget.v2.js'

/** widget/index.html 引用的 iframe 应用入口 chunk（内容 hash 文件名）。 */
const HASHED_JS_REF = /assets\/cs-widget-[A-Za-z0-9_-]+\.js/g

/** S6 缓存策略（照冻结表落 manifest，部署层 nginx 按同表执行）；widget_assets
 * 为 R2-F1/F3 增补：版本化入口资产 no-cache 重验证，热修对已缓存访客立即可达。 */
const CACHE_POLICY = {
  loader: 'no-cache',
  assets: 'public,max-age=31536000,immutable',
  widget_assets: 'no-cache',
  html: 'no-store',
} as const

interface ArtifactFile {
  path: string
  sha256: string
  bytes: number
}

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

async function walkFiles(dir: string, baseDir = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(abs, baseDir)))
    } else if (entry.isFile()) {
      files.push(abs)
    }
  }
  return files
}

function gitSourceHead(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // git 不可用（极少数打包环境）：manifest 仍可生成，但可重复性退化为文件集本身
    return 'unknown'
  }
}

/** CSD-IMG-01R：写稳定版本名别名（必须在 manifest 收集前完成，别名才进 files）。 */
async function writeStableAssetAlias(): Promise<void> {
  let html: string
  try {
    html = await readFile(path.join(DIST, 'widget', 'index.html'), 'utf8')
  } catch {
    console.error('[widget-manifest] FAIL: widget/index.html 不存在，无法定位 iframe 入口 chunk')
    process.exit(1)
  }
  const refs = [...new Set(html.match(HASHED_JS_REF) ?? [])]
  if (refs.length !== 1) {
    console.error(`[widget-manifest] FAIL: widget/index.html 应引用恰好 1 个 cs-widget-<hash>.js，实际=${JSON.stringify(refs)}`)
    process.exit(1)
  }
  const sourceRel = refs[0]
  if (!sourceRel) {
    console.error('[widget-manifest] FAIL: 入口 chunk 引用为空')
    process.exit(1)
  }
  const sourceBytes = await readFile(path.join(DIST, sourceRel))
  const aliasAbs = path.join(DIST, STABLE_ASSET_ALIAS)
  await mkdir(path.dirname(aliasAbs), { recursive: true })
  await writeFile(aliasAbs, sourceBytes)
  console.log(
    `[widget-manifest] stable alias: ${STABLE_ASSET_ALIAS} ← ${sourceRel} ` +
      `(sha256=${sha256Hex(sourceBytes).slice(0, 12)}…, bytes=${sourceBytes.byteLength})`,
  )
}

async function main(): Promise<void> {
  let distStat
  try {
    distStat = await stat(DIST)
  } catch {
    console.error(`[widget-manifest] FAIL: ${DIST} 不存在——请先运行 vite build --mode widget && vite build --mode widget-loader`)
    process.exit(1)
  }
  if (!distStat.isDirectory()) {
    console.error(`[widget-manifest] FAIL: ${DIST} 不是目录`)
    process.exit(1)
  }

  // 0) CSD-IMG-01R：稳定版本名别名（复制入口 chunk → cs-widget.v1.js），先于收集
  await writeStableAssetAlias()

  const sourceHead = gitSourceHead()

  // 1) 收集产物（排除 manifest/校验/health 三个由本脚本管理的文件）
  const all = await walkFiles(DIST)
  const managed = new Set([MANIFEST_NAME, CHECKSUM_NAME, HEALTH_NAME])
  const artifactPaths = all
    .map((abs) => path.relative(DIST, abs).split(path.sep).join('/'))
    .filter((rel) => !managed.has(rel))
    .sort()

  const files: ArtifactFile[] = []
  for (const rel of artifactPaths) {
    const data = await readFile(path.join(DIST, rel))
    files.push({ path: rel, sha256: sha256Hex(data), bytes: data.byteLength })
  }

  // 2) health.txt：稳定指纹行 = source_head + 产物文件集联合哈希（不含时间戳）
  const filesDigest = sha256Hex(Buffer.from(files.map((f) => `${f.path}:${f.sha256}`).join('\n'), 'utf8'))
  const healthLine = `OK imboy-cs-widget source_head=${sourceHead} files_sha256=${filesDigest}\n`
  await writeFile(path.join(DIST, HEALTH_NAME), healthLine, 'utf8')

  // 3) files 纳入 health.txt（自身稳定），写 manifest.json
  const healthData = Buffer.from(healthLine, 'utf8')
  const filesWithHealth: ArtifactFile[] = [
    ...files,
    { path: HEALTH_NAME, sha256: sha256Hex(healthData), bytes: healthData.byteLength },
  ].sort((a, b) => (a.path < b.path ? -1 : 1))

  const manifest = {
    source_head: sourceHead,
    build_command: 'bun run build:widget',
    generated_at_utc: new Date().toISOString(),
    files: filesWithHealth,
    cache_policy: CACHE_POLICY,
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(path.join(DIST, MANIFEST_NAME), manifestBytes)

  // 4) manifest.sha256 = manifest.json 字节哈希
  await writeFile(path.join(DIST, CHECKSUM_NAME), `${sha256Hex(manifestBytes)}\n`, 'utf8')

  const hashed = filesWithHealth.filter((f) => f.path.startsWith('assets/')).length
  console.log(
    `[widget-manifest] OK: ${filesWithHealth.length} files (assets hashed: ${hashed}), ` +
      `source_head=${sourceHead.slice(0, 12)}, files_sha256=${filesDigest.slice(0, 16)}…`,
  )
}

main()
