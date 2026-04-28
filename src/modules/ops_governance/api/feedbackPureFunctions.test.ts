/**
 * Inline mirror tests for private pure functions in feedback.ts:
 *   normalizeFeedback
 */
import { describe, expect, it } from 'bun:test'

// ---------------------------------------------------------------------------
// normalizeFeedback — feedback.ts
// ---------------------------------------------------------------------------

interface Feedback {
  id: number
  user_id: number
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
  feedback_id?: number
  body?: string
  reply_body?: string
}

function normalizeFeedback(item: RawFeedback): Feedback {
  const id = Number(item.id ?? item.feedback_id ?? 0)
  const userId = Number(item.user_id ?? 0)
  const status = Number(item.status)
  return {
    ...item,
    id: Number.isFinite(id) ? id : 0,
    user_id: Number.isFinite(userId) ? userId : 0,
    status: Number.isFinite(status) ? status : 1,
    content: item.content ?? item.body ?? '',
    reply: item.reply ?? item.reply_body,
  }
}

describe('normalizeFeedback', () => {
  const base: RawFeedback = {
    id: 1,
    user_id: 2,
    content: '这个功能很棒',
    status: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('maps standard fields directly', () => {
    const result = normalizeFeedback(base)
    expect(result.id).toBe(1)
    expect(result.user_id).toBe(2)
    expect(result.content).toBe('这个功能很棒')
    expect(result.status).toBe(0)
  })

  it('uses feedback_id fallback when id is 0', () => {
    const raw: RawFeedback = { ...base, id: 0, feedback_id: 99 }
    // id=0, feedback_id=99 → Number(0 ?? 99) = Number(0) = 0 → uses id
    // Actually: id ?? feedback_id ?? 0 → 0 is falsy but ?? checks null/undefined only
    // So id=0 → 0 ?? 99 = 0 (0 is not null/undefined) → Number(0) = 0
    expect(normalizeFeedback(raw).id).toBe(0)
  })

  it('uses feedback_id when id is undefined', () => {
    const raw = { ...base, feedback_id: 55 } as RawFeedback
    // id is undefined → undefined ?? 55 = 55 → Number(55) = 55
    Object.assign(raw, { id: undefined })
    expect(normalizeFeedback(raw).id).toBe(55)
  })

  it('defaults id to 0 when both id and feedback_id are undefined', () => {
    const raw = { ...base } as RawFeedback
    Object.assign(raw, { id: undefined, feedback_id: undefined })
    expect(normalizeFeedback(raw).id).toBe(0)
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
