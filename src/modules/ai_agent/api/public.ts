// AI 助手管理 API / AI agent management API
// 后端: src/adm/adm_ai_agent_handler.erl（baseURL /api/adm，调用不写前缀）
import client from '@/services/api/client'
import { parseUploadDescriptor } from '@/lib/attachmentUploadJournal'
import { useAuthStore } from '@/stores/authStore'
import { requireApiPayload } from '@/services/api/responseAdapter'
import type { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

// visibility: 0=私有 1=公开可发现（进助手广场）
type AgentVisibility = 0 | 1
// status: 0=停用 1=启用
export type AgentStatus = 0 | 1

/** admin 列表行（ai_agent_repo:page JOIN user） */
export interface AiAgentListItem {
  user_id: EntityId
  nickname: string
  avatar: string
  provider: string
  model: string
  description: string
  visibility: AgentVisibility
  status: AgentStatus
  owner_uid: EntityId
  /** 分类（迁移 000057 扩展列，供列表筛选） */
  category: string
  role_id?: string
  role_name?: string
  role_version?: number
  created_at?: string
}

/** 助手能力集（capabilities jsonb → JSON 编码字符串 → 前端解析为对象） */
export type AiAgentCapabilities = Record<string, boolean>

/** agent 详情（ai_agent_ds:get，含 system_prompt 长文本 + 定制扩展字段） */
export interface AiAgentDetail {
  user_id: EntityId
  provider: string
  model: string
  role_id: string
  system_prompt: string
  owner_uid: EntityId
  status: AgentStatus
  description: string
  visibility: AgentVisibility
  category: string
  voice_id: string
  greeting: string
  /** 后端返回 JSON 编码字符串，API 层解析为对象 */
  capabilities: AiAgentCapabilities
  temperature: number
}

/** 更新/新建入参（后端按 user_id 有无区分 create/update） */
export interface AiAgentUpsertInput {
  user_id?: EntityId
  nickname?: string
  account?: string
  /** 头像 URL（admin 上传后随 update 提交，后端同步写 user.avatar） */
  avatar?: string
  avatar_object_key?: string
  avatar_client_upload_id?: string
  provider: string
  role_id?: string
  model?: string
  system_prompt?: string
  description?: string
  visibility?: AgentVisibility
  status?: AgentStatus
  category?: string
  voice_id?: string
  greeting?: string
  capabilities?: AiAgentCapabilities
  temperature?: number
}

/** ai_roles 人格 KV：role_id → system_prompt */
export type AiRolesMap = Record<string, string>

/** 新手引导配置（config 表 onboarding.* 键） */
export interface OnboardingConfig {
  enabled: boolean
  welcome_agent_uid: EntityId
  default_channels: string[]
  welcome_template: string
  welcome_llm_enabled: boolean
}

/** 知识库配置（config 表 ai_agent.kb.* 键；供 @管家 答疑注入） */
export interface KnowledgeConfig {
  enabled: boolean
  group_rule: string
  faq: string
}

export interface AiAgentListParams {
  page: number
  size: number
  category?: string
}

export type AiRoleStatus = 0 | 1

export type AiRoleCapabilityPolicy = {
  knowledge?: {
    mode: 'off' | 'on_demand' | 'required'
    source?: 'all' | 'faq' | 'group_rule'
    max_context_bytes?: number
  }
  group_reply?: { mode: 'off' | 'mention_only' }
  proactive?: { mode: 'off' | 'welcome_only'; daily_limit?: number }
}

export interface AiRoleListItem {
  code: string
  name: string
  description: string
  status: AiRoleStatus
  active_version: number
  bound_agent_count?: number
  updated_at?: string
}

export interface AiRoleDetail extends AiRoleListItem {
  version_id?: EntityId
  version?: number
  state?: 'draft' | 'published' | 'archived'
  system_prompt?: string
  capabilities: AiAgentCapabilities
  knowledge_policy: AiRoleCapabilityPolicy
}

export interface AiRolePageParams {
  page: number
  size: number
  keyword?: string
  status?: AiRoleStatus
}

// --- API 调用 ---

export async function getAiAgentList(
  params: AiAgentListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<AiAgentListItem>> {
  const response = await client.get('/ai_agent/list', { params })
  const payload = requireApiPayload<PaginatedResponse<AiAgentListItem>>(
    response.data,
    '/ai_agent/list'
  )
  const items = Array.isArray(payload.items) ? payload.items : []
  return { ...payload, items }
}

export async function getAiAgentDetail(userId: EntityId): Promise<AiAgentDetail> {
  const response = await client.get('/ai_agent/detail', { params: { user_id: userId } })
  const detail = requireApiPayload<AiAgentDetail>(response.data, '/ai_agent/detail')
  return { ...detail, capabilities: parseCapabilities(detail.capabilities) }
}

export async function createAiAgent(input: AiAgentUpsertInput): Promise<{ user_id: EntityId }> {
  const response = await client.post('/ai_agent/create', input)
  return requireApiPayload<{ user_id: EntityId }>(response.data, '/ai_agent/create')
}

export async function updateAiAgent(input: AiAgentUpsertInput): Promise<{ user_id: EntityId }> {
  const response = await client.post('/ai_agent/update', input)
  return requireApiPayload<{ user_id: EntityId }>(response.data, '/ai_agent/update')
}

export async function setAiAgentStatus(
  userId: EntityId,
  status: AgentStatus
): Promise<ApiResponse> {
  const response = await client.post('/ai_agent/set_status', { user_id: userId, status })
  return response.data
}

export async function getAiRolePage(
  params: AiRolePageParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<AiRoleListItem>> {
  const response = await client.get('/ai_agent/role/list', { params })
  const payload = requireApiPayload<PaginatedResponse<AiRoleListItem>>(
    response.data,
    '/ai_agent/role/list'
  )
  return { ...payload, items: Array.isArray(payload.items) ? payload.items : [] }
}

export async function getAiRoleDetail(code: string): Promise<AiRoleDetail> {
  const response = await client.get('/ai_agent/role/detail', { params: { role_code: code } })
  const detail = requireApiPayload<AiRoleDetail>(response.data, '/ai_agent/role/detail')
  return {
    ...detail,
    capabilities: parseCapabilities(detail.capabilities),
    knowledge_policy: parseKnowledgePolicy(detail.knowledge_policy),
  }
}

export async function createAiRole(input: {
  code: string
  name: string
  description?: string
}): Promise<AiRoleListItem> {
  const response = await client.post('/ai_agent/role/create', input)
  return requireApiPayload<AiRoleListItem>(response.data, '/ai_agent/role/create')
}

export async function saveAiRoleDraft(
  roleCode: string,
  input: {
    version: number
    name?: string
    description?: string
    system_prompt: string
    capabilities: AiAgentCapabilities
    knowledge_policy: AiRoleCapabilityPolicy
  }
): Promise<unknown> {
  const response = await client.post('/ai_agent/role/draft', {
    role_code: roleCode,
    ...input,
  })
  return requireApiPayload(response.data, '/ai_agent/role/draft')
}

export async function publishAiRole(
  roleCode: string,
  version: number
): Promise<unknown> {
  const response = await client.post('/ai_agent/role/publish', {
    role_code: roleCode,
    version,
  })
  return requireApiPayload(response.data, '/ai_agent/role/publish')
}

export async function setAiRoleStatus(code: string, status: AiRoleStatus): Promise<ApiResponse> {
  const response = await client.post('/ai_agent/role/set_status', { role_code: code, status })
  return response.data
}

export async function getOnboardingConfig(): Promise<OnboardingConfig> {
  const response = await client.get('/ai_agent/onboarding_config')
  return requireApiPayload<OnboardingConfig>(response.data, '/ai_agent/onboarding_config')
}

export async function putOnboardingConfig(
  patch: Partial<OnboardingConfig>
): Promise<OnboardingConfig> {
  const response = await client.post('/ai_agent/onboarding_config', patch)
  return requireApiPayload<OnboardingConfig>(response.data, '/ai_agent/onboarding_config')
}

export async function getKnowledgeConfig(): Promise<KnowledgeConfig> {
  const response = await client.get('/ai_agent/knowledge_config')
  return requireApiPayload<KnowledgeConfig>(response.data, '/ai_agent/knowledge_config')
}

export async function putKnowledgeConfig(
  patch: Partial<KnowledgeConfig>
): Promise<KnowledgeConfig> {
  const response = await client.post('/ai_agent/knowledge_config', patch)
  return requireApiPayload<KnowledgeConfig>(response.data, '/ai_agent/knowledge_config')
}

// --- 角色管理（ai_roles 人格 KV） ---

/** GET /ai_agent/roles：全量角色 */
export async function getAiRoles(): Promise<AiRolesMap> {
  const response = await client.get('/ai_agent/roles')
  const payload = requireApiPayload<{ roles: AiRolesMap }>(response.data, '/ai_agent/roles')
  return payload.roles ?? {}
}

/** POST /ai_agent/roles action=save：保存单个角色，回读全量 */
export async function saveAiRole(roleId: string, prompt: string): Promise<AiRolesMap> {
  const response = await client.post('/ai_agent/roles', {
    action: 'save',
    role_id: roleId,
    prompt,
  })
  const payload = requireApiPayload<{ roles: AiRolesMap }>(response.data, '/ai_agent/roles')
  return payload.roles ?? {}
}

/** POST /ai_agent/roles action=delete：删除单个角色，回读全量 */
export async function deleteAiRole(roleId: string): Promise<AiRolesMap> {
  const response = await client.post('/ai_agent/roles', {
    action: 'delete',
    role_id: roleId,
  })
  const payload = requireApiPayload<{ roles: AiRolesMap }>(response.data, '/ai_agent/roles')
  return payload.roles ?? {}
}

// --- 头像上传（C08/V3-13：direct-v1 application 主体会话） ---

/** avatar_direct 单步响应信封 payload（register/finalize/publish 各取所需） */
interface AvatarDirectResponse {
  object_key?: string
  state?: string
  attempt_id?: number
  grant?: {
    transport?: string
    url?: string
    method?: string
    required_headers?: Array<{ key: string; value: string }>
    expires_in?: number
  }
  public_url?: string
  expected?: unknown
}

async function avatarDirect(body: Record<string, unknown>, signal: AbortSignal): Promise<AvatarDirectResponse> {
  const response = await client.post('/ai_agent/avatar_direct', body, { signal })
  return requireApiPayload<AvatarDirectResponse>(response.data, '/ai_agent/avatar_direct')
}

/** 文件字节 SHA-256（hex 小写，declare 的 expected 冻结值） */
async function sha256HexOfFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * POST /ai_agent/avatar_direct 全链上传 AI 头像并通过受控边缘别名发布。
 * 链路（协议 §5 Admin 身份域，application 主体，正文不经后端）：
 *   register（application_id 缺省取 agentId，org 缺省 admin 平台域）
 *   → declare（sha256/size 冻结）→ grant（staging s3_put 描述符）
 *   → 浏览器 PUT grant.url（只发 required_headers，credentials: 'omit'，
 *      Admin Cookie 绝不出域；与服务端签名逐字一致，不增不减）
 *   → finalize（CONFIRMED）→ publish（检查私有 winner → 公开别名）。
 * 返回公开可读 URL（随 update 提交，后端同步写 user.avatar）。
 * 中途失败直接抛错（前端可按原会话安全重试；
 * 同 filename+clientUploadId 重试时 register 幂等恢复同一会话）。
 */
const avatarJournalPrefix = 'imboy-avatar-upload-v1:'

function currentAvatarAdmin(): string {
  const { admin, isAuthenticated } = useAuthStore.getState()
  if (!isAuthenticated || !admin?.id) throw new Error('管理员会话不可用，无法恢复头像上传')
  return String(admin.id)
}

/** 保存成功后只清除此管理员和上传会话对应的恢复记录。 */
export function clearAvatarUploadJournal(clientUploadId: string): void {
  const owner = currentAvatarAdmin()
  const storage = globalThis.localStorage
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i)
    if (!key?.startsWith(`${avatarJournalPrefix}${encodeURIComponent(owner)}:`)) continue
    const value = JSON.parse(storage.getItem(key) ?? 'null') as { clientUploadId?: unknown } | null
    if (value?.clientUploadId === clientUploadId) storage.removeItem(key)
  }
}

export async function uploadAgentAvatar(
  file: File,
  opts?: { agentId?: string; clientUploadId?: string; signal?: AbortSignal },
): Promise<{ url: string; objectKey: string; clientUploadId: string }> {
  const mime = file.type || 'image/png'
  if (file.size <= 0 || file.size > 100 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)) {
    throw new Error('头像格式或大小不受支持')
  }
  const owner = currentAvatarAdmin()
  let invalidated = false
  const controller = new AbortController()
  const cancel = () => controller.abort()
  opts?.signal?.addEventListener('abort', cancel, { once: true })
  if (opts?.signal?.aborted) cancel()
  const timer = setTimeout(cancel, 120_000)
  const unsubscribe = useAuthStore.subscribe((state) => {
    if (!state.isAuthenticated || String(state.admin?.id ?? '') !== owner) {
      invalidated = true
      controller.abort()
    }
  })
  const checkOwner = () => {
    if (invalidated || currentAvatarAdmin() !== owner) throw new Error('管理员会话已切换，上传已停止')
    if (controller.signal.aborted) throw new Error('头像上传已取消或超时，请重试')
  }
  try {
    const sha256 = await sha256HexOfFile(file)
    checkOwner()
    const name = file.name || 'avatar.png'
    const journalKey = `${avatarJournalPrefix}${encodeURIComponent(owner)}:${encodeURIComponent(opts?.agentId || 'create')}:${sha256}:${file.size}:${encodeURIComponent(mime)}:${encodeURIComponent(name)}`
    const locks = globalThis.navigator?.locks
    if (!locks) throw new Error('浏览器不支持安全上传任务锁')
    return await locks.request(`avatar:${journalKey}`, { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error('头像上传正在其他页面进行')
      checkOwner()
      const storage = globalThis.localStorage
      const stored = storage.getItem(journalKey)
      const journal = stored === null ? null : JSON.parse(stored) as { clientUploadId?: unknown; objectKey?: unknown }
      if (journal !== null && (typeof journal.clientUploadId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(journal.clientUploadId) ||
          (journal.objectKey !== undefined && typeof journal.objectKey !== 'string'))) {
        throw new Error('头像恢复记录无效')
      }
      if (journal && opts?.clientUploadId && journal.clientUploadId !== opts.clientUploadId) {
        throw new Error('头像恢复会话冲突')
      }
      const clientUploadId = (journal?.clientUploadId as string | undefined) ?? opts?.clientUploadId ?? crypto.randomUUID()
      const save = (objectKey?: string) => {
        storage.setItem(journalKey, JSON.stringify({ clientUploadId, ...(objectKey ? { objectKey } : {}) }))
      }
      save(typeof journal?.objectKey === 'string' ? journal.objectKey : undefined)

      const request = async (body: Record<string, unknown>) => {
        checkOwner()
        const result = await avatarDirect(body, controller.signal)
        checkOwner()
        return result
      }
      const registered = await request({
        op: 'register', application_id: opts?.agentId || clientUploadId,
        filename: name, client_upload_id: clientUploadId,
      })
      const objectKey = registered.object_key
      if (!objectKey || (journal?.objectKey && journal.objectKey !== objectKey)) {
        throw new Error('头像会话定位键不一致')
      }
      save(objectKey)

      let state = registered.state
      if (state !== 'RESERVED') {
        const status = await request({ op: 'status', object_key: objectKey })
        if (status.object_key !== objectKey) throw new Error('头像状态定位键不一致')
        state = status.state
        const raw = status.expected
        const expected: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (typeof expected !== 'object' || expected === null ||
            (expected as Record<string, unknown>).sha256 !== sha256 ||
            String((expected as Record<string, unknown>).size_bytes) !== String(file.size) ||
            (expected as Record<string, unknown>).mime !== mime) {
          throw new Error('头像文件与已登记内容不一致')
        }
      }
      if (state === 'RESERVED') {
        await request({ op: 'declare', object_key: objectKey, sha256, size_bytes: file.size, mime })
        state = 'DECLARED'
      }
      if (state !== 'CONFIRMED') {
        if (state !== 'DECLARED' && state !== 'GRANTED' && state !== 'FINALIZING') {
          throw new Error('头像上传会话状态不可恢复')
        }
        const granted = await request({
          op: state === 'DECLARED' ? 'grant' : 'renew', object_key: objectKey, sha256,
        })
        if (granted.state !== 'CONFIRMED') {
          const grant = parseUploadDescriptor(granted.grant)
          const attemptId = granted.attempt_id
          if (typeof attemptId !== 'number' || !Number.isSafeInteger(attemptId) || attemptId < 1) {
            throw new Error('avatar grant 未返回 attempt_id')
          }
          checkOwner()
          const putResp = await fetch(grant.url, {
            method: 'PUT', body: file, headers: grant.headers, credentials: 'omit', redirect: 'error',
            signal: controller.signal,
          })
          checkOwner()
          if (!putResp.ok) throw new Error(`头像直传存储失败（HTTP ${putResp.status}）`)
          const finalized = await request({ op: 'finalize', object_key: objectKey, attempt_id: attemptId })
          if (finalized.state !== 'CONFIRMED') throw new Error('头像会话未确认（未达 CONFIRMED）')
        }
      }
      const published = await request({ op: 'publish', object_key: objectKey, agent_id: opts?.agentId ?? '' })
      const publicUrl = published.public_url
      if (!publicUrl) throw new Error('头像发布未返回公开 URL')
      return { url: publicUrl, objectKey, clientUploadId }
    })
  } finally {
    clearTimeout(timer)
    opts?.signal?.removeEventListener('abort', cancel)
    unsubscribe()
  }
}

/** 受控支付授权入参（agent_payment_mandate_logic:authorize/2，金额单位分） */
export interface AgentMandateInput {
  agent_uid: EntityId
  /** 单笔上限（分） */
  max_amount_fen: number
  /** 周期累计上限（分） */
  max_total_fen: number
  /** 有效期（秒） */
  expires_in_secs: number
  /** 累计窗口（秒，默认 86400） */
  period_secs?: number
}

/**
 * 代运营为 Agent 创建受控支付授权（admin 应急入口）。
 * RBAC: finance:write；后端自动解析 agent 绑定的 owner 作为付款人，
 * 同一 agent 仅一个有效 mandate（新授权替换旧授权）。
 */
export async function createAgentMandate(input: AgentMandateInput): Promise<unknown> {
  const response = await client.post('/ai_agent/mandate_create', input)
  return requireApiPayload(response.data, '/ai_agent/mandate_create')
}

/** capabilities 后端为 JSON 编码字符串（jsone:encode），解析失败给空对象兜底 */
function parseCapabilities(raw: unknown): AiAgentCapabilities {
  if (raw && typeof raw === 'object') return raw as AiAgentCapabilities
  if (typeof raw === 'string' && raw !== '') {
    try {
      return JSON.parse(raw) as AiAgentCapabilities
    } catch {
      return {}
    }
  }
  return {}
}

function parseKnowledgePolicy(raw: unknown): AiRoleCapabilityPolicy {
  if (raw && typeof raw === 'object') return raw as AiRoleCapabilityPolicy
  if (typeof raw === 'string' && raw !== '') {
    try {
      return JSON.parse(raw) as AiRoleCapabilityPolicy
    } catch {
      return {}
    }
  }
  return {}
}
