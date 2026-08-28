/**
 * 白标品牌运行时契约测试（C0-BRAND-01 / ADM-01）
 *
 * 在运行时消费链上分别断言两条路径：
 *   - 默认品牌（后端未配置任何 brand_*，或 /brand 拉取失败回退）
 *   - 白标品牌（私有化客户完整换品牌 fixture）
 *
 * 消费链覆盖：fetch → parseBrandConfig → store → document 副作用
 * （① title ③ --primary CSS 变量）与渲染输出（② BrandMark logo/站名
 * ④ BrandLegalLinks 隐私/客服链接）。
 */
import '../test/setupDom'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'

import { BRAND_FALLBACK, parseBrandConfig } from './brand'
import {
  adminTitle,
  applyBrandToDocument,
  brandLegalLinks,
  fetchBrandConfig,
  hexToHslVars,
  initBrandRuntime,
} from './brandRuntime'
import { useBrandStore } from '@/stores/brandStore'
import { BrandLegalLinks } from '@/components/shared/BrandLegalLinks'
import { BrandMark } from '@/components/shared/BrandMark'

/** 与 brand.test.ts 逐字段对齐的默认 fixture（后端 /brand 默认响应） */
const defaultFixture = () => ({
  site_name: 'imboy',
  logo_url: '',
  splash_url: '',
  primary_color: '#2474E5',
  accent_color: '',
  theme: 'light',
  slogan: '',
  copyright: '',
  company: '',
  support_url: '',
  privacy_url: '',
  edition: 'community',
})

/** 与 brand.test.ts 逐字段对齐的白标 fixture（私有化客户完整换品牌） */
const whiteLabelFixture = () => ({
  site_name: '某企业IM',
  logo_url: 'https://cdn.example.com/logo.png',
  splash_url: 'https://cdn.example.com/splash.png',
  primary_color: '#1A73E8',
  accent_color: '#FF6D00',
  theme: 'dark',
  slogan: '高效协作',
  copyright: '© 2026 某企业',
  company: '某企业股份有限公司',
  support_url: 'https://support.example.com',
  privacy_url: 'https://example.com/privacy',
  edition: 'enterprise',
})

const jsonRes = (payload: unknown) =>
  new Response(JSON.stringify({ code: 0, msg: 'success', payload }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => {
  cleanup()
  useBrandStore.setState({ brand: { ...BRAND_FALLBACK } })
  document.title = ''
  document.documentElement.style.removeProperty('--primary')
})

describe('hexToHslVars', () => {
  test('默认主色转换为 index.css --primary 分量格式', () => {
    // #2474E5 = hsl(215, 79%, 52%)，与 src/index.css 的 --primary 同色
    expect(hexToHslVars('#2474E5')).toBe('215 79% 52%')
  })

  test('白标主色转换（Google Blue 基准）', () => {
    expect(hexToHslVars('#1A73E8')).toBe('214 82% 51%')
  })

  test('非法输入回退默认主色', () => {
    for (const bad of ['', '2474E5', '#GGGGGG', 'blue', '#12345']) {
      expect(hexToHslVars(bad)).toBe(hexToHslVars(BRAND_FALLBACK.primaryColor))
    }
  })
})

describe('adminTitle / brandLegalLinks', () => {
  test('默认品牌：标题为 "imboy 管理后台"，合法链接为空', () => {
    const brand = parseBrandConfig(defaultFixture())
    expect(adminTitle(brand)).toBe('imboy 管理后台')
    expect(brandLegalLinks(brand)).toEqual([])
  })

  test('白标品牌：标题与隐私/客服链接齐全', () => {
    const brand = parseBrandConfig(whiteLabelFixture())
    expect(adminTitle(brand)).toBe('某企业IM 管理后台')
    expect(brandLegalLinks(brand)).toEqual([
      { key: 'privacy', label: '隐私政策', href: 'https://example.com/privacy' },
      { key: 'support', label: '客服支持', href: 'https://support.example.com' },
    ])
  })
})

describe('applyBrandToDocument（文档副作用：① 标题 + ③ 主色变量）', () => {
  test('默认品牌：注入默认标题与 --primary', () => {
    applyBrandToDocument(parseBrandConfig(defaultFixture()), document)
    expect(document.title).toBe('imboy 管理后台')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
      '215 79% 52%',
    )
  })

  test('白标品牌：注入品牌标题与 --primary', () => {
    applyBrandToDocument(parseBrandConfig(whiteLabelFixture()), document)
    expect(document.title).toBe('某企业IM 管理后台')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
      '214 82% 51%',
    )
  })
})

describe('fetchBrandConfig（拉取 + 容错回退）', () => {
  test('code=0 的默认 payload 解析为 BRAND_FALLBACK', async () => {
    const brand = await fetchBrandConfig(async () => jsonRes(defaultFixture()))
    expect(brand).toEqual({ ...BRAND_FALLBACK })
  })

  test('code=0 的白标 payload 解析为白标配置', async () => {
    const brand = await fetchBrandConfig(async () => jsonRes(whiteLabelFixture()))
    expect(brand.siteName).toBe('某企业IM')
    expect(brand.logoUrl).toBe('https://cdn.example.com/logo.png')
    expect(brand.primaryColor).toBe('#1A73E8')
  })

  test('HTTP 非 2xx / code!==0 / 响应非 JSON / 网络错误 均静默回退默认', async () => {
    const cases: Array<() => Promise<Response>> = [
      () => Promise.resolve(new Response('err', { status: 500 })),
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 401, msg: 'denied' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      // 生产 /brand 未反代时命中 SPA fallback，返回 index.html
      () =>
        Promise.resolve(
          new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
        ),
      () => Promise.reject(new Error('network down')),
    ]
    for (const fetchImpl of cases) {
      const brand = await fetchBrandConfig(fetchImpl as typeof fetch)
      expect(brand).toEqual({ ...BRAND_FALLBACK })
    }
  })
})

describe('initBrandRuntime 端到端（初始化函数吃 fixture → 消费链生效）', () => {
  test('白标 fixture：先默认基线（无闪烁）→ fetch 后 store/文档/渲染全链路更新', async () => {
    let resolveFetch!: (_res: Response) => void
    const mockFetch = (async () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })) as unknown as typeof fetch

    // 初始（默认品牌 store 基线）：无 logo 图、无合法链接区块。
    // 查询用 render 返回的容器绑定（screen 绑定模块加载期的 document.body，
    // 在本文件的 import 时序下不可用）
    const { getByRole, queryByRole, getAllByRole } = render(
      <>
        <BrandMark />
        <BrandLegalLinks />
      </>,
    )
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      'imboy 管理后台',
    )
    expect(queryByRole('img')).toBeNull()
    expect(queryByRole('navigation', { name: '品牌链接' })).toBeNull()

    initBrandRuntime(mockFetch)

    // fetch 尚未 resolve：文档已是默认品牌基线（①③），渲染仍默认（②④）
    expect(document.title).toBe('imboy 管理后台')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
      '215 79% 52%',
    )

    // 后端返回白标配置 → 全消费链切换
    resolveFetch(jsonRes(whiteLabelFixture()))
    await waitFor(() => {
      expect(getByRole('heading', { level: 1 }).textContent).toBe(
        '某企业IM 管理后台',
      )
    })

    // ② logo 渲染：brand.logoUrl 生效
    const logo = getByRole('img')
    expect(logo.getAttribute('src')).toBe('https://cdn.example.com/logo.png')
    expect(logo.getAttribute('alt')).toBe('某企业IM')

    // ④ 合法链接渲染：隐私/客服
    expect(
      getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['隐私政策', 'https://example.com/privacy'],
      ['客服支持', 'https://support.example.com'],
    ])

    // ①③ 文档副作用与 store 状态
    expect(document.title).toBe('某企业IM 管理后台')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
      '214 82% 51%',
    )
    expect(useBrandStore.getState().brand.siteName).toBe('某企业IM')

    // 可重入：重复初始化不破坏状态（订阅仅注册一次，品牌可回切默认）
    initBrandRuntime(async () => jsonRes(defaultFixture()))
    await waitFor(() => {
      expect(useBrandStore.getState().brand.siteName).toBe('imboy')
    })
    expect(document.title).toBe('imboy 管理后台')
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      'imboy 管理后台',
    )
  })

  test('拉取失败（网络错误）：停留默认品牌，渲染输出为默认形态', async () => {
    const failingFetch = (() =>
      Promise.reject(new Error('network down'))) as unknown as typeof fetch

    const { getByRole, queryByRole } = render(
      <>
        <BrandMark />
        <BrandLegalLinks />
      </>,
    )
    initBrandRuntime(failingFetch)

    await waitFor(() => {
      // fetch 已拒绝且状态稳定：store 仍为默认品牌
      expect(useBrandStore.getState().brand).toEqual({ ...BRAND_FALLBACK })
    })
    expect(document.title).toBe('imboy 管理后台')
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      'imboy 管理后台',
    )
    expect(queryByRole('img')).toBeNull()
    expect(queryByRole('navigation', { name: '品牌链接' })).toBeNull()
  })
})
