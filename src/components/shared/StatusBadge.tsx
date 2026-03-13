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
    success: 'bg-green-100 text-green-800 hover:bg-green-100',
    warning: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
    error: 'bg-red-100 text-red-800 hover:bg-red-100',
    info: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
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
