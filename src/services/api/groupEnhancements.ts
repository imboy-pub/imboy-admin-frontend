// Compatibility API location kept during module migration.
// New admin callers should prefer '@/modules/groups/api'.
import client from './client'
import { ApiResponse, PaginatedResponse } from '@/types/api'
import { requireApiPayload } from './responseAdapter'

type IdLike = number | string

export interface GroupVote {
  id: IdLike
  group_id: IdLike
  vote_id: string
  title: string
  description?: string
  creator_id?: IdLike
  vote_type?: number
  is_anonymous?: boolean
  status: number
  end_at?: string | null
  created_at?: string
  total_votes?: number
}

export interface GroupVoteOption {
  id?: IdLike
  option_id: string
  option_text: string
  vote_count?: number
}

export interface GroupVoteDetail extends GroupVote {
  options?: GroupVoteOption[]
}

export interface GroupSchedule {
  id: IdLike
  schedule_id: string
  group_id: IdLike
  title: string
  description?: string
  location?: string
  creator_id?: IdLike
  start_at?: string | number
  end_at?: string | number
  status: number
  created_at?: string
}

export interface GroupScheduleParticipant {
  id?: IdLike
  user_id: IdLike
  status?: number
  nickname?: string
}

export interface GroupScheduleDetail {
  schedule: GroupSchedule
  participants: GroupScheduleParticipant[]
  participant_count: number
}

export interface GroupNotice {
  id: IdLike
  notice_id?: IdLike
  group_id: IdLike
  user_id?: IdLike
  edit_user_id?: IdLike
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
  id?: IdLike
  group_id: IdLike
  tag_name: string
  created_by?: IdLike
  created_at?: string
}

export interface GroupTagListPayload {
  items: GroupTag[]
  total: number
}

export interface GroupCategory {
  id: IdLike
  category_id?: IdLike
  category_name: string
  sort_order?: number
}

export interface GroupCategoryListParams {
  gid?: IdLike
  uid: IdLike
  page?: number
  size?: number
  keyword?: string
}

export interface GroupFile {
  id: IdLike
  group_id: IdLike
  file_id: string
  file_name?: string
  file_category?: string
  file_size?: number
  uploader_id?: IdLike
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
  id: IdLike
  group_id: IdLike
  album_id: string
  album_name?: string
  album_cover?: string
  creator_id?: IdLike
  photo_count?: number
  status?: number
  created_at?: string
  updated_at?: string
}

export interface GroupTask {
  id: IdLike
  group_id: IdLike
  task_id: string
  title: string
  description?: string
  creator_id?: IdLike
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
  id: IdLike
  task_id: string
  user_id: IdLike
  status: number
  submitted_at?: string | null
  content?: string
  attachment?: string
  score?: number
  comment?: string
  reviewed_by?: IdLike
  reviewed_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface GroupTaskPendingReviewListParams {
  page?: number
  size?: number
}

export interface GroupGovernanceLog {
  uid: IdLike
  account?: string
  nickname?: string
  action: string
  operator_uid?: IdLike
  group_id?: IdLike
  target_id?: IdLike | string
  occurred_at?: string
  created_at?: string
  extra?: Record<string, unknown>
  body?: string
}

export interface GroupGovernanceLogListParams {
  page?: number
  size?: number
  uid?: IdLike
  group_id?: IdLike
  action?: string
  target_id?: IdLike | string
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
  gid: IdLike,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupVote>>> {
  const response = await client.get('/group/vote/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupVotesPayload(
  gid: IdLike,
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
  gid: IdLike,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupSchedule>>> {
  const response = await client.get('/group/schedule/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupSchedulesPayload(
  gid: IdLike,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupSchedule>> {
  return requireApiPayload(await getGroupSchedules(gid, params), '/group/schedule/list')
}

/**
 * @deprecated Prefer `getGroupScheduleDetailPayload`.
 */
export async function getGroupScheduleDetail(scheduleId: string): Promise<ApiResponse<GroupScheduleDetail>> {
  const response = await client.get('/group/schedule/detail', {
    params: { schedule_id: scheduleId },
  })
  return response.data
}

export async function getGroupScheduleDetailPayload(scheduleId: string): Promise<GroupScheduleDetail> {
  return requireApiPayload(
    await getGroupScheduleDetail(scheduleId),
    '/group/schedule/detail'
  )
}

export async function cancelGroupSchedule(scheduleId: string): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/schedule/cancel', { schedule_id: scheduleId })
  return response.data
}

export async function restoreGroupSchedule(scheduleId: string): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/schedule/restore', { schedule_id: scheduleId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupNoticesPayload`.
 */
export async function getGroupNotices(
  gid: IdLike,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupNotice>>> {
  const response = await client.get('/group/notice/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupNoticesPayload(
  gid: IdLike,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupNotice>> {
  return requireApiPayload(await getGroupNotices(gid, params), '/group/notice/list')
}

/**
 * @deprecated Prefer `getGroupNoticeDetailPayload`.
 */
export async function getGroupNoticeDetail(noticeId: IdLike | string): Promise<ApiResponse<GroupNotice>> {
  const response = await client.get('/group/notice/detail', {
    params: { notice_id: noticeId },
  })
  return response.data
}

export async function getGroupNoticeDetailPayload(noticeId: IdLike | string): Promise<GroupNotice> {
  return requireApiPayload(await getGroupNoticeDetail(noticeId), '/group/notice/detail')
}

export async function deleteGroupNotice(noticeId: IdLike | string): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/notice/delete', { notice_id: noticeId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupTagsPayload`.
 */
export async function getGroupTags(gid: IdLike): Promise<ApiResponse<Record<string, unknown>>> {
  const response = await client.get('/group/tag/list', { params: { gid } })
  return response.data
}

export async function getGroupTagsPayload(gid: IdLike): Promise<GroupTagListPayload> {
  const payload = requireApiPayload(await getGroupTags(gid), '/group/tag/list')
  const rawItems = payload.items ?? payload.list
  const items = Array.isArray(rawItems) ? (rawItems as GroupTag[]) : []
  const totalRaw = payload.total
  const total = typeof totalRaw === 'number' ? totalRaw : items.length
  return { items, total }
}

export interface DeleteGroupTagInput {
  gid: IdLike | string
  tag_name: string
}

export async function deleteGroupTag(data: DeleteGroupTagInput): Promise<ApiResponse<Record<string, never>>> {
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
  uid: IdLike | string
  category_id: IdLike | string
  gid?: IdLike | string
}

export async function deleteGroupCategory(data: DeleteGroupCategoryInput): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/category/delete', data)
  return response.data
}

/**
 * @deprecated Prefer `getGroupFilesPayload`.
 */
export async function getGroupFiles(
  gid: IdLike,
  params: GroupFileListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupFile>>> {
  const response = await client.get('/group/file/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupFilesPayload(
  gid: IdLike,
  params: GroupFileListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupFile>> {
  return requireApiPayload(await getGroupFiles(gid, params), '/group/file/list')
}

/**
 * @deprecated Prefer `getGroupFileDetailPayload`.
 */
export async function getGroupFileDetail(fileId: IdLike | string): Promise<ApiResponse<GroupFile>> {
  const response = await client.get('/group/file/detail', {
    params: { file_id: fileId },
  })
  return response.data
}

export async function getGroupFileDetailPayload(fileId: IdLike | string): Promise<GroupFile> {
  return requireApiPayload(await getGroupFileDetail(fileId), '/group/file/detail')
}

export async function deleteGroupFile(fileId: IdLike | string): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/file/delete', { file_id: fileId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupAlbumsPayload`.
 */
export async function getGroupAlbums(
  gid: IdLike,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupAlbum>>> {
  const response = await client.get('/group/album/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupAlbumsPayload(
  gid: IdLike,
  params: GroupPaginationParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupAlbum>> {
  return requireApiPayload(await getGroupAlbums(gid, params), '/group/album/list')
}

/**
 * @deprecated Prefer `getGroupAlbumDetailPayload`.
 */
export async function getGroupAlbumDetail(albumId: IdLike | string): Promise<ApiResponse<GroupAlbum>> {
  const response = await client.get('/group/album/detail', {
    params: { album_id: albumId },
  })
  return response.data
}

export async function getGroupAlbumDetailPayload(albumId: IdLike | string): Promise<GroupAlbum> {
  return requireApiPayload(await getGroupAlbumDetail(albumId), '/group/album/detail')
}

export async function deleteGroupAlbum(albumId: IdLike | string): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/album/delete', { album_id: albumId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupTasksPayload`.
 */
export async function getGroupTasks(
  gid: IdLike,
  params: GroupTaskListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupTask>>> {
  const response = await client.get('/group/task/list', {
    params: { gid, ...params },
  })
  return response.data
}

export async function getGroupTasksPayload(
  gid: IdLike,
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

export async function deleteGroupTask(taskId: string): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/task/delete', { task_id: taskId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupTaskPendingReviewsPayload`.
 */
export async function getGroupTaskPendingReviews(
  taskId: string,
  params: GroupTaskPendingReviewListParams = { page: 1, size: 20 }
): Promise<ApiResponse<PaginatedResponse<GroupTaskAssignment>>> {
  const response = await client.get('/group/task/pending_review', {
    params: { task_id: taskId, ...params },
  })
  return response.data
}

export async function getGroupTaskPendingReviewsPayload(
  taskId: string,
  params: GroupTaskPendingReviewListParams = { page: 1, size: 20 }
): Promise<PaginatedResponse<GroupTaskAssignment>> {
  return requireApiPayload(
    await getGroupTaskPendingReviews(taskId, params),
    '/group/task/pending_review'
  )
}

export interface ReviewGroupTaskAssignmentInput {
  assignment_id: IdLike | string
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

export async function restoreGroupTask(taskId: string): Promise<ApiResponse<Record<string, never>>> {
  const response = await client.post('/group/task/restore', { task_id: taskId })
  return response.data
}

/**
 * @deprecated Prefer `getGroupGovernanceLogsPayload`.
 */
export async function getGroupGovernanceLogs(
  params: GroupGovernanceLogListParams = { page: 1, size: 10 }
): Promise<ApiResponse<PaginatedResponse<GroupGovernanceLog>>> {
  const response = await client.get('/group/governance/log/list', { params })
  return response.data
}

export async function getGroupGovernanceLogsPayload(
  params: GroupGovernanceLogListParams = { page: 1, size: 10 }
): Promise<PaginatedResponse<GroupGovernanceLog>> {
  return requireApiPayload(
    await getGroupGovernanceLogs(params),
    '/group/governance/log/list'
  )
}
