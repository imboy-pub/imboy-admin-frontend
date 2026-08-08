import {
  LayoutDashboard,
  Users,
  UsersRound,
  MessageSquare,
  UserMinus,
  Radio,
  MessageCircle,
  Settings,
  Shield,
  KeyRound,
  FileText,
  BarChart3,
  Camera,
  Megaphone,
  HeartPulse,
  HardDrive,
  Puzzle,
  Wallet,
  CreditCard,
  DollarSign,
  Receipt,
  TrendingUp,
  BadgeCheck,
  ArrowDownToLine,
  ShieldAlert,
  ListChecks,
  Link2,
  Bot,
  type LucideIcon,
} from 'lucide-react'
import type { SidebarMenuConfig } from '@/services/api/adminConfig'

export type SidebarMenuItem = {
  key: string
  path?: string
  label: string
  icon: LucideIcon
  roles?: Array<number | string>
  permission?: string
  children?: SidebarMenuItem[]
}

export const SIDEBAR_FAVORITES_KEY = 'imboy_admin_sidebar_favorites'

export const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  UsersRound,
  MessageSquare,
  UserMinus,
  Radio,
  MessageCircle,
  Settings,
  Shield,
  KeyRound,
  FileText,
  Camera,
  Megaphone,
  BarChart3,
  HeartPulse,
  HardDrive,
  Puzzle,
  Wallet,
  CreditCard,
  DollarSign,
  Receipt,
  TrendingUp,
  BadgeCheck,
  ArrowDownToLine,
  ShieldAlert,
  ListChecks,
  Link2,
  Bot,
}

export const defaultConfig: SidebarMenuConfig = {
  title: 'Imboy Admin',
  items: [
    { path: '/dashboard', icon: 'LayoutDashboard', label: '仪表盘', roles: [1, 2, 3], permission: 'dashboard:view' },
    {
      label: '运营中心',
      icon: 'Users',
      children: [
        { path: '/users', icon: 'Users', label: '用户管理', roles: [1, 2], permission: 'users:read' },
        { path: '/groups', icon: 'UsersRound', label: '群组管理', roles: [1, 2], permission: 'groups:read' },
        { path: '/groups/tasks', icon: 'FileText', label: '群作业管理', roles: [1, 2], permission: 'groups:task:read' },
        { path: '/channels', icon: 'Radio', label: '频道管理', roles: [1, 2], permission: 'channels:read' },
        { path: '/channels/paid', icon: 'DollarSign', label: '付费频道运营', roles: [1, 2], permission: 'channels:read' },
        { path: '/moments', icon: 'Camera', label: '朋友圈管理', roles: [1, 2], permission: 'moments:read' },
        { path: '/ai-agents', icon: 'Bot', label: 'AI 助手管理', roles: [1, 2], permission: 'users:read' },
        { path: '/ai-agents/onboarding', icon: 'Bot', label: '新手引导配置', roles: [1, 2], permission: 'users:read' },
        { path: '/ai-agents/knowledge', icon: 'Bot', label: 'AI 知识库', roles: [1, 2], permission: 'users:read' },
        { path: '/ai-agents/roles', icon: 'Bot', label: 'AI 角色管理', roles: [1, 2], permission: 'users:read' },
        { path: '/analytics', icon: 'BarChart3', label: '运营分析', roles: [1, 2], permission: 'analytics:view' },
      ],
    },
    {
      label: '治理中心',
      icon: 'FileText',
      children: [
        { path: '/reports', icon: 'FileText', label: '举报中心', roles: [1, 2], permission: 'reports:read' },
        { path: '/feedback', icon: 'MessageCircle', label: '反馈处理', roles: [1, 2], permission: 'feedback:read' },
        { path: '/announcements', icon: 'FileText', label: '全局公告', roles: [1, 2], permission: 'announcements:read' },
      ],
    },
    {
      label: '内容审核',
      icon: 'ShieldAlert',
      children: [
        { path: '/moderation/sensitive-words', icon: 'ShieldAlert', label: '敏感词管理', roles: [1, 2], permission: 'reports:read' },
        { path: '/moderation/review-queue', icon: 'ListChecks', label: '人工复审队列', roles: [1, 2], permission: 'reports:read' },
      ],
    },
    {
      label: '审计中心',
      icon: 'FileText',
      children: [
        { path: '/groups/context', icon: 'UsersRound', label: '群上下文入口', roles: [1, 2, 3] },
        { path: '/messages', icon: 'MessageSquare', label: '消息管理', roles: [1, 2, 3], permission: 'messages:read' },
        { path: '/logout-applications', icon: 'UserMinus', label: '注销申请', roles: [1, 2, 3], permission: 'logout_applications:read' },
        { path: '/logs', icon: 'FileText', label: '日志审计', roles: [1, 3], permission: 'logs:view' },
        { path: '/mcp-governance', icon: 'Bot', label: 'MCP 治理', roles: [1, 2], permission: 'mcp_clients:approve' },
      ],
    },
    {
      label: '财务管理',
      icon: 'Wallet',
      children: [
        { path: '/wallets', icon: 'Wallet', label: '钱包管理', roles: [1, 2], permission: 'finance:read' },
        { path: '/recharge-orders', icon: 'CreditCard', label: '充值订单', roles: [1, 2], permission: 'finance:read' },
        { path: '/payment-transactions', icon: 'DollarSign', label: '支付流水', roles: [1, 2], permission: 'finance:read' },
        { path: '/billing-plans', icon: 'TrendingUp', label: '套餐管理', roles: [1, 2], permission: 'finance:read' },
        { path: '/billing-subscriptions', icon: 'Receipt', label: '订阅管理', roles: [1, 2], permission: 'finance:read' },
        { path: '/billing-invoices', icon: 'FileText', label: '账单管理', roles: [1, 2], permission: 'finance:read' },
        { path: '/withdrawals', icon: 'ArrowDownToLine', label: '提现审核', roles: [1, 2], permission: 'finance:read' },
        { path: '/finance-report', icon: 'BarChart3', label: '财务报表', roles: [1, 2], permission: 'finance:read' },
        { path: '/pricing', icon: 'DollarSign', label: '产品定价', roles: [1, 2], permission: 'finance:read' },
      ],
    },
    {
      label: '系统配置',
      icon: 'Settings',
      children: [
        { path: '/settings', icon: 'Settings', label: '系统设置', roles: [1], permission: 'settings:view' },
        { path: '/license', icon: 'BadgeCheck', label: '授权状态', roles: [1], permission: 'settings:view' },
        { path: '/system-health', icon: 'HeartPulse', label: '系统健康', roles: [1], permission: 'settings:view' },
        { path: '/plugins', icon: 'Puzzle', label: '插件管理', roles: [1], permission: 'settings:view' },
        { path: '/storage', icon: 'HardDrive', label: '存储管理', roles: [1], permission: 'storage:view' },
        { path: '/admins', icon: 'Shield', label: '管理员', roles: [1], permission: 'admins:read' },
        { path: '/roles', icon: 'KeyRound', label: '角色权限', roles: [1, 3], permission: 'roles:view' },
        { path: '/settings/sso', icon: 'Link2', label: 'SSO 外部认证', roles: [1], permission: 'settings:view' },
      ],
    },
  ],
}
