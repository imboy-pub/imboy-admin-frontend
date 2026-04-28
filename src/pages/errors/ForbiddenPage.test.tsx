import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ForbiddenPage } from './ForbiddenPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forbidden']}>
      <Routes>
        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="/dashboard" element={<div>dashboard</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ForbiddenPage', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  afterEach(() => { cleanup() })

  it('renders 403 forbidden page', () => {
    const view = renderPage()
    expect(view.container.textContent).toContain('403')
    expect(view.container.textContent).toContain('无权限访问')
  })

  it('renders back and home navigation buttons', () => {
    const view = renderPage()
    expect(view.container.textContent).toContain('返回上页')
    expect(view.container.textContent).toContain('返回首页')
  })

  it('navigates to dashboard when home button is clicked', async () => {
    const view = renderPage()
    await act(async () => {
      fireEvent.click(view.getByText('返回首页'))
    })
    expect(view.container.textContent).toContain('dashboard')
  })
})
