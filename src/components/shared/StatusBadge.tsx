import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'secondary'

interface StatusBadgeProps {
  status: number | string
  labels?: Record<number | string, string>
  variants?: Record<number | string, StatusVariant>
  className?: string
}

const defaultVariants: Record<number, StatusVariant> = {
  1: 'success',
  0: 'error',
  '-1': 'secondary',
}

const defaultLabels: Record<number, string> = {
  1: '正常',
  0: '禁用',
  '-1': '已删除',
}

export function StatusBadge({
  status,
  labels = defaultLabels,
  variants = defaultVariants,
  className,
}: StatusBadgeProps) {
  const label = labels[status] || String(status)
  const variant = variants[status] || 'secondary'

  const variantClasses: Record<StatusVariant, string> = {
    success: 'bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/30',
    warning: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/30',
    error: 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/30',
    info: 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/30',
    secondary: 'bg-muted text-muted-foreground hover:bg-muted',
  }

  return (
    <Badge
      variant="outline"
      className={cn(variantClasses[variant], className)}
    >
      {label}
    </Badge>
  )
}
