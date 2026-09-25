/**
 * SEAT-02 / CS-WEB-01 / CS-WEB-02：会话视图面板（消息历史 + 发送 + ACK + 附件）。
 *
 * - 消息区 role="log" + aria-live（新消息播报，A02 实时性可感知）；
 * - 正文按 sender_type 分侧：visitor 左、seat 右、system 居中；
 * - ACK：权威刷新投影 read_at（存在即已读）——SSE payload 不是真源；
 * - 发送：client_msg_id 幂等（失败 → 重试按钮复用同 id，A02/A06）；
 * - 附件预览/下载（CS-WEB-01）：字节只经 Seat Bearer fetch（真实 enterprise
 *   content 端点）获取——图片（mime image/*）内联预览（fetch → Blob →
 *   ObjectURL），其他文件显示 file_name/size_bytes 与下载状态；`status` 非
 *   active 一律渲染占位（pending_confirm/deleted）。Blob URL 生命周期全托管：
 *   组件卸载 / 附件更换 / 401/403/404 / 取消（AbortController）时 revoke，无泄漏；
 *   DOM/href/log 不出现 token / object key / upload URL（A03）。
 * - 单文件发送（CS-WEB-02）：composer 可选单文件（presign → 裸 PUT → confirm
 *   → 发送 asset_ids，编排冻结在 attachmentUpload/useSeatSend）；正文可空但
 *   正文与附件不能同时空（发送按钮禁用 + hooks 前置校验 + 服务端 422 兜底）；
 *   失败保留正文与文件选择（草稿真源在 useSeatSend，失败不清、成功才清零），重试
 *   复用同一 client_msg_id；服务端 422 语义透传到 role=alert 错误条。
 * - 写入口关闭（canWrite=false 或非 active）→ composer 替换为可解释说明。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCheck, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isSeatApiError } from '../errors'
import { type SeatAttachment, type SeatMessage, type SeatSessionDetail } from './contract'
import { SeatEmptyState, SeatErrorState, SeatLoadingState, seatFailureMessage } from './states'
import { seatFailureKind } from './workbenchHooks'

export type SeatSessionViewProps = {
  /** 附件内容获取（Seat Bearer fetch；由页面从 gateway 组装，org scope 闭包在内）。 */
  fetchAssetBlob: SeatAssetFetcher
  detail: SeatSessionDetail | null
  messages: SeatMessage[]
  messagesLoading: boolean
  messagesError: unknown
  onRetryMessages: () => void
  canWrite: boolean
  writeClosedReason: string | null
  /** CS-WEB-02：草稿真源在 useSeatSend（成功清零/失败保留）；视图只消费投影。 */
  draft: { body: string; fileName: string | null; fileSize: number | null }
  onUpdateDraftBody: (_body: string) => void
  onAttachFile: (_file: File) => void
  onDetachFile: () => void
  onSend: () => void
  onRetrySend: () => void
  sendError: unknown
  sending: boolean
  /** CS-WEB-05：当前会话未读数（服务端 read-state；badge 展示，undefined=未知不显示）。 */
  unreadCount?: number
}

/** 附件字节获取器（org scope 由调用方闭包；signal 供取消/卸载中断）。 */
export type SeatAssetFetcher = (_assetId: string, _signal: AbortSignal) => Promise<Blob>

const ATTACHMENT_PHASE_LABEL: Record<SeatAttachment['phase'], string> = {
  pending_confirm: '附件处理中',
  active: '附件',
  deleted: '附件已失效',
}

/** 下载用 ObjectURL 的有界回收延迟（浏览器取得 blob 引用后回收，不中断下载）。 */
const DOWNLOAD_URL_REVOKE_DELAY_MS = 60_000

function attachmentErrorText(error: unknown): string {
  if (isSeatApiError(error)) {
    if (error.kind === 'unauthorized') return '登录已失效，请重新扫码后重试'
    if (error.kind === 'forbidden') return '没有该附件的访问权限'
    if (error.kind === 'not_found') return '附件不存在或已删除'
    if (error.kind === 'network') return '网络异常，请重试'
  }
  return '附件加载失败'
}

/** size_bytes 人类可读（B/KB/MB；null → 不显示）。 */
function formatBytes(size: number | null): string | null {
  if (size === null || size < 0) return null
  if (size < 1024) return `${size} B`
  const kb = size / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function isImageAttachment(attachment: SeatAttachment): boolean {
  return attachment.mime !== null && attachment.mime.toLowerCase().startsWith('image/')
}

/** 触发浏览器保存：Blob → ObjectURL → 隐藏 a[download]（返回待回收的 URL）。 */
function triggerBrowserDownload(blob: Blob, fileName: string | null): string {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName ?? 'imboy-attachment'
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  return objectUrl
}

type SeatAssetPreviewState =
  | { phase: 'loading' }
  | { phase: 'ready'; objectUrl: string; blob: Blob }
  | { phase: 'failed'; error: unknown }

/**
 * 图片内联预览：挂载即 fetch → Blob → ObjectURL。
 * 生命周期：卸载/附件更换/重试重取时 abort in-flight 并 revoke 旧 URL——
 * 401/403/404 走 failed 分支（不持有任何 URL），无泄漏。
 * loading 态按键派生（key 不匹配即 loading），setState 只发生在异步回调。
 */
function useSeatAssetPreview(fetchAssetBlob: SeatAssetFetcher, assetId: string, retryToken: number): SeatAssetPreviewState {
  const key = `${assetId}#${retryToken}`
  const [snapshot, setSnapshot] = useState<{ key: string; state: SeatAssetPreviewState }>({
    key,
    state: { phase: 'loading' },
  })
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    let cancelled = false
    fetchAssetBlob(assetId, controller.signal)
      .then((blob: Blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSnapshot({ key, state: { phase: 'ready', objectUrl, blob } })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setSnapshot({ key, state: { phase: 'failed', error } })
      })
    return () => {
      cancelled = true
      controller.abort()
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [fetchAssetBlob, assetId, retryToken, key])
  return snapshot.key === key ? snapshot.state : { phase: 'loading' }
}

type SeatAssetDownloadState = 'idle' | 'loading' | 'failed'

/**
 * 附件下载状态机：Blob → ObjectURL → a[download]，URL 定时回收；
 * 卸载时 abort in-flight 并兜底 revoke 未回收 URL。
 */
function useSeatAssetDownload(fetchAssetBlob: SeatAssetFetcher, assetId: string) {
  const [state, setState] = useState<SeatAssetDownloadState>('idle')
  const [error, setError] = useState<unknown>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const revokeTimersRef = useRef<Array<{ url: string; timer: ReturnType<typeof setTimeout> }>>([])
  useEffect(() => {
    const controllers = controllerRef
    const timers = revokeTimersRef
    return () => {
      controllers.current?.abort()
      for (const { url, timer } of timers.current) {
        clearTimeout(timer)
        URL.revokeObjectURL(url)
      }
      timers.current = []
    }
  }, [])
  const download = useCallback(
    async (fileName: string | null, readyBlob?: Blob) => {
      if (state === 'loading') return
      setState('loading')
      setError(null)
      try {
        let blob = readyBlob
        if (blob === undefined) {
          const controller = new AbortController()
          controllerRef.current = controller
          blob = await fetchAssetBlob(assetId, controller.signal)
        }
        const url = triggerBrowserDownload(blob, fileName)
        const timer = setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY_MS)
        revokeTimersRef.current.push({ url, timer })
        setState('idle')
      } catch (caught: unknown) {
        setState('failed')
        setError(caught)
      }
    },
    [fetchAssetBlob, assetId, state],
  )
  return { state, error, download }
}

/** 占位徽标：status 非 active（pending_confirm/deleted）不可下载。 */
function AttachmentPlaceholder({ attachment }: { attachment: SeatAttachment }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
      data-testid="seat-attachment-chip"
    >
      <Paperclip aria-hidden="true" className="h-3 w-3" />
      {ATTACHMENT_PHASE_LABEL[attachment.phase]}
    </span>
  )
}

/** 图片附件：内联预览（blob: URL）+ 下载（复用预览 Blob，不重复请求）。 */
function AttachmentImage({ fetchAssetBlob, attachment }: { fetchAssetBlob: SeatAssetFetcher; attachment: SeatAttachment }) {
  const [retryToken, setRetryToken] = useState(0)
  const preview = useSeatAssetPreview(fetchAssetBlob, attachment.assetId, retryToken)
  const download = useSeatAssetDownload(fetchAssetBlob, attachment.assetId)

  if (preview.phase === 'loading') {
    return (
      <span
        className="inline-flex h-20 w-28 items-center justify-center rounded border border-dashed border-border bg-muted/50 text-xs text-muted-foreground"
        data-testid="seat-attachment-image-loading"
        aria-label="图片加载中"
      >
        图片加载中…
      </span>
    )
  }
  if (preview.phase === 'failed') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive"
        data-testid="seat-attachment-image-error"
      >
        <Paperclip aria-hidden="true" className="h-3 w-3" />
        {attachmentErrorText(preview.error)}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => setRetryToken((token) => token + 1)}
          data-testid="seat-attachment-retry"
        >
          重试
        </button>
      </span>
    )
  }
  return (
    <span className="inline-flex flex-col items-start gap-1" data-testid="seat-attachment-image-group">
      <img
        src={preview.objectUrl}
        alt={attachment.fileName ?? '图片附件'}
        data-testid="seat-attachment-image"
        className="max-h-40 max-w-[12rem] rounded border border-border object-cover"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={download.state === 'loading'}
        onClick={() => void download.download(attachment.fileName, preview.blob)}
        data-testid="seat-attachment-download"
      >
        {download.state === 'loading' ? '下载中…' : '下载图片'}
      </Button>
      {download.state === 'failed' && (
        <span className="text-[10px] text-destructive" data-testid="seat-attachment-download-error">
          {attachmentErrorText(download.error)}
        </span>
      )}
    </span>
  )
}

/** 文件附件：file_name + size_bytes + 下载状态（点击才取字节）。 */
function AttachmentFile({ fetchAssetBlob, attachment }: { fetchAssetBlob: SeatAssetFetcher; attachment: SeatAttachment }) {
  const download = useSeatAssetDownload(fetchAssetBlob, attachment.assetId)
  const sizeText = formatBytes(attachment.size)
  return (
    <span
      className="inline-flex max-w-full items-center gap-2 rounded border border-border px-2 py-1 text-xs"
      data-testid="seat-attachment-file"
    >
      <Paperclip aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block max-w-[10rem] truncate text-foreground" data-testid="seat-attachment-file-name">
          {attachment.fileName ?? '未命名文件'}
        </span>
        {sizeText !== null && (
          <span className="block text-[10px] text-muted-foreground" data-testid="seat-attachment-file-size">
            {sizeText}
          </span>
        )}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={download.state === 'loading'}
        onClick={() => void download.download(attachment.fileName)}
        data-testid="seat-attachment-download"
      >
        {download.state === 'loading' ? '下载中…' : download.state === 'failed' ? '重试下载' : '下载'}
      </Button>
      {download.state === 'failed' && (
        <span className="text-[10px] text-destructive" data-testid="seat-attachment-download-error">
          {attachmentErrorText(download.error)}
        </span>
      )}
    </span>
  )
}

/** 附件统一入口：消费 status（active 才可预览/下载；否则占位）。 */
function AttachmentItem({ fetchAssetBlob, attachment }: { fetchAssetBlob: SeatAssetFetcher; attachment: SeatAttachment }) {
  if (attachment.phase !== 'active') return <AttachmentPlaceholder attachment={attachment} />
  if (isImageAttachment(attachment)) return <AttachmentImage fetchAssetBlob={fetchAssetBlob} attachment={attachment} />
  return <AttachmentFile fetchAssetBlob={fetchAssetBlob} attachment={attachment} />
}

function MessageRow({
  message,
  side,
  fetchAssetBlob,
}: {
  message: SeatMessage
  side: 'visitor' | 'seat' | 'system'
  fetchAssetBlob: SeatAssetFetcher
}) {
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
              <AttachmentItem key={attachment.assetId} fetchAssetBlob={fetchAssetBlob} attachment={attachment} />
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
    fetchAssetBlob,
    detail,
    messages,
    messagesLoading,
    messagesError,
    onRetryMessages,
    canWrite,
    writeClosedReason,
    draft,
    onUpdateDraftBody,
    onAttachFile,
    onDetachFile,
    onSend,
    onRetrySend,
    sendError,
    sending,
    unreadCount,
  } = props
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const conversationRef = useRef<HTMLDivElement | null>(null)

  if (detail === null) {
    return (
      <section aria-label="会话内容" className="flex min-h-0 flex-1 items-center justify-center">
        <SeatEmptyState message="从左侧选择一个会话" testId="seat-conversation-empty" />
      </section>
    )
  }

  const composerVisible = canWrite && detail.status === 'active'
  const canSubmit = draft.body.trim().length > 0 || draft.fileName !== null
  const sendErrorMessage = sendErrorText(sendError)

  return (
    <section aria-label="会话内容" className="flex min-h-0 flex-1 flex-col" data-testid="seat-conversation">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="truncate text-sm font-medium" data-testid="seat-conversation-title">
          {detail.visitorMaskedName ?? '访客'}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {detail.status === 'queued' ? '排队中' : detail.status === 'active' ? '进行中' : '已结束'}
          </span>
          {unreadCount !== undefined && unreadCount > 0 && (
            <span
              className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground"
              data-testid="seat-unread-badge"
              aria-label={`未读 ${unreadCount} 条`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
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
              <MessageRow key={message.id} message={message} side={sideOf(message)} fetchAssetBlob={fetchAssetBlob} />
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border p-3">
        {composerVisible ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              onSend()
            }}
          >
            {draft.fileName !== null && (
              <span
                className="inline-flex max-w-full items-center gap-1.5 self-start rounded border border-border bg-muted/50 px-2 py-1 text-xs"
                data-testid="seat-attach-chip"
              >
                <Paperclip aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="max-w-[12rem] truncate" data-testid="seat-attach-chip-name">
                  {draft.fileName}
                </span>
                {formatBytes(draft.fileSize) !== null && (
                  <span className="text-[10px] text-muted-foreground" data-testid="seat-attach-chip-size">
                    {formatBytes(draft.fileSize)}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`移除附件 ${draft.fileName}`}
                  data-testid="seat-attach-remove"
                  disabled={sending}
                  onClick={onDetachFile}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                aria-label="添加附件（单文件）"
                data-testid="seat-attach-input"
                disabled={sending}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file !== undefined) onAttachFile(file)
                  // 允许移除后重选同一文件：受控清空 value。
                  event.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sending}
                onClick={() => fileInputRef.current?.click()}
                data-testid="seat-attach-button"
                aria-label="添加附件"
              >
                <Paperclip aria-hidden="true" className="h-3.5 w-3.5" />
                附件
              </Button>
              <textarea
                aria-label="回复访客"
                data-testid="seat-composer"
                rows={2}
                placeholder="输入回复，或添加附件发送"
                className="min-h-[2.5rem] flex-1 resize-y rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={draft.body}
                disabled={sending}
                onChange={(event) => onUpdateDraftBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    onSend()
                  }
                }}
              />
              <Button
                type="submit"
                size="sm"
                disabled={sending || !canSubmit}
                aria-disabled={sending || !canSubmit}
                aria-label={canSubmit ? '发送' : '请输入正文或添加附件'}
                data-testid="seat-send"
              >
                {sending ? '发送中…' : '发送'}
              </Button>
            </div>
            {!canSubmit && !sending && (
              <p className="text-[10px] text-muted-foreground" data-testid="seat-composer-hint">
                正文与附件不能同时为空
              </p>
            )}
          </form>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="seat-write-closed" role="note">
            {writeClosedReason ?? '当前会话不可回复'}
          </p>
        )}
        {sendError !== null && sendError !== undefined && (
          <div
            className="mt-2 flex items-center justify-between rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive"
            role="alert"
            data-testid="seat-send-error"
          >
            {/* 服务端 422 语义透传（presign mime/size/hash 拒绝等）；无消息时回退通案。 */}
            <span data-testid="seat-send-error-text">
              {sendErrorMessage !== null ? `发送失败：${sendErrorMessage}（内容已保留，可重试）` : '发送失败，内容已保留'}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onRetrySend} data-testid="seat-send-retry">
              重试发送
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

/** 发送错误可解释文本（SeatApiError/上传目标缺失等 message 透传；无则通案）。 */
function sendErrorText(error: unknown): string | null {
  if (error instanceof Error && error.message.length > 0) return error.message
  return null
}
