/**
 * SEAT-02：坐席工作台合同层单测（wire 投影 / 路径构造 / 不变量）。
 *
 * 覆盖：
 * - seat_session_view / detail / 消息 / 转接目标投影（TSID string 收敛、
 *   fail-closed、未知键丢弃——包括存储侧键，A03 防泄漏的第一道闸）；
 * - 服务端计数 total_by_status 合同（禁本地推断）；
 * - 路径构造全部落在 Seat 域；附件内容路径唯一来源是真实 enterprise
 *   content 端点（CS-WEB-01；无 object key / upload URL / JWT，A03）。
 */
import { describe, expect, it } from 'bun:test'
import {
  SEAT_ASSET_CONTENT_PATH_TEMPLATE,
  buildAssetConfirmPath,
  buildAssetPresignPath,
  buildConversationMessagesPath,
  buildConversationSendPath,
  buildSeatQueuePath,
  buildSeatSessionActionPath,
  buildSeatSessionDetailPath,
  buildSeatSessionsPath,
  buildTransferTargetsPath,
  seatAssetContentPath,
  toSeatAttachmentPhase,
  toSeatMessage,
  toSeatMessageList,
  toSeatPresignResult,
  toSeatCustomerContext,
  toSeatSessionDetail,
  toSeatSessionPage,
  toSeatSessionSummary,
  toTransferTargetList,
  buildSeatSessionContextPath,
} from './contract'

const ORG = '2000000000000000002'
const WS = '3000000000000000003'
const SESSION = '72057594037927937'
const CONV = '5000000000000000005'
/** 超过 Number.MAX_SAFE_INTEGER 的 TSID 字面量（精度保护合同）。 */
const HUGE_TSID = '9223372036854775807'

const SESSION_ROW = {
  id: SESSION,
  organization_id: ORG,
  workspace_id: WS,
  contact_id: '4000000000000000004',
  conversation_id: CONV,
  business_identity_id: '6000000000000000006',
  status: 'queued',
  version: 3,
  queued_at: '2026-09-20T05:14:47Z',
  claimed_at: null,
  closed_at: null,
  source: 'widget',
  contact: { masked_name: '王***', display_name: ' ignored ' },
  last_message: { id: '7000000000000000007', preview: '你好', at: '2026-09-20T05:14:40Z' },
  // 存储侧键：投影必须丢弃（A03：object key 永不出站）。
  storage_bucket: 'should-not-leak',
  upload_url: 'should-not-leak',
}

describe('seat_session_view 投影', () => {
  it('白名单投影：TSID 全 string、计数与掩码名保留、存储侧键不出现', () => {
    const view = toSeatSessionSummary(SESSION_ROW)
    expect(view).not.toBeNull()
    expect(view?.id).toBe(SESSION)
    expect(view?.organizationId).toBe(ORG)
    expect(view?.status).toBe('queued')
    expect(view?.version).toBe(3)
    expect(view?.contactMaskedName).toBe('王***')
    expect(view?.lastMessage.preview).toBe('你好')
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain('should-not-leak')
    expect(serialized).not.toContain('storage_bucket')
    expect(serialized).not.toContain('upload_url')
  })

  it('形状非法 fail-closed：缺 id / 非法 status / version 非正整数 → null', () => {
    expect(toSeatSessionSummary(null)).toBeNull()
    expect(toSeatSessionSummary({})).toBeNull()
    expect(toSeatSessionSummary({ ...SESSION_ROW, status: 'unknown-status' })).toBeNull()
    expect(toSeatSessionSummary({ ...SESSION_ROW, version: 0 })).toBeNull()
    expect(toSeatSessionSummary({ ...SESSION_ROW, id: 'abc' })).toBeNull()
  })

  it('detail 投影补充访客最小资料（掩码名优先，无 PII 字段）', () => {
    const detail = toSeatSessionDetail({ ...SESSION_ROW, status: 'active', claimed_at: '2026-09-20T05:20:00Z' })
    expect(detail.status).toBe('active')
    expect(detail.visitorMaskedName).toBe('王***')
    expect(detail.visitorSource).toBe('widget')
    const serialized = JSON.stringify(detail)
    expect(serialized).not.toContain('display_name')
  })

  it('detail 形状非法 → throw（不部分采纳）', () => {
    expect(() => toSeatSessionDetail({ id: 'x' })).toThrow()
  })
})

describe('会话页投影（服务端计数合同）', () => {
  it('sessions/total/total_by_status/next_after_id 全部来自服务端', () => {
    const page = toSeatSessionPage({
      sessions: [SESSION_ROW],
      total: 42,
      total_by_status: { queued: 2, active: 1, closed: 39 },
      next_after_id: SESSION,
    })
    expect(page.total).toBe(42)
    expect(page.counts).toEqual({ queued: 2, active: 1, closed: 39 })
    expect(page.nextAfterId).toBe(SESSION)
    expect(page.sessions).toHaveLength(1)
  })

  it('计数缺失或形状非法 → throw（禁本地推断）', () => {
    expect(() => toSeatSessionPage({ sessions: [], total: 0 })).toThrow()
    expect(() => toSeatSessionPage({ sessions: [], total: 0, total_by_status: { queued: 1 } })).toThrow()
    expect(() => toSeatSessionPage({ sessions: 'nope', total: 0, total_by_status: {} })).toThrow()
  })
})

describe('消息投影（含 ACK 与附件）', () => {
  // CS-WEB-01：assets[] 镜像后端冻结投影键 {id,mime,size_bytes,file_name,status}。
  const MESSAGE_ROW = {
    id: HUGE_TSID,
    sender_type: 'contact',
    sender_contact_id: '4000000000000000004',
    client_msg_id: 'visitor-cm-1',
    body: '截图如下',
    created_at: '2026-09-20T05:30:00Z',
    read_at: '2026-09-20T05:31:00Z',
    assets: [
      { id: '8000000000000000008', status: 'active', mime: 'image/png', size_bytes: 2048, file_name: 'shot.png' },
      { id: '8000000000000000009', status: 'pending_confirm', mime: 'image/jpeg', size_bytes: 10 },
      { id: '8000000000000000010', status: 'deleted' },
    ],
  }

  it('裸数组载荷（eb list_messages_after 合同）逐行投影；read_at 是 ACK 事实', () => {
    const list = toSeatMessageList([MESSAGE_ROW])
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(HUGE_TSID)
    expect(list[0]?.readAt).toBe('2026-09-20T05:31:00Z')
    expect(list[0]?.attachments).toHaveLength(3)
    expect(list[0]?.attachments[0]?.phase).toBe('active')
  })

  it('CS-WEB-01 键名对齐：size_bytes/file_name 被消费；错位旧键 size 不再被读', () => {
    const [message] = toSeatMessageList([MESSAGE_ROW])
    expect(message?.attachments[0]?.size).toBe(2048)
    expect(message?.attachments[0]?.fileName).toBe('shot.png')
    expect(message?.attachments[0]?.mime).toBe('image/png')
    // 旧错位键（CSX-01 断链实证）：只发 size 的行 size 投影为 null（fail-closed）。
    const [legacy] = toSeatMessageList([
      { ...MESSAGE_ROW, assets: [{ id: '8000000000000000012', status: 'active', mime: 'image/png', size: 999 }] },
    ])
    expect(legacy?.attachments[0]?.size).toBeNull()
  })

  it('兼容 {messages} 旧形载荷', () => {
    expect(toSeatMessageList({ messages: [MESSAGE_ROW] })).toHaveLength(1)
    expect(toSeatMessageList({})).toEqual([])
    expect(toSeatMessageList(null)).toEqual([])
  })

  it('非数组载荷内的垃圾行被丢弃，不猜测', () => {
    expect(toSeatMessageList([{ id: 'x' }, null, MESSAGE_ROW])).toHaveLength(1)
    expect(toSeatMessage(null)).toBeNull()
  })

  it('§3.7 阶段映射：白名单外/协议态一律 pending_confirm（未就绪）', () => {
    expect(toSeatAttachmentPhase('active')).toBe('active')
    expect(toSeatAttachmentPhase('deleted')).toBe('deleted')
    expect(toSeatAttachmentPhase('expired')).toBe('deleted')
    expect(toSeatAttachmentPhase('pending_confirm')).toBe('pending_confirm')
    expect(toSeatAttachmentPhase('upload_ref_issued')).toBe('pending_confirm')
    expect(toSeatAttachmentPhase(undefined)).toBe('pending_confirm')
  })
})

describe('transfer-targets 投影', () => {
  it('{targets, next_after_id}：identity/display_name/available', () => {
    const page = toTransferTargetList({
      targets: [
        { business_identity_id: '6000000000000000006', display_name: '坐席乙', available: true },
        { business_identity_id: 'bad', display_name: '非法行' },
        { business_identity_id: '6000000000000000007', display_name: '坐席丙', available: false },
      ],
      next_after_id: null,
    })
    expect(page.targets).toHaveLength(2)
    expect(page.targets[0]?.identityId).toBe('6000000000000000006')
    expect(page.targets[1]?.available).toBe(false)
  })
})

describe('CS-WEB-03 队列 triage 投影（last_message 键名对齐 + waiting_seconds）', () => {
  /** CS-BE-02 冻结 wire：时间字段 epoch bigint 秒；last_message 键集恰为
   * {id, sender_type, created_at, preview}；queued 行带 waiting_seconds。 */
  const QUEUE_ROW = {
    ...SESSION_ROW,
    queued_at: 1758999975,
    claimed_at: null,
    closed_at: null,
    last_message: { id: '7000000000000000007', sender_type: 'contact', created_at: 1759000000, preview: '你好，请问订单 8891 什么时候发货' },
    waiting_seconds: 125,
  }

  it('last_message 键名对齐（CSX-01 修正）：preview/created_at/sender_type 被消费', () => {
    const view = toSeatSessionSummary(QUEUE_ROW)
    expect(view?.lastMessage.id).toBe('7000000000000000007')
    expect(view?.lastMessage.senderType).toBe('contact')
    expect(view?.lastMessage.preview).toBe('你好，请问订单 8891 什么时候发货')
    expect(view?.lastMessage.createdAt).toBe(1759000000)
  })

  it('旧错位键 at 不再被读（fail-closed）：只发 at 的行 createdAt 为 null', () => {
    const legacy = toSeatSessionSummary({
      ...QUEUE_ROW,
      last_message: { id: '7000000000000000007', preview: '你好', at: '2026-09-20T05:14:40Z' },
    })
    expect(legacy?.lastMessage.preview).toBe('你好')
    expect(legacy?.lastMessage.createdAt).toBeNull()
  })

  it('waiting_seconds：queued 行消费服务端权威值；缺键（active/closed）→ null；形状非法 → null', () => {
    expect(toSeatSessionSummary(QUEUE_ROW)?.waitingSeconds).toBe(125)
    // wire 事实：active/closed 行恒缺该键（cs_session_app:seat_waiting 只在 queued 出键）。
    const active = toSeatSessionSummary({ ...QUEUE_ROW, status: 'active', claimed_at: 1759000025, waiting_seconds: undefined })
    expect(active?.waitingSeconds).toBeNull()
    expect(toSeatSessionSummary({ ...QUEUE_ROW, waiting_seconds: 'soon' })?.waitingSeconds).toBeNull()
    expect(toSeatSessionSummary({ ...QUEUE_ROW, waiting_seconds: 1.5 })?.waitingSeconds).toBeNull()
  })

  it('queued_at/claimed_at/closed_at 是 epoch 秒（PG bigint wire）：整数被消费，ISO 字符串不猜', () => {
    const view = toSeatSessionSummary(QUEUE_ROW)
    expect(view?.queuedAt).toBe(1758999975)
    const active = toSeatSessionSummary({ ...QUEUE_ROW, status: 'active', claimed_at: 1759000025 })
    expect(active?.claimedAt).toBe(1759000025)
    expect(toSeatSessionSummary({ ...SESSION_ROW, queued_at: '2026-09-20T05:14:47Z' })?.queuedAt).toBeNull()
  })

  it('preview 占位语义：null（附件-only/空/撤回/keyring 未装配）原样透传，不猜测不编造', () => {
    const view = toSeatSessionSummary({ ...QUEUE_ROW, last_message: { id: '7000000000000000007', sender_type: 'contact', created_at: 1759000000, preview: null } })
    expect(view?.lastMessage.preview).toBeNull()
    // 无消息：last_message 整键 null → 骨架全空。
    const empty = toSeatSessionSummary({ ...QUEUE_ROW, last_message: null })
    expect(empty?.lastMessage).toEqual({ id: null, senderType: null, preview: null, createdAt: null })
  })
})

describe('路径构造（Seat 域 + A03 附件代理不变量）', () => {
  it('合同路径族全部落在 /api/v1/cs 或 /api/v1/enterprise 域', () => {
    expect(buildSeatQueuePath(ORG)).toBe(`/cs/organizations/${ORG}/sessions/queue`)
    expect(buildSeatSessionsPath(ORG)).toBe(`/cs/organizations/${ORG}/seats/sessions`)
    expect(buildSeatSessionActionPath(ORG, SESSION, 'claim')).toBe(`/cs/organizations/${ORG}/sessions/${SESSION}/claim`)
    expect(buildSeatSessionDetailPath(ORG, SESSION)).toBe(`/cs/organizations/${ORG}/sessions/${SESSION}`)
    expect(buildConversationMessagesPath(CONV)).toBe(`/enterprise/conversations/${CONV}/messages`)
    // DF-9：发送走企业真源写路径（必带 /organizations/:org 段；cs 段 POST 405）。
    expect(buildConversationSendPath(ORG, CONV)).toBe(
      `/enterprise/organizations/${ORG}/conversations/${CONV}/messages`,
    )
    expect(buildTransferTargetsPath(ORG)).toBe(`/cs/organizations/${ORG}/transfer-targets`)
  })

  it('CS-WEB-01：附件内容路径 = 真实 enterprise content 端点（模板一致，无虚构 cs 段）', () => {
    const assetId = '8000000000000000008'
    const path = seatAssetContentPath(ORG, assetId)
    expect(path).toBe(`/enterprise/organizations/${ORG}/assets/${assetId}/content`)
    expect(SEAT_ASSET_CONTENT_PATH_TEMPLATE).toBe('/api/v1/seat/enterprise/organizations/:org_id/assets/:id/content')
    // 旧虚构路由（/cs/organizations/:org/sessions/:sid/assets/…/content）已删除：
    // 构造器不再产出 sessions 段（该路由后端不存在，必 404——CSX-01 断链）。
    expect(path).not.toContain('/sessions/')
    expect(SEAT_ASSET_CONTENT_PATH_TEMPLATE).not.toContain('/cs/organizations/')
  })

  it('路径编码：TSID 特殊字符输入不产生注入面（防御性）', () => {
    const path = seatAssetContentPath('1', encodeURIComponent('../../evil') as never)
    expect(path).not.toContain('../../evil')
  })
})

describe('CS-WEB-02 presign 投影与上传路径', () => {
  it('toSeatPresignResult：完整形状投影（upload.url 消费，token/object key 丢弃）', () => {
    const result = toSeatPresignResult({
      asset_id: '8100000000000000001',
      upload_ref: 'ur-1',
      object_hash: 'ab'.repeat(32),
      mime: 'image/png',
      size_bytes: 2048,
      file_name: '截图.png',
      retain_until: null,
      expires_at: 1759000000,
      upload: {
        method: 'PUT',
        url: '/api/v1/seat/enterprise/organizations/2000000000000000002/assets/upload/1',
        token: 'opaque-token',
        expires_at: 1759000000,
        adapter: 'local_private_object_store',
        rule: 'opaque_token_no_url_no_object_key',
      },
    })
    expect(result.assetId).toBe('8100000000000000001')
    expect(result.uploadRef).toBe('ur-1')
    expect(result.uploadUrl).toBe('/api/v1/seat/enterprise/organizations/2000000000000000002/assets/upload/1')
    expect(result.expiresAt).toBe(1759000000)
    // upload.token（= upload_ref 双投）与 adapter/rule 不进投影（A03 最小面）。
    expect(Object.keys(result).sort()).toEqual(['assetId', 'expiresAt', 'uploadRef', 'uploadUrl'])
  })

  it('upload.url 缺失（部署未开放对象 PUT）→ uploadUrl=null（fail-closed 由编排终止）', () => {
    const result = toSeatPresignResult({
      asset_id: '8100000000000000001',
      upload_ref: 'ur-1',
      upload: { method: 'PUT', token: 'opaque', rule: 'opaque_token_no_url_no_object_key' },
    })
    expect(result.uploadUrl).toBeNull()
    expect(result.assetId).toBe('8100000000000000001')
  })

  it('形状非法 fail-closed：非对象 / asset_id 非法 / upload_ref 缺失 → throw', () => {
    expect(() => toSeatPresignResult(null)).toThrow()
    expect(() => toSeatPresignResult([1, 2])).toThrow()
    expect(() => toSeatPresignResult({ upload_ref: 'ur-1' })).toThrow(/asset_id/)
    expect(() => toSeatPresignResult({ asset_id: 'abc' })).toThrow(/asset_id/)
    expect(() => toSeatPresignResult({ asset_id: '8100000000000000001', upload_ref: '' })).toThrow(/upload_ref/)
    expect(() => toSeatPresignResult({ asset_id: '8100000000000000001' })).toThrow(/upload_ref/)
  })

  it('TSID 精度：大整数字面量 asset_id 经 parseSeatJson 收敛为 string', () => {
    // JSON integer 传输 64-bit TSID（wire 合同）：parseSeatJson 精度保护后再投影。
    const result = toSeatPresignResult({ asset_id: HUGE_TSID, upload_ref: 'ur-9' })
    expect(result.assetId).toBe(HUGE_TSID)
  })

  it('上传路径构造：presign/confirm 落真实 enterprise 动作端点（无虚构路由）', () => {
    expect(buildAssetPresignPath(ORG)).toBe(`/enterprise/organizations/${ORG}/assets/presign`)
    expect(buildAssetConfirmPath(ORG)).toBe(`/enterprise/organizations/${ORG}/assets/confirm`)
    // imboy_router.erl:1790/1796 真实路由族（Seat 域门 /api/v1/seat/enterprise/organizations/ 放行）。
    expect(buildAssetPresignPath(ORG)).not.toContain('/cs/')
    expect(buildAssetConfirmPath(ORG)).not.toContain('/sessions/')
  })
})

describe('CS-WEB-04 客户上下文投影（CS-BE-03 白名单双层防线）', () => {
  const CONTEXT_PAYLOAD = {
    session_id: SESSION,
    workspace_id: WS,
    source: 'widget',
    request_id: 'ignored-common-key',
    business_identity_id: '6000000000000000006',
    contact: { masked_name: '王***', first_seen: 1757000000, last_seen: 1759000000 },
    history: {
      sessions: [
        {
          id: '7100000000000000010',
          conversation_id: CONV,
          workspace_id: WS,
          status: 'closed',
          version: 3,
          rating: 5,
          queued_at: 1758000000,
          claimed_at: 1758000100,
          closed_at: 1758000200,
        },
        { id: HUGE_TSID, conversation_id: null, status: 'bogus-status', version: null, rating: null },
      ],
      next_after_id: null,
    },
    notes: [{ id: '8200000000000000010', business_identity_id: '6000000000000000006', created_at: 1758500000 }],
    // 白名单外键（不该出现；出现也必须被丢弃）：
    contact_phone: '13800138000',
    contact_email: 'a@b.c',
    subject_mask: 'should-not-leak',
    note_bodies: ['should-not-leak'],
  }

  it('白名单投影：已知键收敛为 camelCase；白名单外键一律丢弃', () => {
    const ctx = toSeatCustomerContext(CONTEXT_PAYLOAD)
    expect(ctx.sessionId).toBe(SESSION)
    expect(ctx.workspaceId).toBe(WS)
    expect(ctx.source).toBe('widget')
    expect(ctx.contact.maskedName).toBe('王***')
    expect(ctx.contact.firstSeen).toBe(1757000000)
    expect(ctx.contact.lastSeen).toBe(1759000000)
    expect(ctx.history.sessions.length).toBe(2)
    expect(ctx.history.sessions[0]?.id).toBe('7100000000000000010')
    expect(ctx.history.sessions[0]?.status).toBe('closed')
    expect(ctx.history.sessions[0]?.rating).toBe(5)
    // 未知状态/缺失字段收敛为 null（不猜）：
    expect(ctx.history.sessions[1]?.status).toBe(null)
    expect(ctx.history.sessions[1]?.version).toBe(null)
    expect(ctx.notes.length).toBe(1)
    expect(ctx.notes[0]?.businessIdentityId).toBe('6000000000000000006')
    // JSON.stringify 断言：白名单外键（电话/邮箱/subject_mask/正文材料）永不进投影。
    const serialized = JSON.stringify(ctx)
    expect(serialized).not.toContain('13800138000')
    expect(serialized).not.toContain('a@b.c')
    expect(serialized).not.toContain('should-not-leak')
    expect(serialized).not.toContain('ignored-common-key')
  })

  it('fail-closed：payload 非对象 / session_id 非法即 throw（不猜形状）', () => {
    expect(() => toSeatCustomerContext(null)).toThrow(/shape/)
    expect(() => toSeatCustomerContext('nope')).toThrow(/shape/)
    expect(() => toSeatCustomerContext({})).toThrow(/session_id/)
    expect(() => toSeatCustomerContext({ session_id: 'not-a-tsid' })).toThrow(/session_id/)
  })

  it('空历史/空备注收敛为空数组（面板 empty 态的数据源）', () => {
    const ctx = toSeatCustomerContext({
      session_id: SESSION,
      workspace_id: WS,
      source: 'shop_key',
      contact: {},
      history: {},
      notes: 'not-an-array',
    })
    expect(ctx.contact.maskedName).toBe(null)
    expect(ctx.history.sessions).toEqual([])
    expect(ctx.history.nextAfterId).toBe(null)
    expect(ctx.notes).toEqual([])
    expect(ctx.source).toBe('shop_key')
  })

  it('路径构造：5 段 context 路径落 Seat 域（CS-BE-03 真实路由）', () => {
    expect(buildSeatSessionContextPath(ORG, SESSION)).toBe(
      `/cs/organizations/${ORG}/sessions/${SESSION}/context`,
    )
  })
})
