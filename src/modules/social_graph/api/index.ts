// Stable admin social graph API boundary for user tag and collect governance.
// Keep legacy implementations in '@/services/api/users' during the migration.
export type {
  UserCollectItem,
  UserCollectListParams,
  UserTagItem,
  UserTagListParams,
} from '@/services/api/users'

export {
  deleteUserTag,
  getUserCollectList,
  getUserCollectListPayload,
  getUserTagList,
  getUserTagListPayload,
  removeUserCollect,
} from '@/services/api/users'
