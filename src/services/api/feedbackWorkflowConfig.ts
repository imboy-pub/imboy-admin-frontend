type FeedbackWorkflowConfigSource = 'backend' | 'local' | 'default'

type FeedbackWorkflowConfig = {
  replyTemplates: string[]
  slaHours: number
  source: FeedbackWorkflowConfigSource
}

export type FeedbackWorkflowEditableConfig = {
  replyTemplates: string[]
  slaHours: number
}

type FeedbackWorkflowSaveResult = {
  source: 'backend' | 'local'
  config: FeedbackWorkflowEditableConfig
}

type FeedbackWorkflowBackendPayload = {
  reply_templates: string[]
  sla_hours: number
}

// NOTE: localStorage is intentionally used here (not sessionStorage) because this config
// contains only non-sensitive display preferences (reply templates, SLA hours). Persisting
// across sessions improves UX when the backend is unavailable. No tokens or secrets are stored.
const FEEDBACK_WORKFLOW_LOCAL_KEY = 'imboy.feedback-workflow-config.v1'
const DEFAULT_FEEDBACK_WORKFLOW_CONFIG_URL = '/adm/admin/config/feedback-workflow'
const DEFAULT_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL = '/adm/admin/config/feedback-workflow'
const MIN_SLA_HOURS = 1
const MAX_SLA_HOURS = 720

const DEFAULT_REPLY_TEMPLATES = [
  '感谢反馈，我们已收到并会尽快处理。',
  '问题已记录到修复队列，预计将在后续版本优化。',
  '请补充相关截图和复现步骤，便于我们进一步排查。',
  '该反馈已转交对应业务负责人处理，请留意后续通知。',
]

const DEFAULT_SLA_HOURS = 24

function appendNoCacheStamp(url: string, stamp: number): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${stamp}`
}

function normalizeTemplates(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) {
    return [...fallback]
  }

  const normalized = input
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        if (typeof record.text === 'string') return record.text.trim()
        if (typeof record.label === 'string') return record.label.trim()
        if (typeof record.content === 'string') return record.content.trim()
      }
      return ''
    })
    .filter((item) => item.length > 0)

  if (normalized.length === 0) {
    return [...fallback]
  }

  return Array.from(new Set(normalized)).slice(0, 20)
}

function normalizeSlaHours(input: unknown, fallback: number): number {
  const parsed = Number(input)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  const rounded = Math.round(parsed)
  if (rounded < MIN_SLA_HOURS) return MIN_SLA_HOURS
  if (rounded > MAX_SLA_HOURS) return MAX_SLA_HOURS
  return rounded
}

function normalizeEditableConfig(
  input: unknown,
  fallback: FeedbackWorkflowEditableConfig
): FeedbackWorkflowEditableConfig {
  if (Array.isArray(input)) {
    return {
      replyTemplates: normalizeTemplates(input, fallback.replyTemplates),
      slaHours: fallback.slaHours,
    }
  }

  if (!input || typeof input !== 'object') {
    return { ...fallback, replyTemplates: [...fallback.replyTemplates] }
  }

  const raw = input as Record<string, unknown>

  const templateCandidate = raw.reply_templates ?? raw.replyTemplates ?? raw.templates
  const slaCandidate = raw.sla_hours ?? raw.slaHours ?? raw.sla

  return {
    replyTemplates: normalizeTemplates(templateCandidate, fallback.replyTemplates),
    slaHours: normalizeSlaHours(slaCandidate, fallback.slaHours),
  }
}

function unwrapWorkflowConfigPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    throw new Error('invalid feedback workflow payload')
  }

  const record = raw as Record<string, unknown>
  if ('payload' in record && 'code' in record) {
    const code = Number(record.code)
    if (Number.isFinite(code) && code !== 0) {
      const message = typeof record.msg === 'string' ? record.msg : 'request failed'
      throw new Error(`feedback workflow config rejected: ${message}`)
    }
    if (record.payload === undefined || record.payload === null) {
      throw new Error('feedback workflow payload is empty')
    }
    return record.payload
  }

  return record
}

function resolveConfigUrl(): string {
  const envUrl = typeof import.meta.env.VITE_FEEDBACK_WORKFLOW_CONFIG_URL === 'string'
    ? import.meta.env.VITE_FEEDBACK_WORKFLOW_CONFIG_URL.trim()
    : ''

  return envUrl || DEFAULT_FEEDBACK_WORKFLOW_CONFIG_URL
}

function resolveConfigSaveUrl(): string {
  const envUrl = typeof import.meta.env.VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL === 'string'
    ? import.meta.env.VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL.trim()
    : ''

  return envUrl || DEFAULT_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL
}

async function loadWorkflowConfigFromBackend(url: string, stamp: number): Promise<FeedbackWorkflowEditableConfig> {
  const response = await fetch(appendNoCacheStamp(url, stamp), {
    cache: 'no-store',
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const raw = await response.json()
  const payload = unwrapWorkflowConfigPayload(raw)
  return normalizeEditableConfig(payload, getDefaultFeedbackWorkflowEditableConfig())
}

function toBackendPayload(input: FeedbackWorkflowEditableConfig): FeedbackWorkflowBackendPayload {
  return {
    reply_templates: [...input.replyTemplates],
    sla_hours: input.slaHours,
  }
}

async function saveWorkflowConfigToBackend(
  url: string,
  config: FeedbackWorkflowEditableConfig
): Promise<FeedbackWorkflowEditableConfig> {
  const normalizedConfig = normalizeEditableConfig(config, getDefaultFeedbackWorkflowEditableConfig())
  const methods: Array<'PUT' | 'POST'> = ['PUT', 'POST']

  for (const method of methods) {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(toBackendPayload(normalizedConfig)),
    })

    if (!response.ok) {
      if (response.status === 404 || response.status === 405) {
        continue
      }
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return normalizedConfig
    }

    const raw = await response.json().catch(() => null)
    if (!raw || typeof raw !== 'object') {
      return normalizedConfig
    }

    const payload = unwrapWorkflowConfigPayload(raw)
    return normalizeEditableConfig(payload, normalizedConfig)
  }

  throw new Error('backend save endpoint unavailable')
}

export function getDefaultFeedbackWorkflowEditableConfig(): FeedbackWorkflowEditableConfig {
  return {
    replyTemplates: [...DEFAULT_REPLY_TEMPLATES],
    slaHours: DEFAULT_SLA_HOURS,
  }
}

function readFeedbackWorkflowLocalConfig(): FeedbackWorkflowEditableConfig | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(FEEDBACK_WORKFLOW_LOCAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return normalizeEditableConfig(parsed, getDefaultFeedbackWorkflowEditableConfig())
  } catch {
    return null
  }
}

function saveFeedbackWorkflowLocalConfig(
  next: Partial<FeedbackWorkflowEditableConfig>
): FeedbackWorkflowEditableConfig {
  const fallback = readFeedbackWorkflowLocalConfig() || getDefaultFeedbackWorkflowEditableConfig()
  const normalized = normalizeEditableConfig(next, fallback)

  if (typeof window !== 'undefined') {
    const payload = {
      reply_templates: normalized.replyTemplates,
      sla_hours: normalized.slaHours,
    }
    window.localStorage.setItem(FEEDBACK_WORKFLOW_LOCAL_KEY, JSON.stringify(payload))
  }

  return normalized
}

export async function saveFeedbackWorkflowConfig(
  next: Partial<FeedbackWorkflowEditableConfig>
): Promise<FeedbackWorkflowSaveResult> {
  const fallback = readFeedbackWorkflowLocalConfig() || getDefaultFeedbackWorkflowEditableConfig()
  const normalized = normalizeEditableConfig(next, fallback)
  const saveUrl = resolveConfigSaveUrl()

  try {
    const backendConfig = await saveWorkflowConfigToBackend(saveUrl, normalized)
    return {
      source: 'backend',
      config: backendConfig,
    }
  } catch {
    const localConfig = saveFeedbackWorkflowLocalConfig(normalized)
    return {
      source: 'local',
      config: localConfig,
    }
  }
}

export async function fetchFeedbackWorkflowConfig(): Promise<FeedbackWorkflowConfig> {
  const remoteUrl = resolveConfigUrl()
  const stamp = Date.now()
  const localConfig = readFeedbackWorkflowLocalConfig()

  try {
    const backendConfig = await loadWorkflowConfigFromBackend(remoteUrl, stamp)
    return {
      ...backendConfig,
      source: 'backend',
    }
  } catch {
    if (localConfig) {
      return {
        ...localConfig,
        source: 'local',
      }
    }

    return {
      ...getDefaultFeedbackWorkflowEditableConfig(),
      source: 'default',
    }
  }
}
