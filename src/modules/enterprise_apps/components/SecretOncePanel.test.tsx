/**
 * SecretOncePanel DOM 级测试（jsdom + @testing-library/react）。
 *
 * 证明「一次性」在**渲染层**也成立：
 *  1. 有窗口时明文出现在 DOM（唯一渲染点 `data-testid="secret-once-value"`）；
 *  2. 点「我已保存（永久销毁）」后明文从 DOM 消失，且换成不可逆提示；
 *  3. 销毁后卸载重挂载，明文依然不可见（墓碑不可逆）；
 *  4. 「刷新」（clearAllSecrets 重建内存仓）后明文不可见。
 *
 * 注：本仓既有 jsdom 用例统一用 `render()` 返回的 queries（不用 `screen`：
 * 它在 setupDom 生效前绑定 document.body，会抛
 * "queries bound to document.body ... global document" 错误）。
 */
import '../../../test/setupDom'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import React from 'react'
import { SecretOncePanel } from './SecretOncePanel'
import { armOnce, clearAllSecrets } from '../api/secretOnetime'

/** 合成 secret（非任何真实凭据）；行尾 gitleaks:allow 为如实标注。 */
const SECRET = 'pfx-synthetic.SYNTHETIC-NOT-A-REAL-SECRET' // gitleaks:allow
const CRED = '3234567890123456789'

beforeEach(() => {
  clearAllSecrets()
})

afterEach(() => {
  cleanup()
  clearAllSecrets()
})

describe('SecretOncePanel', () => {
  it('有窗口时渲染明文一次，并带「只显示这一次」提示', () => {
    armOnce({ credentialId: CRED, credentialPrefix: 'pfx-synthetic', secret: SECRET, mode: 'issue' })
    const view = render(<SecretOncePanel credentialId={CRED} />)
    expect(view.getByTestId('secret-once-value').textContent).toBe(SECRET)
    expect(view.getByText(/只显示这一次/)).toBeTruthy()
    expect(view.getByText(/关闭、刷新或点击/)).toBeTruthy()
    expect(view.queryByTestId('secret-once-tombstone')).toBeNull()
  })

  it('销毁后明文从 DOM 消失，并显示不可逆提示（同一会话内不可再见）', () => {
    armOnce({ credentialId: CRED, credentialPrefix: 'pfx-synthetic', secret: SECRET, mode: 'rotate' })
    const view = render(<SecretOncePanel credentialId={CRED} />)
    fireEvent.click(view.getByTestId('secret-once-dismiss'))
    expect(view.queryByTestId('secret-once-value')).toBeNull()
    expect(document.body.textContent).not.toContain(SECRET)
    expect(view.getByTestId('secret-once-tombstone').textContent).toContain('不可再显示')
  })

  it('销毁后卸载重挂载：明文不再出现（墓碑不可逆）', () => {
    armOnce({ credentialId: CRED, secret: SECRET, mode: 'issue' })
    const first = render(<SecretOncePanel credentialId={CRED} />)
    expect(first.getByTestId('secret-once-value').textContent).toBe(SECRET)
    fireEvent.click(first.getByTestId('secret-once-dismiss'))
    first.unmount()
    const second = render(<SecretOncePanel credentialId={CRED} />)
    expect(second.queryByTestId('secret-once-value')).toBeNull()
    expect(second.getByTestId('secret-once-tombstone')).toBeTruthy()
    expect(document.body.textContent).not.toContain(SECRET)
  })

  it('「刷新」= 内存仓重建：清空后挂载只出现 tombstone，无任何明文', () => {
    armOnce({ credentialId: CRED, secret: SECRET, mode: 'issue' })
    const mounted = render(<SecretOncePanel credentialId={CRED} />)
    expect(mounted.getByTestId('secret-once-value').textContent).toBe(SECRET)
    mounted.unmount()
    clearAllSecrets()
    const afterRefresh = render(<SecretOncePanel credentialId={CRED} />)
    expect(afterRefresh.queryByTestId('secret-once-value')).toBeNull()
    expect(afterRefresh.getByTestId('secret-once-tombstone')).toBeTruthy()
    expect(document.body.textContent).not.toContain(SECRET)
  })

  it('未登记窗口（从未签发 / 已过窗口）只渲染 tombstone', () => {
    const view = render(<SecretOncePanel credentialId="never-issued" />)
    expect(view.queryByTestId('secret-once-value')).toBeNull()
    expect(view.getByTestId('secret-once-tombstone')).toBeTruthy()
  })

  it('轮换窗口带上「轮换后」标签（与首次签发可区分）', () => {
    armOnce({ credentialId: CRED, secret: SECRET, mode: 'rotate' })
    const view = render(<SecretOncePanel credentialId={CRED} />)
    expect(view.getByText(/轮换后/)).toBeTruthy()
  })
})
