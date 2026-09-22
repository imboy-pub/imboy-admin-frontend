/**
 * secret only-once 仓 + 「无 secret hydration」源码断言。
 *
 * 这是 brief「secret 只出现一次（不得二次 hydration，不得回显 digest）」的
 * 结构性证据：把「secret 不进任何持久化 / 不进 React Query 缓存 / 不进 URL」
 * 变成可执行的源码扫描 + 可执行的仓语义单测。
 */
import { describe, expect, it, beforeEach } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  armOnce,
  armedWindowCount,
  clearAllSecrets,
  dismissOnce,
  hasVisibleSecret,
  isDismissed,
  maskSecretPrefix,
  readOnce,
  secretReadCount,
} from './secretOnetime'

const MODULE_ROOT = join(import.meta.dir, '..')
const API_ROOT = join(MODULE_ROOT, 'api')

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

function readSource(path: string): string {
  return readFileSync(path, 'utf8')
}

/** 去掉注释与字符串字面量后的代码（用于「不得出现某个 API」的硬扫描）。 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** 合成 secret（形态对齐后端，但非任何真实凭据）。gitleaks 的 generic-api-key 规则会
 * 命中该形态，故按本仓惯例行尾显式豁免 —— 如实标注，不是绕过扫描。 */
const SECRET = 'pfx-synthetic.SYNTHETIC-NOT-A-REAL-SECRET' // gitleaks:allow

beforeEach(() => {
  clearAllSecrets()
})

describe('secret only-once 仓语义', () => {
  it('armOnce → readOnce 可读出；windowId 单调递增', () => {
    const first = armOnce({ credentialId: 'c1', credentialPrefix: 'pfx-synthetic', secret: SECRET, mode: 'issue' })
    const second = armOnce({ credentialId: 'c2', credentialPrefix: 'ib_int_other', secret: 'S2', mode: 'issue' })
    expect(first).toBeGreaterThan(0)
    expect(second).toBeGreaterThan(first)
    expect(readOnce('c1')!.secret).toBe(SECRET)
    expect(readOnce('c1')!.mode).toBe('issue')
    expect(readOnce('c1')!.credentialPrefix).toBe('pfx-synthetic')
  })

  it('同一 credential 轮换时旧窗口被顶替（不存在两个 secret 同时可见）', () => {
    armOnce({ credentialId: 'c1', secret: 'OLD', mode: 'issue' })
    const rotated = armOnce({ credentialId: 'c1', secret: 'NEW', mode: 'rotate' })
    expect(armedWindowCount()).toBe(1)
    const reveal = readOnce('c1')!
    expect(reveal.secret).toBe('NEW')
    expect(reveal.windowId).toBe(rotated)
    expect(reveal.mode).toBe('rotate')
  })

  it('销毁后（dismissOnce）readOnce 恒 null，且墓碑不可逆（再 arm 才重新开放）', () => {
    armOnce({ credentialId: 'c1', secret: SECRET, mode: 'issue' })
    expect(dismissOnce('c1')).toBe(true)
    expect(readOnce('c1')).toBeNull()
    expect(isDismissed('c1')).toBe(true)
    expect(hasVisibleSecret('c1')).toBe(false)
    // 再读多次仍为 null（不可能被 hydration 回来）
    expect(readOnce('c1')).toBeNull()
    expect(readOnce('c1')).toBeNull()
    expect(armedWindowCount()).toBe(0)
    // 只有一次**新的签发/轮换**（armOnce）才重新开窗
    armOnce({ credentialId: 'c1', secret: 'NEW', mode: 'rotate' })
    expect(isDismissed('c1')).toBe(false)
    expect(readOnce('c1')!.secret).toBe('NEW')
  })

  it('「刷新」= 内存仓重建：clearAllSecrets 后所有明文不可再见', () => {
    armOnce({ credentialId: 'c1', secret: SECRET, mode: 'issue' })
    expect(readOnce('c1')!.secret).toBe(SECRET)
    clearAllSecrets()
    expect(readOnce('c1')).toBeNull()
    expect(armedWindowCount()).toBe(0)
  })

  it('空 id / 空 secret 不建窗（不产生「空 secret 可读」的假成功）', () => {
    expect(armOnce({ credentialId: '', secret: SECRET, mode: 'issue' })).toBe(0)
    expect(armOnce({ credentialId: 'c1', secret: '', mode: 'issue' })).toBe(0)
    expect(armedWindowCount()).toBe(0)
  })

  it('脱敏前缀永不回显全量 secret', () => {
    expect(maskSecretPrefix('pfx-synthetic')).toBe('pfx-synthetic****')
    expect(maskSecretPrefix('')).toBe('ib_int_****')
    expect(maskSecretPrefix('pfx-synthetic')).not.toContain(SECRET)
  })

  it('读出计数可取证（同一次签发只被读 1 次，而非反复 hydration）', () => {
    const before = secretReadCount()
    armOnce({ credentialId: 'c1', secret: SECRET, mode: 'issue' })
    readOnce('c1')
    expect(secretReadCount()).toBe(before + 1)
  })
})

describe('无 secret hydration — 源码扫描（硬约束）', () => {
  const moduleFiles = listSourceFiles(MODULE_ROOT).filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
  const apiFiles = listSourceFiles(API_ROOT).filter(
    (path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx')
  )

  it('模块源码非空（扫描目标存在）', () => {
    expect(moduleFiles.length).toBeGreaterThanOrEqual(8)
    expect(apiFiles.length).toBeGreaterThanOrEqual(4)
  })

  it('secret 仓与 api 层都不触碰任何持久化设施（localStorage/sessionStorage/IndexedDB/cookie）', () => {
    const forbidden = [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'IndexedDB',
      'document.cookie',
      'caches.',
      'persist(',
    ]
    const offenders: string[] = []
    for (const path of [...apiFiles, ...listSourceFiles(join(MODULE_ROOT, 'components')), ...listSourceFiles(join(MODULE_ROOT, 'pages'))]) {
      const code = stripComments(readSource(path))
      for (const token of forbidden) {
        if (code.includes(token)) offenders.push(`${path}: ${token}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('api 层可执行代码里不出现 /api/internal 或 /api/v1 字面量（INV-2/INV-3 边界）', () => {
    for (const path of apiFiles) {
      // 注释里允许出现该前缀作为说明；可执行代码（去注释后）一律不得出现
      const code = stripComments(readSource(path))
      expect(`${path}:${code.includes('/api/internal')}`).toBe(`${path}:false`)
      expect(`${path}:${code.includes('internal/v1')}`).toBe(`${path}:false`)
      expect(`${path}:${code.includes('/api/v1')}`).toBe(`${path}:false`)
    }
  })

  it('api 层的 HTTP 调用全部经 ENDPOINTS 构造器，无内联路径字面量', () => {
    const code = stripComments(readSource(join(API_ROOT, 'public.ts')))
    const verbs = code.match(/client\.(get|post|put|patch|delete)\b/g) ?? []
    const endpoints = code.match(/ENDPOINTS\.\w+/g) ?? []
    expect(verbs.length).toBeGreaterThanOrEqual(13)
    // 每个调用点都是一条 ENPOINTS.* 实参（无第二套路径真源）
    expect(endpoints.length).toBeGreaterThanOrEqual(verbs.length)
    // 不存在以 '/' 开头的路径字面量（唯一真源是 contracts.ENTERPRISE_APPS_BASE）
    const inlinePaths = code.match(/'\/[A-Za-z]/g) ?? []
    expect(inlinePaths).toEqual([])
  })

  it('React Query 的 queryKey 里不出现 secret（secret 不进任何查询缓存）', () => {
    for (const path of [...apiFiles, ...listSourceFiles(join(MODULE_ROOT, 'components')), ...listSourceFiles(join(MODULE_ROOT, 'pages'))]) {
      const code = readSource(path)
      const keyLiterals = code.match(/queryKey[^\n]*\[[^\]]*\]/g) ?? []
      for (const literal of keyLiterals) {
        expect(literal.toLowerCase()).not.toContain('secret')
      }
    }
  })

  it('secret 仓源码自身不出现 secret 之外的持久化/序列化出口', () => {
    const code = stripComments(readSource(join(API_ROOT, 'secretOnetime.ts')))
    expect(code).not.toContain('JSON.stringify')
    expect(code).not.toContain('localStorage')
    expect(code).not.toContain('sessionStorage')
    expect(code).toContain('const windows = new Map')
  })

  it('签发/轮换服务只返回 windowId（secret 不作为返回值字段外泄）', () => {
    const code = readSource(join(API_ROOT, 'public.ts'))
    // 返回值类型必须是 {credential, windowId}，不得回传 secret 本体
    expect(code).toContain('export type IssueCredentialResult = {')
    expect(code).toContain('windowId: number')
    const resultBlocks = code.match(/IssueCredentialResult = \{[\s\S]*?\}/g) ?? []
    expect(resultBlocks.length).toBe(1)
    expect(resultBlocks[0]!).not.toContain('secret: string')
  })

  it('明文渲染点唯一：`data-testid="secret-once-value"` 只出现在 SecretOncePanel', () => {
    const renderers = moduleFiles.filter((path) => readSource(path).includes('secret-once-value'))
    expect(renderers.map((path) => path.split('/').pop())).toEqual(['SecretOncePanel.tsx'])
  })

  it('readOnce 的调用者被冻结为 2 处（定义处 + 展示面板 + 销毁后的一次空判定）', () => {
    const callers = moduleFiles
      .filter((path) => !path.endsWith('secretOnetime.ts'))
      .filter((path) => stripComments(readSource(path)).includes('readOnce('))
      .map((path) => path.split('/').pop()!)
      .sort()
    expect(callers).toEqual(['CredentialPanel.tsx', 'SecretOncePanel.tsx'])
  })
})
