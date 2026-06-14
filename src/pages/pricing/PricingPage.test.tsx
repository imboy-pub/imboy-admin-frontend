import '../../test/setupDom'

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import { PricingPage } from './PricingPage'

afterEach(() => {
  cleanup()
})

describe('PricingPage', () => {
  it('渲染页头与三档定价的 CTA', () => {
    const { getByText } = render(<PricingPage />)
    expect(getByText('产品定价')).toBeTruthy()
    expect(getByText('下载开源版')).toBeTruthy()
    expect(getByText('联系销售')).toBeTruthy()
    expect(getByText('商务洽谈')).toBeTruthy()
  })

  it('展示推荐徽章与功能对比表', () => {
    const { getByText } = render(<PricingPage />)
    expect(getByText('推荐 · 最快现金流')).toBeTruthy()
    expect(getByText('功能对比')).toBeTruthy()
    // 对比表「服务」分组的授权方式行（唯一文本）
    expect(getByText('终身买断')).toBeTruthy()
    expect(getByText('年费订阅')).toBeTruthy()
  })
})
