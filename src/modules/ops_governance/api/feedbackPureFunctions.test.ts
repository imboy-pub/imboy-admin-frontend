/**
 * Inline mirror tests for private pure functions in feedback.ts:
 *   normalizeFeedback
 */
import { describe, expect, it } from 'bun:test'

// ---------------------------------------------------------------------------
// normalizeFeedback — feedback.ts
// ---------------------------------------------------------------------------

// EntityId mirror: 与 src/types/common.ts 一致；mirror 文件保持本地定义不 import
type EntityId = string

interface Feedback {
  id: EntityId
  user_id: EntityId
  content: string
  status: number
  created_at: string
  updated_at: string
  reply?: string
  reply_at?: string
  nickname?: string
  avatar?: string
}

type RawFeedback = Feedback & {
  feedback_id?: EntityId
  body?: string
  reply_body?: string
}

// 与 feedback.ts 同步：string-safe 收紧，避免 BIGINT TSID 经 Number() 精度丢失。
function coerceFeedbackId(value: unknown): EntityId {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : '0'
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return '0'
}

function normalizeFeedback(item: RawFeedback): Feedback {
  const status = Number(item.status)
  return {
    ...item,
    id: coerceFeedbackId(item.id ?? item.feedback_id),
    user_id: coerceFeedbackId(item.user_id),
    status: Number.isFinite(status) ? status : 1,
    content: item.content ?? item.body ?? '',
    reply: item.reply ?? item.reply_body,
  }
}

describe('normalizeFeedback', () => {
  const base: RawFeedback = {
    id: '1',
    user_id: '2',
    content: '这个功能很棒',
    status: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('maps standard fields directly', () => {
    const result = normalizeFeedback(base)
    expect(result.id).toBe('1')
    expect(result.user_id).toBe('2')
    expect(result.content).toBe('这个功能很棒')
    expect(result.status).toBe(0)
  })

  it('returns sentinel "0" when id is empty string (?? does not fallback on empty string)', () => {
    // '' ?? '99' = ''（?? 只对 null/undefined fallback），coerceFeedbackId('') → '0'
    // 这是与原 number 版本不同的语义点：原版 0 ?? 99 = 0 → 0；新版 '' ?? '99' = '' → '0'
    const raw = { ...base, id: '', feedback_id: '99' } as RawFeedback
    expect(normalizeFeedback(raw).id).toBe('0')
  })

  it('uses feedback_id when id is undefined', () => {
    const raw = { ...base, feedback_id: '55' } as RawFeedback
    Object.assign(raw, { id: undefined })
    expect(normalizeFeedback(raw).id).toBe('55')
  })

  it('defaults id to sentinel "0" when both id and feedback_id are undefined', () => {
    const raw = { ...base } as RawFeedback
    Object.assign(raw, { id: undefined, feedback_id: undefined })
    expect(normalizeFeedback(raw).id).toBe('0')
  })

  it('uses body fallback when content is undefined', () => {
    const raw: RawFeedback = { ...base, body: 'body text' }
    Object.assign(raw, { content: undefined })
    expect(normalizeFeedback(raw).content).toBe('body text')
  })

  it('uses reply_body fallback when reply is undefined', () => {
    const raw: RawFeedback = { ...base, reply_body: '已处理' }
    expect(normalizeFeedback(raw).reply).toBe('已处理')
  })

  it('preserves reply when both reply and reply_body are set', () => {
    const raw: RawFeedback = { ...base, reply: '主回复', reply_body: '副回复' }
    expect(normalizeFeedback(raw).reply).toBe('主回复')
  })

  it('defaults status to 1 when NaN', () => {
    const raw: RawFeedback = { ...base }
    Object.assign(raw, { status: 'not-a-number' })
    expect(normalizeFeedback(raw).status).toBe(1)
  })

  it('preserves extended fields like nickname and avatar', () => {
    const raw: RawFeedback = { ...base, nickname: '小明', avatar: 'https://cdn.example.com/a.jpg' }
    const result = normalizeFeedback(raw)
    expect(result.nickname).toBe('小明')
    expect(result.avatar).toBe('https://cdn.example.com/a.jpg')
  })
})
