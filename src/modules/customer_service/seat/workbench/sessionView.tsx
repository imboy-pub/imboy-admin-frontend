/**
 * SEAT-02：会话视图面板（消息历史 + 发送 + ACK + 附件显示）。
 *
 * - 消息区 role="log" + aria-live（新消息播报，A02 实时性可感知）；
 * - 正文按 sender_type 分侧：visitor 左、seat 右、system 居中；
 * - ACK：权威刷新投影 read_at（存在即已读）——SSE payload 不是真源；
 * - 发送：client_msg_id 幂等（失败 → 重试按钮复用同 id，A02/A06）；
 * - 附件：只渲染 content 代理路径（seatAssetContentPath）+ §3.7 阶段徽标；
 *   全链不出现 object key / upload URL / JWT（A03）；
 * - 写入口关闭（canWrite=false 或非 active）→ composer 替换为可解释说明。
 */
import { useRef } from 'react'
import { CheckCheck, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { seatAssetContentPath, type SeatAttachment, type SeatMessage, type SeatSessionDetail } from './contract'
import { SeatEmptyState, SeatErrorState, SeatLoadingState, seatFailureMessage } from './states'
import { seatFailureKind } from './workbenchHooks'

export type SeatSessionViewProps = {
  orgId: string
  detail: SeatSessionDetail | null
  messages: SeatMessage[]
  messagesLoading: boolean
  messagesError: unknown
  onRetryMessages: () => void
  canWrite: boolean
  writeClosedReason: string | null
  onSend: (_body: string) => void
  onRetrySend: () => void
  sendError: unknown
  sending: boolean
}

const ATTACHMENT_PHASE_LABEL: Record<SeatAttachment['phase'], string> = {
  pending_confirm: '附件处理中',
  active: '附件',
  deleted: '附件已失效',
}

function AttachmentChip({ orgId, detail, attachment }: { orgId: string; detail: SeatSessionDetail; attachment: SeatAttachment }) {
  if (attachment.phase !== 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground" data-testid="seat-attachment-chip">
        <Paperclip aria-hidden="true" className="h-3 w-3" />
        {ATTACHMENT_PHASE_LABEL[attachment.phase]}
      </span>
    )
  }
  // A03：href 只能由 content 代理路径生成；无 object key / upload URL / token。
  const href = seatAssetContentPath(orgId, detail.id, attachment.assetId)
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs text-primary underline-offset-2 hover:underline"
      data-testid="seat-attachment-chip"
      download
    >
      <Paperclip aria-hidden="true" className="h-3 w-3" />
      {attachment.fileName ?? ATTACHMENT_PHASE_LABEL.active}
    </a>
  )
}

function MessageRow({ message, side, orgId, detail }: { message: SeatMessage; side: 'visitor' | 'seat' | 'system'; orgId: string; detail: SeatSessionDetail }) {
  if (side === 'system') {
    return (
      <li className="text-center text-xs text-muted-foreground" data-testid="seat-message-system">
        {message.body ?? ''}
      </li>
    )
  }
  const align = side === 'seat' ? 'items-end' : 'items-start'
  return (
    <li className={`flex flex-col ${align}`} data-testid={`seat-message-${message.id}`}>
      <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${side === 'seat' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
        {message.body !== null && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        {message.attachments.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.attachments.map((attachment) => (
              <AttachmentChip key={attachment.assetId} orgId={orgId} detail={detail} attachment={attachment} />
            ))}
          </div>
        )}
      </div>
      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        {message.readAt !== null && (
          <span aria-label="已读" data-testid="seat-message-acked">
            <CheckCheck aria-hidden="true" className="h-3 w-3" />
          </span>
        )}
        {message.createdAt !== null ? message.createdAt : ''}
      </span>
    </li>
  )
}

function sideOf(message: SeatMessage): 'visitor' | 'seat' | 'system' {
  if (message.senderType === 'contact' || message.senderType === 'visitor') return 'visitor'
  if (message.senderType === 'system') return 'system'
  return 'seat'
}

export function SeatSessionView(props: SeatSessionViewProps) {
  const {
    orgId,
    detail,
    messages,
    messagesLoading,
    messagesError,
    onRetryMessages,
    canWrite,
    writeClosedReason,
    onSend,
    onRetrySend,
    sendError,
    sending,
  } = props
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const conversationRef = useRef<HTMLDivElement | null>(null)

  if (detail === null) {
    return (
      <section aria-label="会话内容" className="flex min-h-0 flex-1 items-center justify-center">
        <SeatEmptyState message="从左侧选择一个会话" testId="seat-conversation-empty" />
      </section>
    )
  }

  const composerVisible = canWrite && detail.status === 'active'

  return (
    <section aria-label="会话内容" className="flex min-h-0 flex-1 flex-col" data-testid="seat-conversation">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="truncate text-sm font-medium" data-testid="seat-conversation-title">
          {detail.visitorMaskedName ?? '访客'}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {detail.status === 'queued' ? '排队中' : detail.status === 'active' ? '进行中' : '已结束'}
          </span>
        </h2>
      </header>
      <div
        ref={conversationRef}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 outline-none"
        data-testid="seat-message-list"
      >
        {messagesLoading && messages.length === 0 ? (
          <SeatLoadingState message="加载消息…" testId="seat-messages-loading" />
        ) : seatFailureKind(messagesError) !== null ? (
          <SeatErrorState
            message={seatFailureMessage(seatFailureKind(messagesError)) ?? '消息加载失败'}
            onRetry={onRetryMessages}
            testId="seat-messages-error"
          />
        ) : messages.length === 0 ? (
          <SeatEmptyState message="暂无消息" testId="seat-messages-empty" />
        ) : (
          <ul role="log" aria-live="polite" aria-label="消息记录" className="flex flex-col gap-2">
            {messages.map((message) => (
              <MessageRow key={message.id} message={message} side={sideOf(message)} orgId={orgId} detail={detail} />
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border p-3">
        {composerVisible ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const composer = composerRef.current
              if (composer === null) return
              onSend(composer.value)
              composer.value = ''
            }}
          >
            <textarea
              ref={composerRef}
              aria-label="回复访客"
              data-testid="seat-composer"
              rows={2}
              className="min-h-[2.5rem] flex-1 resize-y rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  const composer = composerRef.current
                  if (composer === null) return
                  onSend(composer.value)
                  composer.value = ''
                }
              }}
            />
            <Button type="submit" size="sm" disabled={sending} data-testid="seat-send">
              {sending ? '发送中…' : '发送'}
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="seat-write-closed" role="note">
            {writeClosedReason ?? '当前会话不可回复'}
          </p>
        )}
        {sendError !== null && sendError !== undefined && (
          <div className="mt-2 flex items-center justify-between rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert" data-testid="seat-send-error">
            <span>发送失败，内容已保留</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetrySend} data-testid="seat-send-retry">
              重试发送
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
