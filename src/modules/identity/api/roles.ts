import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'
import { coerceEntityId } from '@/lib/entityId'
import {
  resolveEndpoint,
} from '@/lib/endpointCandidates'
import { ROLE_PICKER_FETCH_SIZE } from '@/lib/pagination'

export interface RoleItem {
  /** TSID：后端以 JSON integer 返回，safeParseBigIntJson 已转 string；严禁 Number() 回转（>2^53 丢精度） */
  id: EntityId
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

// 与 imboy_router.erl 的 /api/adm/role/* 一一对应（后端另注册了 /roles/* 等
// 别名指向同一 action，此处只认规范形式，不再运行时探测）
const DEFAULT_ROLE_LIST_ENDPOINT = '/role/list'
const DEFAULT_ROLE_CREATE_ENDPOINT = '/role/create'
const DEFAULT_ROLE_PERMISSION_SAVE_ENDPOINT = '/role/permissions/save'
const DEFAULT_ROLE_DISABLE_ENDPOINT = '/role/disable'
const DEFAULT_ROLE_DELETE_ENDPOINT = '/role/delete'


const ROLE_LIST_ENDPOINT = resolveEndpoint(import.meta.env.VITE_ROLE_LIST_ENDPOINT, DEFAULT_ROLE_LIST_ENDPOINT)
const ROLE_CREATE_ENDPOINT = resolveEndpoint(import.meta.env.VITE_ROLE_CREATE_ENDPOINT, DEFAULT_ROLE_CREATE_ENDPOINT)
const ROLE_PERMISSION_SAVE_ENDPOINT = resolveEndpoint(
  import.meta.env.VITE_ROLE_PERMISSION_SAVE_ENDPOINT,
  DEFAULT_ROLE_PERMISSION_SAVE_ENDPOINT
)
const ROLE_DISABLE_ENDPOINT = resolveEndpoint(import.meta.env.VITE_ROLE_DISABLE_ENDPOINT, DEFAULT_ROLE_DISABLE_ENDPOINT)
const ROLE_DELETE_ENDPOINT = resolveEndpoint(import.meta.env.VITE_ROLE_DELETE_ENDPOINT, DEFAULT_ROLE_DELETE_ENDPOINT)

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
    id: coerceEntityId(id),
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

  const items = rawItems.map((item) => normalizeRole(item)).filter((item) => item.id.length > 0 && item.id !== '0' && item.name.length > 0)
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

// adm_role_handler:permissions_save_action/3 对 PUT 与 POST 都路由到同一个
// save_permissions_handle/2，无需方法协商
function putEndpoint(endpoint: string, body: Record<string, unknown>): Promise<ApiResponse<Record<string, never>>> {
  return client.put(endpoint, body).then((r) => r.data as ApiResponse<Record<string, never>>)
}


export async function getRoleList(): Promise<ApiResponse<unknown>> {
  return getEndpoint(ROLE_LIST_ENDPOINT, {
    page: 1,
    size: ROLE_PICKER_FETCH_SIZE,
    status: -1,
  })
}

// 注：此处曾有一条 catch 分支，在 isEndpointUnavailable(error) 为真时回落到
// 由侧边栏配置推导角色列表。移除理由：
//   1) 判据不可靠 —— 业务错误码 404 与"路由不存在"在 client.ts 压平后无法区分；
//   2) /api/adm/role/list 在 imboy_router.erl 中确实注册，回落分支从未被正当触发；
//   3) 回落产出的角色对象是残缺的（status 硬编码 1、created_at 为空），
//      静默展示错误数据比报错更糟。
// 错误如实向上抛，由调用方与 ErrorBoundary 呈现。
export async function getRoleListPayload(): Promise<RoleListPayload> {
  const payload = requireApiPayload(await getRoleList(), '/role/list')
  const normalized = normalizeRoleListPayload(payload)
  return {
    ...normalized,
    source: 'list',
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

  return postEndpoint(ROLE_CREATE_ENDPOINT, body)
}

export async function updateRolePermissions(
  roleId: EntityId,
  permissions: string[]
): Promise<ApiResponse<Record<string, never>>> {
  return putEndpoint(ROLE_PERMISSION_SAVE_ENDPOINT, {
    role_id: roleId,
    permissions: normalizeStringArray(permissions),
  })
}

/** 停用角色（软停用，status→0）。内置角色（id<=3）由后端拒绝。 */
export async function disableRole(roleId: EntityId): Promise<ApiResponse<Record<string, never>>> {
  return postEndpoint(ROLE_DISABLE_ENDPOINT, { role_id: roleId })
}

/**
 * 删除角色（硬删除）。后端会校验该角色下无在用管理员，否则拒绝。
 * 内置角色（id<=3）由后端拒绝。
 */
export async function deleteRole(roleId: EntityId): Promise<ApiResponse<Record<string, never>>> {
  return postEndpoint(ROLE_DELETE_ENDPOINT, { role_id: roleId })
}
