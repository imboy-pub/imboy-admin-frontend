import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'
import { fetchSidebarMenuConfig } from './adminConfig'

type ApiErrorLike = {
  code?: number | string
  msg?: string
  message?: string
}

export interface RoleItem {
  id: number
  name: string
  description: string
  permissions: string[]
  status: number
  created_at: string
}

export interface CreateRoleInput {
  name: string
  description?: string
  permissions?: string[]
  status?: number
}

export interface RoleListPayload extends PaginatedResponse<RoleItem> {
  source: 'list' | 'config'
}

const DEFAULT_ROLE_LIST_ENDPOINTS = ['/role/list', '/roles/list']
const DEFAULT_ROLE_CREATE_ENDPOINTS = ['/role/create', '/roles/create']
const DEFAULT_ROLE_PERMISSION_SAVE_ENDPOINTS = [
  '/role/permissions/save',
  '/role/permission/update',
  '/roles/permissions/save',
]

function normalizeEndpoint(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function buildEndpointCandidates(rawEnv: unknown, defaults: string[]): string[] {
  const configured = typeof rawEnv === 'string'
    ? rawEnv.split(',').map((item) => normalizeEndpoint(item)).filter((item) => item.length > 0)
    : []
  const normalizedDefaults = defaults.map((item) => normalizeEndpoint(item)).filter((item) => item.length > 0)
  return Array.from(new Set([...configured, ...normalizedDefaults]))
}

const ROLE_LIST_ENDPOINTS = buildEndpointCandidates(import.meta.env.VITE_ROLE_LIST_ENDPOINT, DEFAULT_ROLE_LIST_ENDPOINTS)
const ROLE_CREATE_ENDPOINTS = buildEndpointCandidates(import.meta.env.VITE_ROLE_CREATE_ENDPOINT, DEFAULT_ROLE_CREATE_ENDPOINTS)
const ROLE_PERMISSION_SAVE_ENDPOINTS = buildEndpointCandidates(
  import.meta.env.VITE_ROLE_PERMISSION_SAVE_ENDPOINT,
  DEFAULT_ROLE_PERMISSION_SAVE_ENDPOINTS
)

function toErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const record = error as ApiErrorLike
  const parsed = Number(record.code)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (!error || typeof error !== 'object') return String(error)
  const record = error as ApiErrorLike
  if (typeof record.msg === 'string' && record.msg.length > 0) return record.msg
  if (typeof record.message === 'string' && record.message.length > 0) return record.message
  return String(error)
}

export function isRoleEndpointUnavailable(error: unknown): boolean {
  const code = toErrorCode(error)
  if (code === 404 || code === 405 || code === 501) {
    return true
  }

  const message = toErrorMessage(error).toLowerCase()
  return message.includes('not found') ||
    message.includes('404') ||
    message.includes('method not allowed') ||
    message.includes('endpoint unavailable') ||
    message.includes('invalid url')
}

function normalizeStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (typeof item === 'number') return String(item)
        return ''
      })
      .filter((item) => item.length > 0)
  }

  if (typeof input === 'string') {
    return input
      .split(/[\s,;\n]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }

  return []
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function toStatusInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.floor(parsed)
}

function pickFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const candidate = record[key]
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      return candidate
    }
  }
  return ''
}

function normalizeRole(raw: unknown): RoleItem {
  const record = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
  const id = pickFirst(record, ['id', 'role_id'])
  const name = pickFirst(record, ['name', 'role_name'])
  const description = pickFirst(record, ['description', 'desc'])
  const permissions = pickFirst(record, ['permissions', 'permission_keys', 'permission_list'])
  const status = pickFirst(record, ['status', 'state'])
  const createdAt = pickFirst(record, ['created_at', 'create_time'])

  return {
    id: toPositiveInt(id, 0),
    name: String(name || ''),
    description: String(description || ''),
    permissions: normalizeStringArray(permissions),
    status: toStatusInt(status, 1),
    created_at: String(createdAt || ''),
  }
}

function normalizeRoleListPayload(payload: unknown): PaginatedResponse<RoleItem> {
  const isArrayPayload = Array.isArray(payload)
  const record = !isArrayPayload && typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {}

  const rawItems = isArrayPayload
    ? payload
    : Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.list)
        ? record.list
        : []

  const items = rawItems.map((item) => normalizeRole(item)).filter((item) => item.id > 0 && item.name.length > 0)
  const safePage = toPositiveInt(record.page ?? record.current_page, 1)
  const safeSize = toPositiveInt(record.size ?? record.page_size, Math.max(items.length, 1))
  const safeTotal = toPositiveInt(record.total, items.length)
  const totalPagesFromPayload = toPositiveInt(record.total_pages ?? record.totalPages, 0)
  const safeTotalPages = totalPagesFromPayload > 0
    ? totalPagesFromPayload
    : Math.max(1, Math.ceil(safeTotal / safeSize))

  return {
    items,
    page: safePage,
    size: safeSize,
    total: safeTotal,
    total_pages: safeTotalPages,
  }
}

async function getFromCandidates(
  endpoints: string[],
  params?: Record<string, unknown>
): Promise<ApiResponse<unknown>> {
  let lastError: unknown = new Error('No endpoint candidates configured')

  for (const endpoint of endpoints) {
    try {
      const response = await client.get(endpoint, { params })
      return response.data as ApiResponse<unknown>
    } catch (error) {
      lastError = error
      if (isRoleEndpointUnavailable(error)) {
        continue
      }
      throw error
    }
  }

  throw lastError
}

async function postToCandidates(
  endpoints: string[],
  body: Record<string, unknown>
): Promise<ApiResponse<Record<string, never>>> {
  let lastError: unknown = new Error('No endpoint candidates configured')

  for (const endpoint of endpoints) {
    try {
      const response = await client.post(endpoint, body)
      return response.data as ApiResponse<Record<string, never>>
    } catch (error) {
      lastError = error
      if (isRoleEndpointUnavailable(error)) {
        continue
      }
      throw error
    }
  }

  throw lastError
}

async function putOrPostToCandidates(
  endpoints: string[],
  body: Record<string, unknown>
): Promise<ApiResponse<Record<string, never>>> {
  let lastError: unknown = new Error('No endpoint candidates configured')

  for (const endpoint of endpoints) {
    try {
      const response = await client.put(endpoint, body)
      return response.data as ApiResponse<Record<string, never>>
    } catch (putError) {
      if (!isRoleEndpointUnavailable(putError)) {
        throw putError
      }

      lastError = putError

      try {
        const response = await client.post(endpoint, body)
        return response.data as ApiResponse<Record<string, never>>
      } catch (postError) {
        lastError = postError
        if (isRoleEndpointUnavailable(postError)) {
          continue
        }
        throw postError
      }
    }
  }

  throw lastError
}

async function getRoleListByConfigFallback(): Promise<RoleListPayload> {
  const sidebarConfig = await fetchSidebarMenuConfig()
  const roles = Array.isArray(sidebarConfig.rbac?.roles) ? sidebarConfig.rbac?.roles : []
  const items: RoleItem[] = roles
    .map((item) => ({
      id: Number(item.id),
      name: item.name || '',
      description: item.description || '',
      permissions: Array.isArray(item.permissions)
        ? item.permissions.map((permission) => String(permission).trim()).filter((permission) => permission.length > 0)
        : [],
      status: 1,
      created_at: '',
    }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.name.length > 0)

  const size = Math.max(items.length, 1)
  return {
    items,
    page: 1,
    size,
    total: items.length,
    total_pages: 1,
    source: 'config',
  }
}

export async function getRoleList(): Promise<ApiResponse<unknown>> {
  return getFromCandidates(ROLE_LIST_ENDPOINTS, {
    page: 1,
    size: 200,
    status: -1,
  })
}

export async function getRoleListPayload(): Promise<RoleListPayload> {
  try {
    const payload = requireApiPayload(await getRoleList(), '/role/list')
    const normalized = normalizeRoleListPayload(payload)
    return {
      ...normalized,
      source: 'list',
    }
  } catch (error) {
    if (!isRoleEndpointUnavailable(error)) {
      throw error
    }
    return getRoleListByConfigFallback()
  }
}

export async function createRole(input: CreateRoleInput): Promise<ApiResponse<Record<string, never>>> {
  const permissions = normalizeStringArray(input.permissions)
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    status: input.status ?? 1,
    permissions,
  }

  if (typeof input.description === 'string' && input.description.trim().length > 0) {
    body.description = input.description.trim()
  }

  return postToCandidates(ROLE_CREATE_ENDPOINTS, body)
}

export async function updateRolePermissions(
  roleId: number,
  permissions: string[]
): Promise<ApiResponse<Record<string, never>>> {
  return putOrPostToCandidates(ROLE_PERMISSION_SAVE_ENDPOINTS, {
    role_id: roleId,
    permissions: normalizeStringArray(permissions),
  })
}
