import { describe, expect, it, afterEach } from 'bun:test'

import client from './client'
import { safeParseBigIntJson } from '@/lib/safeParseBigIntJson'
import { requireApiPayload } from './responseAdapter'
import {
  getProjectMembersPayload,
  getProjectMilestonesPayload,
  getProjectChannelsPayload,
  getProjectAggregationsPayload,
  projectMembersQueryKey,
  projectMilestonesQueryKey,
  projectChannelsQueryKey,
  projectAggregationsQueryKey,
  isForbiddenError,
} from './workspaces'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

// 大 TSID：> Number.MAX_SAFE_INTEGER (2^53-1)，JSON number 解析必须经 safeParseBigIntJson 保 string。
// 注意：测试输入不能用 JS number 字面量构造——字面量本身就会丢精度
// （9007199254740993 → ...992），必须以 string 常量模拟「后端下发 wire 文本」的原始字节。
const BIG_TSID_STR = '9007199254740993'

function makePagedEnvelope(list: unknown[], extra: Record<string, unknown> = {}) {
  return {
    data: {
      code: 0,
      msg: 'ok',
      payload: {
        list,
        page: 1,
        size: 10,
        total: list.length,
        total_page: 1,
        ...extra,
      },
    },
  }
}

describe('workspaces admin project governance API (W2)', () => {
  afterEach(() => {
    mutableClient.get = originalGet
  })

  it('parses big TSID as string via safeParseBigIntJson and keeps EntityId roundtrip through requireApiPayload', () => {
    // 后端 normalize 后 TSID integer 下发：JSON 解析层必须保 string，禁 Number 回转
    const parsed = safeParseBigIntJson(
      `{"payload":{"list":[{"user_id":${BIG_TSID_STR}}],"page":1,"size":10,"total":1,"total_page":1}}`
    ) as { payload: { list: Array<{ user_id: unknown }> } }

    expect(parsed.payload.list[0].user_id).toBe(BIG_TSID_STR)
    expect(typeof parsed.payload.list[0].user_id).toBe('string')

    const members = requireApiPayload<{ list: Array<{ user_id: string }> }>(
      parsed as never,
      'project/members'
    )
    expect(members.list[0].user_id).toBe(BIG_TSID_STR)
  })

  it('getProjectMembersPayload passes project_id as EntityId string with page/size params', async () => {
    let capturedUrl = ''
    let capturedParams: Record<string, unknown> | undefined

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      capturedUrl = url
      capturedParams = config?.params
      return makePagedEnvelope([
        {
          project_id: BIG_TSID_STR,
          user_id: BIG_TSID_STR,
          nickname: 'alice',
          account: 'alice@imboy',
          role: 'member',
          joined_at: '2026-08-01 10:00:00',
        },
      ])
    }

    const result = await getProjectMembersPayload(BIG_TSID_STR, { page: 2, size: 10 })

    expect(capturedUrl).toBe('/project/members')
    // TSID 以 string 原样下发，未经 Number()/parseInt() 破坏精度
    expect(capturedParams?.project_id).toBe(BIG_TSID_STR)
    expect(capturedParams?.page).toBe(2)
    expect(capturedParams?.size).toBe(10)
    // 返回链路保持 EntityId string
    expect(result.items[0].user_id).toBe(BIG_TSID_STR)
    expect(typeof result.items[0].user_id).toBe('string')
  })

  it('getProjectMilestonesPayload forwards status filter and project_id as string', async () => {
    let capturedParams: Record<string, unknown> | undefined

    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      capturedParams = config?.params
      return makePagedEnvelope([
        { id: BIG_TSID_STR, project_id: BIG_TSID_STR, name: 'M1', status: 'planned' },
      ])
    }

    const result = await getProjectMilestonesPayload(BIG_TSID_STR, {
      status: 'reached',
      page: 1,
      size: 10,
    })

    expect(capturedParams?.project_id).toBe(BIG_TSID_STR)
    expect(capturedParams?.status).toBe('reached')
    expect(result.items[0].id).toBe(BIG_TSID_STR)
  })

  it('getProjectChannelsPayload requests /project/channels with EntityId project_id', async () => {
    let capturedUrl = ''
    let capturedParams: Record<string, unknown> | undefined

    mutableClient.get = async (url: string, config?: { params?: Record<string, unknown> }) => {
      capturedUrl = url
      capturedParams = config?.params
      return makePagedEnvelope([{ id: BIG_TSID_STR, name: 'chan-1', subscriber_count: 3 }])
    }

    const result = await getProjectChannelsPayload(BIG_TSID_STR, { page: 1, size: 10 })

    expect(capturedUrl).toBe('/project/channels')
    expect(capturedParams?.project_id).toBe(BIG_TSID_STR)
    expect(result.items[0].id).toBe(BIG_TSID_STR)
  })

  it('getProjectAggregationsPayload forwards aggregation type param with EntityId project_id', async () => {
    const capturedTypes: Array<string | undefined> = []

    mutableClient.get = async (_url: string, config?: { params?: Record<string, unknown> }) => {
      capturedTypes.push(config?.params?.type as string)
      return makePagedEnvelope([{ id: BIG_TSID_STR, type: 'pinned' }])
    }

    await getProjectAggregationsPayload(BIG_TSID_STR, { type: 'pinned', page: 1, size: 10 })
    await getProjectAggregationsPayload(BIG_TSID_STR, { type: 'resources', page: 1, size: 10 })
    await getProjectAggregationsPayload(BIG_TSID_STR, { type: 'activity', page: 1, size: 10 })
    await getProjectAggregationsPayload(BIG_TSID_STR, { type: 'related_posts', page: 1, size: 10 })

    expect(capturedTypes).toEqual(['pinned', 'resources', 'activity', 'related_posts'])
  })

  it('normalizes backend {list,total_page} envelope into items/total_pages via requireApiPayload', async () => {
    mutableClient.get = async () =>
      makePagedEnvelope([{ user_id: BIG_TSID_STR }], { total: 25, total_page: 3 })

    const result = await getProjectMembersPayload(BIG_TSID_STR, { page: 1, size: 10 })

    expect(result.items).toHaveLength(1)
    expect(result.total_pages).toBe(3)
  })

  it('builds distinct query keys per governance resource and filter params', () => {
    expect(projectMembersQueryKey(BIG_TSID_STR, { page: 1, size: 10 })).toEqual([
      'workspaces',
      'projects',
      'members',
      BIG_TSID_STR,
      { page: 1, size: 10 },
    ])
    expect(projectMilestonesQueryKey(BIG_TSID_STR, { status: 'reached' })).toEqual([
      'workspaces',
      'projects',
      'milestones',
      BIG_TSID_STR,
      { status: 'reached' },
    ])
    expect(projectChannelsQueryKey(BIG_TSID_STR)).toEqual([
      'workspaces',
      'projects',
      'channels',
      BIG_TSID_STR,
    ])
    expect(projectAggregationsQueryKey(BIG_TSID_STR, { type: 'activity' })).toEqual([
      'workspaces',
      'projects',
      'aggregations',
      BIG_TSID_STR,
      { type: 'activity' },
    ])
  })

  it('isForbiddenError detects 403 ApiError from client interceptor shape', () => {
    expect(isForbiddenError({ code: 403, msg: '您无权访问此资源' })).toBe(true)
    expect(isForbiddenError({ code: 401, msg: 'unauthorized' })).toBe(false)
    expect(isForbiddenError({ code: -1, msg: '网络错误' })).toBe(false)
    expect(isForbiddenError(new Error('network'))).toBe(false)
    expect(isForbiddenError(null)).toBe(false)
    expect(isForbiddenError(undefined)).toBe(false)
    expect(isForbiddenError('403')).toBe(false)
  })
})
