/**
 * SEAT-02：坐席 QR 扫码登录门（复用 SEAT-01 QrLoginSession 合同流）。
 *
 * - device_id 由 deviceIdentity 生成并 localStorage 持久化（非敏感设备柄，
 *   SEAT-01 遗留缺口⑤）；JWT 不经本组件（onConfirmed → establishSeatSession）；
 * - 二维码内容 = qr_token 合同字符串（非凭证；60s 服务端自过期）；
 * - expired/cancelled/401 → onEnded → 页面回登录并给可解释文案；
 * - a11y：阶段文案 aria-live；手动「换一张码」键盘可达。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { QrLoginSession, type QrLoginCallbacks, type QrLoginEndReason, type QrLoginPhase } from '../qrLoginSession'
import { isSeatApiError } from '../errors'
import { getOrCreateSeatDeviceId } from './deviceIdentity'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export type SeatQrLoginPanelProps = {
  createSession: (_callbacks: QrLoginCallbacks) => QrLoginSession
  onConfirmed: (_token: string) => void
  onEnded: (_reason: QrLoginEndReason) => void
  /** 端原因 → 登录页可解释文案（来自 store endReason）。 */
  notice?: string | null
}

const PHASE_TEXT: Record<QrLoginPhase, string> = {
  creating: '正在生成登录二维码…',
  awaiting_scan: '请用手机 Imboy 扫码登录',
  scanned: '已扫码，请在手机上确认',
  confirmed: '登录成功，正在进入工作台…',
  ended: '登录未完成',
}

/** qr_token → 二维码合同字符串（坐席端只做承载；编码渲染由 css/文本展示）。 */
function qrCodeContent(qrToken: string): string {
  return `imboy://qr_login?qr_token=${encodeURIComponent(qrToken)}`
}

export function SeatQrLoginPanel({ createSession, onConfirmed, onEnded, notice }: SeatQrLoginPanelProps) {
  const [phase, setPhase] = useState<QrLoginPhase>('creating')
  const [qrToken, setQrToken] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const sessionRef = useRef<QrLoginSession | null>(null)

  /** 构造并启动一次 QR 会话（不触碰同步 UI 状态；回调里才 setState）。 */
  const createAndStart = useCallback(() => {
    if (sessionRef.current !== null) sessionRef.current.dispose()
    const session = createSession({
      onQrCreated: (created) => {
        setQrToken(created.qrToken)
        setPhase('awaiting_scan')
      },
      onScanned: () => setPhase('scanned'),
      onConfirmed: (token) => {
        setPhase('confirmed')
        onConfirmed(token)
      },
      onEnded: (reason) => {
        setPhase('ended')
        sessionRef.current = null
        onEnded(reason)
      },
      onError: (error) => {
        if (isSeatApiError(error) && error.kind === 'network') setErrorText('网络异常，正在重试')
      },
    })
    sessionRef.current = session
    void session.start({ deviceId: getOrCreateSeatDeviceId(), deviceName: 'Web 坐席工作台', platform: 'web' }).catch(
      (error: unknown) => {
        setPhase('ended')
        void isSeatApiError(error)
        setErrorText('二维码生成失败，请重试')
      },
    )
  }, [createSession, onConfirmed, onEnded])

  /** 手动换码：重置展示态再重开会话（键盘可达入口）。 */
  const restart = useCallback(() => {
    setErrorText(null)
    setQrToken(null)
    setPhase('creating')
    createAndStart()
  }, [createAndStart])

  useEffect(() => {
    createAndStart()
    return () => {
      sessionRef.current?.dispose()
      sessionRef.current = null
    }
  }, [createAndStart])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm" data-testid="seat-qr-login">
        <CardHeader>
          <CardTitle className="text-lg">坐席登录</CardTitle>
          <CardDescription>使用手机 Imboy 扫码，登录 Web 坐席工作台</CardDescription>
        </CardHeader>
        <CardContent>
          {notice !== null && notice !== undefined && notice.length > 0 && (
            <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert" data-testid="seat-login-notice">
              {notice}
            </p>
          )}
          <div className="flex flex-col items-center gap-4">
            <div
              className="flex h-48 w-48 items-center justify-center break-all rounded border border-border bg-muted p-2 text-[10px] leading-tight text-muted-foreground"
              data-testid="seat-qr-code"
              aria-label={qrToken === null ? '二维码生成中' : '登录二维码'}
            >
              {qrToken === null ? <span>生成中…</span> : <span className="select-all">{qrCodeContent(qrToken)}</span>}
            </div>
            <p className="text-sm text-foreground" aria-live="polite" data-testid="seat-qr-phase">
              {PHASE_TEXT[phase]}
            </p>
            {errorText !== null && (
              <p className="text-sm text-destructive" role="alert">
                {errorText}
              </p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={restart} data-testid="seat-qr-refresh">
              换一张码
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
