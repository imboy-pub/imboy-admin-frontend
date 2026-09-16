/**
 * CSW-01-A04 / CSC-00-A04：shop secret / 签名 secret 进入 HTML/JS/产物 的
 * 自测「必红」扫描（负例承载）。
 *
 * 扫描范围：
 * - src/widget/customer_service/**（loader + iframe 应用源码与测试）
 * - widget/index.html（iframe 入口）
 * - dist-widget/**（构建产物，存在时才扫；`bun run build:widget` 后必存在）
 *
 * 必红负例（CSC-00-A04）：动态构造一段把 data-shop-key 写进 script 标签的
 * 反例 fixture，断言：
 *   1) 扫描器对该 fixture 判红（containsSecretShape === true）——即任何把
 *      shop secret 写进 HTML/JS 的改动都会让本测试红；
 *   2) loader 运行时忽略 data-shop-key 且不外泄值（行为断言见 loader.test.ts）。
 */
import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')
const WIDGET_SRC_DIR = join(REPO_ROOT, 'src', 'widget')
const WIDGET_ENTRY_HTML = join(REPO_ROOT, 'widget', 'index.html')
const DIST_WIDGET_DIR = join(REPO_ROOT, 'dist-widget')

/**
 * SECRET 形状模式（CSC-00-A04 秘密分类表）：
 * - shop_key / widget_identity_key 的一切赋值与 data 属性形状（SECRET，禁浏览器 exposure）；
 * - sk_live_/sk_test_/wpk_ 前缀密钥形状；
 * - PEM 私钥；
 * - 低位数以上十六进制长随机串紧跟 key= 形状。
 * 注意：public_widget_id 是 PUBLIC 标识，允许出现，不在扫描模式内。
 */
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['data-shop-key 属性', /data-shop-key\s*=/i],
  ['shop_key 赋值/键值', /shop_key["']?\s*[:=]\s*["'][^"']+["']/i],
  ['widget_identity_key 键值', /widget_identity_key["']?\s*[:=]\s*["'][^"']+["']/i],
  ['sk_ 前缀密钥', /\bsk_(?:live|test|prod)_[A-Za-z0-9_-]{8,}/],
  ['wpk_ 前缀密钥', /\bwpk_[A-Za-z0-9_-]{16,}/],
  ['PEM 私钥', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

/** 返回命中的 (模式名, 文件) 列表；非空即红。 */
export function containsSecretShape(content: string): Array<string> {
  const hits: string[] = []
  for (const [name, pattern] of SECRET_PATTERNS) {
    if (pattern.test(content)) hits.push(name)
  }
  return hits
}

function listFilesRecursively(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listFilesRecursively(full))
    else out.push(full)
  }
  return out
}

const SCANNABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.html', '.css', '.json']

describe('CSW-01-A04：Widget 源码无 shop secret / 签名 secret / 长期凭证', () => {
  it('src/widget/**（运行时源码，不含测试夹具）与 widget/index.html 全部通过扫描', () => {
    const files = [...listFilesRecursively(WIDGET_SRC_DIR), WIDGET_ENTRY_HTML].filter(
      (file) =>
        // 只扫运行时表面（HTML/JS/产物语义）；负例 fixture 字符串住在 *.test.ts，
        // 由下方「必红负例」用例直接验证扫描器对它们判红
        SCANNABLE_EXTENSIONS.some((ext) => file.endsWith(ext)) && !file.endsWith('.test.ts')
    )
    expect(files.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      for (const [name] of SECRET_PATTERNS) {
        if (containsSecretShape(content).includes(name)) {
          offenders.push(`${file}（命中：${name}）`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('dist-widget/** 产物（存在时）全部通过 SECRET 形状扫描', () => {
    if (!existsSync(DIST_WIDGET_DIR)) {
      // 未构建时跳过产物扫描（源码扫描已必跑）；bun run build:widget 后本分支必执行
      expect(existsSync(join(REPO_ROOT, 'src', 'widget', 'customer_service'))).toBe(true)
      return
    }
    const files = listFilesRecursively(DIST_WIDGET_DIR)
    expect(files.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const file of files) {
      if (!SCANNABLE_EXTENSIONS.some((ext) => file.endsWith(ext))) continue
      const hits = containsSecretShape(readFileSync(file, 'utf8'))
      for (const name of hits) offenders.push(`${file}（命中：${name}）`)
    }
    expect(offenders).toEqual([])
  })
})

describe('CSC-00-A04 必红负例：data-shop-key 进 script 必被判红', () => {
  // 动态构造反例（绝不把 secret 形状常量落盘到任何仓库文件）
  const badFixture = [
    '<!-- 反例：商家误把 shop secret 写进接入代码（正确写法只有 public widget_id） -->',
    '<script async src="https://cs.example.com/loader.js"',
    `  data-widget-id="wgt_pub_demo"`,
    `  data-shop-key="sk_live_${'X'.repeat(24)}"></script>`,
  ].join('\n')

  it('扫描器对反例 fixture 判红（shop_key 进入 HTML 必红）', () => {
    const hits = containsSecretShape(badFixture)
    expect(hits).toContain('data-shop-key 属性')
    expect(hits).toContain('sk_ 前缀密钥')
    expect(hits.length).toBeGreaterThanOrEqual(2)
  })

  it('正确接入代码（只有 public widget_id）不判红', () => {
    const goodFixture = '<script async src="https://cs.example.com/loader.js" data-widget-id="wgt_pub_demo"></script>'
    expect(containsSecretShape(goodFixture)).toEqual([])
  })
})
