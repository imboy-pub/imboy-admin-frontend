#!/usr/bin/env bun
/** Offline inventory: lock instances are authoritative; local metadata is evidence, never a guess. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

type Metadata = { name: string; version: string; license?: string | { type?: string } }
type Entry = [string, ...unknown[]]
type Dependencies = Record<string, string>
type Edges = { dependencies?: Dependencies; optionalDependencies?: Dependencies; peerDependencies?: Dependencies }
type Lock = { lockfileVersion: number; workspaces: Record<string, Edges & { devDependencies?: Dependencies }>; packages: Record<string, Entry> }
type Evidence = { metadata: Metadata; texts: Array<{ name: string; hash: string }>; source: string; artifactVerified: boolean }
const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'docs/third-party-licenses.md')
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const known = new Set('MIT MIT-0 ISC Apache-2.0 BSD-2-Clause BSD-3-Clause BSD-4-Clause 0BSD CC0-1.0 CC-BY-3.0 CC-BY-4.0 Unlicense Python-2.0 MPL-2.0 BlueOak-1.0.0 LGPL-2.1-only LGPL-2.1-or-later LGPL-3.0-only LGPL-3.0-or-later GPL-2.0-only GPL-2.0-or-later GPL-3.0-only GPL-3.0-or-later Zlib Unicode-3.0'.split(' '))

export function validLicense(value: string): boolean {
  const tokens = value.match(/\(|\)|[^\s()]+/g) ?? []
  let operand = true
  let depth = 0
  for (const token of tokens) {
    if (token === '(' && operand) depth++
    else if (token === ')' && !operand && depth > 0) depth--
    else if (known.has(token) && operand) operand = false
    else if ((token === 'AND' || token === 'OR') && !operand) operand = true
    else return false
  }
  return tokens.length > 0 && !operand && depth === 0
}

// Full notice bodies used only for conservative recognition, never to synthesize a missing notice.
const embeddedBodies: Record<string, string> = {
  MIT: `Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,
  'BSD-2-Clause': `Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
}

function normalizeNotice(text: string): string {
  return text.replace(/^[\t ]*\* ?/gm, '').replace(/\s+/g, ' ').trim()
}

export function containsEmbeddedLicense(license: Metadata['license'], text: string): boolean {
  const declaration = typeof license === 'string' ? license : license?.type
  const template = declaration ? embeddedBodies[declaration] : undefined
  if (!template) return false
  const normalized = normalizeNotice(text)
  const offset = normalized.indexOf(normalizeNotice(template))
  if (offset < 0) return false
  const attribution = normalized.slice(Math.max(0, offset - 300), offset)
  return /Copyright\s+(?:\(c\)\s*)?(?:\d{4}|©)/i.test(attribution)
}

async function directoryEvidence(directory: string, source: string): Promise<Evidence | undefined> {
  try {
    const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as Metadata
    const names = (await readdir(directory)).filter(name => /^(licen[sc]e|copying|notice)([._-]|$)/i.test(name)).sort()
    const texts = []
    for (const name of names) {
      const text = await readFile(path.join(directory, name))
      if (text.toString('utf8').trim().length) texts.push({ name, hash: sha(text) })
    }
    return { metadata, texts, source, artifactVerified: false }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function collectMetadata(): Promise<Map<string, Evidence[]>> {
  const index = new Map<string, Evidence[]>()
  const cache = process.env.BUN_INSTALL_CACHE_DIR ?? path.join(homedir(), '.bun/install/cache')
  const locations = [[path.join(root, 'node_modules'), '**/package.json', 'installed'], [cache, '*@*@@@*/package.json', 'bun-cache'], [cache, '@*/*@*@@@*/package.json', 'bun-cache']]
  for (const [cwd, pattern, source] of locations) {
    for await (const file of new Bun.Glob(pattern).scan({ cwd, followSymlinks: true, onlyFiles: true })) {
      const evidence = await directoryEvidence(path.dirname(path.join(cwd, file)), source)
      if (!evidence) continue
      const key = `${evidence.metadata.name}@${evidence.metadata.version}`
      index.set(key, [...(index.get(key) ?? []), evidence])
    }
  }
  return index
}

function components(key: string): string[] {
  return key.match(/(?:@[^/]+\/)?[^/]+/g) ?? []
}

export function resolveDependency(lock: Lock, parent: string, name: string): string | undefined {
  const parents = components(parent)
  while (parents.length) {
    const key = `${parents.join('/')}/${name}`
    if (lock.packages[key]) return key
    parents.pop()
  }
  return lock.packages[name] ? name : undefined
}

export function groups(lock: Lock): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  function visit(key: string, group: string): void {
    const labels = result.get(key) ?? new Set<string>()
    if (labels.has(group)) return
    labels.add(group)
    result.set(key, labels)
    const edges = lock.packages[key].find(value => typeof value === 'object') as Edges
    for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
      for (const name of Object.keys(edges?.[kind] ?? {})) {
        const target = resolveDependency(lock, key, name)
        if (target) visit(target, group)
        else if (kind !== 'peerDependencies') throw new Error(`Unresolved lock edge: ${key} -> ${name}`)
      }
    }
  }
  const workspace = lock.workspaces['']
  for (const [group, roots] of [['运行 / Runtime', workspace.dependencies], ['开发 / Development', workspace.devDependencies]] as const) {
    for (const name of Object.keys(roots ?? {})) {
      if (!lock.packages[name]) throw new Error(`Missing direct lock dependency: ${name}`)
      visit(name, group)
    }
  }
  return result
}

export async function archiveEvidence(archive: string, integrity: unknown, source: string): Promise<Evidence> {
  const bytes = await readFile(archive)
  const measured = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  if (integrity !== measured) throw new Error(`Tarball does not match lock integrity: ${source}`)
  const names = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).trim().split('\n')
  const manifests = names.filter(name => /^[^/]+\/package\.json$/.test(name))
  if (manifests.length !== 1) throw new Error('Archive has no unique top-level package.json')
  const prefix = `${path.dirname(manifests[0])}/`
  const metadata = JSON.parse(execFileSync('tar', ['-xOf', archive, manifests[0]], { encoding: 'utf8' })) as Metadata
  const texts: Evidence['texts'] = []
  for (const name of names.filter(name => name.startsWith(prefix) && /^(licen[sc]e|copying|notice)([._-]|$)/i.test(path.basename(name)) && !name.endsWith('/'))) {
    const text = execFileSync('tar', ['-xOf', archive, name])
    if (text.toString('utf8').trim().length) texts.push({ name: name.slice(prefix.length), hash: sha(text) })
  }
  if (!texts.length) {
    for (const name of names.filter(name => name.startsWith(prefix) && /^[^/]+\.(?:md|js)$/i.test(name.slice(prefix.length)))) {
      const text = execFileSync('tar', ['-xOf', archive, name], { encoding: 'utf8' })
      if (containsEmbeddedLicense(metadata.license, text)) texts.push({ name: `${name.slice(prefix.length)} (embedded notice)`, hash: sha(text) })
    }
  }
  return { metadata, texts, source: `${source}; tar SHA-256 ${sha(bytes)}`, artifactVerified: true }
}

async function sourceLicenses(entry: Entry, directory: string, stem: string): Promise<Evidence['texts']> {
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, `${stem}.source-licenses.json`), 'utf8'))
    const metadata = JSON.parse(await readFile(path.join(directory, `${stem}.registry.json`), 'utf8'))
    if (`${metadata.name}@${metadata.version}` !== entry[0] || metadata.dist?.integrity !== entry.at(-1)) throw new Error('Source metadata differs from locked artifact')
    if (!/^[a-f0-9]{40}$/.test(metadata.gitHead ?? '')) throw new Error('Source license has no exact registry gitHead')
    const repository = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url
    const project = repository?.match(/github\.com[:/]([^/]+\/[^/#]+?)(?:\.git)?$/)?.[1]
    if (!project) throw new Error('Unsupported source license repository')
    const result = []
    for (const item of manifest.sources) {
      const prefix = `https://raw.githubusercontent.com/${project}/${metadata.gitHead}/`
      if (!item.url.startsWith(prefix) || item.revision !== metadata.gitHead || !/^LICENSE(?:\.md|\.txt|-MIT)?$|^LICENCE$|^COPYING$/.test(item.url.slice(prefix.length))) throw new Error('License source is not the exact repository revision')
      if (!new RegExp(`^${stem}\\.source-license-\\d+\\.txt$`).test(item.file)) throw new Error('Invalid source license filename')
      const text = await readFile(path.join(directory, item.file))
      if (!text.toString('utf8').trim().length || sha(text) !== item.sha256) throw new Error('Source license text hash mismatch')
      result.push({ name: item.url, hash: item.sha256 })
    }
    return result
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function archiveFor(entry: Entry): Promise<Evidence | undefined> {
  const location = entry[0].slice(entry[0].lastIndexOf('@') + 1)
  if (location.startsWith('./')) {
    const archive = path.resolve(root, location)
    if (!archive.startsWith(`${root}${path.sep}`)) throw new Error('Vendored package outside repository')
    return archiveEvidence(archive, entry.at(-1), location)
  }
  const directory = process.env.IMBOY_LICENSE_ARCHIVE_DIR
  if (!directory) return undefined
  try {
    const stem = sha(entry[0])
    const evidence = await archiveEvidence(path.join(directory, `${stem}.tgz`), entry.at(-1), 'npm registry archive')
    const texts = evidence.texts.length ? evidence.texts : await sourceLicenses(entry, directory, stem)
    return texts === evidence.texts || !texts.length ? evidence : {
      ...evidence, texts, source: `${evidence.source}; source sidecars: internal consistency only`,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function selectEvidence(candidates: Evidence[]): Evidence | undefined {
  const sorted = candidates.toSorted((a, b) => b.texts.length - a.texts.length || a.source.localeCompare(b.source))
  const declarations = new Set(sorted.map(item => JSON.stringify(item.metadata.license)))
  if (declarations.size > 1) throw new Error('Conflicting local license declarations for the same package/version')
  return sorted[0]
}

export function validateWorkspace(lock: Lock, manifest: { dependencies?: Dependencies; devDependencies?: Dependencies }): void {
  for (const kind of ['dependencies', 'devDependencies'] as const) {
    const ordered = (value: Dependencies | undefined) => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)))
    if (ordered(lock.workspaces[''][kind]) !== ordered(manifest[kind])) throw new Error(`package.json ${kind} differs from bun.lock`)
  }
}

async function row(key: string, entry: Entry, index: Map<string, Evidence[]>, labels: Set<string> | undefined): Promise<{ line: string; qualified: boolean }> {
  const offset = entry[0].lastIndexOf('@')
  const name = entry[0].slice(0, offset)
  const version = entry[0].slice(offset + 1)
  const evidence = await archiveFor(entry) ?? selectEvidence(index.get(entry[0]) ?? [])
  if (evidence && (evidence.metadata.name !== name || (!version.startsWith('./') && evidence.metadata.version !== version))) throw new Error(`Metadata mismatch: ${key}`)
  const license = typeof evidence?.metadata.license === 'string' ? evidence.metadata.license : evidence?.metadata.license?.type ?? 'UNKNOWN'
  const qualified = Boolean(labels && evidence?.artifactVerified && validLicense(license) && evidence.texts.length)
  const text = evidence?.texts.map(item => `${item.name}: ${item.hash}`).join('<br>') || 'MISSING'
  const fields = [key, evidence?.metadata.version ?? version, labels ? [...labels].sort().join('<br>') : 'UNREACHABLE', license, text, evidence?.source ?? 'MISSING', qualified ? '已识别 / Identified' : '待核验 / Unverified']
  return { line: `| ${fields.map(field => field.replaceAll('|', '\\|')).join(' | ')} |`, qualified }
}

async function main(): Promise<void> {
  if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Usage: bun scripts/generate-third-party-licenses.mts [--check]')
  const lockText = await readFile(path.join(root, 'bun.lock'), 'utf8')
  const lock = Bun.JSON5.parse(lockText) as Lock
  if (lock.lockfileVersion !== 1 || !lock.packages || !lock.workspaces['']) throw new Error('Unsupported bun.lock schema')
  validateWorkspace(lock, JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')))
  const index = await collectMetadata()
  const labels = groups(lock)
  const rows = []
  for (const [key, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, 'en'))) rows.push(await row(key, entry, index, labels.get(key)))
  const document = ['# 第三方许可证清单 / Third-party license inventory', '',
    '本清单覆盖 Admin、客服坐席与 Widget 的全部锁定依赖实例（包括平台可选包）。运行、开发分组按依赖图可达性，兼属两组表示共享依赖；不等于最终 bundle 内容。',
    'This inventory covers every locked instance, including platform optional packages. Reachability separates runtime and development; shared entries are not a bundle manifest.', '',
    '`bun run licenses:generate` 离线读取完整性匹配锁文件的精确 tarball；本地安装包与 Bun 缓存只能辅助诊断，不能满足资格；`bun run licenses:check` 校验生成物一致性。缺失元数据、许可证文本、未知声明或不可达实例均退出 1，不能猜测许可证。',
    '`licenses:generate` qualifies only tarballs matching lock integrity; installed/cache metadata is diagnostic only; `licenses:check` also rejects drift. Missing or unknown evidence fails closed. Provide every non-vendored locked archive, including platform variants, via IMBOY_LICENSE_ARCHIVE_DIR to an external directory of exact npm tarballs named SHA-256(name@version).tgz; their lock SHA-512 is verified, with no install scripts executed.', '',
    '许可证声明来自 package.json；文本列为包顶层 LICENSE/COPYING/NOTICE 原文 SHA-256（原 tarball 也读取其嵌套许可证）。全部非 vendored 锁定原包（含平台变体）须放仓外 IMBOY_LICENSE_ARCHIVE_DIR，按 name@version 的 SHA-256 命名 .tgz，校验 lock SHA-512。清单不替代再分发时随包提供的完整许可证、版权声明与 NOTICE，也不构成法律授权。vendored qrcode.react 直接校验仓内 tarball 的 lock SHA-512 并读取包内原文。',
    'Declarations come from package.json and hashes bind original license/notice texts. Redistribute full upstream notices and licenses where required. The vendored qrcode.react archive is checked against lock integrity.', '',
    '原包缺少独立 LICENSE 时，只接受原包内与完整 MIT/BSD 模板正文一致、且附版权声明的原文（只归一化换行、空白与注释行前缀；截断正文、缺任何授权条件或免责段落均不接受），或 npm 精确版本元数据 gitHead 所指官方仓原文；仓外 .registry.json/.source-licenses.json 及 source-license-N.txt 必须通过 name/version/lock integrity、仓库 revision 与文本 hash 校验。空白原文不算正文；没有原文的已声明许可证仍标待核验。侧车校验只证明本地数据内部一致性，不能认证 registry 响应或官方源码下载；须另行审查可信下载来源证据。',
    'Embedded MIT/BSD recognition requires the complete notice body matching a conservative template plus copyright attribution; only whitespace/comment-prefix formatting is normalized. Truncated grants, conditions or disclaimers do not qualify. Exact registry gitHead source notices may be checked separately. External sidecars are bound to name/version/lock integrity, repository revision and text hash. Empty/whitespace notices do not qualify. Sidecar checks prove internal consistency only, not registry/source authenticity; independent trusted-download evidence is required. A declaration without notice text remains unverified.', '',
    `bun.lock SHA-256: \`${sha(lockText)}\``, '',
    '| 锁定实例 / Lock instance | 版本 / Version | 用途 / Scope | 声明 / License | 原文 SHA-256 / Text | 来源 / Source | 元数据资格 / Evidence |',
    '| --- | --- | --- | --- | --- | --- | --- |', ...rows.map(item => item.line), ''].join('\n')
  if (process.argv.includes('--check')) {
    if (await readFile(output, 'utf8') !== document) throw new Error('License inventory differs; regenerate and review')
  } else await writeFile(output, document)
  const unknown = rows.filter(item => !item.qualified).length
  console.log(`${rows.length} lock instances; ${unknown} unverified`)
  if (unknown) process.exitCode = 1
}

if (import.meta.main) await main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
