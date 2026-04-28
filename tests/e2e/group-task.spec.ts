/**
 * 群任务治理页 E2E 测试 / GroupTaskManagePage E2E Tests
 *
 * 策略（混合方案 C）/ Strategy (Hybrid C):
 *   - 登录走真实后端（loginAsAdmin）以获得合法 JWT 与权限上下文
 *   - 业务接口（/group/task/*）通过 page.route() 固定 mock，保证断言稳定
 *   - Login uses real backend via loginAsAdmin for valid JWT and RBAC context
 *   - Business endpoints (/group/task/*) are intercepted for deterministic data
 *
 * 覆盖场景 / Coverage:
 *   1. 任务列表渲染、状态徽章、空态 / List render, status badges, empty state
 *   2. 状态过滤 / Status filter
 *   3. 详情与待批改 / Detail panel + pending reviews
 *   4. 批改操作（打分+评语）/ Review operation
 *   5. 强制结束确认对话框 / Force-close confirm dialog
 *   6. CSV 导出按钮可点击 / CSV export button clickable
 *   7. 页面主标题渲染 / Page heading renders
 *
 * 前置条件 / Prerequisites:
 *   - 需要 IMBOY_ADMIN_E2E_SUPER_ACCOUNT / _PASSWORD（或 _ACCOUNT / _PASSWORD 带 role_id ∈ [1,2]）
 *   - 后端可达 /login 与 /adm/* 端点
 *
 * 运行 / Run:
 *   bun run test:e2e -- --project=chromium group-task
 */

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsAdmin, requireAdminCredentials } from './support/adminAuth'

// ---------------------------------------------------------------------------
// Mock 数据 / Mock data (TSID 字段使用字符串以贴近后端真实行为)
// ---------------------------------------------------------------------------

const GROUP_ID = '200'

// 状态常量 / Status constants: 与 GroupTaskManagePage 的 labels 对齐
// 1=进行中 2=待审核 3=已完成
const STATUS_IN_PROGRESS = 1
const STATUS_PENDING_REVIEW = 2
const STATUS_COMPLETED = 3

type MockTask = {
  id: string
  task_id: string
  title: string
  description: string
  status: number
  group_id: string
  deadline: string
  creator_id: string
  created_at: string
  deleted_at: string | null
}

const MOCK_TASKS: MockTask[] = [
  {
    id: '1001',
    task_id: 'task_e2e_1001',
    title: '第一章练习题',
    description: '完成课本第一章所有习题',
    status: STATUS_IN_PROGRESS,
    group_id: GROUP_ID,
    deadline: '2099-12-31',
    creator_id: '100',
    created_at: '2026-04-01T10:00:00Z',
    deleted_at: null,
  },
  {
    id: '1002',
    task_id: 'task_e2e_1002',
    title: '期中综合作业',
    description: '完成期中所有章节综合练习',
    status: STATUS_PENDING_REVIEW,
    group_id: GROUP_ID,
    deadline: '2099-06-30',
    creator_id: '100',
    created_at: '2026-04-02T10:00:00Z',
    deleted_at: null,
  },
  {
    id: '1003',
    task_id: 'task_e2e_1003',
    title: '已完成的旧任务',
    description: '历史任务',
    status: STATUS_COMPLETED,
    group_id: GROUP_ID,
    deadline: '2026-01-01',
    creator_id: '100',
    created_at: '2026-01-01T10:00:00Z',
    deleted_at: null,
  },
]

type MockAssignment = {
  id: string
  task_id: string
  user_id: string
  status: number
  content: string
  submitted_at: string
  score: number | null
  comment: string | null
}

const MOCK_PENDING_REVIEWS: MockAssignment[] = [
  {
    id: '2001',
    task_id: 'task_e2e_1001',
    user_id: '201',
    status: 2,
    content: '我已完成第一章所有习题，请查阅',
    submitted_at: '2026-04-10T14:00:00Z',
    score: null,
    comment: null,
  },
]

type MockOptions = {
  tasks?: MockTask[]
  pendingReviews?: MockAssignment[]
  reviewShouldFail?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function payloadResponse(payload: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, msg: 'ok', payload }),
  }
}

function successResponse() {
  return payloadResponse({})
}

async function setupGroupTaskMocks(page: Page, opts: MockOptions = {}): Promise<void> {
  const tasks = opts.tasks ?? MOCK_TASKS
  const pendingReviews = opts.pendingReviews ?? MOCK_PENDING_REVIEWS

  // 任务列表 / Task list
  await page.route('**/group/task/list**', async (route: Route) => {
    const url = new URL(route.request().url())
    const statusParam = url.searchParams.get('status')
    const filtered = statusParam
      ? tasks.filter((t) => String(t.status) === statusParam)
      : tasks
    await route.fulfill(
      payloadResponse({
        items: filtered,
        page: 1,
        size: 10,
        total: filtered.length,
        total_pages: Math.max(1, Math.ceil(filtered.length / 10)),
      })
    )
  })

  // 任务详情 / Task detail
  await page.route('**/group/task/detail**', async (route: Route) => {
    const url = new URL(route.request().url())
    const taskId = url.searchParams.get('task_id') || ''
    const task = tasks.find((t) => t.id === taskId || t.task_id === taskId)
    if (task) {
      await route.fulfill(payloadResponse(task))
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 404, msg: 'not found', payload: null }),
      })
    }
  })

  // 待批改列表 / Pending reviews
  await page.route('**/group/task/pending_review**', async (route: Route) => {
    await route.fulfill(
      payloadResponse({
        items: pendingReviews,
        page: 1,
        size: 50,
        total: pendingReviews.length,
        total_pages: 1,
      })
    )
  })

  // 批改 / Review
  await page.route('**/group/task/review', async (route: Route) => {
    if (opts.reviewShouldFail) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 400, msg: '参数错误', payload: null }),
      })
      return
    }
    await route.fulfill(successResponse())
  })

  // 强制结束 / Close
  await page.route('**/group/task/close', async (route: Route) => {
    await route.fulfill(successResponse())
  })

  // 删除 / Delete
  await page.route('**/group/task/delete', async (route: Route) => {
    await route.fulfill(successResponse())
  })

  // 恢复 / Restore
  await page.route('**/group/task/restore', async (route: Route) => {
    await route.fulfill(successResponse())
  })
}

async function gotoGroupTaskPage(page: Page): Promise<void> {
  await page.goto(`/groups/${GROUP_ID}/tasks`)
  await expect(page.getByRole('heading', { name: '群任务管理' })).toBeVisible()
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

test.describe('群任务治理页 —— 列表渲染 / Task list rendering', () => {
  test('渲染任务列表并展示状态徽章 / renders tasks with status badges', async ({ page }) => {
    const credentials = requireAdminCredentials('super')
    await loginAsAdmin(page, credentials)
    await setupGroupTaskMocks(page)
    await gotoGroupTaskPage(page)

    await expect(page.getByText('第一章练习题')).toBeVisible()
    await expect(page.getByText('期中综合作业')).toBeVisible()
    await expect(page.getByText('已完成的旧任务')).toBeVisible()

    // 状态标签对齐 GroupTaskManagePage: 1=进行中 2=待审核 3=已完成
    await expect(page.getByText('进行中').first()).toBeVisible()
    await expect(page.getByText('待审核').first()).toBeVisible()
    await expect(page.getByText('已完成').first()).toBeVisible()
  })

  test('列表为空时显示「暂无数据」空态 / shows empty state when no tasks', async ({ page }) => {
    const credentials = requireAdminCredentials('super')
    await loginAsAdmin(page, credentials)
    await setupGroupTaskMocks(page, { tasks: [] })
    await gotoGroupTaskPage(page)

    await expect(page.getByText('暂无数据').first()).toBeVisible()
  })
})

test.describe('群任务治理页 —— 状态过滤 / Status filter', () => {
  test('筛选「进行中」仅显示 status=1 的任务 / filter by in-progress shows only status=1', async ({
    page,
  }) => {
    const credentials = requireAdminCredentials('super')
    await loginAsAdmin(page, credentials)
    await setupGroupTaskMocks(page)
    await gotoGroupTaskPage(page)

    await page.getByTestId('group-task-status-filter').selectOption('1')

    await expect(page.getByText('第一章练习题')).toBeVisible()
    await expect(page.getByText('期中综合作业')).toBeHidden()
    await expect(page.getByText('已完成的旧任务')).toBeHidden()
  })

  test('重置为「全部」恢复全量列表 / reset filter restores full list', async ({ page }) => {
    const credentials = requireAdminCredentials('super')
    await loginAsAdmin(page, credentials)
    await setupGroupTaskMocks(page)
    await gotoGroupTaskPage(page)

    const filter = page.getByTestId('group-task-status-filter')
    await filter.selectOption('1')
    await expect(page.getByText('期中综合作业')).toBeHidden()

    await filter.selectOption('-1')
    await expect(page.getByText('第一章练习题')).toBeVisible()
    await expect(page.getByText('期中综合作业')).toBeVisible()
  })
})

test.describe('群任务治理页 —— 详情与批改 / Detail and review', () => {
  test('点击行展示任务详情 / clicking row shows task detail', async ({ page }) => {
    const credentials = requireAdminCredentials('super')
    await loginAsAdmin(page, credentials)
    await setupGroupTaskMocks(page)
    await gotoGroupTaskPage(page)

    await page.getByRole('row', { name: /第一章练习题/ }).click()

    await expect(page.getByText('完成课本第一章所有习题')).toBeVisible()
  })

  test('待批改区显示已提交成员并可提交批改 / pending review list shows assignment and submits review', async ({
    page,
  }) => {
    const credentials = requireAdminCredentials('super')
    await loginAsAdmin(page, credentials)
    await setupGroupTaskMocks(page)
    await gotoGroupTaskPage(page)

    await page.getByRole('row', { name: /第一章练习题/ }).click()

    // 待批改内容出现
    await expect(page.getByText('我已完成第一章所有习题，请查阅')).toBeVisible()

    // 打开批改表单
    await page.getByRole('button', { name: '批改' }).first().click()

    // 填写评分与评语
    await page.getByPlaceholder('评分（0-100，可选）').fill('92')
    await page.getByPlaceholder('评语（可选）').fill('完成得很好')

    // 拦截提交并验证成功 toast
    const reviewResponsePromise = page.waitForResponse((resp) =>
      /\/group\/task\/review$/.test(new URL(resp.url()).pathname)
    )
    await page.getByRole('button', { name: '提交批改' }).click()
    await reviewResponsePromise
    await expect(page.getByText('任务批改已提交')).toBeVisible()
  })
})

test.describe('群任务治理页 —— 操作按钮 / Action buttons', () => {
  test('点击「强制结束」按钮弹出确认对话框并可取消 / force-close opens confirm dialog', async ({
    page,
  }) => {
    const credentials = requireAdminCredentials('super')
    await loginAsAdmin(page, credentials)
    await setupGroupTaskMocks(page)
    await gotoGroupTaskPage(page)

    // 第一行（第一章练习题，status=1，可关闭）的强制结束图标按钮
    const firstRow = page.getByRole('row', { name: /第一章练习题/ })
    await firstRow.getByRole('button', { name: '强制结束任务' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/强制结束任务/)).toBeVisible()

    await dialog.getByRole('button', { name: '取消' }).click()
    await expect(dialog).toBeHidden()
  })
})

test.describe('群任务治理页 —— CSV 导出 / CSV export', () => {
  test('点击「导出 CSV」触发浏览器下载 / clicking export triggers CSV download', async ({
    page,
  }) => {
    const credentials = requireAdminCredentials('super')
    await loginAsAdmin(page, credentials)
    await setupGroupTaskMocks(page)
    await gotoGroupTaskPage(page)

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      page.getByRole('button', { name: /导出 CSV/ }).click(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.csv$/)
  })
})
