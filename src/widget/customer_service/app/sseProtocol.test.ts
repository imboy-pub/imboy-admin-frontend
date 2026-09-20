/**
 * FE-W01：§3.6 冻结 SSE 信封消费单元测试（解析 / event_id 去重 / 帧分类 / resync）。
 *
 * 合同：contracts/sse-event-contract.json（六种 type、envelope 字段、
 * at-least-once 按 event_id 去重、resync.required 清游标全量刷新）。
 */
import { describe, expect, it } from 'bun:test'
import {
  classifySseFrame,
  parseSseEnvelope,
  SseEventIdDeduper,
} from './sseProtocol'

const VALID_ENVELOPE = {
  event_id: '72057594037928010',
  type: 'message.appended',
  organization_id: '1234567890123456789',
  workspace_id: '1234567890123456788',
  resource_type: 'message',
  resource_id: '72057594037927999',
  resource_version: 1,
  occurred_at: '2026-09-20T08:00:00Z',
  reason: 'created',
}

function envelopeData(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...VALID_ENVELOPE, ...overrides })
}

describe('parseSseEnvelope（逐字段 fail-closed）', () => {
  it('合法信封（六种 type 逐一）解析成功', () => {
    for (const type of [
      'queue.changed',
      'session.changed',
      'message.appended',
      'assignment.changed',
      'seat.changed',
      'resync.required',
    ]) {
      const parsed = parseSseEnvelope(envelopeData({ type }))
      expect(parsed).not.toBeNull()
      expect(parsed?.type).toBe(type)
      expect(parsed?.eventId).toBe(VALID_ENVELOPE.event_id)
    }
  })

  it('任一字段缺失/越界/形状非法一律 null（不部分采纳）', () => {
    expect(parseSseEnvelope('not json')).toBeNull()
    expect(parseSseEnvelope('[]')).toBeNull()
    for (const key of Object.keys(VALID_ENVELOPE)) {
      const broken = { ...VALID_ENVELOPE }
      delete (broken as Record<string, unknown>)[key]
      expect(parseSseEnvelope(JSON.stringify(broken))).toBeNull()
    }
    expect(parseSseEnvelope(envelopeData({ type: 'unknown.type' }))).toBeNull()
    expect(parseSseEnvelope(envelopeData({ resource_type: 'evil' }))).toBeNull()
    expect(parseSseEnvelope(envelopeData({ reason: 'maybe' }))).toBeNull()
    expect(parseSseEnvelope(envelopeData({ resource_version: '1' }))).toBeNull()
    expect(parseSseEnvelope(envelopeData({ resource_id: 42 }))).toBeNull()
    expect(parseSseEnvelope(envelopeData({ event_id: '' }))).toBeNull()
  })

  it('resource_id = null 合法（resource_id TSID-string-or-null）', () => {
    const parsed = parseSseEnvelope(envelopeData({ resource_id: null }))
    expect(parsed?.resourceId).toBeNull()
  })
})

describe('SseEventIdDeduper（at-least-once 去重 + reset）', () => {
  it('重复 event_id 返回 true；新 id 返回 false', () => {
    const deduper = new SseEventIdDeduper()
    expect(deduper.isDuplicate('a')).toBe(false)
    expect(deduper.isDuplicate('a')).toBe(true)
    expect(deduper.isDuplicate('b')).toBe(false)
  })

  it('容量有界（FIFO 淘汰），resync reset 后允许旧 id 再次消费', () => {
    const deduper = new SseEventIdDeduper(2)
    deduper.isDuplicate('a')
    deduper.isDuplicate('b')
    deduper.isDuplicate('c') // 淘汰 a
    expect(deduper.isDuplicate('a')).toBe(false)
    expect(deduper.size).toBeGreaterThan(0)
    deduper.reset()
    expect(deduper.size).toBe(0)
    expect(deduper.isDuplicate('a')).toBe(false)
  })
})

describe('classifySseFrame（信封优先；widget 面帧兼容；其余忽略）', () => {
  it('§3.6 信封帧 → envelope', () => {
    const frame = { id: '10', event: 'message', data: envelopeData() }
    const classified = classifySseFrame(frame)
    expect(classified.kind).toBe('envelope')
    if (classified.kind === 'envelope') expect(classified.envelope.type).toBe('message.appended')
  })

  it('widget 状态帧（cs.session 投影）→ widget-state；closed 触发评分相位由控制器消费', () => {
    const frame = {
      id: '72057594037927999',
      event: 'state',
      data: JSON.stringify({ resource: 'cs.session', session_id: '72057594037927936', status: 'closed' }),
    }
    const classified = classifySseFrame(frame)
    expect(classified).toEqual({ kind: 'widget-state', status: 'closed' })
  })

  it('widget 消息帧 → widget-message（载荷不入业务真源，只触发权威刷新）', () => {
    const frame = { id: '72057594037927999', event: 'message', data: JSON.stringify({ id: '72057594037927999' }) }
    expect(classifySseFrame(frame)).toEqual({ kind: 'widget-message', messageId: '72057594037927999' })
    expect(classifySseFrame({ id: null, event: 'message', data: '{}' })).toEqual({
      kind: 'widget-message',
      messageId: null,
    })
  })

  it('keep-alive / 未知形状 → ignore', () => {
    expect(classifySseFrame({ id: null, event: 'keep-alive', data: ': ping' })).toEqual({ kind: 'ignore' })
    expect(classifySseFrame({ id: null, event: 'message', data: 'garbage-not-enough-fields' })).toEqual({
      kind: 'ignore',
    })
  })
})
