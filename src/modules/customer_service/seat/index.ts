/**
 * SEAT-01：Web 坐席域公共出口（认证/上下文/API client/SSE/QR 登录）。
 *
 * 域隔离约定（SEAT-01-A01）：
 * - 本模块是独立 JWT fetch 域，绝不 import Admin axios client / authStore；
 * - 只调 `/api/v1/cs/*` 与 QR 登录合同路径；`credentials: 'omit'`；
 * - access JWT 只存模块内存 vault（seatTokenVault），不落任何持久层。
 *
 * 路由挂载（SEAT-03 的 A0 租约）：本模块只导出
 * SEAT_WORKSPACE_ROUTE 常量与认证面组件所需的状态/动作，
 * 不改 App.tsx / sidebar / 共享 Router wiring。
 */
export {
  SEAT_CAPABILITIES,
  type SeatCapability,
  type SeatContext,
  type SeatContextsResult,
  type SeatSessionEndReason,
  type SeatWorkspaceRef,
  type EntityId,
} from './types'
export { isRecord, nonEmptyString, parseSeatJson, toEntityId } from './tsid'
export {
  classifySeatError,
  isSeatApiError,
  seatInvalidResponse,
  seatNetworkError,
  SeatApiError,
  type SeatErrorKind,
} from './errors'
export {
  QR_SESSION_TOKEN_QUERY_PATHS,
  redactSeatUrl,
  SEAT_API_BASE,
  SeatApiClient,
  assertSeatApiPath,
  assertSeatQueryContract,
  type SeatFetchLike,
} from './seatApiClient'
export {
  establishSeatSession,
  SeatTokenVault,
  seatTokenVault,
  useSeatAuthStore,
  type SeatAuthState,
  type SeatAuthStatus,
} from './seatAuthStore'
export { SeatAuthGuard } from './seatAuthGuard'
export { fetchSeatContexts, selectActiveSeatContexts, toSeatContexts } from './seatContexts'
export {
  createSeatSseParser,
  parseSeatSseBlock,
  parseSeatSseEnvelope,
  SEAT_SSE_EVENT_TYPES,
  SEAT_SSE_REASONS,
  SEAT_SSE_RESOURCE_TYPES,
  SeatSseEventIdDeduper,
  type SeatSseEnvelope,
  type SeatSseEventType,
  type SeatSseReason,
  type SeatSseResourceType,
} from './seatSseProtocol'
export {
  SEAT_EVENTS_PATH_TEMPLATE,
  SeatEventStream,
  type SeatEventStreamEndReason,
  type SeatEventStreamStatus,
} from './seatSseClient'
export {
  QR_LOGIN_CREATE_PATH,
  QR_LOGIN_POLL_INTERVAL_MS,
  QR_LOGIN_STATUS_PATH,
  QR_LOGIN_SUBSCRIBE_PATH,
  QrLoginSession,
  toQrStatusFrame,
  type QrLoginCallbacks,
  type QrLoginCreated,
  type QrLoginDevice,
  type QrLoginEndReason,
  type QrLoginPhase,
} from './qrLoginSession'

// ---------------------------------------------------------------------------
// SEAT-02：坐席工作台（合同层 / API / hooks / UI）
// ---------------------------------------------------------------------------
export {
  SEAT_ASSET_CONTENT_PATH_TEMPLATE,
  SEAT_ATTACHMENT_PHASES,
  SEAT_SESSION_STATUSES,
  buildConversationMessagesPath,
  buildSeatQueuePath,
  buildSeatSessionActionPath,
  buildSeatSessionDetailPath,
  buildSeatSessionsPath,
  buildTransferTargetsPath,
  seatAssetContentPath,
  toSeatMessage,
  toSeatMessageList,
  toSeatSessionDetail,
  toSeatSessionPage,
  toSeatSessionSummary,
  toSeatAttachmentPhase,
  toTransferTargetList,
  type SeatAttachment,
  type SeatAttachmentPhase,
  type SeatMessage,
  type SeatSessionCounts,
  type SeatSessionDetail,
  type SeatSessionPage,
  type SeatSessionStatus,
  type SeatSessionSummary,
  type SeatTransferTarget,
  type SeatTransferTargetPage,
} from './workbench/contract'
export {
  SEAT_MESSAGE_PAGE_LIMIT,
  SEAT_SESSION_PAGE_LIMIT,
  SeatWorkbenchApi,
  type SeatPageQuery,
} from './workbench/workbenchApi'
export { getOrCreateSeatDeviceId, resetSeatDeviceIdForTest } from './workbench/deviceIdentity'
export { SeatWorkspacePage } from './workbench/SeatWorkspacePage'

/** SEAT-03 wiring 参考常量（本卡不改 Router）。 */
export const SEAT_WORKSPACE_ROUTE = '/customer-service/workspace'
