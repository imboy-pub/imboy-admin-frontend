/**
 * p10a：盘点各待测页面的可见按钮与表单控件（为定制交互做准备）
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Page } from '@playwright/test'
import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

const EVIDENCE_ROOT = path.resolve(process.cwd(), 'tests/auto_test/evidence')

const TARGETS = [
  { slug: 'SensitiveWordPage', path: '/moderation/sensitive-words' },
  { slug: 'VersionPage', path: '/settings/versions' },
  { slug: 'UserTagManagePage', path: '/users/{uid}/tags' },
  { slug: 'UserCollectManagePage', path: '/users/{uid}/collects' },
  { slug: 'GroupTagManagePage', path: '/groups/{gid}/tags' },
  { slug: 'GroupCategoryManagePage', path: '/groups/{gid}/categories' },
  { slug: 'GroupNoticeManagePage', path: '/groups/{gid}/notices' },
  { slug: 'GroupVoteManagePage', path: '/groups/{gid}/votes' },
  { slug: 'GroupScheduleManagePage', path: '/groups/{gid}/schedules' },
  { slug: 'GroupTaskManagePage', path: '/groups/{gid}/tasks' },
  { slug: 'GroupAlbumManagePage', path: '/groups/{gid}/albums' },
  { slug: 'GroupFileManagePage', path: '/groups/{gid}/files' },
  { slug: 'GroupMemberManagePage', path: '/groups/{gid}/members' },
  { slug: 'UserListPage', path: '/users' },
  { slug: 'GroupListPage', path: '/groups' },
  { slug: 'ChannelListPage', path: '/channels' },
  { slug: 'ChannelDetailPage', path: '/channels/{cid}' },
  { slug: 'ChannelMessagePage', path: '/channels/{cid}/messages' },
  { slug: 'ChannelSubscriberPage', path: '/channels/{cid}/subscribers' },
  { slug: 'ChannelAdminPage', path: '/channels/{cid}/admins' },
  { slug: 'ChannelInvitationPage', path: '/channels/{cid}/invitations' },
  { slug: 'ChannelOrderPage', path: '/channels/{cid}/orders' },
  { slug: 'MutedUsersPage', path: '/settings/muted-users' },
  { slug: 'SSOConfigPage', path: '/settings/sso' },
  { slug: 'ComplianceKeyPage', path: '/settings/compliance-keys' },
  { slug: 'BillingPlanListPage', path: '/billing-plans' },
  { slug: 'FeedbackListPage', path: '/feedback' },
  { slug: 'PluginManagementPage', path: '/plugins' },
  { slug: 'MomentListPage', path: '/moments' },
  { slug: 'AnnouncementListPage', path: '/announcements' },
]

function isApiUrl(url: string) {
  return url.includes('/api/adm')
}

async function harvestIds(page: Page, listPath: string, keyword: string): Promise<string[]> {
  const ids: string[] = []
  return new Promise((resolve) => {
    let done = false
    const handler = async (res: import('@playwright/test').Response) => {
      if (done) return
      const url = res.url()
      if (isApiUrl(url) && res.request().method() === 'GET' && url.includes(keyword)) {
        try {
          const body = await res.json()
          collect(body, ids)
          if (ids.length > 0) {
            done = true
            page.off('response', handler)
            resolve(ids.slice(0, 3))
          }
        } catch {
          /* ignore */
        }
      }
    }
    const collect = (node: unknown, out: string[], depth = 0) => {
      if (depth > 6 || out.length > 5) return
      if (Array.isArray(node)) { for (const i of node.slice(0, 10)) collect(i, out, depth + 1); return }
      if (typeof node === 'object' && node !== null) {
        const o = node as Record<string, unknown>
        const v = o.id ?? o.user_id ?? o.group_id ?? o.channel_id
        if (typeof v === 'string' && v.length > 0 && v.length < 64) out.push(v)
        for (const c of Object.values(o)) collect(c, out, depth + 1)
      }
    }
    page.on('response', handler)
    page.goto(listPath, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {})
    setTimeout(() => { if (!done) { done = true; page.off('response', handler); resolve([]) } }, 6_000)
  })
}

test('p10a 按钮盘点', async ({ page }) => {
  test.setTimeout(30 * 60 * 1000)
  await loginAsAdmin(page, requireAdminCredentials())

  const uid = (await harvestIds(page, '/users', '/user/'))[0] ?? ''
  const gid = (await harvestIds(page, '/groups', '/group/'))[0] ?? ''
  const cid = (await harvestIds(page, '/channels', '/channel/'))[0] ?? ''
  console.log('[p10a] ids', { uid, gid, cid })

  const inventory: Record<string, { buttons: string[]; rowButtons: string[]; inputs: string[]; hasTable: boolean; rows: number }> = {}

  for (const t of TARGETS) {
    const target = t.path.replace('{uid}', uid).replace('{gid}', gid).replace('{cid}', cid)
    if (/\{uid|gid|cid\}/.test(target) && !/0/.test(target)) {
      inventory[t.slug] = { buttons: [], rowButtons: [], inputs: [], hasTable: false, rows: 0 }
      continue
    }
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 18_000 })
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
      await page.waitForTimeout(600)
      const info = await page.evaluate(() => {
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        }
        const headerBtns = Array.from(document.querySelectorAll('main button, [class*="PageHeader"] button'))
          .filter(visible)
          .map((b) => (b.textContent || '').trim()).filter(Boolean)
        const rowBtns = Array.from(document.querySelectorAll('table td button, table td a'))
          .filter(visible)
          .map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim()).filter(Boolean)
        const inputs = Array.from(document.querySelectorAll('main input, main textarea') as NodeListOf<HTMLInputElement>)
          .filter(visible)
          .map((i) => `${i.tagName.toLowerCase()}#${i.id || ''}[${(i.getAttribute('placeholder') || '').slice(0, 12)}]`)
        const tables = document.querySelectorAll('table')
        const rows = tables.length ? tables[0].querySelectorAll('tbody tr').length : 0
        return {
          buttons: Array.from(new Set(headerBtns)).slice(0, 20),
          rowButtons: Array.from(new Set(rowBtns)).slice(0, 20),
          inputs: inputs.slice(0, 15),
          hasTable: tables.length > 0,
          rows,
        }
      }).catch(() => ({ buttons: [], rowButtons: [], inputs: [], hasTable: false, rows: 0 }))
      inventory[t.slug] = info
    } catch {
      inventory[t.slug] = { buttons: [], rowButtons: [], inputs: [], hasTable: false, rows: -1 }
    }
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, '_report-p10a-inventory.json'), JSON.stringify({ ids: { uid, gid, cid }, inventory }, null, 1))
  console.log('[p10a] saved')
})
