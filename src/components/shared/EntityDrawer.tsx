import { ReactNode, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
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
        className={cn(
          'flex h-full w-full max-w-xl flex-col border-l border-slate-200/80 bg-white text-slate-900 shadow-2xl dark:border-slate-800/80 dark:bg-slate-950 dark:text-slate-100 bg-background text-foreground',
          className
        )}
      >
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{title}</h2>
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
