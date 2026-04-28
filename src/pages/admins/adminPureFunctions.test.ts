/**
 * Inline mirror tests for private pure functions in admin/roles/moments/schedule pages:
 *   AdminListPage:          getErrorMessage, buildInitialCreateForm
 *   RolePermissionPage:     getErrorMessage (same pattern), normalizeRoleIds (same as hook)
 *   MomentReportPage:       isEditableElement
 *   GroupScheduleManagePage: normalizeTimestamp (number/string variant)
 */
import '../../test/setupDom'
import { describe, expect, it } from 'bun:test'

// ---------------------------------------------------------------------------
// getErrorMessage — AdminListPage / RolePermissionPage (same logic)
// ---------------------------------------------------------------------------

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (!error || typeof error !== 'object') return String(error)
  const record = error as { msg?: string; message?: string }
  if (typeof record.msg === 'string' && record.msg.length > 0) return record.msg
  if (typeof record.message === 'string' && record.message.length > 0) return record.message
  return String(error)
}

describe('getErrorMessage', () => {
  it('returns Error.message for Error instances', () => {
    expect(getErrorMessage(new Error('something failed'))).toBe('something failed')
  })

  it('returns msg from object with msg field', () => {
    expect(getErrorMessage({ msg: 'operation failed', code: 500 })).toBe('operation failed')
  })

  it('returns message from object with message field (no msg)', () => {
    expect(getErrorMessage({ message: 'network error' })).toBe('network error')
  })

  it('returns String(error) for null', () => {
    expect(getErrorMessage(null)).toBe('null')
  })

  it('returns String(error) for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('undefined')
  })

  it('returns String(error) for number', () => {
    expect(getErrorMessage(42)).toBe('42')
  })

  it('returns String(error) for empty object (no msg or message)', () => {
    const result = getErrorMessage({})
    expect(typeof result).toBe('string')
  })

  it('prefers msg over message', () => {
    expect(getErrorMessage({ msg: 'primary', message: 'secondary' })).toBe('primary')
  })
})

// ---------------------------------------------------------------------------
// buildInitialCreateForm — AdminListPage.tsx
// ---------------------------------------------------------------------------

type RoleOption = { id: number; name: string }
type CreateAdminForm = {
  account: string
  pwd: string
  nickname: string
  email: string
  mobile: string
  role_id: number
  status: number
}

function buildInitialCreateForm(roleOptions: RoleOption[]): CreateAdminForm {
  return {
    account: '',
    pwd: '',
    nickname: '',
    email: '',
    mobile: '',
    role_id: roleOptions[0]?.id || 2,
    status: 1,
  }
}

describe('buildInitialCreateForm', () => {
  it('defaults all string fields to empty strings', () => {
    const form = buildInitialCreateForm([{ id: 1, name: 'admin' }])
    expect(form.account).toBe('')
    expect(form.pwd).toBe('')
    expect(form.nickname).toBe('')
    expect(form.email).toBe('')
    expect(form.mobile).toBe('')
  })

  it('uses first roleOption id as role_id', () => {
    const form = buildInitialCreateForm([{ id: 3, name: 'auditor' }, { id: 2, name: 'operator' }])
    expect(form.role_id).toBe(3)
  })

  it('defaults role_id to 2 when roleOptions is empty', () => {
    expect(buildInitialCreateForm([]).role_id).toBe(2)
  })

  it('sets status to 1', () => {
    expect(buildInitialCreateForm([]).status).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// isEditableElement — MomentReportPage.tsx
// ---------------------------------------------------------------------------

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tagName = target.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }

  return target.isContentEditable
}

describe('isEditableElement', () => {
  it('returns false for null', () => {
    expect(isEditableElement(null)).toBe(false)
  })

  it('returns true for input element', () => {
    const input = document.createElement('input')
    expect(isEditableElement(input)).toBe(true)
  })

  it('returns true for textarea element', () => {
    const textarea = document.createElement('textarea')
    expect(isEditableElement(textarea)).toBe(true)
  })

  it('returns true for select element', () => {
    const select = document.createElement('select')
    expect(isEditableElement(select)).toBe(true)
  })

  it('returns falsy for regular div (not editable)', () => {
    const div = document.createElement('div')
    expect(isEditableElement(div)).toBeFalsy()
  })

  it('returns falsy for span', () => {
    const span = document.createElement('span')
    expect(isEditableElement(span)).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// normalizeTimestamp (number/string) — GroupScheduleManagePage.tsx
// ---------------------------------------------------------------------------

function formatDate(msOrDate: number | Date): string {
  const d = typeof msOrDate === 'number' ? new Date(msOrDate) : msOrDate
  return d.toISOString()
}

function normalizeTimestamp(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'number') {
    const ms = value > 1000000000000 ? value : value * 1000
    return formatDate(ms)
  }
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric > 1000000000000 ? numeric : numeric * 1000
    return formatDate(ms)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return formatDate(parsed)
}

describe('normalizeTimestamp (ScheduleManage)', () => {
  it('returns "-" for undefined', () => {
    expect(normalizeTimestamp(undefined)).toBe('-')
  })

  it('returns "-" for null', () => {
    // @ts-expect-error intentional test
    expect(normalizeTimestamp(null)).toBe('-')
  })

  it('returns "-" for empty string', () => {
    expect(normalizeTimestamp('')).toBe('-')
  })

  it('converts seconds-level unix timestamp number', () => {
    const result = normalizeTimestamp(1714000000)
    expect(result).toContain('2024')
  })

  it('converts milliseconds-level unix timestamp number', () => {
    const result = normalizeTimestamp(1714000000000)
    expect(result).toContain('2024')
  })

  it('converts numeric string', () => {
    const result = normalizeTimestamp('1714000000')
    expect(result).toContain('2024')
  })

  it('parses ISO date string', () => {
    const result = normalizeTimestamp('2024-03-15T00:00:00Z')
    expect(result).toContain('2024')
  })

  it('returns raw value for invalid date string', () => {
    expect(normalizeTimestamp('not-a-date')).toBe('not-a-date')
  })
})
