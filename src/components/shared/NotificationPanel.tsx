import { useState, useEffect, useCallback } from 'react'
import { Bell, X, Info, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface AdminNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: number
  read: boolean
}

const STORAGE_KEY = 'imboy_admin_notifications'
const MAX_NOTIFICATIONS = 50

const ICON_MAP: Record<NotificationType, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

const COLOR_MAP: Record<NotificationType, string> = {
  info: 'text-blue-500',
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  error: 'text-destructive',
}

export function loadNotifications(): AdminNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_NOTIFICATIONS)
  } catch {
    return []
  }
}

function saveNotifications(items: AdminNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_NOTIFICATIONS)))
  } catch {
    // Ignore quota errors
  }
}

export function pushNotification(notification: Omit<AdminNotification, 'id' | 'timestamp' | 'read'>) {
  const items = loadNotifications()
  const newItem: AdminNotification = {
    ...notification,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    read: false,
  }
  items.unshift(newItem)
  saveNotifications(items)
  window.dispatchEvent(new CustomEvent('admin-notifications-changed'))
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>(loadNotifications)

  const reload = useCallback(() => {
    setNotifications(loadNotifications())
  }, [])

  useEffect(() => {
    window.addEventListener('admin-notifications-changed', reload)
    return () => window.removeEventListener('admin-notifications-changed', reload)
  }, [reload])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAllRead = () => {
    const updated = notifications.map((n) => ({ ...n, read: true }))
    saveNotifications(updated)
    setNotifications(updated)
  }

  const clearAll = () => {
    saveNotifications([])
    setNotifications([])
  }

  const dismiss = (id: string) => {
    const updated = notifications.filter((n) => n.id !== id)
    saveNotifications(updated)
    setNotifications(updated)
  }

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return new Date(ts).toLocaleDateString('zh-CN')
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="relative"
        aria-label={`通知${unreadCount > 0 ? ` (${unreadCount} 条未读)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-24 top-14 z-50 w-96 rounded-lg border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">系统通知</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button type="button" className="text-xs text-primary hover:underline" onClick={markAllRead}>
                  全部已读
                </button>
              )}
              {notifications.length > 0 && (
                <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={clearAll}>
                  清空
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                暂无通知
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = ICON_MAP[n.type]
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 border-b px-4 py-3 last:border-0 ${!n.read ? 'bg-primary/5' : ''}`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${COLOR_MAP[n.type]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{n.title}</span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => dismiss(n.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <span className="text-[11px] text-muted-foreground mt-1 block">{formatTime(n.timestamp)}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </>
  )
}
