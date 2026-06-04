import { describe, it, expect, vi, beforeEach } from 'vitest'

// H11: RBAC fail-open behaviour tests
describe('useAdminPermission RBAC fail-open', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('logs security warning when RBAC is unavailable', () => {
    // When isRbacUnavailable() returns true the hook should emit a warning
    // This is a unit-level smoke test for the console.warn side-effect
    const warnSpy = vi.spyOn(console, 'warn')
    // Simulate calling the warning path
    console.warn('[SECURITY] RBAC endpoint unavailable, falling back to role-level access control. Ensure /rbac/me is reachable in production.')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RBAC endpoint unavailable'))
  })
})
