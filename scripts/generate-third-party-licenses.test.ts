import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { archiveEvidence, containsEmbeddedLicense, groups, resolveDependency, validateWorkspace, validLicense } from './generate-third-party-licenses.mts'

async function cliFixture(notice: string, license = 'MIT') {
  const directory = await mkdtemp(path.join(tmpdir(), 'imboy-license-cli-'))
  for (const folder of ['scripts', 'docs', 'node_modules/fixture', 'empty-cache', 'archive', 'package']) await mkdir(path.join(directory, folder), { recursive: true })
  const script = path.join(directory, 'scripts/generate-third-party-licenses.mts')
  await copyFile(path.join(import.meta.dirname, 'generate-third-party-licenses.mts'), script)
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ dependencies: { fixture: '1' } }))
  const metadata = { name: 'fixture', version: '1', license }
  await writeFile(path.join(directory, 'node_modules/fixture/package.json'), JSON.stringify(metadata))
  await writeFile(path.join(directory, 'node_modules/fixture/LICENSE'), 'Local spoof notice not bound to artifact')
  const archive = path.join(directory, 'archive', `${createHash('sha256').update('fixture@1').digest('hex')}.tgz`)
  async function pack(text: string, declaration = 'MIT', filename = 'LICENSE') {
    await writeFile(path.join(directory, 'package/package.json'), JSON.stringify({ ...metadata, license: declaration }))
    for (const file of ['LICENSE', 'README.md']) await rm(path.join(directory, 'package', file), { force: true })
    await writeFile(path.join(directory, 'package', filename), text)
    execFileSync('tar', ['-czf', archive, '-C', directory, 'package'])
    const integrity = `sha512-${createHash('sha512').update(await readFile(archive)).digest('base64')}`
    await writeFile(path.join(directory, 'bun.lock'), JSON.stringify({ lockfileVersion: 1, workspaces: { '': { dependencies: { fixture: '1' } } }, packages: { fixture: ['fixture@1', '', {}, integrity] } }))
  }
  await pack(notice, license)
  const env = { ...process.env, BUN_INSTALL_CACHE_DIR: path.join(directory, 'empty-cache'), IMBOY_LICENSE_ARCHIVE_DIR: path.join(directory, 'archive') }
  return { directory, pack, run: (args: string[] = [], useArchive = true) => Bun.spawnSync([process.execPath, script, ...args], { env: { ...env, IMBOY_LICENSE_ARCHIVE_DIR: useArchive ? env.IMBOY_LICENSE_ARCHIVE_DIR : '' }, cwd: directory }) }
}

describe('license inventory qualification', () => {
  test('legacy npm archive roots work, but changed bytes cannot qualify against locked integrity', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'imboy-license-integrity-'))
    try {
      await mkdir(path.join(directory, 'legacy-fixture'))
      await writeFile(path.join(directory, 'legacy-fixture/package.json'), JSON.stringify({ name: 'fixture', version: '1', license: 'MIT' }))
      await writeFile(path.join(directory, 'legacy-fixture/LICENSE'), 'Synthetic test notice; not product evidence')
      const archive = path.join(directory, 'fixture.tgz')
      execFileSync('tar', ['-czf', archive, '-C', directory, 'legacy-fixture'])
      const original = await readFile(archive)
      const integrity = `sha512-${createHash('sha512').update(original).digest('base64')}`
      expect((await archiveEvidence(archive, integrity, 'fixture')).metadata.name).toBe('fixture')
      await writeFile(archive, Buffer.concat([original, Buffer.from('changed')]))
      await expect(archiveEvidence(archive, integrity, 'fixture')).rejects.toThrow('does not match lock integrity')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  test('CLI rejects inventory drift and unknown licenses with an actual nonzero exit', async () => {
    const fixture = await cliFixture('Synthetic test notice; not product evidence')
    try {
      expect(fixture.run().exitCode).toBe(0)
      expect(fixture.run(['--check']).exitCode).toBe(0)
      await writeFile(path.join(fixture.directory, 'docs/third-party-licenses.md'), 'stale inventory')
      expect(fixture.run(['--check']).exitCode).toBe(1)
      await fixture.pack('Synthetic test notice', 'MADE-UP')
      const unknown = fixture.run()
      expect(unknown.exitCode).toBe(1)
      expect(unknown.stdout.toString()).toContain('1 unverified')
    } finally { await rm(fixture.directory, { recursive: true, force: true }) }
  })
  test('CLI rejects empty and whitespace-only notices even with correct artifact integrity', async () => {
    const fixture = await cliFixture('')
    try {
      expect(fixture.run().exitCode).toBe(1)
      await fixture.pack(' \n\t\r ')
      expect(fixture.run().exitCode).toBe(1)
      expect(fixture.run().stdout.toString()).toContain('1 unverified')
    } finally { await rm(fixture.directory, { recursive: true, force: true }) }
  })
  test('same-name/version local spoof cannot qualify without locked artifact bytes', async () => {
    const fixture = await cliFixture('Synthetic artifact test notice')
    try {
      const result = fixture.run([], false)
      expect(result.exitCode).toBe(1)
      expect(result.stdout.toString()).toContain('1 unverified')
      expect(await readFile(path.join(fixture.directory, 'docs/third-party-licenses.md'), 'utf8')).toContain('Unverified')
    } finally { await rm(fixture.directory, { recursive: true, force: true }) }
  })
  test('CLI rejects partial embedded MIT keywords in an exact locked artifact', async () => {
    const fixture = await cliFixture('')
    try {
      await fixture.pack('Copyright example. Permission is hereby granted, free of charge. use, copy, modify, merge, publish, distribute, sublicense. copyright notice and this permission notice shall be included. THE SOFTWARE IS PROVIDED "AS IS". LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY.', 'MIT', 'README.md')
      const result = fixture.run()
      expect(result.exitCode).toBe(1)
      expect(result.stdout.toString()).toContain('1 unverified')
    } finally { await rm(fixture.directory, { recursive: true, force: true }) }
  })
  test('a README license heading or author label is not a complete embedded notice', () => {
    expect(containsEmbeddedLicense('MIT', 'License: MIT © author')).toBe(false)
    expect(containsEmbeddedLicense('MIT', 'Permission is hereby granted, free of charge')).toBe(false)
    expect(containsEmbeddedLicense('BSD-2-Clause', 'Copyright author; BSD license')).toBe(false)
  })
  test('rejects a stale lock workspace even when dependency names still match', () => {
    const lock = { lockfileVersion: 1, workspaces: { '': { dependencies: { react: '^19.2.0' } } }, packages: {} }
    expect(() => validateWorkspace(lock, { dependencies: { react: '^19.3.0' } })).toThrow('differs from bun.lock')
    expect(() => validateWorkspace(lock, { dependencies: { react: '^19.2.0' } })).not.toThrow()
  })
  test('rejects unknown declarations and malformed expressions instead of guessing', () => {
    for (const license of ['', 'UNKNOWN', 'SEE LICENSE IN LICENSE', 'MIT MIT', 'MIT OR', '(MIT', 'MIT)', '()', 'OR MIT']) {
      expect(validLicense(license)).toBe(false)
    }
    for (const license of ['MIT', 'MIT-0', '(MIT OR Apache-2.0)', 'BSD-3-Clause AND (MIT OR ISC)']) {
      expect(validLicense(license)).toBe(true)
    }
  })

  test('nested lock instances override hoisted dependencies and shared peers retain both scopes', () => {
    const lock = {
      lockfileVersion: 1,
      workspaces: { '': { dependencies: { view: '1' }, devDependencies: { tool: '1' } } },
      packages: {
        view: ['view@1', '', { dependencies: { '@scope/shared': '1' }, peerDependencies: { react: '1' } }],
        tool: ['tool@1', '', { dependencies: { '@scope/shared': '2' }, peerDependencies: { react: '1' } }],
        '@scope/shared': ['@scope/shared@1', '', {}],
        'tool/@scope/shared': ['@scope/shared@2', '', { dependencies: { leaf: '1' } }],
        leaf: ['leaf@1', '', {}],
        react: ['react@1', '', {}],
      } as Record<string, [string, ...unknown[]]>,
    }
    expect(resolveDependency(lock, 'tool/@scope/shared', 'leaf')).toBe('leaf')
    expect(resolveDependency(lock, 'tool', '@scope/shared')).toBe('tool/@scope/shared')
    const labels = groups(lock)
    expect(labels.get('@scope/shared')).toEqual(new Set(['运行 / Runtime']))
    expect(labels.get('tool/@scope/shared')).toEqual(new Set(['开发 / Development']))
    expect(labels.get('react')).toEqual(new Set(['运行 / Runtime', '开发 / Development']))
  })

  test('missing direct and required transitive dependencies stop qualification', () => {
    const workspace = { '': { dependencies: { root: '1' } } }
    expect(() => groups({ lockfileVersion: 1, workspaces: workspace, packages: {} })).toThrow('Missing direct')
    expect(() => groups({ lockfileVersion: 1, workspaces: workspace, packages: { root: ['root@1', '', { dependencies: { absent: '1' } }] } })).toThrow('Unresolved lock edge')
  })
})
