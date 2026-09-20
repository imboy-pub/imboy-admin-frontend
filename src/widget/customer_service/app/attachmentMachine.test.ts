/**
 * FE-W01：附件状态机单元测试（§3.7 UI 映射：pending→confirming→sending→linked|failed）。
 *
 * 覆盖验收点（FE-W01-A04）：
 * - 全链路允许跃迁；只有 linked 是成功态；
 * - 每个中间步骤失败 → failed（不伪成功）；
 * - 非法跃迁 fail-closed（原样返回）；
 * - retry_reset 复用同一 client_msg_id（幂等键）。
 */
import { describe, expect, it } from 'bun:test'
import {
  initialAttachmentItem,
  isTerminalAttachmentState,
  reduceAttachment,
  type AttachmentEvent,
  type AttachmentItem,
} from './attachmentMachine'

const BASE = {
  key: 'local-cm-1',
  clientMsgId: 'cm-1',
  name: '报表.pdf',
  mime: 'application/pdf',
  sizeBytes: 1024,
}

function item(): AttachmentItem {
  return initialAttachmentItem(BASE)
}

function chainFrom(events: AttachmentEvent[], start: AttachmentItem = item()): AttachmentItem {
  return events.reduce((acc, event) => reduceAttachment(acc, event), start)
}

const HAPPY: AttachmentEvent[] = [
  { type: 'hash_computed', key: BASE.key, objectHash: 'a'.repeat(64) },
  { type: 'presign_succeeded', key: BASE.key, assetId: 'asset-1', uploadRef: 'ref-1', uploadUrl: 'https://store.example/put?sig=x' },
  { type: 'confirm_succeeded', key: BASE.key },
  { type: 'append_succeeded', key: BASE.key, messageId: 'msg-9' },
]

describe('附件状态机（§3.7 UI 映射）', () => {
  it('允许跃迁全链：pending→confirming→sending→linked；只有 linked 是成功态', () => {
    let current = item()
    expect(current.state).toBe('pending')
    current = reduceAttachment(current, HAPPY[0]!)
    expect(current.state).toBe('pending')
    current = reduceAttachment(current, HAPPY[1]!)
    expect(current.state).toBe('confirming')
    current = reduceAttachment(current, HAPPY[2]!)
    expect(current.state).toBe('sending')
    expect(isTerminalAttachmentState('sending')).toBe(false)
    current = reduceAttachment(current, HAPPY[3]!)
    expect(current.state).toBe('linked')
    expect(current.messageId).toBe('msg-9')
    expect(current.assetId).toBe('asset-1')
    expect(isTerminalAttachmentState('linked')).toBe(true)
    expect(isTerminalAttachmentState('pending')).toBe(false)
    expect(isTerminalAttachmentState('failed')).toBe(true)
  })

  it('每个中间步骤失败 → failed（携带原因，不伪成功）', () => {
    const fail = (reason: string): AttachmentEvent => ({ type: 'step_failed', key: BASE.key, reason })
    const afterHash = chainFrom([HAPPY[0]!])
    expect(reduceAttachment(afterHash, fail('presign 429')).state).toBe('failed')
    const afterPresign = chainFrom([HAPPY[0]!, HAPPY[1]!])
    expect(reduceAttachment(afterPresign, fail('confirm 409')).state).toBe('failed')
    const afterConfirm = chainFrom([HAPPY[0]!, HAPPY[1]!, HAPPY[2]!])
    expect(reduceAttachment(afterConfirm, fail('append 409')).state).toBe('failed')
  })

  it('非法跃迁 fail-closed：跳步/回退/终态后再驱动一律原样返回', () => {
    // pending 直接收 append（跳步）→ 忽略
    expect(reduceAttachment(item(), HAPPY[3]!).state).toBe('pending')
    // confirming 直接收 append（跳过 confirm CAS）→ 忽略
    const confirming = chainFrom([HAPPY[0]!, HAPPY[1]!])
    expect(reduceAttachment(confirming, HAPPY[3]!).state).toBe('confirming')
    // linked 终态不可再驱动（不可解绑/换绑的 UI 面）
    const linked = chainFrom(HAPPY)
    expect(reduceAttachment(linked, HAPPY[2]!)).toBe(linked)
    expect(reduceAttachment(linked, { type: 'step_failed', key: BASE.key, reason: 'x' })).toBe(linked)
    // 其它 key 的事件不影响本条目
    const current = item()
    expect(reduceAttachment(current, { type: 'confirm_succeeded', key: 'other' })).toBe(current)
  })

  it('retry_reset：failed → pending，client_msg_id 与已算 hash 复用（幂等键复用）', () => {
    // 失败发生在 hash 之后（真实时序：hash → presign 失败）
    const hashed = reduceAttachment(item(), HAPPY[0]!)
    const failed = reduceAttachment(hashed, { type: 'step_failed', key: BASE.key, reason: '网络失败' })
    expect(failed.state).toBe('failed')
    const retried = reduceAttachment(failed, { type: 'retry_reset', key: BASE.key })
    expect(retried.state).toBe('pending')
    expect(retried.failureReason).toBeNull()
    expect(retried.clientMsgId).toBe(BASE.clientMsgId)
    expect(retried.objectHash).toBe('a'.repeat(64))
    // 非 failed 状态不允许 retry_reset
    const fresh = item()
    expect(reduceAttachment(fresh, { type: 'retry_reset', key: BASE.key })).toBe(fresh)
    // 重置后可重新走完整链
    const relinked = chainFrom(HAPPY, retried)
    expect(relinked.state).toBe('linked')
  })
})
