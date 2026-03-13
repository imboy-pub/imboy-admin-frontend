import { ReactNode } from 'react'
import { Search, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type FilterBarProps = {
  children: ReactNode
  onSearch?: () => void
  onReset?: () => void
  searchText?: string
  resetText?: string
  extraActions?: ReactNode
}

export function FilterBar({
  children,
  onSearch,
  onReset,
  searchText = '搜索',
  resetText = '重置',
  extraActions,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        {children}
      </div>
      <div className="flex items-center gap-2">
        {extraActions}
        {onReset && (
          <Button variant="outline" onClick={onReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {resetText}
          </Button>
        )}
        {onSearch && (
          <Button onClick={onSearch}>
            <Search className="mr-2 h-4 w-4" />
            {searchText}
          </Button>
        )}
      </div>
    </div>
  )
}

