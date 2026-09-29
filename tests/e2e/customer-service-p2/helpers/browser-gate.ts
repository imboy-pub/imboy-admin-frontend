/**
 * P2-E2E-01（A7）：A05 浏览器门采集器。
 *
 * 每个用例把本用例创建的全部 page 注册进 collector：收集 console error、
 * network 5xx 与响应体/页面源码（供 JWT/object key/secret 泄漏扫描），
 * 用例收尾统一断言。预期负例（4xx/断网重连）由各 spec 声明豁免模式。
 * 这是采集与断言，不是拦截：页面请求原样发生。
 */
import type { Page, Response } from '@playwright/test'

export interface BrowserGateCollector {
  consoleErrors: Array<{ text: string; pageUrl: string }>
  /** 未捕获页面异常（pageerror；泄漏扫描与归档用）。 */
  pageErrors: Array<{ text: string; pageUrl: string }>
  serverErrors: Array<{ status: number; url: string }>
  /** 响应体采样（截断）供泄漏扫描：仅 2xx/3xx 文本型响应（负例响应不采）。 */
  responseBodies: Array<{ url: string; sample: string }>
  /** 页面外发 URL（泄漏扫描：JWT/secret 不进 URL）。 */
  requestUrls: string[]
  /** 4xx 请求台账（归因用：console 的 Failed to load resource 不带 URL）。 */
  clientErrors: Array<{ status: number; url: string }>
  /** 网络层失败请求（requestfailed；url 参与泄漏扫描）。 */
  requestFailures: Array<{ url: string; failure: string }>
  exemptPatterns: RegExp[]
}

export function createCollector(exemptPatterns: RegExp[] = []): BrowserGateCollector {
  return {
    consoleErrors: [],
    pageErrors: [],
    serverErrors: [],
    clientErrors: [],
    responseBodies: [],
    requestUrls: [],
    requestFailures: [],
    exemptPatterns,
  }
}

/** 把 page 的 console/network 流量登记进 collector（观察，不拦截）。 */
export function watchPage(collector: BrowserGateCollector, page: Page): void {
  page.on('console', (message) => {
    if (message.type() === 'error') collector.consoleErrors.push({ text: message.text(), pageUrl: page.url() })
  })
  page.on('pageerror', (error) => {
    collector.pageErrors.push({ text: String(error?.message ?? error), pageUrl: page.url() })
  })
  page.on('requestfailed', (request) => {
    collector.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText ?? 'unknown' })
  })
  page.on('response', (response: Response) => {
    const status = response.status()
    if (status >= 400 && status < 500) collector.clientErrors.push({ status, url: response.url() })
    const url = response.url()
    if (status >= 500) collector.serverErrors.push({ status, url })
    if (status >= 200 && status < 400) {
      const contentType = response.headers()['content-type'] ?? ''
      // 采样仅限 API/文档面（json/html/text）；静态 js/css 产物不入采样
      // （源码泄漏由 secret-scan 静态脚本覆盖，浏览器门盯的是传输面）。
      if (/json|html|text\/plain|xml/.test(contentType) && !/event-stream|javascript|css/.test(contentType)) {
        void response
          .text()
          .then((body) => {
            if (body.length > 0) collector.responseBodies.push({ url, sample: body.slice(0, 20_000) })
          })
          .catch(() => {
            /* 流式/已消费响应体不可读：跳过采样（SSE 常态） */
          })
      }
    }
  })
  page.on('request', (request) => {
    collector.requestUrls.push(request.url())
  })
}
