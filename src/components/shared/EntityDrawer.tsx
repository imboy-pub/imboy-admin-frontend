import { ReactNode, useEffect, useId, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface EntityDrawerProps {
  open: boolean
  onOpenChange: (_open: boolean) => void
  title: string
  subtitle?: string
  loading?: boolean
  error?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

export function EntityDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  loading = false,
  error,
  actions,
  children,
  className,
}: EntityDrawerProps) {
  const asideRef = useRef<HTMLElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined

    const aside = asideRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = (): HTMLElement[] =>
      aside ? Array.from(aside.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : []

    // 初始焦点落入抽屉：首个可聚焦元素，否则抽屉容器本身。
    ;(focusables()[0] ?? aside)?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
        return
      }
      if (event.key !== 'Tab' || !aside) return

      const items = focusables()
      if (items.length === 0) {
        // 无可聚焦子元素时，锁定在抽屉容器上，防止 Tab 跑到被遮罩背景。
        event.preventDefault()
        aside.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === aside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      // 关闭时把焦点归还给打开抽屉前的元素。
      previouslyFocused?.focus?.()
    }
  }, [onOpenChange, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        className="flex-1 bg-black/45 backdrop-blur-[1px]"
        onClick={() => onOpenChange(false)}
        aria-label="关闭抽屉"
      />

      <aside
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'flex h-full w-full max-w-xl flex-col border-l border-border bg-background text-foreground shadow-2xl',
          className
        )}
      >
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div className="space-y-1">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="text-sm text-muted-foreground">加载中...</p>}
          {!loading && error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && children}
        </div>

        {actions && (
          <div className="border-t px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>
        )}
      </aside>
    </div>
  )
}
