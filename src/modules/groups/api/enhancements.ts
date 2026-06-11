import client from '@/services/api/client'
import { requireApiPayload } from '@/services/api/responseAdapter'
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import type { EntityId } from '@/types/common'

export interface GroupVote {
  id: EntityId
  group_id: EntityId
  vote_id: string
  title: string
  description?: string
  creator_id?: EntityId
  vote_type?: number
  is_anonymous?: boolean
  status: number
  end_at?: string | null
  created_at?: string
  total_votes?: number
}

export interface GroupVoteOption {
  id?: EntityId
  option_id: string
  option_text: string
  vote_count?: number
}

export interface GroupVoteDetail extends GroupVote {
  options?: GroupVoteOption[]
}

export interface GroupSchedule {
  id: EntityId
  schedule_id: string
  group_id: EntityId
  title: string
  description?: string
  location?: string
  creator_id?: EntityId
  start_at?: string | number
  end_at?: string | number
  status: number
  created_at?: string
}

export interface GroupScheduleParticipant {
  id?: EntityId
  user_id: EntityId
  status?: number
  nickname?: string
}

export interface GroupScheduleDetail {
  schedule: GroupSchedule
  participants: GroupScheduleParticipant[]
  participant_count: number
}

export interface GroupNotice {
  id: EntityId
  notice_id?: EntityId
  group_id: EntityId
  user_id?: EntityId
  edit_user_id?: EntityId
  title?: string
  body?: string
  status?: number
  pinned?: boolean
  read_count?: number
  expired_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface GroupTag {
  id?: EntityId
  group_id: EntityId
  tag_name: string
  created_by?: EntityId
  created_at?: string
}

export interface GroupTagListPayload {
  items: GroupTag[]
  total: number
}

export interface GroupCategory {
  id: EntityId
  category_id?: EntityId
  category_name: string
  sort_order?: number
}

export interface GroupCategoryListParams {
  gid?: EntityId
  uid: EntityId
  page?: number
  size?: number
  keyword?: string
}

export interface GroupFile {
  id: EntityId
  group_id: EntityId
  file_id: string
  file_name?: string
  file_category?: string
  file_size?: number
  uploader_id?: EntityId
  download_count?: number
  status?: number
  created_at?: string
  updated_at?: string
}

export interface GroupFileListParams {
  page?: number
  size?: number
  category?: string
  keyword?: string
}

export interface GroupAlbum {
  id: EntityId
  group_id: EntityId
  album_id: string
  album_name?: string
  album_cover?: string
  creator_id?: EntityId
  photo_count?: number
  status?: number
  created_at?: string
  updated_at?: string
}

export interface GroupTask {
  id: EntityId
  group_id: EntityId
  task_id: string
  title: string
  description?: string
  creator_id?: EntityId
  deadline?: string | null
  status: number
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface GroupTaskListParams {
  page?: number
  size?: number
  status?: number
  deleted?: number
}

export interface GroupTaskAssignment {
  id: EntityId
  task_id: string
  user_id: EntityId
  status: number
  submitted_at?: string | null
  content?: string
  attachment?: string
  score?: number
  comment?: string
  reviewed_by?: EntityId
  reviewed_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface GroupTaskPendingReviewListParams {
  page?: number
  size?: number
}

export interface GroupGovernanceLog {
  uid: EntityId
  account?: string
  nickname?: string
  action: string
  operator_uid?: EntityId
  group_id?: EntityId
  target_id?: EntityId | string
  occurred_at?: string
  created_at?: string
  extra?: Record<string, unknown>
  body?: string
}

export interface GroupGovernanceLogListParams {
  page?: number
  size?: number
  uid?: EntityId
  group_id?: EntityId
  action?: string
  target_id?: EntityId | string
  keyword?: string
  from_ts?: string | number
  to_ts?: string | number
}

export interface GroupPaginationParams {
  page?: number
  size?: number
}

/**
 * @deprecated Prefer `getGroupVotesPayload`.
 */
export async function getGroupVotes(
  gid: EntityId,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupVote>>> {
  const response = await client.get('/group/vote/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupVotesPayload(
  gid: EntityId,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupVote>> {
  return requireApiPayload(await getGroupVotes(gid, params), '/group/vote/list')
}

/**
 * @deprecated Prefer `getGroupVoteDetailPayload`.
 */
export async function getGroupVoteDetail(voteId: string): Promise<ApiResponse<GroupVoteDetail>> {
  const response = await client.get('/group/vote/detail', { params: { vote_id: voteId } })
  return response.data
}

export async function getGroupVoteDetailPayload(voteId: string): Promise<GroupVoteDetail> {
  return requireApiPayload(await getGroupVoteDetail(voteId), '/group/vote/detail')
}

export async function closeGroupVote(voteId: string): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/vote/close', { vote_id: voteId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupSchedulesPayload`.
 */
export async function getGroupSchedules(
  gid: EntityId,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupSchedule>>> {
  const response = await client.get('/group/schedule/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupSchedulesPayload(
  gid: EntityId,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupSchedule>> {
  return requireApiPayload(await getGroupSchedules(gid, params), '/group/schedule/list')
}

/**
 * @deprecated Prefer `getGroupScheduleDetailPayload`.
 */
export async function getGroupScheduleDetail(
  scheduleId: string
): Promise<ApiResponse<GroupScheduleDetail>> {
  const response = await client.get('/group/schedule/detail', {
    params: { schedule_id: scheduleId },
  })
  return response.data
}

export async function getGroupScheduleDetailPayload(
  scheduleId: string
): Promise<GroupScheduleDetail> {
  return requireApiPayload(
    await getGroupScheduleDetail(scheduleId),
    '/group/schedule/detail'
  )
}

export async function cancelGroupSchedule(
  scheduleId: string
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/schedule/cancel', { schedule_id: scheduleId })
  return response.data
}

export async function restoreGroupSchedule(
  scheduleId: string
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/schedule/restore', { schedule_id: scheduleId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupNoticesPayload`.
 */
export async function getGroupNotices(
  gid: EntityId,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupNotice>>> {
  const response = await client.get('/group/notice/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupNoticesPayload(
  gid: EntityId,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupNotice>> {
  return requireApiPayload(await getGroupNotices(gid, params), '/group/notice/list')
}

/**
 * @deprecated Prefer `getGroupNoticeDetailPayload`.
 */
export async function getGroupNoticeDetail(
  noticeId: EntityId | string
): Promise<ApiResponse<GroupNotice>> {
  const response = await client.get('/group/notice/detail', {
    params: { notice_id: noticeId },
  })
  return response.data
}

export async function getGroupNoticeDetailPayload(
  noticeId: EntityId | string
): Promise<GroupNotice> {
  return requireApiPayload(await getGroupNoticeDetail(noticeId), '/group/notice/detail')
}

export async function deleteGroupNotice(
  noticeId: EntityId | string
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/notice/delete', { notice_id: noticeId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupTagsPayload`.
 */
export async function getGroupTags(
  gid: EntityId,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<ApiResponse<Record<string, unknown>>> {
  const response = await client.get('/group/tag/list', { params: { gid, ...params } })
  return response.data
}

export async function getGroupTagsPayload(
  gid: EntityId,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<GroupTagListPayload> {
  const payload = requireApiPayload(await getGroupTags(gid, params), '/group/tag/list')
  const rawItems = payload.items ?? payload.list
  const items = Array.isArray(rawItems) ? (rawItems as GroupTag[]) : []
  const totalRaw = payload.total
  const total = typeof totalRaw === 'number' ? totalRaw : items.length
  return { items, total }
}

export interface DeleteGroupTagInput {
  gid: EntityId | string
  tag_name: string
}

export async function deleteGroupTag(
  data: DeleteGroupTagInput
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/tag/delete', data)
  return response.data
}

/**
 * @deprecated Prefer `getGroupCategoriesPayload`.
 */
export async function getGroupCategories(
  params: GroupCategoryListParams
): Promise<ApiResponse<PaginatedResponse<GroupCategory>>> {
  const response = await client.get('/group/category/list', { params })
  return response.data
}

export async function getGroupCategoriesPayload(
  params: GroupCategoryListParams
): Promise<PaginatedResponse<GroupCategory>> {
  return requireApiPayload(await getGroupCategories(params), '/group/category/list')
}

export interface DeleteGroupCategoryInput {
  uid: EntityId | string
  category_id: EntityId | string
  gid?: EntityId | string
}

export async function deleteGroupCategory(
  data: DeleteGroupCategoryInput
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/category/delete', data)
  return response.data
}

/**
 * @deprecated Prefer `getGroupFilesPayload`.
 */
export async function getGroupFiles(
  gid: EntityId,
  params: GroupFileListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupFile>>> {
  const response = await client.get('/group/file/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupFilesPayload(
  gid: EntityId,
  params: GroupFileListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupFile>> {
  return requireApiPayload(await getGroupFiles(gid, params), '/group/file/list')
}

/**
 * @deprecated Prefer `getGroupFileDetailPayload`.
 */
export async function getGroupFileDetail(fileId: EntityId | string): Promise<ApiResponse<GroupFile>> {
  const response = await client.get('/group/file/detail', {
    params: { file_id: fileId },
  })
  return response.data
}

export async function getGroupFileDetailPayload(fileId: EntityId | string): Promise<GroupFile> {
  return requireApiPayload(await getGroupFileDetail(fileId), '/group/file/detail')
}

export async function deleteGroupFile(
  fileId: EntityId | string
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/file/delete', { file_id: fileId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupAlbumsPayload`.
 */
export async function getGroupAlbums(
  gid: EntityId,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupAlbum>>> {
  const response = await client.get('/group/album/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupAlbumsPayload(
  gid: EntityId,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupAlbum>> {
  return requireApiPayload(await getGroupAlbums(gid, params), '/group/album/list')
}

/**
 * @deprecated Prefer `getGroupAlbumDetailPayload`.
 */
export async function getGroupAlbumDetail(
  albumId: EntityId | string
): Promise<ApiResponse<GroupAlbum>> {
  const response = await client.get('/group/album/detail', {
    params: { album_id: albumId },
  })
  return response.data
}

export async function getGroupAlbumDetailPayload(
  albumId: EntityId | string
): Promise<GroupAlbum> {
  return requireApiPayload(await getGroupAlbumDetail(albumId), '/group/album/detail')
}

export async function deleteGroupAlbum(
  albumId: EntityId | string
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/album/delete', { album_id: albumId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupTasksPayload`.
 */
export async function getGroupTasks(
  gid: EntityId,
  params: GroupTaskListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupTask>>> {
  const response = await client.get('/group/task/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupTasksPayload(
  gid: EntityId,
  params: GroupTaskListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupTask>> {
  return requireApiPayload(await getGroupTasks(gid, params), '/group/task/list')
}

/**
 * @deprecated Prefer `getGroupTaskDetailPayload`.
 */
export async function getGroupTaskDetail(taskId: string): Promise<ApiResponse<GroupTask>> {
  const response = await client.get('/group/task/detail', {
    params: { task_id: taskId },
  })
  return response.data
}

export async function getGroupTaskDetailPayload(taskId: string): Promise<GroupTask> {
  return requireApiPayload(await getGroupTaskDetail(taskId), '/group/task/detail')
}

export async function deleteGroupTask(
  taskId: string
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/task/delete', { task_id: taskId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupTaskPendingReviewsPayload`.
 */
export async function getGroupTaskPendingReviews(
  taskId: string,
  params: GroupTaskPendingReviewListParams = { page: 1, size: DEFAULT_PAGE_SIZE }
): Promise<ApiResponse<PaginatedResponse<GroupTaskAssignment>>> {
  const response = await client.get('/group/task/pending_review', {
    params: { task_id: taskId, ...params },
  })
  return response.data
}

export async function getGroupTaskPendingReviewsPayload(
  taskId: string,
  params: GroupTaskPendingReviewListParams = { page: 1, size: DEFAULT_PAGE_SIZE }
): Promise<PaginatedResponse<GroupTaskAssignment>> {
  return requireApiPayload(
    await getGroupTaskPendingReviews(taskId, params),
    '/group/task/pending_review'
  )
}

export interface ReviewGroupTaskAssignmentInput {
  assignment_id: EntityId | string
  score?: number
  comment?: string
}

export async function reviewGroupTaskAssignment(
  data: ReviewGroupTaskAssignmentInput
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/task/review', data)
  return response.data
}

export async function closeGroupTask(taskId: string): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/task/close', { task_id: taskId })
  return response.data
}

export async function restoreGroupTask(
  taskId: string
): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/task/restore', { task_id: taskId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupGovernanceLogsPayload`.
 */
export async function getGroupGovernanceLogs(
  params: GroupGovernanceLogListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupGovernanceLog>>> {
  const response = await client.get('/group/governance_log/list', { params })
  return response.data
}

export async function getGroupGovernanceLogsPayload(
  params: GroupGovernanceLogListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupGovernanceLog>> {
  return requireApiPayload(
    await getGroupGovernanceLogs(params),
    '/group/governance_log/list'
  )
}
