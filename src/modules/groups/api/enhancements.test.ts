/**
 * Unit tests for groups/api/enhancements.ts — detail, delete, and misc functions
 * not covered by groups.test.ts:
 *   vote:     getGroupVoteDetailPayload
 *   schedule: getGroupScheduleDetailPayload, restoreGroupSchedule
 *   notice:   getGroupNoticeDetailPayload
 *   category: getGroupCategoriesPayload, deleteGroupCategory
 *   file:     getGroupFileDetailPayload, deleteGroupFile
 *   album:    getGroupAlbumsPayload, getGroupAlbumDetailPayload, deleteGroupAlbum
 *   task:     getGroupTaskDetailPayload, deleteGroupTask,
 *             getGroupTaskPendingReviewsPayload, reviewGroupTaskAssignment, restoreGroupTask
 */
import { afterEach, describe, expect, it } from 'bun:test'
import client from '@/services/api/client'
import {
  getGroupVoteDetailPayload,
  getGroupScheduleDetailPayload,
  restoreGroupSchedule,
  getGroupNoticeDetailPayload,
  getGroupCategoriesPayload,
  deleteGroupCategory,
  getGroupFileDetailPayload,
  deleteGroupFile,
  getGroupAlbumsPayload,
  getGroupAlbumDetailPayload,
  deleteGroupAlbum,
  getGroupTaskDetailPayload,
  deleteGroupTask,
  getGroupTaskPendingReviewsPayload,
  reviewGroupTaskAssignment,
  restoreGroupTask,
} from './enhancements'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn; post: AnyFn }
const mutableClient = client as unknown as MutableClient
const origGet = mutableClient.get
const origPost = mutableClient.post

afterEach(() => {
  mutableClient.get = origGet
  mutableClient.post = origPost
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResponse(payload: unknown) {
  return { data: { code: 0, msg: 'ok', payload } }
}

function errorResponse() {
  return { data: { code: 1, msg: 'error' } }
}

function paginatedPayload<T>(items: T[]) {
  return { items, page: 1, size: 10, total: items.length, total_pages: 1 }
}

// ---------------------------------------------------------------------------
// Vote
// ---------------------------------------------------------------------------

describe('getGroupVoteDetailPayload', () => {
  it('resolves with vote detail on success', async () => {
    const detail = { id: '1', group_id: '10', vote_id: 'v1', title: 'Poll', status: 1 }
    mutableClient.get = async () => okResponse(detail)
    const result = await getGroupVoteDetailPayload('v1')
    expect(result.vote_id).toBe('v1')
    expect(result.title).toBe('Poll')
  })

  it('sends vote_id as query param', async () => {
    let capturedParams: unknown
    mutableClient.get = async (_url: unknown, config: unknown) => {
      capturedParams = (config as { params: unknown }).params
      return okResponse({ id: '1', group_id: '10', vote_id: 'v99', title: 'X', status: 1 })
    }
    await getGroupVoteDetailPayload('v99')
    expect((capturedParams as { vote_id: string }).vote_id).toBe('v99')
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => errorResponse()
    await expect(getGroupVoteDetailPayload('v1')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

describe('getGroupScheduleDetailPayload', () => {
  it('resolves with schedule detail on success', async () => {
    const detail = { schedule: { id: '1', group_id: '10', schedule_id: 's1', title: 'Meeting', status: 1 }, participants: [], participant_count: 0 }
    mutableClient.get = async () => okResponse(detail)
    const result = await getGroupScheduleDetailPayload('s1')
    expect(result.schedule.schedule_id).toBe('s1')
    expect(result.participant_count).toBe(0)
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => errorResponse()
    await expect(getGroupScheduleDetailPayload('s1')).rejects.toThrow()
  })
})

describe('restoreGroupSchedule', () => {
  it('resolves with response data on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await restoreGroupSchedule('s1')
    expect(result.code).toBe(0)
  })

  it('sends schedule_id in body', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await restoreGroupSchedule('sched-42')
    expect((capturedBody as { schedule_id: string }).schedule_id).toBe('sched-42')
  })
})

// ---------------------------------------------------------------------------
// Notice
// ---------------------------------------------------------------------------

describe('getGroupNoticeDetailPayload', () => {
  it('resolves with notice on success', async () => {
    const notice = { id: '1', group_id: '10', notice_id: 'n1', title: 'Announcement', body: 'Hello' }
    mutableClient.get = async () => okResponse(notice)
    const result = await getGroupNoticeDetailPayload('n1')
    expect(result.notice_id).toBe('n1')
    expect(result.title).toBe('Announcement')
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => errorResponse()
    await expect(getGroupNoticeDetailPayload('n1')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

describe('getGroupCategoriesPayload', () => {
  it('resolves with paginated categories on success', async () => {
    const items = [{ id: '1', category_name: 'Tech' }]
    mutableClient.get = async () => okResponse(paginatedPayload(items))
    const result = await getGroupCategoriesPayload({ uid: '100' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].category_name).toBe('Tech')
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => errorResponse()
    await expect(getGroupCategoriesPayload({ uid: '1' })).rejects.toThrow()
  })
})

describe('deleteGroupCategory', () => {
  it('resolves with response data on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await deleteGroupCategory({ uid: '1', category_id: '100' })
    expect(result.code).toBe(0)
  })

  it('sends category_id in body', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await deleteGroupCategory({ uid: '5', category_id: 'cat-7' })
    expect((capturedBody as { category_id: string }).category_id).toBe('cat-7')
    expect((capturedBody as { uid: string }).uid).toBe('5')
  })
})

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

describe('getGroupFileDetailPayload', () => {
  it('resolves with file on success', async () => {
    const file = { id: '1', group_id: '10', file_id: 'f1', file_name: 'report.pdf', status: 1 }
    mutableClient.get = async () => okResponse(file)
    const result = await getGroupFileDetailPayload('f1')
    expect(result.file_id).toBe('f1')
    expect(result.file_name).toBe('report.pdf')
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => errorResponse()
    await expect(getGroupFileDetailPayload('f1')).rejects.toThrow()
  })
})

describe('deleteGroupFile', () => {
  it('resolves with response data on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await deleteGroupFile('f1')
    expect(result.code).toBe(0)
  })

  it('sends file_id in body', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await deleteGroupFile('file-99')
    expect((capturedBody as { file_id: string }).file_id).toBe('file-99')
  })
})

// ---------------------------------------------------------------------------
// Album
// ---------------------------------------------------------------------------

describe('getGroupAlbumsPayload', () => {
  it('resolves with paginated albums on success', async () => {
    const items = [{ id: '1', group_id: '10', album_id: 'a1', album_name: 'Summer' }]
    mutableClient.get = async () => okResponse(paginatedPayload(items))
    const result = await getGroupAlbumsPayload('gid-1')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].album_name).toBe('Summer')
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => errorResponse()
    await expect(getGroupAlbumsPayload('gid-1')).rejects.toThrow()
  })
})

describe('getGroupAlbumDetailPayload', () => {
  it('resolves with album detail on success', async () => {
    const album = { id: '1', group_id: '10', album_id: 'a1', album_name: 'Winter', photo_count: 5 }
    mutableClient.get = async () => okResponse(album)
    const result = await getGroupAlbumDetailPayload('a1')
    expect(result.album_id).toBe('a1')
    expect(result.photo_count).toBe(5)
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => errorResponse()
    await expect(getGroupAlbumDetailPayload('a1')).rejects.toThrow()
  })
})

describe('deleteGroupAlbum', () => {
  it('resolves with response data on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await deleteGroupAlbum('a1')
    expect(result.code).toBe(0)
  })

  it('sends album_id in body', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await deleteGroupAlbum('album-42')
    expect((capturedBody as { album_id: string }).album_id).toBe('album-42')
  })
})

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

describe('getGroupTaskDetailPayload', () => {
  it('resolves with task detail on success', async () => {
    const task = { id: '1', group_id: '10', task_id: 't1', title: 'Build', status: 0 }
    mutableClient.get = async () => okResponse(task)
    const result = await getGroupTaskDetailPayload('t1')
    expect(result.task_id).toBe('t1')
    expect(result.title).toBe('Build')
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => errorResponse()
    await expect(getGroupTaskDetailPayload('t1')).rejects.toThrow()
  })
})

describe('deleteGroupTask', () => {
  it('resolves with response data on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await deleteGroupTask('t1')
    expect(result.code).toBe(0)
  })

  it('sends task_id in body', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await deleteGroupTask('task-77')
    expect((capturedBody as { task_id: string }).task_id).toBe('task-77')
  })
})

describe('getGroupTaskPendingReviewsPayload', () => {
  it('resolves with paginated assignments on success', async () => {
    const items = [{ id: '1', task_id: 't1', user_id: '100', status: 0 }]
    mutableClient.get = async () => okResponse(paginatedPayload(items))
    const result = await getGroupTaskPendingReviewsPayload('t1')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].task_id).toBe('t1')
  })

  it('sends task_id and pagination params', async () => {
    let capturedParams: unknown
    mutableClient.get = async (_url: unknown, config: unknown) => {
      capturedParams = (config as { params: unknown }).params
      return okResponse(paginatedPayload([]))
    }
    await getGroupTaskPendingReviewsPayload('task-5', { page: 2, size: 20 })
    expect((capturedParams as { task_id: string; page: number }).task_id).toBe('task-5')
    expect((capturedParams as { page: number }).page).toBe(2)
  })

  it('throws on API error', async () => {
    mutableClient.get = async () => errorResponse()
    await expect(getGroupTaskPendingReviewsPayload('t1')).rejects.toThrow()
  })
})

describe('reviewGroupTaskAssignment', () => {
  it('resolves with response data on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await reviewGroupTaskAssignment({ assignment_id: 'a1', score: 90, comment: 'Great' })
    expect(result.code).toBe(0)
  })

  it('sends assignment_id, score, and comment in body', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await reviewGroupTaskAssignment({ assignment_id: 'assign-1', score: 85, comment: 'Good work' })
    const b = capturedBody as { assignment_id: string; score: number; comment: string }
    expect(b.assignment_id).toBe('assign-1')
    expect(b.score).toBe(85)
    expect(b.comment).toBe('Good work')
  })
})

describe('restoreGroupTask', () => {
  it('resolves with response data on success', async () => {
    mutableClient.post = async () => ({ data: { code: 0, msg: 'ok' } })
    const result = await restoreGroupTask('t1')
    expect(result.code).toBe(0)
  })

  it('sends task_id in body', async () => {
    let capturedBody: unknown
    mutableClient.post = async (_url: unknown, body: unknown) => {
      capturedBody = body
      return { data: { code: 0, msg: 'ok' } }
    }
    await restoreGroupTask('task-restore-9')
    expect((capturedBody as { task_id: string }).task_id).toBe('task-restore-9')
  })
})
