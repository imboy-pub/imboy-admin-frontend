#!/usr/bin/env bun
// 检查真实生产产物，防止 Bun 预载的开发 URL 覆盖 Vite production 配置。
// Check real build artifacts against production declarations, not process.env.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const repository = path.resolve(import.meta.dirname, '..')
const output = path.resolve(process.argv[2] ?? path.join(repository, 'dist'))
const placeholder = '__IMBOY_API_HOST__'
const declarations = new Map(
  readFileSync(path.join(repository, '.env.production'), 'utf8')
    .split(/\r?\n/)
    .flatMap((line): Array<[string, string]> => {
      const match = line.match(/^(VITE_[A-Z0-9_]+)=(.*)$/)
      return match ? [[match[1], match[2]]] : []
    }),
)

function requireCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(`[admin-build-verify] ${message}`)
}

for (const key of ['VITE_API_BASE_URL', 'VITE_SIDEBAR_CONFIG_URL']) {
  requireCondition(declarations.get(key)?.startsWith(placeholder + '/') === true, `${key} must declare a production placeholder URL`)
}
const urls = [...declarations].filter(([, value]) => value.startsWith(placeholder + '/'))

function scriptsIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? scriptsIn(file) : entry.name.endsWith('.js') ? [file] : []
  })
}

const scripts = scriptsIn(output)
requireCondition(scripts.length > 0, 'production JS artifacts are missing')
const javascript = scripts.map((file) => readFileSync(file, 'utf8')).join('\n')
requireCondition(readFileSync(path.join(output, 'index.html'), 'utf8').includes(placeholder), 'production HTML/CSP placeholder is missing')
for (const [key, value] of urls) {
  requireCondition(javascript.includes(value), `${key} production URL is missing from built JS`)
}
console.log(`[admin-build-verify] PASS: HTML/CSP placeholder and ${urls.length} production URL declarations across ${scripts.length} JS artifacts`)
