/**
 * L-01 overseas_baseline 三端可见性验收（Admin 侧）。
 *
 * 后端 overseas_baseline 运行时预设下，GET /admin/config/features
 * （imboy_feature:all() → imboy_policy:effective_features()）下发：
 * 敏感键 false（location / channel_discover / channel_order / bot_webhook），
 * 基线键 true（channel / moment / group_* / e2ee / channel_invitation）。
 * 编译全集与 full-selected 相同（runtime can disable but cannot add absent），
 * manifest 契约校验必须继续通过。
 *
 * 验收口径：被禁功能的菜单项与直连 URL 在 Admin 缺席（FeatureDisabledPage），
 * 基线功能入口照常。
 */
import '../../test/setupDom'
import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import React from 'react'

import {
  isAdminFeatureEnabled,
  assertAdminFeatureManifest,
  type FeatureFlags,
} from './features'
import {
  compiledProductFeatures,
  productFeatureManifestHash,
  productFeatureSchemaVersion,
} from '@/generated/productFeatures'
import { filterByFeatures } from '@/components/layout/sidebarFilters'
import { FeatureRoute } from '@/components/auth/FeatureRoute'
import { useAuthStore } from '@/stores/authStore'
import client from '@/services/api/client'

// overseas_baseline 预设下后端下发的 effective features
// （对齐 imboy_profile_preset:profile_defaults(overseas_baseline)）
const overseasFlags: FeatureFlags = {
  channel: true,
  channel_discover: false,
  channel_invitation: true,
  channel_order: false,
  e2ee: true,
  group_schedule: true,
  group_task: true,
  group_vote: true,
  location: false,
  moment: true,
  bot_webhook: false,
}

// 模拟后端 /admin/config/features 的 overseas_baseline 完整响应
// （features map + manifest 契约字段；编译全集与主 manifest 一致）
const overseasPayload = {
  ...overseasFlags,
  manifest_hash: productFeatureManifestHash,
  manifest_schema_version: productFeatureSchemaVersion,
  compiled_features: compiledProductFeatures,
}

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }
const mutableClient = client as unknown as MutableClient
const origGet = mutableClient.get

afterEach(() => {
  mutableClient.get = origGet
  useAuthStore.setState({ admin: null, isAuthenticated: false })
  cleanup()
  try { localStorage.clear() } catch { /* ignore */ }
})

// ---------------------------------------------------------------------------
// effective feature 判定
// ---------------------------------------------------------------------------
describe('overseas_baseline effective flags', () => {
  it('disables sensitive features', () => {
    expect(isAdminFeatureEnabled(overseasFlags, 'location')).toBe(false)
    expect(isAdminFeatureEnabled(overseasFlags, 'channel_discover')).toBe(false)
    expect(isAdminFeatureEnabled(overseasFlags, 'channel_order')).toBe(false)
    expect(isAdminFeatureEnabled(overseasFlags, 'bot_webhook')).toBe(false)
  })

  it('keeps baseline features on', () => {
    expect(isAdminFeatureEnabled(overseasFlags, 'channel')).toBe(true)
    expect(isAdminFeatureEnabled(overseasFlags, 'channel_invitation')).toBe(true)
    expect(isAdminFeatureEnabled(overseasFlags, 'moment')).toBe(true)
    expect(isAdminFeatureEnabled(overseasFlags, 'group_vote')).toBe(true)
    expect(isAdminFeatureEnabled(overseasFlags, 'group_schedule')).toBe(true)
    expect(isAdminFeatureEnabled(overseasFlags, 'group_task')).toBe(true)
  })

  it('does not let the enabled channel parent resurrect a disabled child', () => {
    // channel_discover 自身显式 false：父开关 channel=true 不得把它救回
    expect(isAdminFeatureEnabled(overseasFlags, 'channel_discover')).toBe(false)
    expect(isAdminFeatureEnabled(overseasFlags, 'channel_order')).toBe(false)
  })

  it('passes the manifest contract (compiled superset identical to full-selected)', () => {
    expect(() => assertAdminFeatureManifest(overseasPayload)).not.toThrow()
  })
  // 注：compiled_features 校验是有意的超集检查（只拒"服务端超出 Admin
  // 编译能力"），编译子集合法——该语义由 features.test.ts 既有用例覆盖。
})

// ---------------------------------------------------------------------------
// 侧边栏菜单缺席
// ---------------------------------------------------------------------------
describe('overseas_baseline sidebar visibility', () => {
  const items = [
    { key: 'dashboard', path: '/dashboard', label: '仪表盘', icon: 'LayoutDashboard' },
    {
      key: 'ops',
      label: '运营中心',
      icon: 'Users',
      children: [
        { key: 'channels', path: '/channels', label: '频道管理', icon: 'Radio' },
        { key: 'channels-paid', path: '/channels/paid', label: '付费频道运营', icon: 'DollarSign' },
        { key: 'moments', path: '/moments', label: '朋友圈管理', icon: 'Camera' },
      ],
    },
  ]

  it('drops the paid-channel menu item while keeping baseline entries', () => {
    const filtered = filterByFeatures(items, overseasFlags)
    const ops = filtered.find((item) => item.key === 'ops')
    const labels = (ops?.children ?? []).map((child) => child.label)

    expect(labels).toContain('频道管理')
    expect(labels).toContain('朋友圈管理')
    expect(labels).not.toContain('付费频道运营')
  })

  it('keeps everything visible under the default (community) flags', () => {
    const filtered = filterByFeatures(items, null)
    const ops = filtered.find((item) => item.key === 'ops')
    const labels = (ops?.children ?? []).map((child) => child.label)

    expect(labels).toContain('付费频道运营')
  })
})

// ---------------------------------------------------------------------------
// 直连 URL 兜底
// ---------------------------------------------------------------------------
describe('overseas_baseline direct URL guard', () => {
  function renderAt(path: string, element: React.ReactElement) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } })
    let view: ReturnType<typeof render>
    awaitAct(async () => {
      view = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="*" element={element} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    })
    return view!
  }

  async function awaitAct(fn: () => void) {
    await act(async () => {
      fn()
    })
  }

  it('blocks /channels paid ops behind channel_order and shows the disabled page', async () => {
    useAuthStore.setState({ admin: { id: '1', account: 'admin', nickname: 'Admin', avatar: null, status: 1, role_ids: [1], created_at: '', updated_at: '' }, isAuthenticated: true })
    mutableClient.get = async (url: unknown) => {
      if (String(url).includes('/admin/config/features')) {
        return { data: { code: 0, msg: 'ok', payload: overseasPayload } }
      }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const view = renderAt(
      '/channels/paid',
      <FeatureRoute feature="channel_order">
        <span>paid-ops-content</span>
      </FeatureRoute>
    )

    await waitFor(() => {
      const text = view.container.textContent ?? ''
      expect(text.includes('功能未开启')).toBe(true)
      expect(text.includes('paid-ops-content')).toBe(false)
    })
  })

  it('still renders baseline channel content', async () => {
    useAuthStore.setState({ admin: { id: '1', account: 'admin', nickname: 'Admin', avatar: null, status: 1, role_ids: [1], created_at: '', updated_at: '' }, isAuthenticated: true })
    mutableClient.get = async (url: unknown) => {
      if (String(url).includes('/admin/config/features')) {
        return { data: { code: 0, msg: 'ok', payload: overseasPayload } }
      }
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    const view = renderAt(
      '/channels',
      <FeatureRoute feature="channel">
        <span>channel-content</span>
      </FeatureRoute>
    )

    await waitFor(() => {
      expect(view.container.textContent).toContain('channel-content')
    })
  })
})
