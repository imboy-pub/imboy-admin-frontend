import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { Admin } from '@/types/admin'
import { requireApiPayload } from './responseAdapter'
import type { EntityId } from '@/types/common'
import { coerceEntityId } from '@/lib/entityId'
import {
  resolveEndpoint,
} from '@/lib/endpointCandidates'

export interface AdminListParams {
  page?: number
  size?: number
  status?: number
  role_id?: EntityId
  keyword?: string
}

export interface CreateAdminInput {
  account: string
  pwd: string
  nickname?: string
  email?: string
  mobile?: string
  role_id: EntityId
  status?: number
}

interface AssignAdminRoleInput {
  admin_id: EntityId
  role_id: EntityId
}

interface AdminListPayload extends PaginatedResponse<Admin> {
  source: 'list' | 'current'
}

// 与 imboy_router.erl 的 /api/adm/admin/* 一一对应。
// ⚠️ DISABLE 此前的候选链是 ['/admin/disable','/admins/disable','/admin/delete','/admins/delete']
//    —— 禁用请求失败会回退去调**删除**。语义完全不同的两个操作被放进同一条
//    回退链，一个"管理员不存在"的业务错误就足以把禁用升级成删除尝试。
const DEFAULT_ADMIN_LIST_ENDPOINT = '/admin/list'
const DEFAULT_ADMIN_CREATE_ENDPOINT = '/admin/create'
const DEFAULT_ADMIN_ASSIGN_ROLE_ENDPOINT = '/admin/assign_role'
const DEFAULT_ADMIN_DISABLE_ENDPOINT = '/admin/disable'


const ADMIN_LIST_ENDPOINT = resolveEndpoint(import.meta.env.VITE_ADMIN_LIST_ENDPOINT, DEFAULT_ADMIN_LIST_ENDPOINT)
const ADMIN_CREATE_ENDPOINT = resolveEndpoint(import.meta.env.VITE_ADMIN_CREATE_ENDPOINT, DEFAULT_ADMIN_CREATE_ENDPOINT)
const ADMIN_DISABLE_ENDPOINT = resolveEndpoint(import.meta.env.VITE_ADMIN_DISABLE_ENDPOINT, DEFAULT_ADMIN_DISABLE_ENDPOINT)
const ADMIN_ASSIGN_ROLE_ENDPOINT = resolveEndpoint(
  import.meta.env.VITE_ADMIN_ASSIGN_ROLE_ENDPOINT,
  DEFAULT_ADMIN_ASSIGN_ROLE_ENDPOINT
)


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
    role_id: coerceEntityId(roleId),
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

function getEndpoint(endpoint: string, params?: Record<string, unknown>): Promise<ApiResponse<unknown>> {
  return client.get(endpoint, { params }).then((r) => r.data as ApiResponse<unknown>)
}

function postEndpoint(endpoint: string, body: Record<string, unknown>): Promise<ApiResponse<Record<string, never>>> {
  return client.post(endpoint, body).then((r) => r.data as ApiResponse<Record<string, never>>)
}

// adm_admin_handler 的 assign_role 与 adm_role_handler 同样对 PUT/POST 同等处理，
// 无需方法协商
function putEndpoint(endpoint: string, body: Record<string, unknown>): Promise<ApiResponse<Record<string, never>>> {
  return client.put(endpoint, body).then((r) => r.data as ApiResponse<Record<string, never>>)
}

async function getAdminList(
  params: AdminListParams = { page: 1, size: 10, status: -1 }
): Promise<ApiResponse<unknown>> {
  return getEndpoint(ADMIN_LIST_ENDPOINT, params as Record<string, unknown>)
}

export async function getAdminListPayload(
  params: AdminListParams = { page: 1, size: 10, status: -1 }
): Promise<AdminListPayload> {
  // 注：此处曾有一条 catch 分支，在 isEndpointUnavailable(error) 为真时回落成
  // "只显示当前管理员"的单条列表。移除理由同 roles.ts：判据不可靠，且
  // /api/adm/admin/list 确实注册；静默展示一条残缺数据会让管理员误以为
  // 系统里只有自己，比直接报错危险得多。
  const payload = requireApiPayload(await getAdminList(params), '/admin/list')
  const normalized = normalizeAdminListPayload(payload)
  return {
    ...normalized,
    source: 'list',
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

  return postEndpoint(ADMIN_CREATE_ENDPOINT, body)
}

export async function assignAdminRole(input: AssignAdminRoleInput): Promise<ApiResponse<Record<string, never>>> {
  return putEndpoint(ADMIN_ASSIGN_ROLE_ENDPOINT, {
    admin_id: input.admin_id,
    role_id: input.role_id,
  })
}

export async function disableAdmin(adminId: EntityId): Promise<ApiResponse<Record<string, never>>> {
  return postEndpoint(ADMIN_DISABLE_ENDPOINT, { admin_id: adminId })
}
