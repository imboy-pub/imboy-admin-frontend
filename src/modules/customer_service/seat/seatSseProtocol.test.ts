/**
 * SEAT-01：§3.6 SSE 协议纯层单测（信封 fail-closed 解析 / event_id 去重 / 分帧）。
 */
import { describe, expect, it } from 'bun:test'
import {
  createSeatSseParser,
  parseSeatSseBlock,
  parseSeatSseEnvelope,
  SeatSseEventIdDeduper,
} from './seatSseProtocol'

const FULL_ENVELOPE = JSON.stringify({
  event_id: '1000000000000000001',
  type: 'message.appended',
  organization_id: '2000000000000000002',
  workspace_id: '3000000000000000003',
  resource_type: 'message',
  resource_id: '4000000000000000004',
  resource_version: 1,
  occurred_at: '2026-09-20T05:14:47Z',
  reason: 'created',
})

describe('parseSeatSseEnvelope（A05 信封 fail-closed）', () => {
  it('标准信封解析成功，TSID 全 string', () => {
    const envelope = parseSeatSseEnvelope(FULL_ENVELOPE)
    expect(envelope).not.toBe(null)
    expect(envelope?.eventId).toBe('1000000000000000001')
    expect(envelope?.type).toBe('message.appended')
    expect(envelope?.resourceId).toBe('4000000000000000004')
    expect(envelope?.reason).toBe('created')
  })

  it('resource_id 允许 null', () => {
    const envelope = parseSeatSseEnvelope(
      FULL_ENVELOPE.replace('"4000000000000000004"', 'null'),
    )
    expect(envelope?.resourceId).toBe(null)
  })

  it('六种 type + 六种 resource_type + 五种 reason 逐一可解析', () => {
    for (const type of [
      'queue.changed',
      'session.changed',
      'message.appended',
      'assignment.changed',
      'seat.changed',
    ]) {
      expect(parseSeatSseEnvelope(FULL_ENVELOPE.replace('message.appended', type))?.type).toBe(type)
    }
    expect(
      parseSeatSseEnvelope(FULL_ENVELOPE.replace('"resource_type":"message"', '"resource_type":"conversation"'))
        ?.resourceType,
    ).toBe('conversation')
    expect(parseSeatSseEnvelope(FULL_ENVELOPE.replace('created', 'revoked'))?.reason).toBe('revoked')
  })

  it('任何字段缺失/越界/类型不符 → null（不猜测、不部分采纳）', () => {
    expect(parseSeatSseEnvelope('not json')).toBe(null)
    expect(parseSeatSseEnvelope('[]')).toBe(null)
    expect(parseSeatSseEnvelope('{}')).toBe(null)
    expect(parseSeatSseEnvelope(FULL_ENVELOPE.replace('message.appended', 'unknown.type'))).toBe(null)
    expect(parseSeatSseEnvelope(FULL_ENVELOPE.replace('"created"', '"hacked"'))).toBe(null)
    expect(parseSeatSseEnvelope(FULL_ENVELOPE.replace('"resource_version":1', '"resource_version":"1"'))).toBe(null)
    expect(parseSeatSseEnvelope(FULL_ENVELOPE.replace('"occurred_at"', '"occurred_at_x"'))).toBe(null)
    expect(parseSeatSseEnvelope(FULL_ENVELOPE.replace('"resource_id":"4000000000000000004",', ''))).toBe(null)
    expect(parseSeatSseEnvelope(FULL_ENVELOPE.replace('1000000000000000001', ''))).toBe(null)
  })
})

describe('SeatSseEventIdDeduper（at-least-once 去重）', () => {
  it('重复 id 报重复；reset 后允许重现', () => {
    const deduper = new SeatSseEventIdDeduper()
    expect(deduper.isDuplicate('1')).toBe(false)
    expect(deduper.isDuplicate('1')).toBe(true)
    expect(deduper.isDuplicate('2')).toBe(false)
    deduper.reset()
    expect(deduper.isDuplicate('1')).toBe(false)
  })

  it('容量有界：FIFO 淘汰最旧 id', () => {
    const deduper = new SeatSseEventIdDeduper(2)
    deduper.isDuplicate('1')
    deduper.isDuplicate('2')
    deduper.isDuplicate('3') // 1 被淘汰
    expect(deduper.size).toBe(2)
    expect(deduper.isDuplicate('1')).toBe(false)
    expect(deduper.isDuplicate('3')).toBe(true)
  })
})

describe('SSE 分帧解析（retry / heartbeat / 跨 chunk）', () => {
  it('解析 id/event/data/retry，忽略注释心跳行', () => {
    const parsed = parseSeatSseBlock('retry: 2000\nid: 1000000000000000001\nevent: message.appended\ndata: {"k":1}')
    expect(parsed?.retryMs).toBe(2000)
    expect(parsed?.event.id).toBe('1000000000000000001')
    expect(parsed?.event.event).toBe('message.appended')
    expect(parsed?.event.data).toBe('{"k":1}')
    expect(parseSeatSseBlock(': keep-alive')).toBe(null)
  })

  it('多行 data 合并（\n 连接）', () => {
    const parsed = parseSeatSseBlock('data: {"a":\ndata: 1}')
    expect(parsed?.event.data).toBe('{"a":\n1}')
  })

  it('parser 跨 chunk 组装（任意切分不丢帧）', () => {
    const parser = createSeatSseParser()
    const first = parser.push('id: 1\ndata: {"a"')
    expect(first.events).toHaveLength(0)
    const second = parser.push(':1}\n\ndata: {"b":2}\n\n')
    expect(second.events).toHaveLength(2)
    expect(second.events[0]?.data).toBe('{"a":1}')
    expect(second.events[1]?.data).toBe('{"b":2}')
  })
})
