import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { GroupContextGatewayPage } from './GroupContextGatewayPage'

function LocationEcho() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderPage(initialEntry = '/groups/context') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/groups/context" element={<GroupContextGatewayPage />} />
        <Route path="/groups/:id" element={<LocationEcho />} />
        <Route path="/groups/:id/votes" element={<LocationEcho />} />
        <Route path="/groups/:id/notices" element={<LocationEcho />} />
        <Route path="/groups/:id/categories" element={<LocationEcho />} />
        <Route path="/groups/:id/tags" element={<LocationEcho />} />
        <Route path="/groups/:id/files" element={<LocationEcho />} />
        <Route path="/groups/:id/albums" element={<LocationEcho />} />
        <Route path="/groups/:id/schedules" element={<LocationEcho />} />
        <Route path="/groups/:id/tasks" element={<LocationEcho />} />
        <Route path="/groups/:id/governance-logs" element={<LocationEcho />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('GroupContextGatewayPage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps action buttons disabled when gid is empty', async () => {
    const view = renderPage()

    const targetTaskButton = view.getByTestId('group-context-target-tasks') as HTMLButtonElement
    const governanceButton = view.getByTestId('group-context-open-governance') as HTMLButtonElement

    expect(targetTaskButton.disabled).toBe(true)
    expect(governanceButton.disabled).toBe(true)
  })

  it('prefills gid from query and can jump to task target', async () => {
    const view = renderPage('/groups/context?gid=88')

    const input = view.getByTestId('group-context-gid-input') as HTMLInputElement
    const targetTaskButton = view.getByTestId('group-context-target-tasks') as HTMLButtonElement

    expect(input.value).toBe('88')
    expect(targetTaskButton.disabled).toBe(false)

    fireEvent.click(targetTaskButton)

    await waitFor(() => {
      expect(view.getByTestId('location').textContent).toBe('/groups/88/tasks?from=context')
    })
  })

  it('prefills gid from query and can jump to governance logs', async () => {
    const view = renderPage('/groups/context?gid=88')

    const input = view.getByTestId('group-context-gid-input') as HTMLInputElement
    const governanceButton = view.getByTestId('group-context-open-governance') as HTMLButtonElement

    expect(input.value).toBe('88')
    expect(governanceButton.disabled).toBe(false)

    fireEvent.click(governanceButton)

    await waitFor(() => {
      expect(view.getByTestId('location').textContent).toBe('/groups/88/governance-logs?from=context')
    })
  })
})
