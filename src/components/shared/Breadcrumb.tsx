import { useLocation, Link } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'

const LABEL_MAP: Record<string, string> = {
  dashboard: '仪表盘',
  users: '用户管理',
  groups: '群组管理',
  channels: '频道管理',
  moments: '朋友圈',
  messages: '消息管理',
  reports: '举报中心',
  feedback: '反馈处理',
  announcements: '全局公告',
  analytics: '运营分析',
  settings: '系统设置',
  features: '功能开关',
  capabilities: '能力配置',
  versions: '版本管理',
  ddl: 'DDL 配置',
  storage: '存储管理',
  admins: '管理员',
  roles: '角色权限',
  logs: '日志审计',
  logoutApplications: '注销申请',
  context: '群上下文入口',
  forbidden: '无权限',
  votes: '投票管理',
  notices: '公告管理',
  categories: '分组分类',
  tags: '标签管理',
  files: '文件管理',
  albums: '相册管理',
  schedules: '日程管理',
  tasks: '任务管理',
  'governance-logs': '治理日志',
  members: '成员管理',
  subscribers: '订阅者',
  'channel-admins': '管理员',
  invitations: '邀请管理',
  orders: '订单管理',
  collects: '收藏管理',
}

function formatSegment(segment: string): string {
  return LABEL_MAP[segment] ?? segment
}

function isDynamicSegment(segment: string): boolean {
  // UUID or numeric IDs
  return /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment) || /^\d+$/.test(segment)
}

export function Breadcrumb() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  if (segments.length === 0) return null

  const items: Array<{ label: string; path: string }> = [
    { label: '首页', path: '/dashboard' },
  ]

  let currentPath = ''
  for (const segment of segments) {
    currentPath += `/${segment}`
    if (isDynamicSegment(segment)) {
      items.push({ label: segment, path: currentPath })
    } else {
      items.push({ label: formatSegment(segment), path: currentPath })
    }
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4" aria-label="面包屑导航">
      <Home className="h-3.5 w-3.5" />
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={item.path} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" />
            {isLast ? (
              <span className="font-medium text-foreground">{item.label}</span>
            ) : (
              <Link to={item.path} className="hover:text-foreground transition-colors">
                {item.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
