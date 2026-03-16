import client, { SKIP_AUTH_EXPIRED_EVENT_FLAG } from './client'
import { requireApiPayload } from './responseAdapter'
import { AxiosRequestConfig } from 'axios'

export type FeatureFlags = Record<string, boolean>

const FEATURE_CACHE_KEY = 'imboy_admin_feature_flags'

type AuthAwareRequestConfig = AxiosRequestConfig & {
  [SKIP_AUTH_EXPIRED_EVENT_FLAG]?: boolean
}

const PARENT_FEATURES: Record<string, string> = {
  channel_discover: 'channel',
  channel_invitation: 'channel',
  channel_order: 'channel',
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return undefined
}

function normalizeFeatureFlags(raw: unknown): FeatureFlags {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const normalized: FeatureFlags = {}
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const parsed = normalizeBoolean(value)
    if (parsed !== undefined) {
      normalized[key] = parsed
    }
  })
  return normalized
}

function readCachedFeatureFlags(): FeatureFlags | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(FEATURE_CACHE_KEY)
    if (!raw) return null
    return normalizeFeatureFlags(JSON.parse(raw))
  } catch {
    return null
  }
}

function cacheFeatureFlags(flags: FeatureFlags) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FEATURE_CACHE_KEY, JSON.stringify(flags))
  } catch {
    // Ignore cache persistence failures.
  }
}

export function adminFeatureQueryKey(account?: string | null) {
  return ['admin', 'features', account || 'anonymous'] as const
}

export async function getAdminFeaturesPayload(): Promise<FeatureFlags | null> {
  const requestConfig: AuthAwareRequestConfig = {
    [SKIP_AUTH_EXPIRED_EVENT_FLAG]: true,
  }

  try {
    const response = await client.get('/admin/config/features', requestConfig)
    const payload = requireApiPayload<Record<string, unknown>>(
      response.data,
      '/admin/config/features'
    )
    const flags = normalizeFeatureFlags(payload)
    cacheFeatureFlags(flags)
    return flags
  } catch {
    return readCachedFeatureFlags()
  }
}

export function getCachedAdminFeatures(): FeatureFlags | null {
  return readCachedFeatureFlags()
}

export function isAdminFeatureEnabled(
  featureFlags: FeatureFlags | null | undefined,
  featureKey?: string | null
): boolean {
  if (!featureKey) return true
  const currentFlag = normalizeBoolean(featureFlags?.[featureKey])
  if (currentFlag === false) return false
  const parentFeature = PARENT_FEATURES[featureKey]
  if (!parentFeature) return true
  return isAdminFeatureEnabled(featureFlags, parentFeature)
}

export function featureKeyForAdminPath(pathname?: string | null): string | null {
  if (!pathname) return null

  if (/^\/channels\/[^/]+\/invitations(?:\/|$)/.test(pathname)) {
    return 'channel_invitation'
  }
  if (/^\/channels\/[^/]+\/orders(?:\/|$)/.test(pathname)) {
    return 'channel_order'
  }
  if (/^\/channels(?:\/|$)/.test(pathname)) {
    return 'channel'
  }
  if (/^\/moments(?:\/|$)/.test(pathname) || /^\/reports(?:\/|$)/.test(pathname)) {
    return 'moment'
  }
  if (/^\/groups\/[^/]+\/votes(?:\/|$)/.test(pathname)) {
    return 'group_vote'
  }
  if (/^\/groups\/[^/]+\/schedules(?:\/|$)/.test(pathname)) {
    return 'group_schedule'
  }
  if (/^\/groups\/[^/]+\/tasks(?:\/|$)/.test(pathname)) {
    return 'group_task'
  }
  return null
}
