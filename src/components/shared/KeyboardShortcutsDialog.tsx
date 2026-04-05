import { useState, useEffect } from 'react'
import { Keyboard } from 'lucide-react'

interface ShortcutGroup {
  title: string
  items: Array<{ keys: string; description: string }>
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '全局',
    items: [
      { keys: '⌘ K', description: '打开命令面板' },
      { keys: '?', description: '显示快捷键帮助' },
      { keys: 'Esc', description: '关闭弹窗/面板' },
    ],
  },
  {
    title: '列表页',
    items: [
      { keys: '↑ / K', description: '上一条记录' },
      { keys: '↓ / J', description: '下一条记录' },
      { keys: 'O', description: '查看选中记录详情' },
      { keys: 'Enter', description: '搜索/确认' },
    ],
  },
  {
    title: '举报处理',
    items: [
      { keys: 'R', description: '驳回举报' },
      { keys: 'V', description: '确认违规' },
    ],
  },
  {
    title: '导航',
    items: [
      { keys: '⌘ 1-9', description: '切换侧边栏菜单项' },
    ],
  },
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        setOpen((v) => !v)
        return
      }
      if (event.key === 'Escape' && open) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setOpen(false)}
      />
      <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Keyboard className="h-5 w-5" />
            键盘快捷键
          </h2>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="max-h-96 space-y-4 overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.keys}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <span className="text-sm">{item.description}</span>
                    <span className="flex items-center gap-1">
                      {item.keys.split(' / ').map((key, i) => (
                        <span key={key} className="flex items-center gap-1">
                          {i > 0 && <span className="text-xs text-muted-foreground">/</span>}
                          {key.split('+').map((part, j) => (
                            <span key={j} className="flex items-center gap-0.5">
                              {j > 0 && <span className="text-xs">+</span>}
                              <Kbd>{part}</Kbd>
                            </span>
                          ))}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t pt-3 text-center text-xs text-muted-foreground">
          按 <Kbd>?</Kbd> 或 <Kbd>Esc</Kbd> 关闭
        </div>
      </div>
    </div>
  )
}
