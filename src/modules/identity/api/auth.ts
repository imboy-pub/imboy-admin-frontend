import type { AxiosRequestConfig } from 'axios'
import { coerceEntityId } from '@/lib/entityId'
import client, { SKIP_AUTH_EXPIRED_EVENT_FLAG } from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiError, ApiResponse } from '@/types/api'
import { Admin } from '@/types/admin'
import type { EntityId } from '@/types/common'
import { useAuthStore } from '@/stores/authStore'

let cookieMutationTail: Promise<void> = Promise.resolve()
const cookieMutationConfig: AxiosRequestConfig & { [SKIP_AUTH_EXPIRED_EVENT_FLAG]: true } = {
  [SKIP_AUTH_EXPIRED_EVENT_FLAG]: true,
}

function withAuthCookie<T>(operation: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks
  if (locks) return locks.request('imboy:admin-auth-cookie', operation)

  // shortcut: this queue coordinates one page, cross-tab ordering requires Web Locks.
  const result = cookieMutationTail.then(operation)
  cookieMutationTail = result.then(() => undefined, () => undefined)
  return result
}

function requireCurrentAttempt(epoch: number, signal?: AbortSignal) {
  if (signal?.aborted || useAuthStore.getState().authEpoch !== epoch) {
    throw new DOMException('认证操作已取消', 'AbortError')
  }
}

export interface LoginParams {
  account: string
  pwd: string
  captcha: string
  csrf_token: string
}

export interface LoginResponse {
  id: EntityId
  account: string
  nickname: string
  avatar: string
  role_id: number | number[]
  next: string
}

export interface LoginMeta {
  csrf_token: string
  public_key: string
  system_name: string
}

export function normalizeLoginMeta(meta?: Partial<LoginMeta>): LoginMeta {
  return {
    csrf_token: meta?.csrf_token || '',
    public_key: meta?.public_key || '',
    system_name: meta?.system_name || 'Imboy Admin',
  }
}

// 获取验证码图片 URL
export function getCaptchaUrl() {
  return `${client.defaults.baseURL}/passport/captcha?t=${Date.now()}`
}

// 获取登录元数据（JSON）
async function getLoginMeta(): Promise<LoginMeta> {
  const response = await client.get<ApiResponse<LoginMeta>>('/passport/meta')
  return normalizeLoginMeta(requireApiPayload(response.data, '/passport/meta'))
}

// 获取登录页面初始数据
export async function getLoginPage(): Promise<{
  csrf_token: string
  public_key: string
  system_name: string
}> {
  return getLoginMeta()
}

export async function loginPayload(params: LoginParams, signal?: AbortSignal): Promise<LoginResponse> {
  const epoch = useAuthStore.getState().authEpoch
  return withAuthCookie(async () => {
    requireCurrentAttempt(epoch, signal)
    const response = await client.post<ApiResponse<LoginResponse>>('/passport/do_login', params, cookieMutationConfig)
    const login = requireApiPayload(response.data, '/passport/do_login')
    requireCurrentAttempt(epoch, signal)
    // A session may be revoked after the server issues the login response.
    const current = await readCurrentAdmin({ ...cookieMutationConfig, signal })
    requireCurrentAttempt(epoch, signal)
    const id = coerceEntityId(login.id)
    if (!id || id !== coerceEntityId(current.id)) {
      throw { code: 401, msg: '当前会话已更改，请重新登录' } satisfies ApiError
    }
    return login
  })
}

async function readCurrentAdmin(config: AxiosRequestConfig): Promise<Admin> {
  const response = await client.get<ApiResponse<Admin>>('/current', config)
  return requireApiPayload(response.data, '/current')
}

export async function getCurrentAdminPayload(signal?: AbortSignal): Promise<Admin> {
  return withAuthCookie(async () => {
    signal?.throwIfAborted()
    return readCurrentAdmin({ signal })
  })
}

// 登出
export async function logout(): Promise<void> {
  await withAuthCookie(async () => {
    await client.post('/passport/logout', undefined, cookieMutationConfig)
  })
}
