/**
 * SEAT-02：坐席工作台合同层单测（wire 投影 / 路径构造 / 不变量）。
 *
 * 覆盖：
 * - seat_session_view / detail / 消息 / 转接目标投影（TSID string 收敛、
 *   fail-closed、未知键丢弃——包括存储侧键，A03 防泄漏的第一道闸）；
 * - 服务端计数 total_by_status 合同（禁本地推断）；
 * - 路径构造全部落在 Seat 域；附件 href 唯一来源是 content 代理路径
 *   （无 object key / upload URL / JWT，A03）。
 */
import { describe, expect, it } from 'bun:test'
import {
  SEAT_ASSET_CONTENT_PATH_TEMPLATE,
  buildConversationMessagesPath,
  buildSeatQueuePath,
  buildSeatSessionActionPath,
  buildSeatSessionDetailPath,
  buildSeatSessionsPath,
  buildTransferTargetsPath,
  seatAssetContentPath,
  toSeatAttachmentPhase,
  toSeatMessage,
  toSeatMessageList,
  toSeatSessionDetail,
  toSeatSessionPage,
  toSeatSessionSummary,
  toTransferTargetList,
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
  const MESSAGE_ROW = {
    id: HUGE_TSID,
    sender_type: 'contact',
    sender_contact_id: '4000000000000000004',
    client_msg_id: 'visitor-cm-1',
    body: '截图如下',
    created_at: '2026-09-20T05:30:00Z',
    read_at: '2026-09-20T05:31:00Z',
    assets: [
      { asset_id: '8000000000000000008', status: 'active', mime: 'image/png', size: 2048, file_name: 'shot.png' },
      { asset_id: '8000000000000000009', status: 'pending_confirm', mime: 'image/jpeg', size: 10 },
      { asset_id: '8000000000000000010', status: 'deleted' },
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

describe('路径构造（Seat 域 + A03 附件代理不变量）', () => {
  it('合同路径族全部落在 /api/v1/cs 或 /api/v1/enterprise 域', () => {
    expect(buildSeatQueuePath(ORG)).toBe(`/cs/organizations/${ORG}/sessions/queue`)
    expect(buildSeatSessionsPath(ORG)).toBe(`/cs/organizations/${ORG}/seats/sessions`)
    expect(buildSeatSessionActionPath(ORG, SESSION, 'claim')).toBe(`/cs/organizations/${ORG}/sessions/${SESSION}/claim`)
    expect(buildSeatSessionDetailPath(ORG, SESSION)).toBe(`/cs/organizations/${ORG}/sessions/${SESSION}`)
    expect(buildConversationMessagesPath(CONV)).toBe(`/enterprise/conversations/${CONV}/messages`)
    expect(buildTransferTargetsPath(ORG)).toBe(`/cs/organizations/${ORG}/transfer-targets`)
  })

  it('附件 href 唯一来源 = content 代理路径；模板与实现一致', () => {
    const assetId = '8000000000000000008'
    const path = seatAssetContentPath(ORG, SESSION, assetId)
    expect(path).toBe(`/api/v1/cs/organizations/${ORG}/sessions/${SESSION}/assets/${assetId}/content`)
    expect(SEAT_ASSET_CONTENT_PATH_TEMPLATE).toBe('/api/v1/cs/organizations/:org_id/sessions/:session_id/assets/:asset_id/content')
  })

  it('路径编码：TSID 特殊字符输入不产生注入面（防御性）', () => {
    const path = seatAssetContentPath('1', '2', encodeURIComponent('../../evil') as never)
    expect(path).not.toContain('../../evil')
  })
})
