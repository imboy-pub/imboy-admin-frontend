/**
 * P1-E2E-01 A06：mock 禁令静态自检（自证）。
 *
 * 扫描本 spec 目录全部源码：断言零响应伪造（无网络拦截/替身注册）、零
 * skip/only、真实用例数大于零。自检本身也是本套件的一条真实用例。
 * 注意：为让自检源码不含被扫描的字面量 token，pattern 一律运行时拼接。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url))

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === '.artifacts' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full))
      continue
    }
    if ((entry.endsWith('.ts') || entry.endsWith('.mjs')) && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

test('A06 自检：客服真实链套件源码零 mock/skip/only 且用例数大于零', async () => {
  const files = collectSourceFiles(SPEC_DIR)
  expect(files.length, 'suite sources present').toBeGreaterThan(0)

  // 运行时拼接，避免自检源码自身命中被扫描 pattern。
  const forbidden: Array<{ label: string; pattern: string }> = [
    { label: '网络拦截（page 对象 route 注册）', pattern: 'page' + '.route(' },
    { label: '用例跳过（skip 注册）', pattern: '.skip' + '(' },
    { label: '用例单跑（only 注册）', pattern: '.only' + '(' },
    { label: 'fetch 替身注入声明', pattern: 'fetchImpl:' + ' ()' },
  ]

  const violations: string[] = []
  let testCount = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const rule of forbidden) {
      if (text.includes(rule.pattern)) violations.push(`${path.basename(file)}: ${rule.label}`)
    }
    if (file.endsWith('.spec.ts')) {
      testCount += (text.match(/^\s*test\(/gm) ?? []).length
    }
  }

  expect(violations, violations.join('; ')).toEqual([])
  expect(testCount, '真实用例数必须大于零（a01/a02/a06 至少各一）').toBeGreaterThanOrEqual(3)
})
