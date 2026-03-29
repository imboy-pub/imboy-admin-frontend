import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse } from '@/types/api'
import { Admin } from '@/types/admin'

export interface LoginParams {
  account: string
  pwd: string
  captcha: string
  csrf_token: string
}

export interface LoginResponse {
  id: string
  account: string
  nickname: string
  avatar: string
  role_id: number
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
export async function getLoginMeta(): Promise<LoginMeta> {
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

/**
 * @deprecated Prefer `loginPayload` to consume typed payload directly.
 */
export async function login(params: LoginParams): Promise<ApiResponse<LoginResponse>> {
  const response = await client.post('/passport/do_login', params)
  return response.data
}

export async function loginPayload(params: LoginParams): Promise<LoginResponse> {
  return requireApiPayload(await login(params), '/passport/do_login')
}

/**
 * @deprecated Prefer `getCurrentAdminPayload` to consume typed payload directly.
 */
export async function getCurrentAdmin(): Promise<ApiResponse<Admin>> {
  const response = await client.get('/current')
  return response.data
}

export async function getCurrentAdminPayload(): Promise<Admin> {
  return requireApiPayload(await getCurrentAdmin(), '/current')
}

// 登出
export async function logout(): Promise<void> {
  await client.post('/passport/logout')
}
