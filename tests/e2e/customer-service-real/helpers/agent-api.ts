/**
 * P1-E2E-01（A6-E2E）：合成坐席的 API 驱动（任务 A01 指定：坐席侧走 HTTP API）。
 *
 * 全部端点/参数形状已在 9802 真实节点逐条实测（2026-09-20 csww run）：
 * - claim/transfer/close 写路径必带 workspace_id + expected_version（CAS）；
 * - 坐席回消息走企业真源 POST /enterprise/organizations/:org/conversations/:id/messages
 *   （sender_type=business_identity + identity_id；422 逐键报缺）；
 * - ACK recipient_ref 形状 `identity:<iid>`（DB CHECK 同口径）。
 * 注意（实证缺陷候选，已记证据）：坐席回消息要求客户端显式 identity_id，
 * eb_auth 派生的 caller_identity_id 未生效（500 identity_required）。
 */
import {
  BACKEND_BASE,
  WORKSPACE_ID,
  envelope,
  seatLogin,
} from './env'

export { seatLogin }

export interface QueueSession {
  id: string
  status: string
  version: number
  conversation_id: string
  contact_id: string
  business_identity_id?: string | null
}

export class SeatAgent {
  private constructor(
    readonly label: string,
    readonly account: string,
    readonly identityId: string,
    private readonly token: string
  ) {}

  static async login(label: string, account: string, identityId: string): Promise<SeatAgent> {
    const { token } = await seatLogin(account)
    return new SeatAgent(label, account, identityId, token)
  }

  private headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = { authorization: `Bearer ${this.token}` }
    if (json) h['content-type'] = 'application/json'
    return h
  }

  private async call(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${BACKEND_BASE}${path}`, init)
    if (res.status === 401 || res.status === 403) {
      throw new Error(`seat ${this.label} auth rejected on ${path}: HTTP ${res.status}`)
    }
    return res
  }

  /** GET queue（按 workspace 读取当前排队+在办集合）。 */
  async queue(orgId: string): Promise<QueueSession[]> {
    const res = await this.call(
      `/api/v1/cs/organizations/${orgId}/sessions/queue?workspace_id=${WORKSPACE_ID}`,
      { method: 'GET', headers: this.headers(false) }
    )
    if (res.status !== 200) throw new Error(`queue read failed: HTTP ${res.status}`)
    const payload = await envelope<{ sessions: QueueSession[] }>(res)
    return payload.sessions
  }

  /** GET 会话详情（读最新 version，CAS 前置；workspace_id 走 query）。 */
  async detail(orgId: string, sessionId: string): Promise<QueueSession> {
    const res = await this.call(
      `/api/v1/cs/organizations/${orgId}/sessions/${sessionId}?workspace_id=${WORKSPACE_ID}`,
      { method: 'GET', headers: this.headers(false) }
    )
    if (res.status !== 200) throw new Error(`session detail failed: HTTP ${res.status}`)
    return await envelope<QueueSession>(res)
  }

  /** GET 坐席名下会话（status=active|closed 两视图；容量满时的防御清理依据）。 */
  async seatSessions(orgId: string, status: 'active' | 'closed'): Promise<QueueSession[]> {
    const res = await this.call(
      `/api/v1/cs/organizations/${orgId}/seats/sessions?status=${status}&workspace_id=${WORKSPACE_ID}`,
      { method: 'GET', headers: this.headers(false) }
    )
    if (res.status !== 200) throw new Error(`seat session list failed: HTTP ${res.status}`)
    const payload = await envelope<{ sessions?: QueueSession[] }>(res)
    return payload.sessions ?? []
  }

  /** POST claim（CAS；max_concurrent=1 时先收容本坐席遗留 active 会话）。 */
  async claimWithCapacityDefense(orgId: string, sessionId: string, expectedVersion: number): Promise<void> {
    try {
      await this.claim(orgId, sessionId, expectedVersion)
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('seat_at_capacity')) throw err
      // 本 run 前次失败的残留 active 会话（max_concurrent=1）——先关闭再重试。
      for (const stale of await this.seatSessions(orgId, 'active')) {
        const detail = await this.detail(orgId, stale.id)
        await this.close(orgId, stale.id, detail.version, 'e2e-stale-cleanup')
      }
      await this.claim(orgId, sessionId, expectedVersion)
    }
  }

  /** POST claim（CAS）。 */
  async claim(orgId: string, sessionId: string, expectedVersion: number): Promise<void> {
    const res = await this.call(`/api/v1/cs/organizations/${orgId}/sessions/${sessionId}/claim`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ workspace_id: WORKSPACE_ID, expected_version: expectedVersion }),
    })
    if (res.status !== 200) throw new Error(`claim failed: HTTP ${res.status} ${await res.text()}`)
  }

  /** 坐席回消息（企业真源；client_msg_id 幂等）。返回 message id。 */
  async reply(orgId: string, conversationId: string, clientMsgId: string, body: string): Promise<string> {
    const res = await this.call(
      `/api/v1/enterprise/organizations/${orgId}/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({
          body,
          client_msg_id: clientMsgId,
          workspace_id: WORKSPACE_ID,
          sender_type: 'business_identity',
          identity_id: this.identityId,
        }),
      }
    )
    if (res.status !== 200) throw new Error(`agent reply failed: HTTP ${res.status} ${await res.text()}`)
    const payload = await envelope<{ message: { id: string } }>(res)
    return payload.message.id
  }

  /** 坐席读会话消息（企业真源 GET；裸数组载荷；org+workspace 走 query）。 */
  async listMessages(orgId: string, conversationId: string): Promise<Array<{ id: string; sender_type?: string; client_msg_id?: string }>> {
    const qs = new URLSearchParams({ workspace_id: WORKSPACE_ID, organization_id: orgId })
    const res = await this.call(`/api/v1/enterprise/conversations/${conversationId}/messages?${qs.toString()}`, {
      method: 'GET',
      headers: this.headers(false),
    })
    if (res.status !== 200) throw new Error(`agent list messages failed: HTTP ${res.status}`)
    const raw: unknown = await res.json()
    const body = raw as { payload?: unknown }
    const list = Array.isArray(body.payload) ? body.payload : []
    return list as Array<{ id: string; sender_type?: string; client_msg_id?: string }>
  }

  /** ACK（delivery-only；recipient_ref 形状 identity:<iid>）。 */
  async ack(orgId: string, conversationId: string, messageId: string): Promise<void> {
    const res = await this.call(
      `/api/v1/enterprise/organizations/${orgId}/conversations/${conversationId}/messages/${messageId}/ack`,
      {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({ workspace_id: WORKSPACE_ID, recipient_ref: `identity:${this.identityId}` }),
      }
    )
    if (res.status !== 200) throw new Error(`ack failed: HTTP ${res.status} ${await res.text()}`)
  }

  /** transfer 到目标坐席（CAS）。 */
  async transfer(orgId: string, sessionId: string, expectedVersion: number, toIdentityId: string): Promise<void> {
    const res = await this.call(`/api/v1/cs/organizations/${orgId}/sessions/${sessionId}/transfer`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ to_identity_id: toIdentityId, expected_version: expectedVersion, workspace_id: WORKSPACE_ID }),
    })
    if (res.status !== 200) throw new Error(`transfer failed: HTTP ${res.status} ${await res.text()}`)
  }

  /** close（CAS）。 */
  async close(orgId: string, sessionId: string, expectedVersion: number, reason?: string): Promise<void> {
    const body: Record<string, unknown> = { expected_version: expectedVersion, workspace_id: WORKSPACE_ID }
    if (reason !== undefined) body.reason = reason
    const res = await this.call(`/api/v1/cs/organizations/${orgId}/sessions/${sessionId}/close`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(body),
    })
    if (res.status !== 200) throw new Error(`close failed: HTTP ${res.status} ${await res.text()}`)
  }

  /** 治理面：吊销 visit token（owner/admin；A 即 owner；workspace_id 必填）。 */
  async revokeVisitToken(orgId: string, visitTokenId: string): Promise<void> {
    const res = await this.call(`/api/v1/cs/organizations/${orgId}/visit-tokens/${visitTokenId}/revoke`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ workspace_id: WORKSPACE_ID }),
    })
    if (res.status !== 200) throw new Error(`visit token revoke failed: HTTP ${res.status} ${await res.text()}`)
  }
}

/** 访客面 API（bootstrap/建会话/读消息，供负例与评分预置用；真实后端）。 */
export const visitorApi = {
  async bootstrap(orgId: string, publicWidgetId: string, subjectId: string, origin: string): Promise<{ secret: string; contactId: string; consentVersion: string }> {
    const res = await fetch(`${BACKEND_BASE}/api/v1/cs/widget/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: origin },
      body: JSON.stringify({ organization_id: orgId, public_widget_id: publicWidgetId, subject_id: subjectId }),
    })
    if (res.status !== 200) throw new Error(`bootstrap failed: HTTP ${res.status}`)
    const payload = await envelope<{ secret: string; contact_id: string; consent_version: string }>(res)
    return { secret: payload.secret, contactId: payload.contact_id, consentVersion: payload.consent_version }
  },

  /** 建会话（响应键 session_id；无 version）。 */
  async createSession(orgId: string, installationId: string, visitToken: string): Promise<{ id: string }> {
    const res = await fetch(`${BACKEND_BASE}/api/v1/cs/widget/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cs-visit-token': visitToken },
      body: JSON.stringify({ organization_id: orgId, installation_id: installationId }),
    })
    if (res.status !== 200) throw new Error(`visitor create session failed: HTTP ${res.status}`)
    const payload = await envelope<{ session_id: string }>(res)
    return { id: payload.session_id }
  },

  /** 原始响应版（负例专用：不断言成功，回传状态码给断言）。 */
  async rawListMessages(orgId: string, installationId: string, sessionId: string, visitToken: string): Promise<Response> {
    const qs = new URLSearchParams({ organization_id: orgId, installation_id: installationId })
    return fetch(`${BACKEND_BASE}/api/v1/cs/widget/sessions/${sessionId}/messages?${qs.toString()}`, {
      method: 'GET',
      headers: { 'x-cs-visit-token': visitToken },
    })
  },

  /**
   * 访客面评分（POST /sessions/:id/rating；CAS expected_version；token 走
   * x-cs-visit-token 头）。DF-5 期间页面评分视图不可达，A01 用页面会话的
   * 同一 visit token（被动观察页面请求头所得，非拦截）经同一后端动作评分。
   */
  async rate(orgId: string, installationId: string, sessionId: string, expectedVersion: number, rating: number, visitToken: string): Promise<void> {
    const res = await fetch(`${BACKEND_BASE}/api/v1/cs/widget/sessions/${sessionId}/rating`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cs-visit-token': visitToken },
      body: JSON.stringify({ organization_id: orgId, installation_id: installationId, rating, expected_version: expectedVersion }),
    })
    if (res.status !== 200) throw new Error(`visitor rating failed: HTTP ${res.status} ${await res.text()}`)
    await envelope(res)
  },
}
