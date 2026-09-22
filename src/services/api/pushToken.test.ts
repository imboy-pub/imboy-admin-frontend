/**
 * 推送 Token 取数面 — 明文剥离的负例探针（FULL-04 追加必修项）。
 *
 * 背景：`GET /api/adm/admin/push_token/list` 当前仍返回明文 `token`
 * （`push_token_repo:list_page/2` 的 SELECT 含 `token` 列；后端侧改动已按
 * `PENDING_A0_WIRING` 交 A0）。本文件断言 **Admin 应用层永不携带明文**：
 *
 *  1. 返回类型 `PushTokenView` 无 `token` 字段（结构性）；
 *  2. 合成探针 token 出现在响应里时，**函数返回值序列化后零命中**
 *     （对应 A0 要求的 `binary:match` = nomatch 的 JS 侧等价断言）；
 *  3. 派生指纹不可用于推送、不可反推、且不含任何明文片段。
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { md5 } from 'js-md5'
import client from './client'
import {
  listPushTokens,
  rawTokenStrippedCount,
  resetRawTokenStrippedCount,
  toPushTokenView,
  tokenFingerprint,
} from './pushToken'

type AnyFn = (..._args: unknown[]) => unknown
type MutableClient = { get: AnyFn }

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get

/** 合成探针：**不是**任何真实设备的 token。 */
const PROBE_TOKEN = 'SYNTHETIC-PUSH-TOKEN-PROBE-0001-not-a-real-device-credential'

function payloadResponse(list: unknown[], total = list.length) {
  return {
    data: { code: 0, msg: 'ok', payload: { list, total, page: 1, size: 10 } },
  }
}

function mockList(list: unknown[]) {
  mutableClient.get = async () => payloadResponse(list)
}

afterEach(() => {
  mutableClient.get = originalGet
  resetRawTokenStrippedCount()
})

describe('listPushTokens 明文剥离（负例探针）', () => {
  it('断言 1：返回行的键集合里没有 token（类型与运行时双无）', async () => {
    mockList([
      {
        user_id: '9001',
        device_id: 'dev-001',
        device_type: 'phone',
        platform: 'android',
        token: PROBE_TOKEN,
        created_at: 'T1',
        updated_at: 'T2',
      },
    ])
    const result = await listPushTokens(1, 10)
    const row = result.list[0]!
    expect('token' in row).toBe(false)
    expect(Object.keys(row).sort()).toEqual([
      'created_at',
      'device_id',
      'device_type',
      'platform',
      'token_fingerprint',
      'updated_at',
      'user_id',
    ])
  })

  it('断言 2：探针 token 在返回值序列化后零命中（|binary:match| = nomatch 的等价断言）', async () => {
    mockList([
      { user_id: '9001', device_id: 'dev-001', device_type: 'phone', platform: 'android', token: PROBE_TOKEN },
    ])
    const result = await listPushTokens(1, 10)
    const serialized = JSON.stringify(result)
    expect(serialized.indexOf(PROBE_TOKEN)).toBe(-1)
    // 连前缀片段也不得出现（避免「截断明文」这种半吊子脱敏）
    expect(serialized).not.toContain(PROBE_TOKEN.slice(0, 20))
    expect(serialized).not.toContain('SYNTHETIC-PUSH-TOKEN')
  })

  it('断言 2b：多行 / 多页响应同样零命中；计数留痕证明后端仍在回传明文', async () => {
    resetRawTokenStrippedCount()
    mockList([
      { user_id: '1', device_id: 'a', platform: 'android', token: `${PROBE_TOKEN}-A` },
      { user_id: '2', device_id: 'b', platform: 'ios', token: `${PROBE_TOKEN}-B` },
      { user_id: '3', device_id: 'c', platform: 'web' },
    ])
    const result = await listPushTokens(1, 10)
    expect(result.list).toHaveLength(3)
    const serialized = JSON.stringify(result)
    expect(serialized.indexOf(PROBE_TOKEN)).toBe(-1)
    // 两行带 token（第三行没有）→ 计数 = 2，即「后端仍回传明文」的可观测留痕
    expect(rawTokenStrippedCount()).toBe(2)
  })

  it('空 token / 非对象行：不崩、不产出假指纹', async () => {
    mockList([{ user_id: '1', device_id: 'a' }, { user_id: '2', device_id: 'b', token: '' }, null, 'x'])
    const result = await listPushTokens(1, 10)
    // null / 非对象被丢弃，空 token 行保留但指纹为空
    expect(result.list).toHaveLength(2)
    expect(result.list[0]!.token_fingerprint).toBe('')
    expect(result.list[1]!.token_fingerprint).toBe('')
    expect(rawTokenStrippedCount()).toBe(0)
  })

  it('分页与总数透传（剥离不改变分页语义）', async () => {
    mutableClient.get = async () => ({
      data: { code: 0, msg: 'ok', payload: { list: [], total: 137, page: 3, size: 25 } },
    })
    const result = await listPushTokens(3, 25)
    expect(result.total).toBe(137)
    expect(result.page).toBe(3)
    expect(result.size).toBe(25)
  })
})

describe('tokenFingerprint（不可逆短指纹）', () => {
  it('由 md5 派生且只暴露前 8 位 + 原长', () => {
    const fp = tokenFingerprint(PROBE_TOKEN)
    expect(fp).toBe(`${md5(PROBE_TOKEN).slice(0, 8)}:${PROBE_TOKEN.length}`)
    expect(fp.startsWith(md5(PROBE_TOKEN).slice(0, 8))).toBe(true)
    expect(fp.endsWith(`:${PROBE_TOKEN.length}`)).toBe(true)
  })

  it('不可反推 / 不含明文片段 / 不可用于推送', () => {
    const fp = tokenFingerprint(PROBE_TOKEN)
    expect(fp).not.toContain(PROBE_TOKEN)
    expect(PROBE_TOKEN).not.toContain(fp)
    // 不含明文的前/中/后片段（20 字符窗口）
    expect(fp).not.toContain(PROBE_TOKEN.slice(0, 20))
    expect(fp).not.toContain(PROBE_TOKEN.slice(-20))
    // 指纹长度远小于设备凭据（无法作为推送凭据使用）
    expect(fp.length).toBeLessThan(PROBE_TOKEN.length)
    expect(fp.split(':')[0]!.length).toBe(8)
  })

  it('确定性 + 区分性：同 token 同指纹；异 token 异指纹', () => {
    expect(tokenFingerprint(PROBE_TOKEN)).toBe(tokenFingerprint(PROBE_TOKEN))
    expect(tokenFingerprint(`${PROBE_TOKEN}-A`)).not.toBe(tokenFingerprint(`${PROBE_TOKEN}-B`))
    expect(tokenFingerprint('')).toBe('')
  })

  it('toPushTokenView 对同一行两次投影结果一致（无隐藏状态泄漏）', () => {
    const raw = { user_id: '1', device_id: 'a', token: PROBE_TOKEN }
    const a = toPushTokenView(raw)
    const b = toPushTokenView(raw)
    expect(a).toEqual(b)
  })
})
