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
    expect(getByText('查看项目')).toBeTruthy()
    expect(getByText('联系销售')).toBeTruthy()
    expect(getByText('商务洽谈')).toBeTruthy()
  })

  it('仅比较交付与服务，三档均不限制注册人数或集群节点数', () => {
    const { getByText, getAllByText, queryByText } = render(<PricingPage />)
    expect(getByText('部署支持')).toBeTruthy()
    expect(getByText('交付与服务对比')).toBeTruthy()
    expect(getByText('注册人数与集群节点数')).toBeTruthy()
    expect(getAllByText('不按版次限制')).toHaveLength(3)
    expect(queryByText(/终身买断|绑定域名|解锁更高上限/)).toBeNull()
  })
})
