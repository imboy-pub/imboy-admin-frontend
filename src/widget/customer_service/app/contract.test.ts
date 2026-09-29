/**
 * CSW-01R：Widget 后端合同投影/构造器单元测试（REVIEW-2 R2-4 缺口扫描落点）。
 *
 * 只覆盖既有套件未触达的导出（toCreatedSession/toSession/toWidgetMessage/
 * toPresignResult/isBareHttpsUploadUrl 已在 leaveMessage/uploader/widgetApi
 * 测试覆盖，此处不重复）。锁定的安全合同：
 *   - S3 零申报：bootstrap 请求体键集**恰好** {public_widget_id, subject_id}
 *     （organization/workspace 客户端申报即 400 server_derived_key_rejected）；
 *   - 凭证投影 fail-closed：bootstrap 响应缺 secret → null（visit token 绝不伪造）；
 *   - object_hash 形状 = 64 位**小写** hex（PUT 后服务端复核合同）；
 *   - 附件 content 路径零凭证（token 只走 header，路径/查询串不含）。
 */
import { describe, expect, it } from 'bun:test'
import {
  buildAssetContentPath,
  buildAssetMessageBody,
  buildBootstrapBody,
  buildConfirmBody,
  buildCreateSessionBody,
  buildMessagesPath,
  buildPresignBody,
  buildRatingBody,
  buildScopeQuery,
  buildSendMessageBody,
  buildSsePath,
  isValidExpectedVersion,
  isValidRatingScore,
  isValidSha256Hex,
  toBootstrapResult,
  toBrand,
  toMessageList,
  toSessionList,
} from './contract'

const SCOPE = { installationId: '72057594037928001' }
const HASH = 'a'.repeat(64)

describe('出站构造器：S3 零申报合同（键集恰好）', () => {
  it('buildBootstrapBody 键集恰好 {public_widget_id, subject_id}——org/workspace 键不存在', () => {
    const body = buildBootstrapBody({ publicWidgetId: '702000000000000101', subjectId: 'browser-1' })
    expect(Object.keys(body).sort()).toEqual(['public_widget_id', 'subject_id'])
  })

  it('buildCreateSessionBody 只携带 installation_id（bootstrap 响应派生值）', () => {
    expect(buildCreateSessionBody(SCOPE)).toEqual({ installation_id: SCOPE.installationId })
  })

  it('buildPresignBody 键集恰好 4 键（多出的键会被后端 400）', () => {
    const body = buildPresignBody(SCOPE, { mime: 'text/plain', sizeBytes: 11, objectHash: HASH })
    expect(Object.keys(body).sort()).toEqual(['installation_id', 'mime', 'object_hash', 'size_bytes'])
    expect(body.size_bytes).toBe(11)
  })

  it('buildConfirmBody 恰好 {installation_id, upload_ref}', () => {
    expect(buildConfirmBody(SCOPE, 'ref-1')).toEqual({ installation_id: SCOPE.installationId, upload_ref: 'ref-1' })
  })

  it('buildSendMessageBody 携带幂等键 client_msg_id；buildRatingBody 携带 CAS expected_version', () => {
    expect(buildSendMessageBody(SCOPE, 'cmid-1', '你好')).toEqual({
      installation_id: SCOPE.installationId,
      client_msg_id: 'cmid-1',
      body: '你好',
    })
    expect(buildRatingBody(SCOPE, 5, 3)).toEqual({
      installation_id: SCOPE.installationId,
      rating: 5,
      expected_version: 3,
    })
  })

  it('buildAssetMessageBody：空 asset_ids 不带该键（与纯文本同形）；非空时过滤空串', () => {
    const plain = buildAssetMessageBody(SCOPE, 'cmid-2', '纯文本', [])
    expect('asset_ids' in plain).toBe(false)
    const withAssets = buildAssetMessageBody(SCOPE, 'cmid-3', '带附件', ['1', '', '2'])
    expect(withAssets.asset_ids).toEqual(['1', '2'])
  })
})

describe('路径/查询串构造：零凭证 + 形状稳定', () => {
  it('buildScopeQuery 恒含 installation_id；after_id/limit 仅在有效值时出现；空 extras → 空串', () => {
    expect(buildScopeQuery(SCOPE)).toBe(`?installation_id=${SCOPE.installationId}`)
    expect(buildScopeQuery(SCOPE, { afterId: '9', limit: 20 })).toBe(
      `?installation_id=${SCOPE.installationId}&after_id=9&limit=20`,
    )
    // 非法 limit（0/负/非整数）与空 after_id 不产生键
    expect(buildScopeQuery(SCOPE, { afterId: '', limit: 0 })).toBe(`?installation_id=${SCOPE.installationId}`)
    expect(buildScopeQuery(SCOPE, { afterId: null, limit: 1.5 })).toBe(`?installation_id=${SCOPE.installationId}`)
  })

  it('buildMessagesPath/buildSsePath 对 sessionId 做 encodeURIComponent', () => {
    expect(buildMessagesPath('s/1', SCOPE)).toBe(
      `/api/v1/cs/widget/sessions/s%2F1/messages?installation_id=${SCOPE.installationId}`,
    )
    expect(buildSsePath('s1', SCOPE)).toBe(
      `/api/v1/cs/widget/sessions/s1/events?installation_id=${SCOPE.installationId}`,
    )
  })

  it('buildAssetContentPath 零凭证：路径+查询串只有 installation_id，token 绝不出现', () => {
    const path = buildAssetContentPath('s1', 'a1', SCOPE)
    expect(path).toBe(`/api/v1/cs/widget/sessions/s1/assets/a1/content?installation_id=${SCOPE.installationId}`)
    expect(path.toLowerCase()).not.toContain('token')
    expect(path.toLowerCase()).not.toContain('secret')
  })
})

describe('凭证投影 fail-closed：toBootstrapResult', () => {
  const full = {
    installation_id: '72057594037928001',
    public_widget_id: '702000000000000101',
    display_name: 'Imboy Shop',
    consent_version: '1',
    branding: { display_name: '店', primary_color: '#0066ff', welcome_text: '欢迎' },
    contact_id: '72057594037927936',
    secret: 's3cr3t-once',
    reused: false,
  }

  it('全键响应完整投影；visitToken 取自 secret；branding 走白名单投影', () => {
    const r = toBootstrapResult(full)
    expect(r).not.toBeNull()
    expect(r!.visitToken).toBe('s3cr3t-once')
    expect(r!.installationId).toBe(full.installation_id)
    expect(r!.branding).toEqual({ displayName: '店', primaryColor: '#0066ff', welcomeText: '欢迎' })
  })

  it('缺 secret / installation_id / contact_id 任一 → null（凭证三件套绝不伪造）', () => {
    expect(toBootstrapResult({ ...full, secret: '' })).toBeNull()
    expect(toBootstrapResult({ ...full, installation_id: '' })).toBeNull()
    expect(toBootstrapResult({ ...full, contact_id: '' })).toBeNull()
    expect(toBootstrapResult(null)).toBeNull()
    expect(toBootstrapResult('not-a-record')).toBeNull()
  })

  it('reused 仅严格 true 才为 true（truthy 非布尔值均按 false 投影）', () => {
    expect(toBootstrapResult({ ...full, reused: true })!.reused).toBe(true)
    expect(toBootstrapResult({ ...full, reused: 'true' })!.reused).toBe(false)
    expect(toBootstrapResult({ ...full, reused: 1 })!.reused).toBe(false)
  })
})

describe('品牌投影 fail-closed：toBrand', () => {
  it('非对象输入 → 默认品牌（在线客服，无色无欢迎语）', () => {
    expect(toBrand(undefined)).toEqual({ displayName: '在线客服', primaryColor: null, welcomeText: null })
  })

  it('颜色形状 #rgb~#rrggbbaa 放行，非法形状归 null；空名回落默认', () => {
    expect(toBrand({ primary_color: '#ff0', display_name: '  ' }).primaryColor).toBe('#ff0')
    expect(toBrand({ primary_color: '#FF00AA12' }).primaryColor).toBe('#FF00AA12')
    expect(toBrand({ primary_color: 'red' }).primaryColor).toBeNull()
    expect(toBrand({ primary_color: '#0066ff; url(x)' }).primaryColor).toBeNull()
    expect(toBrand({ display_name: '  ' }).displayName).toBe('在线客服')
  })
})

describe('列表投影：toSessionList / toMessageList（两形兼容 + 逐项过滤）', () => {
  it('toSessionList 接受裸数组与 {sessions} 包裹，非法行丢弃，非数组 → []', () => {
    const rows = [{ id: '1', status: 'active', version: 2, agents_online: true }, { junk: true }]
    expect(toSessionList(rows)).toHaveLength(1)
    expect(toSessionList({ sessions: rows })).toHaveLength(1)
    expect(toSessionList('nope')).toEqual([])
    expect(toSessionList({ sessions: 'nope' })).toEqual([])
  })

  it('toMessageList 接受裸数组与 {messages}；{message} 解包是逐行合同（行级嵌套形）', () => {
    const row = { id: '9', sender_type: 'contact', body: 'hi', assets: [] }
    expect(toMessageList([row, { id: '' }])).toHaveLength(1)
    expect(toMessageList({ messages: [row] })).toHaveLength(1)
    // 单发响应载荷 {message:{...}} 出现在**行**位置时解包（P1-E2E-01 两形兼容）
    expect(toMessageList([{ message: row }])).toHaveLength(1)
    expect(toMessageList({ message: row })).toEqual([])
    // 缺 sender_type 的行 fail-closed 丢弃
    expect(toMessageList([{ id: '9', body: 'hi' }])).toEqual([])
  })
})

describe('评分与哈希形状门', () => {
  it('isValidRatingScore 仅 1..5 安全整数', () => {
    for (const ok of [1, 3, 5]) expect(isValidRatingScore(ok)).toBe(true)
    for (const bad of [0, 6, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidRatingScore(bad)).toBe(false)
    }
  })

  it('isValidExpectedVersion 仅正安全整数（CAS 版本）', () => {
    expect(isValidExpectedVersion(1)).toBe(true)
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(isValidExpectedVersion(bad)).toBe(false)
  })

  it('isValidSha256Hex 仅 64 位小写 hex（大写/短串/非 hex 拒绝）', () => {
    expect(isValidSha256Hex('a'.repeat(64))).toBe(true)
    expect(isValidSha256Hex('0123456789abcdef'.repeat(4))).toBe(true)
    expect(isValidSha256Hex('A'.repeat(64))).toBe(false)
    expect(isValidSha256Hex('a'.repeat(63))).toBe(false)
    expect(isValidSha256Hex(`${'g'.repeat(63)}a`)).toBe(false)
  })
})
