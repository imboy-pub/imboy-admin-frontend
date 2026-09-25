import { useMemo } from 'react'
import { zhCN, type I18nKey } from './zh-CN'

export type { I18nKey }
export { zhCN }

/** 插值参数：键值中的 `{name}` 占位符以此表替换。 */
export type I18nParams = Readonly<Record<string, string | number>>

const PLACEHOLDER = /\{(\w+)\}/g

/**
 * 纯函数翻译：按冻结键表取 zh-CN 文案并做 `{param}` 插值。
 *
 * 键类型收窄为 `I18nKey`（字面量联合）——拼错键在编译期即失败，运行期不可能
 * 出现缺失键（键表 `as const` 与类型同源）。参数多余忽略；占位符缺参时保留
 * 原样（便于测试/巡检暴露漏传）。
 */
export function t(key: I18nKey, params?: I18nParams): string {
  const template = zhCN[key]
  if (params === undefined) return template
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * React 侧消费口（为未来 locale 切换留的接缝）：当前等价于直接用 `t`，
 * 但组件统一从 hook 取值后，替换实现不需要逐组件改动。
 */
export function useI18n(): { t: (_key: I18nKey, _params?: I18nParams) => string } {
  return useMemo(() => ({ t }), [])
}
