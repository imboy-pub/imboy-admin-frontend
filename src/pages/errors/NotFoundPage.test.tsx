import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NotFoundPage } from './NotFoundPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/not-found']}>
      <Routes>
        <Route path="/not-found" element={<NotFoundPage />} />
        <Route path="/dashboard" element={<div>dashboard</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('NotFoundPage', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  afterEach(() => { cleanup() })

  it('renders 404 page', () => {
    const view = renderPage()
    expect(view.container.textContent).toContain('404')
    expect(view.container.textContent).toContain('页面不存在')
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
