import client, { SKIP_AUTH_EXPIRED_EVENT_FLAG } from './client'
import { ApiResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'
import { AxiosRequestConfig } from 'axios'
import type { EntityId } from '@/types/common'
import { coerceEntityId } from '@/lib/entityId'
import { useAuthStore } from '@/stores/authStore'

interface RbacProfile {
  /** TSID 角色 ID；后端 JSON integer 经 safeParseBigIntJson 转为 string */
  role_id: EntityId
  role_ids?: EntityId[]
  role_name: string
  permissions: string[]
  menu_paths: string[]
}

function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (typeof item === 'number') return String(item)
      return ''
    })
    .filter((item) => item.length > 0)
}

// ⚠️ TSID 严禁 Number() 回转（>2^53 丢精度）
function normalizeRoleIds(rawRoleId: unknown, rawRoleIds: unknown): EntityId[] {
  const values = Array.isArray(rawRoleIds) && rawRoleIds.length > 0 ? rawRoleIds : [rawRoleId]
  return Array.from(
    new Set(
      values
        .map((item) => coerceEntityId(item))
        .filter((id) => id.length > 0 && id !== '0')
    )
  )
}

function normalizeRbacProfile(raw: Partial<RbacProfile> | undefined): RbacProfile {
  const roleIds = normalizeRoleIds(raw?.role_id, raw?.role_ids)
  const roleId = roleIds[0] || ''
  return {
    role_id: roleId,
    role_ids: roleIds,
    role_name: raw?.role_name || 'unknown',
    permissions: normalizeStringList(raw?.permissions),
    menu_paths: normalizeStringList(raw?.menu_paths),
  }
}

const RBAC_UNAVAILABLE_KEY = 'imboy_admin_rbac_endpoint_unavailable'
type RbacSession = {
  epoch: number
  unavailable: boolean
  pending: Promise<RbacProfile> | null
}
let session: RbacSession | undefined

type AuthAwareRequestConfig = AxiosRequestConfig & {
  [SKIP_AUTH_EXPIRED_EVENT_FLAG]?: boolean
}

export function clearRbacUnavailable() {
  session = undefined
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(RBAC_UNAVAILABLE_KEY)
  }
}

function currentRbacSession(): RbacSession {
  const epoch = useAuthStore.getState().authEpoch
  if (session?.epoch !== epoch) {
    if (session) clearRbacUnavailable()
    session = {
      epoch,
      pending: null,
      unavailable: typeof window !== 'undefined' && sessionStorage.getItem(RBAC_UNAVAILABLE_KEY) === '1',
    }
  }
  return session
}

function is404Error(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const maybe = error as { code?: number | string; status?: number; response?: { status?: number } }
  if (Number(maybe.code) === 404) return true
  if (Number(maybe.status) === 404) return true
  if (Number(maybe.response?.status) === 404) return true
  return false
}

async function getMyRbacProfile(): Promise<ApiResponse<RbacProfile>> {
  const requestConfig: AuthAwareRequestConfig = {
    [SKIP_AUTH_EXPIRED_EVENT_FLAG]: true,
  }
  const response = await client.get('/rbac/me', requestConfig)
  return response.data
}

export async function getMyRbacProfilePayload(): Promise<RbacProfile> {
  const requestSession = currentRbacSession()
  if (requestSession.unavailable) {
    throw new Error('RBAC endpoint unavailable')
  }

  if (requestSession.pending) {
    return requestSession.pending
  }

  requestSession.pending = (async () => {
    try {
      const payload = requireApiPayload(await getMyRbacProfile(), '/rbac/me')
      return normalizeRbacProfile(payload)
    } catch (error) {
      if (session === requestSession && useAuthStore.getState().authEpoch === requestSession.epoch &&
          is404Error(error)) {
        requestSession.unavailable = true
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(RBAC_UNAVAILABLE_KEY, '1')
        }
      }
      throw error
    } finally {
      requestSession.pending = null
    }
  })()

  return requestSession.pending
}
