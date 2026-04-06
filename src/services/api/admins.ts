import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { Admin } from '@/types/admin'
import { requireApiPayload } from './responseAdapter'
import { getCurrentAdminPayload } from './auth'

type IdLike = string | number

type ApiErrorLike = {
  code?: number | string
  msg?: string
  message?: string
}

export interface AdminListParams {
  page?: number
  size?: number
  status?: number
  role_id?: number
  keyword?: string
}

export interface CreateAdminInput {
  account: string
  pwd: string
  nickname?: string
  email?: string
  mobile?: string
  role_id: number
  status?: number
}

interface AssignAdminRoleInput {
  admin_id: IdLike
  role_id: number
}

interface AdminListPayload extends PaginatedResponse<Admin> {
  source: 'list' | 'current'
}

const DEFAULT_ADMIN_LIST_ENDPOINTS = ['/admin/list', '/admins/list']
const DEFAULT_ADMIN_CREATE_ENDPOINTS = ['/admin/create', '/admins/create']
const DEFAULT_ADMIN_ASSIGN_ROLE_ENDPOINTS = ['/admin/assign_role', '/admin/role/update', '/admins/assign-role']

function normalizeEndpoint(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function buildEndpointCandidates(rawEnv: unknown, defaults: string[]): string[] {
  const configured = typeof rawEnv === 'string'
    ? rawEnv.split(',').map((item) => normalizeEndpoint(item)).filter((item) => item.length > 0)
    : []

  return Array.from(new Set([...configured, ...defaults.map((item) => normalizeEndpoint(item)).filter((item) => item.length > 0)]))
}

const ADMIN_LIST_ENDPOINTS = buildEndpointCandidates(import.meta.env.VITE_ADMIN_LIST_ENDPOINT, DEFAULT_ADMIN_LIST_ENDPOINTS)
const ADMIN_CREATE_ENDPOINTS = buildEndpointCandidates(import.meta.env.VITE_ADMIN_CREATE_ENDPOINT, DEFAULT_ADMIN_CREATE_ENDPOINTS)
const ADMIN_ASSIGN_ROLE_ENDPOINTS = buildEndpointCandidates(
  import.meta.env.VITE_ADMIN_ASSIGN_ROLE_ENDPOINT,
  DEFAULT_ADMIN_ASSIGN_ROLE_ENDPOINTS
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

function isAdminRbacEndpointUnavailable(error: unknown): boolean {
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

function normalizeAdmin(raw: unknown): Admin {
  const record = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
  const id = pickFirst(record, ['id', 'admin_id', 'uid'])
  const account = pickFirst(record, ['account', 'username'])
  const nickname = pickFirst(record, ['nickname', 'name'])
  const roleId = pickFirst(record, ['role_id', 'role'])
  const loginCount = pickFirst(record, ['login_count', 'sign_in_count'])
  const lastLoginIp = pickFirst(record, ['last_login_ip', 'last_ip'])
  const lastLoginAt = pickFirst(record, ['last_login_at', 'last_sign_in_at'])
  const createdAt = pickFirst(record, ['created_at', 'create_time'])
  const status = pickFirst(record, ['status', 'state'])

  return {
    id: String(id || ''),
    account: String(account || ''),
    nickname: String(nickname || ''),
    avatar: String(record.avatar || ''),
    email: typeof record.email === 'string' ? record.email : undefined,
    mobile: typeof record.mobile === 'string' ? record.mobile : undefined,
    role_id: toStatusInt(roleId, 0),
    login_count: toStatusInt(loginCount, 0),
    last_login_ip: String(lastLoginIp || ''),
    last_login_at: String(lastLoginAt || ''),
    status: toStatusInt(status, 1),
    created_at: String(createdAt || ''),
  }
}

function normalizeAdminListPayload(payload: unknown): PaginatedResponse<Admin> {
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

  const items = rawItems.map((item) => normalizeAdmin(item))
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
      if (isAdminRbacEndpointUnavailable(error)) {
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
      if (isAdminRbacEndpointUnavailable(error)) {
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
      if (!isAdminRbacEndpointUnavailable(putError)) {
        throw putError
      }

      lastError = putError

      try {
        const response = await client.post(endpoint, body)
        return response.data as ApiResponse<Record<string, never>>
      } catch (postError) {
        lastError = postError
        if (isAdminRbacEndpointUnavailable(postError)) {
          continue
        }
        throw postError
      }
    }
  }

  throw lastError
}

async function getAdminList(
  params: AdminListParams = { page: 1, size: 10, status: -1 }
): Promise<ApiResponse<unknown>> {
  return getFromCandidates(ADMIN_LIST_ENDPOINTS, params as Record<string, unknown>)
}

export async function getAdminListPayload(
  params: AdminListParams = { page: 1, size: 10, status: -1 }
): Promise<AdminListPayload> {
  try {
    const payload = requireApiPayload(await getAdminList(params), '/admin/list')
    const normalized = normalizeAdminListPayload(payload)
    return {
      ...normalized,
      source: 'list',
    }
  } catch (error) {
    if (!isAdminRbacEndpointUnavailable(error)) {
      throw error
    }

    const currentAdmin = normalizeAdmin(await getCurrentAdminPayload())
    return {
      items: [currentAdmin],
      page: 1,
      size: 1,
      total: 1,
      total_pages: 1,
      source: 'current',
    }
  }
}

export async function createAdmin(input: CreateAdminInput): Promise<ApiResponse<Record<string, never>>> {
  const account = input.account.trim()
  const pwd = input.pwd.trim()

  const body: Record<string, unknown> = {
    account,
    pwd,
    role_id: input.role_id,
    status: input.status ?? 1,
  }

  if (typeof input.nickname === 'string' && input.nickname.trim().length > 0) {
    body.nickname = input.nickname.trim()
  }
  if (typeof input.email === 'string' && input.email.trim().length > 0) {
    body.email = input.email.trim()
  }
  if (typeof input.mobile === 'string' && input.mobile.trim().length > 0) {
    body.mobile = input.mobile.trim()
  }

  return postToCandidates(ADMIN_CREATE_ENDPOINTS, body)
}

export async function assignAdminRole(input: AssignAdminRoleInput): Promise<ApiResponse<Record<string, never>>> {
  return putOrPostToCandidates(ADMIN_ASSIGN_ROLE_ENDPOINTS, {
    admin_id: input.admin_id,
    role_id: input.role_id,
  })
}
