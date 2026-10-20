import '../../../test/setupDom'
import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { ScopeEditor } from './ScopeEditor'
import type { EnterpriseScope } from '../api/contracts'

afterEach(cleanup)

function Editor() {
  const [value, setValue] = useState<EnterpriseScope[]>(['identities:write'])
  return <ScopeEditor value={value} onChange={setValue} baseline={['identities:write']} idPrefix="oa" />
}

describe('OA 权限选择', () => {
  it('成员停用和登录签票可单独勾选，目录写权限不自动授予它们', () => {
    const view = render(<Editor />)
    const members = view.getByRole('checkbox', { name: '授予 scope members:write' })
    const login = view.getByRole('checkbox', { name: '授予 scope oa:login:issue' })
    expect(members.getAttribute('aria-checked')).toBe('false')
    expect(login.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(members)
    expect(members.getAttribute('aria-checked')).toBe('true')
    expect(login.getAttribute('aria-checked')).toBe('false')
    expect(view.getByTestId('scope-diff-added').textContent).toContain('members:write')
    expect(view.getByTestId('scope-risky-members:write').textContent).toContain('需显式授予')
    fireEvent.click(login)
    expect(login.getAttribute('aria-checked')).toBe('true')
    expect(view.getByTestId('scope-diff-added').textContent).toContain('oa:login:issue')
  })

  it('只读模式保留新增权限的禁用状态', () => {
    const view = render(<ScopeEditor value={[]} onChange={() => { throw new Error('read-only') }} baseline={[]} disabled idPrefix="readonly" />)
    for (const scope of ['members:write', 'oa:login:issue']) {
      const checkbox = view.getByRole('checkbox', { name: `授予 scope ${scope}` })
      expect(checkbox.hasAttribute('disabled')).toBe(true)
      fireEvent.click(checkbox)
      expect(checkbox.getAttribute('aria-checked')).toBe('false')
    }
  })
})
