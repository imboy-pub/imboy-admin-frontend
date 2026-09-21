/**
 * SEAT-02：坐席工作台六态 UI 原子（A06）。
 * loading / error / empty / offline / retry / permission denied 全部有
 * 可操作状态；紧凑运营工具风格，无嵌套卡片、无营销元素。
 */
import { AlertCircle, Ban, Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SeatFailureKind } from './workbenchHooks'

type StatePanelProps = {
  message: string
  testId: string
}

function panelClass(): string {
  return 'flex flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground'
}

/** loading：aria-busy + 可见文案。 */
export function SeatLoadingState({ message, testId }: StatePanelProps) {
  return (
    <div className={panelClass()} data-testid={testId} aria-busy="true" role="status">
      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
      <span>{message}</span>
    </div>
  )
}

/** error + retry：同一面板给出可操作重试入口。 */
export function SeatErrorState({
  message,
  detail,
  onRetry,
  testId,
}: StatePanelProps & { detail?: string; onRetry: () => void }) {
  return (
    <div className={panelClass()} data-testid={testId} role="alert">
      <AlertCircle aria-hidden="true" className="h-5 w-5 text-destructive" />
      <span>{message}</span>
      {detail !== undefined && <span className="text-xs text-muted-foreground">{detail}</span>}
      <Button type="button" variant="outline" size="sm" onClick={onRetry} data-testid={`${testId}-retry`}>
        <RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
        重试
      </Button>
    </div>
  )
}

/** empty：可解释空态（非错误）。 */
export function SeatEmptyState({ message, testId }: StatePanelProps) {
  return (
    <div className={panelClass()} data-testid={testId} role="status">
      <Ban aria-hidden="true" className="h-5 w-5" />
      <span>{message}</span>
    </div>
  )
}

/** offline：断线横幅 + 重连入口（不遮蔽内容，置顶条状）。 */
export function SeatOfflineBanner({ onRetry, testId = 'seat-offline-banner' }: { onRetry: () => void; testId?: string }) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
      data-testid={testId}
      role="alert"
    >
      <span className="flex items-center gap-2">
        <WifiOff aria-hidden="true" className="h-4 w-4" />
        实时连接已断开，正在展示可能过期的数据
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} data-testid={`${testId}-retry`}>
        <RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
        重连
      </Button>
    </div>
  )
}

/** permission denied：fail-closed 可解释态（非成员/停用/撤权/缺能力）。 */
export function SeatPermissionDeniedState({ message, testId }: StatePanelProps) {
  return (
    <div className={panelClass()} data-testid={testId} role="alert">
      <Ban aria-hidden="true" className="h-5 w-5" />
      <span>{message}</span>
    </div>
  )
}

/** 统一把失败分类映射为错误面板文案（A06：全部可操作）。 */
export function seatFailureMessage(kind: SeatFailureKind): string {
  switch (kind) {
    case 'forbidden':
      return '没有访问该资源的权限'
    case 'network':
      return '网络异常，无法连接服务'
    case 'server':
      return '服务暂时不可用'
    case 'other':
      return '请求失败'
    default:
      return ''
  }
}
