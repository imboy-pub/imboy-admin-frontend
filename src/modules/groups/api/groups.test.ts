/**
 * Unit tests for groups module API:
 *   groups/api/public — getGroupListPayload, getGroupDetailPayload, dissolveGroup, searchGroupsPayload, getGroupMembersPayload
 *   groups/api/enhancements — sampled coverage across vote, schedule, notice, task, governance log
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  getGroupListPayload,
  getGroupDetailPayload,
  dissolveGroup,
  searchGroupsPayload,
  getGroupMembersPayload,
} from './public'
import {
  getGroupVotesPayload,
  closeGroupVote,
  getGroupSchedulesPayload,
  cancelGroupSchedule,
  getGroupNoticesPayload,
  deleteGroupNotice,
  getGroupTagsPayload,
  deleteGroupTag,
  getGroupFilesPayload,
  getGroupTasksPayload,
  closeGroupTask,
  getGroupGovernanceLogsPayload,
} from './enhancements'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn; delete: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post
const originalDelete = (client as unknown as { delete?: AnyFn }).delete

afterEach(() => {
  mutableClient.get = originalGet
  mutableClient.post = originalPost
  if (originalDelete !== undefined) {
    (client as unknown as { delete: AnyFn }).delete = originalDelete
  }
})

// ---------------------------------------------------------------------------
// groups/api/public
// ---------------------------------------------------------------------------
describe('getGroupListPayload', () => {
  it('returns paginated group list from /group/list', async () => {
    mutableClient.get = async (url: string, _config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/group/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { id: '1001', title: '技术交流群', status: 1, type: 1 },
              { id: '1002', title: '产品设计群', status: 1, type: 1 },
            ],
            page: 1, size: 20, total: 2, total_pages: 1,
          },
        },
      }
    }

    const result = await getGroupListPayload({ page: 1, size: 20 })
    expect(result.items).toHaveLength(2)
    expect(result.items[0].title).toBe('技术交流群')
    expect(result.total).toBe(2)
  })
})

describe('getGroupDetailPayload', () => {
  it('sends gid as query param and returns detail', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/group/detail')
      expect(config?.params?.gid).toBe('1001')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            id: '1001',
            title: '技术交流群',
            status: 1,
            owner_uid: '8001',
          },
        },
      }
    }

    const result = await getGroupDetailPayload('1001')
    expect(result.id).toBe('1001')
    expect(result.owner_uid).toBe('8001')
  })
})

describe('dissolveGroup', () => {
  it('posts gid to /group/dissolve', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/group/dissolve')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await dissolveGroup('1001')
    expect(capturedBody.gid).toBe('1001')
  })
})

describe('searchGroupsPayload', () => {
  it('forwards keyword, page, size to /group/search', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/group/search')
      expect(config?.params?.keyword).toBe('技术')
      expect(config?.params?.page).toBe(1)
      expect(config?.params?.size).toBe(20)
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [{ id: '1001', title: '技术交流群' }],
            page: 1, size: 20, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await searchGroupsPayload('技术', 1, 20)
    expect(result.items[0].title).toBe('技术交流群')
  })
})

describe('getGroupMembersPayload', () => {
  it('returns paginated member list for gid', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/group/members')
      expect(config?.params?.gid).toBe('1001')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { uid: '8001', nickname: '群主', role: 0 },
              { uid: '8002', nickname: '成员甲', role: 2 },
            ],
            page: 1, size: 20, total: 2, total_pages: 1,
          },
        },
      }
    }

    const result = await getGroupMembersPayload('1001')
    expect(result.items).toHaveLength(2)
    expect(result.items[0].uid).toBe('8001')
  })
})

// ---------------------------------------------------------------------------
// groups/api/enhancements — votes
// ---------------------------------------------------------------------------
describe('getGroupVotesPayload', () => {
  it('returns paginated vote list for gid', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/group/vote/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [{ id: 'v-001', title: '技术选型投票', status: 1 }],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getGroupVotesPayload({ gid: '1001' })
    expect(result.items[0].title).toBe('技术选型投票')
  })
})

describe('closeGroupVote', () => {
  it('posts voteId to /group/vote/close', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/group/vote/close')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await closeGroupVote('v-001')
    expect(capturedBody.vote_id).toBe('v-001')
  })
})

// ---------------------------------------------------------------------------
// groups/api/enhancements — schedules
// ---------------------------------------------------------------------------
describe('getGroupSchedulesPayload', () => {
  it('returns paginated schedule list for gid', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/group/schedule/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [{ id: 's-001', title: 'Q1 复盘', status: 1 }],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getGroupSchedulesPayload({ gid: '1001' })
    expect(result.items[0].title).toBe('Q1 复盘')
  })
})

describe('cancelGroupSchedule', () => {
  it('posts scheduleId to /group/schedule/cancel', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/group/schedule/cancel')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await cancelGroupSchedule('s-001')
    expect(capturedBody.schedule_id).toBe('s-001')
  })
})

// ---------------------------------------------------------------------------
// groups/api/enhancements — notices
// ---------------------------------------------------------------------------
describe('getGroupNoticesPayload', () => {
  it('returns paginated notice list for gid', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/group/notice/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [{ id: 'n-001', content: '群公告内容', created_at: '2026-01-01' }],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getGroupNoticesPayload({ gid: '1001' })
    expect(result.items[0].content).toBe('群公告内容')
  })
})

describe('deleteGroupNotice', () => {
  it('posts noticeId to /group/notice/delete', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/group/notice/delete')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await deleteGroupNotice('n-001')
    expect(capturedBody.notice_id).toBe('n-001')
  })
})

// ---------------------------------------------------------------------------
// groups/api/enhancements — tags
// ---------------------------------------------------------------------------
describe('getGroupTagsPayload', () => {
  it('returns tag list for gid from payload', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/group/tag/list')
      expect(config?.params?.gid).toBe('1001')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { group_id: '1001', tag_name: '技术' },
              { group_id: '1001', tag_name: '后端' },
              { group_id: '1001', tag_name: '前端' },
            ],
            total: 3,
          },
        },
      }
    }

    const result = await getGroupTagsPayload('1001')
    expect(result.items).toHaveLength(3)
    expect(result.items[0].tag_name).toBe('技术')
    expect(result.total).toBe(3)
  })
})

describe('deleteGroupTag', () => {
  it('posts gid and tag to /group/tag/delete', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/group/tag/delete')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await deleteGroupTag({ gid: '1001', tag: '技术' })
    expect(capturedBody.gid).toBe('1001')
    expect(capturedBody.tag).toBe('技术')
  })
})

// ---------------------------------------------------------------------------
// groups/api/enhancements — files
// ---------------------------------------------------------------------------
describe('getGroupFilesPayload', () => {
  it('returns paginated file list for gid', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/group/file/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [{ id: 'f-001', name: 'report.pdf', size: 204800 }],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getGroupFilesPayload({ gid: '1001' })
    expect(result.items[0].name).toBe('report.pdf')
  })
})

// ---------------------------------------------------------------------------
// groups/api/enhancements — tasks
// ---------------------------------------------------------------------------
describe('getGroupTasksPayload', () => {
  it('returns paginated task list for gid', async () => {
    mutableClient.get = async (url: string) => {
      expect(url).toBe('/group/task/list')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [{ id: 't-001', title: '实现登录功能', status: 1 }],
            page: 1, size: 10, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getGroupTasksPayload({ gid: '1001' })
    expect(result.items[0].title).toBe('实现登录功能')
  })
})

describe('closeGroupTask', () => {
  it('posts taskId to /group/task/close', async () => {
    let capturedBody: Record<string, unknown> = {}
    mutableClient.post = async (url: string, body: Record<string, unknown>) => {
      expect(url).toBe('/group/task/close')
      capturedBody = body
      return { data: { code: 0, msg: 'ok', payload: {} } }
    }

    await closeGroupTask('t-001')
    expect(capturedBody.task_id).toBe('t-001')
  })
})

// ---------------------------------------------------------------------------
// groups/api/enhancements — governance logs
// ---------------------------------------------------------------------------
describe('getGroupGovernanceLogsPayload', () => {
  it('returns paginated governance log list for gid', async () => {
    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      expect(url).toBe('/group/governance_log/list')
      expect(config?.params?.gid).toBe('1001')
      return {
        data: {
          code: 0, msg: 'ok',
          payload: {
            items: [
              { id: 'log-001', action: 'kick_member', operator_uid: '8001', created_at: '2026-03-01' },
            ],
            page: 1, size: 20, total: 1, total_pages: 1,
          },
        },
      }
    }

    const result = await getGroupGovernanceLogsPayload({ gid: '1001' })
    expect(result.items[0].action).toBe('kick_member')
  })
})
