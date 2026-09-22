import { useCallback, useMemo, useState } from 'react'
import { KeyRound, ShieldAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { dismissOnce, readOnce, type SecretRevealMode } from '../api/secretOnetime'

const MODE_LABELS: Record<SecretRevealMode, string> = {
  issue: '新签发',
  rotate: '轮换后',
}

export type SecretOncePanelProps = {
  credentialId: string
  /** 销毁后的回调（父组件可据此清掉“待展示”状态）。 */
  onDismissed?: () => void
}

/**
 * 一次性 secret 展示面板（plan-full §7「secret only-once」）。
 *
 * - 明文来自 `secretOnetime` 的**内存仓**（`readOnce`），不来自任何网络读面；
 * - 只在本组件渲染一次展示窗口；点「我已保存」或离开页面后 `readOnce` 恒 null；
 * - 页面刷新后内存仓为空 ⇒ 明文不可再见（不是 CSS 隐藏）。
 */
export function SecretOncePanel({ credentialId, onDismissed }: SecretOncePanelProps) {
  const [tick, setTick] = useState(0)
  // tick 只是「销毁后重算」的触发器：readOnce 是内存仓读，不是可缓存派生值
  //（刻意不放 React Query 缓存 —— 见 secretOnetime 的合同说明）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reveal = useMemo(() => readOnce(credentialId), [credentialId, tick])

  const handleDismiss = useCallback(() => {
    dismissOnce(credentialId)
    setTick((prev) => prev + 1)
    onDismissed?.()
  }, [credentialId, onDismissed])

  if (reveal === null) {
    return (
      <div
        className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
        data-testid="secret-once-tombstone"
      >
        <ShieldAlert className="mb-1 h-4 w-4" />
        该凭证的明文 secret **不可再显示**（一次性：已销毁 / 已离开页面 / 已刷新）。如需新 secret，请执行「轮换」。
      </div>
    )
  }

  return (
    <div
      className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
      data-testid="secret-once-panel"
      data-window-id={reveal.windowId}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4" />
        凭证明文（{MODE_LABELS[reveal.mode]}）
        <Badge variant="secondary">只显示这一次</Badge>
      </div>
      <code
        className="block break-all rounded bg-background px-2 py-1.5 font-mono text-xs"
        data-testid="secret-once-value"
      >
        {reveal.secret}
      </code>
      <p className="text-xs text-muted-foreground">
        立即保存到你的密钥管理系统。关闭、刷新或点击「我已保存」后，本页与任何后续读面都不会再返回该明文；
        平台不提供二次查看，也不回显 digest。
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(reveal.secret)
          }}
        >
          复制
        </Button>
        <Button size="sm" variant="destructive" onClick={handleDismiss} data-testid="secret-once-dismiss">
          <Trash2 className="mr-1 h-4 w-4" />
          我已保存（永久销毁）
        </Button>
      </div>
    </div>
  )
}
