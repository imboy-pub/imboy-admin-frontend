import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, LogOut, User } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { logout as logoutApi } from '@/modules/identity'
import { trackUxEvent } from '@/lib/uxTelemetry'

type CommandItem = {
  key: string
  label: string
  path: string
  keywords: string[]
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

export function Header() {
  const { admin, logout } = useAuthStore()
  const navigate = useNavigate()
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandKeyword, setCommandKeyword] = useState('')
  const commandInputRef = useRef<HTMLInputElement | null>(null)

  const quickJumpCommand = useMemo(
    () => parseQuickJump(commandKeyword),
    [commandKeyword]
  )

  const filteredCommands = useMemo(() => {
    const normalizedKeyword = commandKeyword.trim().toLowerCase()
    const baseCommands = normalizedKeyword.length === 0
      ? COMMAND_ITEMS
      : COMMAND_ITEMS.filter((command) =>
          command.label.toLowerCase().includes(normalizedKeyword) ||
          command.keywords.some((item) => item.toLowerCase().includes(normalizedKeyword))
        )

    if (!quickJumpCommand) return baseCommands

    const hasDuplicatePath = baseCommands.some((item) => item.path === quickJumpCommand.path)
    if (hasDuplicatePath) return baseCommands
    return [quickJumpCommand, ...baseCommands]
  }, [commandKeyword, quickJumpCommand])

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
      return
    }

    const timer = window.setTimeout(() => {
      commandInputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [commandOpen])

  const handleLogout = async () => {
    try {
      await logoutApi()
    } catch {
      // 忽略服务端登出失败，仍然执行本地登出
    } finally {
      logout()
      navigate('/login')
    }
  }

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

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b bg-background px-6">
        <div className="flex items-center gap-4">
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

          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              {admin?.nickname?.charAt(0) || <User className="h-4 w-4" />}
            </div>
            <span className="text-sm font-medium">{admin?.nickname || '管理员'}</span>
          </div>

          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
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
                placeholder="输入命令或实体 ID，例如：user 1024"
                value={commandKeyword}
                onChange={(event) => setCommandKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredCommands.length > 0) {
                    executeCommand(filteredCommands[0], 'enter')
                  }
                }}
              />
            </div>

            <div className="max-h-[360px] overflow-y-auto p-2">
              {filteredCommands.length > 0 ? (
                filteredCommands.map((command) => (
                  <button
                    key={command.key}
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => executeCommand(command, 'click')}
                  >
                    {command.label}
                  </button>
                ))
              ) : (
                <div className="px-3 py-6 text-sm text-muted-foreground">无匹配命令</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
