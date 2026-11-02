/**
 * V3-27 快捷回复：Seat 会话输入区面板（只读列表 + 标题搜索 + 点击插入）。
 *
 * 合同：v3/specs/cs-quick-reply.md §3/§8——
 * - 列出当前坐席工作空间的快捷回复（只读，点击不发送）；
 * - 标题搜索过滤（前端包含匹配，case-insensitive）；
 * - 点击条目把 content 插入草稿（空草稿填入 / 非空换行追加），
 *   插入后收起面板；发送仍走既有 composer 流程；
 * - 数据新鲜度由 react-query 承担（无 SSE 事件，合同 §6 不扩事件面）。
 * 样式遵循 seat 域既有体系（语义 token class：border-border/bg-muted 等），
 * 紧凑运营风格，无嵌套卡片。
 */
import { useMemo, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { filterSeatQuickReplies, insertQuickReplyContent, type SeatQuickReply } from './quickReplies'
import { seatFailureKind } from './workbenchHooks'
import { seatFailureMessage } from './states'

type SeatQuickReplyPanelProps = {
  replies: SeatQuickReply[]
  loading: boolean
  error: unknown
  onRetry: () => void
  /** 点击条目后的草稿插入回调（收到已按 §8 语义拼接好的正文）。 */
  onInsert: (_nextBody: string) => void
  /** 当前草稿正文（插入语义：非空换行追加）。 */
  draftBody: string
  disabled?: boolean
}

export function SeatQuickReplyPanel(props: SeatQuickReplyPanelProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const filtered = useMemo(
    () => filterSeatQuickReplies(props.replies, search),
    [props.replies, search],
  )

  const insert = (row: SeatQuickReply) => {
    props.onInsert(insertQuickReplyContent(props.draftBody, row.content))
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="relative flex flex-col" data-testid="seat-quick-reply-panel">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-label="快捷回复"
        disabled={props.disabled}
        onClick={() => setOpen((value) => !value)}
        data-testid="seat-quick-reply-toggle"
      >
        <MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />
        快捷回复
      </Button>
      {open && (
        <div
          className="absolute bottom-full left-0 z-10 mb-1 flex w-[min(20rem,80vw)] flex-col gap-2 rounded border border-border bg-background p-2 shadow-sm"
          data-testid="seat-quick-reply-list-panel"
          role="region"
          aria-label="快捷回复列表"
        >
          <input
            type="search"
            aria-label="搜索快捷回复标题"
            placeholder="搜索标题…"
            className="rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            data-testid="seat-quick-reply-search"
          />
          {props.loading ? (
            <p className="px-1 py-2 text-xs text-muted-foreground" data-testid="seat-quick-reply-loading" role="status">
              加载快捷回复…
            </p>
          ) : props.error !== null && props.error !== undefined ? (
            <div
              className="flex items-center justify-between gap-2 px-1 py-2 text-xs text-destructive"
              data-testid="seat-quick-reply-error"
              role="alert"
            >
              <span>{seatFailureMessage(seatFailureKind(props.error)) ?? '快捷回复加载失败'}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={props.onRetry}
                data-testid="seat-quick-reply-retry"
              >
                重试
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p
              className="px-1 py-2 text-xs text-muted-foreground"
              data-testid="seat-quick-reply-empty"
              role="status"
            >
              {props.replies.length === 0 ? '暂无快捷回复' : '没有匹配的快捷回复'}
            </p>
          ) : (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto" aria-label="快捷回复条目">
              {filtered.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => insert(row)}
                    disabled={props.disabled}
                    data-testid={`seat-quick-reply-item-${row.id}`}
                    title={row.content}
                  >
                    <span className="max-w-full truncate text-sm text-foreground">{row.title}</span>
                    <span className="max-w-full truncate text-xs text-muted-foreground">
                      {row.content}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
