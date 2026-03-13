export type MenuConfigItem = {
  path?: string
  label: string
  icon?: string
  enabled?: boolean
  roles?: Array<number | string>
  permission?: string
  children?: MenuConfigItem[]
}

export type PermissionCatalogItem = {
  key: string
  name: string
  module: string
  path: string
}

export type RoleTemplateConfig = {
  id: number
  name: string
  description: string
  permissions: string[]
}

export type AdminRbacConfig = {
  permissions?: PermissionCatalogItem[]
  roles?: RoleTemplateConfig[]
}

export type SidebarMenuConfig = {
  title?: string
  items?: MenuConfigItem[]
  rbac?: AdminRbacConfig
}

const DEFAULT_REMOTE_SIDEBAR_CONFIG_URL = '/adm/admin/config/sidebar'
const DEFAULT_LOCAL_SIDEBAR_CONFIG_URL = '/sidebar-menu.json'

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => (typeof item === 'string' ? item.trim() : String(item)))
    .filter((item) => item.length > 0)
}

function normalizePermissionCatalog(input: unknown): PermissionCatalogItem[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const key = typeof raw.key === 'string' ? raw.key.trim() : ''
      const name = typeof raw.name === 'string' ? raw.name.trim() : ''
      const module = typeof raw.module === 'string' ? raw.module.trim() : ''
      const path = typeof raw.path === 'string' ? raw.path.trim() : ''
      if (!key || !name || !module || !path) return null
      return { key, name, module, path }
    })
    .filter((item): item is PermissionCatalogItem => item !== null)
}

function normalizeRoleTemplates(input: unknown): RoleTemplateConfig[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const id = Number(raw.id)
      const name = typeof raw.name === 'string' ? raw.name.trim() : ''
      const description = typeof raw.description === 'string' ? raw.description.trim() : ''
      const permissions = normalizeStringArray(raw.permissions)
      if (!Number.isFinite(id) || id <= 0 || !name) return null
      return { id, name, description, permissions }
    })
    .filter((item): item is RoleTemplateConfig => item !== null)
}

function appendNoCacheStamp(url: string, stamp: number): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${stamp}`
}

function normalizeSidebarConfig(data: SidebarMenuConfig | MenuConfigItem[]): SidebarMenuConfig {
  if (Array.isArray(data)) {
    return { items: data }
  }

  const rbac = data.rbac || {}
  return {
    title: data.title,
    items: Array.isArray(data.items) ? data.items : [],
    rbac: {
      permissions: normalizePermissionCatalog(rbac.permissions),
      roles: normalizeRoleTemplates(rbac.roles),
    },
  }
}

function unwrapSidebarConfigPayload(raw: unknown): SidebarMenuConfig | MenuConfigItem[] {
  if (Array.isArray(raw)) {
    return raw as MenuConfigItem[]
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('invalid sidebar config payload')
  }

  const record = raw as Record<string, unknown>
  if ('payload' in record && 'code' in record) {
    const code = Number(record.code)
    if (Number.isFinite(code) && code !== 0) {
      const message = typeof record.msg === 'string' ? record.msg : 'request failed'
      throw new Error(`backend config rejected: ${message}`)
    }
    const payload = record.payload
    if (!payload || (typeof payload !== 'object' && !Array.isArray(payload))) {
      throw new Error('backend config payload is empty')
    }
    return payload as SidebarMenuConfig | MenuConfigItem[]
  }

  return record as SidebarMenuConfig
}

function resolveSidebarConfigUrls(): string[] {
  const envUrl = typeof import.meta.env.VITE_SIDEBAR_CONFIG_URL === 'string'
    ? import.meta.env.VITE_SIDEBAR_CONFIG_URL.trim()
    : ''

  const configuredRemoteUrl = envUrl || DEFAULT_REMOTE_SIDEBAR_CONFIG_URL
  const candidates = [configuredRemoteUrl, DEFAULT_LOCAL_SIDEBAR_CONFIG_URL]

  return Array.from(new Set(candidates.filter((url) => typeof url === 'string' && url.trim().length > 0)))
}

async function loadSidebarConfigFromUrl(url: string, stamp: number): Promise<SidebarMenuConfig> {
  const response = await fetch(appendNoCacheStamp(url, stamp), {
    cache: 'no-store',
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const raw = await response.json()
  return normalizeSidebarConfig(unwrapSidebarConfigPayload(raw))
}

export async function fetchSidebarMenuConfig(): Promise<SidebarMenuConfig> {
  const urls = resolveSidebarConfigUrls()
  const stamp = Date.now()
  const errors: string[] = []

  for (const url of urls) {
    try {
      return await loadSidebarConfigFromUrl(url, stamp)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${url}: ${message}`)
    }
  }

  throw new Error(`Load sidebar config failed (${errors.join(' | ')})`)
}
