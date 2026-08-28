import * as React from 'react'
import { cn } from '@/lib/utils'

type TabsOrientation = 'horizontal' | 'vertical'

interface TabsContextValue {
  currentValue: string
  onValueChange: (_value: string) => void
  /** id 基座（useId 生成），trigger 与 panel 的 id/aria 关联均由它派生 */
  baseId: string
  orientation: TabsOrientation
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabs() {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error('Tabs compound components must be used within <Tabs>')
  return ctx
}

interface TabsProps {
  value: string
  onValueChange: (_value: string) => void
  children: React.ReactNode
  className?: string
  orientation?: TabsOrientation
}

export function Tabs({
  value,
  onValueChange,
  children,
  className,
  orientation = 'horizontal',
}: TabsProps) {
  const baseId = React.useId()

  return (
    <TabsContext.Provider value={{ currentValue: value, onValueChange, baseId, orientation }}>
      <div className={cn('space-y-4', className)}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

interface TabsListProps {
  children: React.ReactNode
  className?: string
}

export function TabsList({ children, className }: TabsListProps) {
  const { orientation } = useTabs()

  return (
    <div
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
      role="tablist"
      aria-orientation={orientation}
    >
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

export function TabsTrigger({ value, children, className, disabled }: TabsTriggerProps) {
  const { currentValue, onValueChange, baseId, orientation } = useTabs()
  const isActive = currentValue === value

  // WAI-ARIA APG tabs：方向键在 tablist 内循环 roving focus 并自动激活（对齐 Radix 惯例）。
  // 跳过 disabled tab；DOM 查询而非 React Children，保持复合组件的松散组合。
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight'
    const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft'
    let delta: number
    if (event.key === nextKey) delta = 1
    else if (event.key === prevKey) delta = -1
    else return
    event.preventDefault()
    const tablist = event.currentTarget.closest('[role="tablist"]')
    if (!tablist) return
    const tabs = Array.from(
      tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
    )
    const index = tabs.indexOf(event.currentTarget)
    if (index === -1 || tabs.length === 0) return
    const nextTab = tabs[(index + delta + tabs.length) % tabs.length]
    nextTab.focus()
    if (nextTab.dataset.value) onValueChange(nextTab.dataset.value)
  }

  return (
    <button
      role="tab"
      type="button"
      id={`${baseId}-trigger-${value}`}
      aria-controls={`${baseId}-content-${value}`}
      data-value={value}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      aria-selected={isActive}
      data-state={isActive ? 'active' : 'inactive'}
      onClick={() => onValueChange(value)}
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        isActive
          ? 'bg-background text-foreground shadow-sm'
          : 'hover:bg-background/50 hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { currentValue, baseId } = useTabs()
  if (currentValue !== value) return null

  return (
    <div
      role="tabpanel"
      id={`${baseId}-content-${value}`}
      aria-labelledby={`${baseId}-trigger-${value}`}
      data-state={currentValue === value ? 'active' : 'inactive'}
      className={cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)}
    >
      {children}
    </div>
  )
}
