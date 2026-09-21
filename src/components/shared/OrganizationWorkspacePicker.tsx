/**
 * Organization → Workspace 级联选择器（EADM-06 / A6 共享件，W1 独占）。
 *
 * 定位：纯"共享件"，**数据无关（data-agnostic）受控组件**。
 * 它不查询任何后端、不持有 org/workspace 列表数据源——列表由消费者
 * （A3/A4/A5 在 W2 接入的页面）通过 TanStack Query 查询后作为 props 传入。
 * 这样最稳地隔离了本卡片与"新建后端接口 / 新增依赖"的禁令。
 *
 * 可搜索：组件内部对传入的 `organizations` / `workspaces` 数组做**本地子串过滤**
 * （不区分大小写）。若数据量过大需要服务端搜索，消费者应自行按搜索关键字
 * 拉取后传入——组件只负责渲染与交互（详见 CONTRACT.md）。
 *
 * 复用既有 ui primitives：Dialog（radix）、Button、Input。
 */
import * as React from 'react'
import type { EntityId } from '@/types/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** 一个可选选项（组织或工作区）。id 即 TSID，name 用于展示与本地搜索。 */
export interface OrgWorkspaceOption {
  id: EntityId
  name: string
  /** 可选的次级说明（如成员数 / 状态），仅展示用。 */
  meta?: string
}

/** 受控值：当前选中的组织与工作区 TSID。 */
export interface OrganizationWorkspaceValue {
  organizationId: EntityId | null
  workspaceId: EntityId | null
}

export interface OrganizationWorkspacePickerProps {
  /** 受控：当前选中的组织 TSID。 */
  organizationId: EntityId | null
  /** 受控：当前选中的工作区 TSID。 */
  workspaceId: EntityId | null
  /** 组织选项列表（消费者查询后传入；组件仅做本地搜索与渲染）。 */
  organizations: OrgWorkspaceOption[]
  /** 当前组织下的工作区选项列表（消费者按 organizationId 查询后传入）。 */
  workspaces: OrgWorkspaceOption[]
  /** 选中变化回调（任一维度变化都会触发，并给出完整 newValue）。 */
  onChange: (_next: OrganizationWorkspaceValue) => void
  /**
   * 组织维度由用户主动变化时的回调。消费者应在此 refetch 工作区列表
   * （并清掉旧 workspaceId）。仅组织变化时 newValue.workspaceId 已置 null。
   */
  onOrganizationChange?: (_organizationId: EntityId | null) => void
  /** 整体禁用。 */
  disabled?: boolean
  /** 数据加载中（仅影响占位文案与禁用交互）。 */
  loading?: boolean
  organizationLabel?: string
  workspaceLabel?: string
  placeholder?: string
  className?: string
  triggerLabel?: string
}

function filterOptions(
  options: OrgWorkspaceOption[],
  keyword: string
): OrgWorkspaceOption[] {
  const kw = keyword.trim().toLowerCase()
  if (kw.length === 0) return options
  return options.filter((o) => o.name.toLowerCase().includes(kw))
}

export function OrganizationWorkspacePicker({
  organizationId,
  workspaceId,
  organizations,
  workspaces,
  onChange,
  onOrganizationChange,
  disabled = false,
  loading = false,
  organizationLabel = '组织',
  workspaceLabel = '工作区',
  placeholder = '选择组织 / 工作区',
  className,
  triggerLabel = '选择组织与工作区',
}: OrganizationWorkspacePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [orgKeyword, setOrgKeyword] = React.useState('')
  const [wsKeyword, setWsKeyword] = React.useState('')

  const selectedOrg = React.useMemo(
    () => organizations.find((o) => o.id === organizationId) ?? null,
    [organizations, organizationId]
  )
  const selectedWs = React.useMemo(
    () => workspaces.find((w) => w.id === workspaceId) ?? null,
    [workspaces, workspaceId]
  )

  const filteredOrgs = React.useMemo(
    () => filterOptions(organizations, orgKeyword),
    [organizations, orgKeyword]
  )
  const filteredWs = React.useMemo(
    () => filterOptions(workspaces, wsKeyword),
    [workspaces, wsKeyword]
  )

  const triggerText = selectedOrg
    ? selectedWs
      ? `${selectedOrg.name} / ${selectedWs.name}`
      : selectedOrg.name
    : placeholder

  function handlePickOrg(id: EntityId) {
    setOrgKeyword('')
    setWsKeyword('')
    onChange({ organizationId: id, workspaceId: null })
    onOrganizationChange?.(id)
  }

  function handlePickWs(id: EntityId) {
    onChange({ organizationId, workspaceId: id })
    setOpen(false)
  }

  function handleClear() {
    setOrgKeyword('')
    setWsKeyword('')
    onChange({ organizationId: null, workspaceId: null })
    onOrganizationChange?.(null)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || loading}
        aria-label={triggerLabel}
        className={cn('justify-start', className)}
        onClick={() => setOpen(true)}
      >
        <span className={cn('truncate', !selectedOrg && 'text-muted-foreground')}>
          {loading ? '加载中…' : triggerText}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{organizationLabel} / {workspaceLabel}</DialogTitle>
            <DialogDescription>
              先选择组织，再选择其下的工作区；上下文会写入 URL 以便刷新与分享。
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 组织面板 */}
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">{organizationLabel}</div>
              <Input
                type="search"
                value={orgKeyword}
                placeholder={`搜索${organizationLabel}`}
                onChange={(e) => setOrgKeyword(e.target.value)}
                aria-label={`搜索${organizationLabel}`}
              />
              <ul className="max-h-64 overflow-auto rounded-md border border-border p-1">
                {filteredOrgs.length === 0 ? (
                  <li className="px-2 py-3 text-sm text-muted-foreground">无匹配{organizationLabel}</li>
                ) : (
                  filteredOrgs.map((o) => {
                    const active = o.id === organizationId
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          aria-pressed={active}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent',
                            active && 'bg-accent font-medium'
                          )}
                          onClick={() => handlePickOrg(o.id)}
                        >
                          <span className="truncate">{o.name}</span>
                          {o.meta ? (
                            <span className="shrink-0 text-xs text-muted-foreground">{o.meta}</span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>

            {/* 工作区面板 */}
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">{workspaceLabel}</div>
              <Input
                type="search"
                value={wsKeyword}
                placeholder={`搜索${workspaceLabel}`}
                disabled={!selectedOrg}
                onChange={(e) => setWsKeyword(e.target.value)}
                aria-label={`搜索${workspaceLabel}`}
              />
              <ul className="max-h-64 overflow-auto rounded-md border border-border p-1">
                {!selectedOrg ? (
                  <li className="px-2 py-3 text-sm text-muted-foreground">请先选择{organizationLabel}</li>
                ) : filteredWs.length === 0 ? (
                  <li className="px-2 py-3 text-sm text-muted-foreground">无匹配{workspaceLabel}</li>
                ) : (
                  filteredWs.map((w) => {
                    const active = w.id === workspaceId
                    return (
                      <li key={w.id}>
                        <button
                          type="button"
                          aria-pressed={active}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent',
                            active && 'bg-accent font-medium'
                          )}
                          onClick={() => handlePickWs(w.id)}
                        >
                          <span className="truncate">{w.name}</span>
                          {w.meta ? (
                            <span className="shrink-0 text-xs text-muted-foreground">{w.meta}</span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={!selectedOrg && !selectedWs}
            >
              清除选择
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              完成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default OrganizationWorkspacePicker
