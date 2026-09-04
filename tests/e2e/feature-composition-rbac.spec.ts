import { expect, test } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

// Feature Composition F-05 动态验收：
// 后端 release 的 compiled_features 上限决定 Admin 菜单与直连 URL 行为。
// FC_EXPECT_OPTIONAL=1  → full-selected 后端：可选菜单可见、页面可达、契约含 canonical hash
// FC_EXPECT_OPTIONAL=0  → base-only 后端：可选菜单隐藏、直连 URL 落 FeatureDisabledPage、契约仅 core
// VITE_PROXY_TARGET 指向被测后端（9801=full-selected / 9802=base-only）。

const EXPECT_OPTIONAL = process.env.FC_EXPECT_OPTIONAL === '1'

const CANONICAL_HASH = 'sha256:b59aae27976015823e315e9a5ee42bb2af3970cec92c97df04b517b4674d1457'
const BASE_ONLY_HASH = 'sha256:e943ee9541241206e6f0b91502ddb173f06c086e83195c7a7cc95de2f4623712'

const OPTIONAL_MENUS = [
  { linkName: '频道管理', path: '/channels', label: '频道' },
  { linkName: '朋友圈管理', path: '/moments', label: '朋友圈' },
]

test('compiled feature ceiling drives menu, direct URL and backend contract', async ({
  page,
}) => {
  const credentials = requireAdminCredentials()
  await loginAsAdmin(page, credentials)

  // 1) 后端功能契约：manifest hash + compiled_features 必须与被测 profile 一致
  const res = await page.request.get('/api/adm/admin/config/features')
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  const payload = body.payload ?? body
  if (!payload.compiled_features) {
    console.log('FEATURES RESPONSE:', res.status(), JSON.stringify(body).slice(0, 400))
  }
  const compiled: string[] = payload.compiled_features ?? []
  if (EXPECT_OPTIONAL) {
    expect(payload.manifest_hash).toBe(CANONICAL_HASH)
    expect(compiled).toContain('moment')
    expect(compiled).toContain('channel')
  } else {
    expect(payload.manifest_hash).toBe(BASE_ONLY_HASH)
    expect(compiled).toEqual(['core'])
  }

  // 2) 侧边栏可选菜单跟随编译上限
  // 3) 直连 URL 行为：可达页面 或 fail-closed「功能未开启」
  for (const menu of OPTIONAL_MENUS) {
    const link = page.getByRole('link', { name: menu.linkName })
    if (EXPECT_OPTIONAL) {
      await expect(link).toBeVisible()
    } else {
      await expect(link).toHaveCount(0)
    }

    await page.goto(menu.path)
    if (EXPECT_OPTIONAL) {
      await expect(page.getByText('功能未开启')).toHaveCount(0)
      await expect(page.locator('body')).toContainText(
        menu.path === '/moments' ? '朋友圈治理' : '频道',
      )
    } else {
      // base 构建下可选路由物理缺席 → 404；若路由仍在但运行时关闭 → 功能未开启
      const notFound = page.getByRole('heading', { name: '404' })
      const disabled = page.getByRole('heading', { name: '功能未开启' })
      await expect(notFound.or(disabled).first()).toBeVisible()
    }
  }
})
