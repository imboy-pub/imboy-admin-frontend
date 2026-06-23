import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { ApiResponse } from '@/types/api'

/**
 * 首启初始化向导 API（P0-5）
 *
 * 对应后端：
 *   GET  /api/adm/setup/status  → adm_setup_handler:status
 *   POST /api/adm/setup/init    → adm_setup_handler:init_setup
 *
 * 两个端点均已加入 imboy_router:open/0 白名单，免鉴权访问。
 */

export interface SetupStatus {
  initialized: boolean
}

export interface SetupInitParams {
  /** 手机号或邮箱（二选一） */
  account: string
  /** 明文密码：8-64 字符，必须包含字母和数字 */
  password: string
  /** 昵称：1-80 字符 */
  nickname: string
}

export interface SetupInitResponse {
  id: string
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const response = await client.get<ApiResponse<SetupStatus>>('/setup/status')
  return requireApiPayload(response.data, '/setup/status')
}

export async function initSetup(params: SetupInitParams): Promise<SetupInitResponse> {
  const response = await client.post<ApiResponse<SetupInitResponse>>('/setup/init', params)
  return requireApiPayload(response.data, '/setup/init')
}
