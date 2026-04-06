import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trackUxEvent } from '@/lib/uxTelemetry'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { NotificationPanel } from '@/components/shared/NotificationPanel'
import { AdminProfilePanel } from '@/components/shared/AdminProfilePanel'
import { useSidebarMobile } from './AdminLayout'
import { searchUsersPayload } from '@/modules/identity'
import { searchGroupsPayload } from '@/modules/groups'
import { searchChannelsPayload } from '@/modules/channels'

type CommandItem = {
  key: string
  label: string
  path: string
  keywords: string[]
  group?: string
}

type EntitySearchResult = {
  type: 'user' | 'group' | 'channel'
  id: string | number
  name: string
  subtitle?: string
}

const COMMAND_ITEMS: CommandItem[] = [
  { key: 'dashboard', label: '前往 仪表盘', path: '/dashboard', keywords: ['dashboard', 'home', '仪表盘'] },
  { key: 'users', label: '前往 用户管理', path: '/users', keywords: ['user', 'users', '用户'] },
  { key: 'groups', label: '前往 群组管理', path: '/groups', keywords: ['group', 'groups', '群组'] },
  { key: 'channels', label: '前往 频道管理', path: '/channels', keywords: ['channel', 'channels', '频道'] },
  { key: 'moments', label: '前往 朋友圈治理', path: '/moments', keywords: ['moment', 'moments', '朋友圈', '动态'] },
  { key: 'reports', label: '前往 举报中心', path: '/reports', keywords: ['report', 'reports', '举报'] },
  { key: 'feedback', label: '前往 反馈处理', path: '/feedback', keywords: ['feedback', '反馈'] },
  { key: 'messages', label: '前往 消息管理', path: '/messages', keywords: ['messages', '消息'] },
  { key: 'logout-applications', label: '前往 注销申请', path: '/logout-applications', keywords: ['logout', '注销'] },
  { key: 'logs', label: '前往 日志审计', path: '/logs', keywords: ['log', 'logs', '审计'] },
]

function parseQuickJump(keyword: string): CommandItem | null {
  const matched = keyword.trim().match(/^(user|group|channel|moment)\s+([a-zA-Z0-9_-]+)$/i)
  if (!matched) return null

  const entity = matched[1].toLowerCase()
  const entityId = matched[2]

  const mapping: Record<string, { label: string; pathPrefix: string }> = {
    user: { label: '用户详情', pathPrefix: '/users/' },
    group: { label: '群组详情', pathPrefix: '/groups/' },
    channel: { label: '频道详情', pathPrefix: '/channels/' },
    moment: { label: '动态详情', pathPrefix: '/moments/' },
  }

  const target = mapping[entity]
  if (!target) return null

  return {
    key: `quick:${entity}:${entityId}`,
    label: `打开 ${target.label} ${entityId}`,
    path: `${target.pathPrefix}${entityId}`,
    keywords: [entity, entityId],
  }
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  user: '用户',
  group: '群组',
  channel: '频道',
}

function entityToCommandItem(result: EntitySearchResult): CommandItem {
  const pathMap: Record<string, string> = {
    user: `/users/${result.id}`,
    group: `/groups/${result.id}`,
    channel: `/channels/${result.id}`,
  }
  return {
    key: `entity:${result.type}:${result.id}`,
    label: result.name,
    path: pathMap[result.type] || '/',
    keywords: [result.type, String(result.id), result.name],
    group: ENTITY_TYPE_LABELS[result.type],
  }
}

export function Header() {
  const { toggleMobile } = useSidebarMobile()
  const navigate = useNavigate()
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandKeyword, setCommandKeyword] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [entityResults, setEntityResults] = useState<EntitySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const commandInputRef = useRef<HTMLInputElement | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const quickJumpCommand = useMemo(
    () => parseQuickJump(commandKeyword),
    [commandKeyword]
  )

  // 实体搜索：防抖 300ms，最少 2 字符
  const performEntitySearch = useCallback(async (keyword: string) => {
    if (keyword.length < 2) {
      setEntityResults([])
      setSearching(false)
      return
    }

    // 如果匹配快速跳转模式，跳过搜索
    if (parseQuickJump(keyword)) {
      setEntityResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    try {
      const [usersRes, groupsRes, channelsRes] = await Promise.allSettled([
        searchUsersPayload(keyword, 1, 5),
        searchGroupsPayload(keyword, 1, 5),
        searchChannelsPayload({ keyword, limit: 5 }),
      ])

      const results: EntitySearchResult[] = []

      if (usersRes.status === 'fulfilled') {
        for (const user of usersRes.value.items.slice(0, 5)) {
          results.push({
            type: 'user',
            id: user.id,
            name: user.nickname || user.account || `#${user.id}`,
            subtitle: user.account,
          })
        }
      }

      if (groupsRes.status === 'fulfilled') {
        for (const group of groupsRes.value.items.slice(0, 5)) {
          results.push({
            type: 'group',
            id: group.id,
            name: group.title || `#${group.id}`,
            subtitle: `${group.member_count} 成员`,
          })
        }
      }

      if (channelsRes.status === 'fulfilled') {
        for (const channel of channelsRes.value.items.slice(0, 5)) {
          results.push({
            type: 'channel',
            id: channel.id,
            name: channel.name || `#${channel.id}`,
            subtitle: `${channel.subscriber_count || 0} 订阅`,
          })
        }
      }

      setEntityResults(results)
    } catch {
      setEntityResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  // 防抖搜索
  useEffect(() => {
    if (!commandOpen) return
    const keyword = commandKeyword.trim()

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }

    if (keyword.length < 2 || parseQuickJump(keyword)) {
      setEntityResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    searchTimerRef.current = setTimeout(() => {
      performEntitySearch(keyword)
    }, 300)

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
      }
    }
  }, [commandKeyword, commandOpen, performEntitySearch])

  const entityCommands = useMemo(
    () => entityResults.map(entityToCommandItem),
    [entityResults]
  )

  const filteredCommands = useMemo(() => {
    const normalizedKeyword = commandKeyword.trim().toLowerCase()
    const baseCommands = normalizedKeyword.length === 0
      ? COMMAND_ITEMS
      : COMMAND_ITEMS.filter((command) =>
          command.label.toLowerCase().includes(normalizedKeyword) ||
          command.keywords.some((item) => item.toLowerCase().includes(normalizedKeyword))
        )

    if (!quickJumpCommand) return [...entityCommands, ...baseCommands]

    const hasDuplicatePath = baseCommands.some((item) => item.path === quickJumpCommand.path)
    if (hasDuplicatePath) return [...entityCommands, ...baseCommands]
    return [quickJumpCommand, ...entityCommands, ...baseCommands]
  }, [commandKeyword, quickJumpCommand, entityCommands])

  // 搜索结果变化时重置选中索引
  useEffect(() => {
    setActiveIndex(0)
  }, [filteredCommands])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
        return
      }

      if (event.key === 'Escape') {
        setCommandOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!commandOpen) {
      setCommandKeyword('')
      setActiveIndex(0)
      setEntityResults([])
      setSearching(false)
      return
    }

    const timer = window.setTimeout(() => {
      commandInputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [commandOpen])

  const executeCommand = (command: CommandItem, trigger: 'click' | 'enter') => {
    trackUxEvent('ux_command_palette_execute', {
      command_key: command.key,
      command_label: command.label,
      path: command.path,
      trigger,
      keyword: commandKeyword.trim(),
    })
    navigate(command.path)
    setCommandOpen(false)
    setCommandKeyword('')
  }

  // 分组渲染：实体搜索结果 vs 导航命令
  const groupedItems = useMemo(() => {
    const groups: Array<{ label: string; items: CommandItem[] }> = []
    const entityItems = filteredCommands.filter((c) => c.group)
    const navItems = filteredCommands.filter((c) => !c.group && !c.key.startsWith('quick:'))
    const quickItems = filteredCommands.filter((c) => c.key.startsWith('quick:'))

    if (quickItems.length > 0) {
      groups.push({ label: '快速跳转', items: quickItems })
    }
    if (entityItems.length > 0) {
      groups.push({ label: '实体搜索', items: entityItems })
    }
    if (navItems.length > 0) {
      groups.push({ label: '导航', items: navItems })
    }
    return groups
  }, [filteredCommands])

  // 平坦索引用于键盘导航
  const flatList = useMemo(
    () => groupedItems.flatMap((g) => g.items),
    [groupedItems]
  )

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b bg-background px-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={toggleMobile}
            aria-label="打开菜单"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Imboy 管理后台</h1>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCommandOpen(true)}
            title="打开命令面板 (Cmd/Ctrl+K)"
          >
            Cmd/Ctrl + K
          </Button>

          <NotificationPanel />

          <ThemeToggle />

          <AdminProfilePanel />
        </div>
      </header>

      {commandOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
          onClick={() => setCommandOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-lg border bg-background shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b p-3">
              <Input
                ref={commandInputRef}
                placeholder="搜索用户、群组、频道或输入命令，例如：user 1024"
                value={commandKeyword}
                onChange={(event) => setCommandKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setActiveIndex((prev) => Math.min(prev + 1, flatList.length - 1))
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setActiveIndex((prev) => Math.max(prev - 1, 0))
                  } else if (event.key === 'Enter' && flatList.length > 0) {
                    executeCommand(flatList[activeIndex], 'enter')
                  }
                }}
              />
            </div>

            <div className="max-h-[400px] overflow-y-auto p-2">
              {searching && entityResults.length === 0 && commandKeyword.trim().length >= 2 && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">搜索中...</div>
              )}

              {!searching && flatList.length === 0 && commandKeyword.trim().length >= 2 && (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  未找到匹配「{commandKeyword.trim()}」的结果
                </div>
              )}

              {!searching && flatList.length === 0 && commandKeyword.trim().length < 2 && (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">输入关键词搜索用户、群组、频道</div>
              )}

              {groupedItems.map((group) => {
                const groupStartIndex = flatList.indexOf(group.items[0])
                return (
                  <div key={group.label}>
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{group.label}</div>
                    {group.items.map((command) => {
                      const globalIndex = groupStartIndex + group.items.indexOf(command)
                      return (
                        <button
                          key={command.key}
                          type="button"
                          className={`w-full rounded-md px-3 py-2 text-left text-sm flex items-center justify-between ${globalIndex === activeIndex ? 'bg-muted' : 'hover:bg-muted'}`}
                          onClick={() => executeCommand(command, 'click')}
                          onMouseEnter={() => setActiveIndex(globalIndex)}
                        >
                          <span className="truncate">{command.label}</span>
                          <span className="shrink-0 ml-2 text-xs text-muted-foreground">
                            {command.group && (
                              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                {command.group}
                              </span>
                            )}
                            {!command.group && !command.key.startsWith('quick:') && (
                              <span className="text-muted-foreground/60">{command.path}</span>
                            )}
                            {command.key.startsWith('quick:') && (
                              <span className="text-muted-foreground/60">回车跳转</span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
              <span>输入「user 1024」快速跳转</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
