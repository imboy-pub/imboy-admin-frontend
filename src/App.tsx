import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { PermissionRoute } from '@/components/auth/PermissionRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { LoginPage, SetupPage } from '@/modules/identity'
import { NotFoundPage } from '@/pages/errors/NotFoundPage'
import { ForbiddenPage } from '@/pages/errors/ForbiddenPage'
import { ErrorBoundary } from '@/components/shared'
import { TopLoadingBar } from '@/components/shared/TopLoadingBar'
import { compiledAdminFeatureRoutes } from '@/generated/generatedFeatureComposition'

// Route-level code splitting — each page loads on demand
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const LogoutApplicationListPage = lazy(() => import('@/pages/logout-applications/LogoutApplicationListPage').then((m) => ({ default: m.LogoutApplicationListPage })))

const AiAgentListPage = lazy(() => import('@/modules/ai_agent').then((m) => ({ default: m.AiAgentListPage })))
const OnboardingConfigPage = lazy(() => import('@/modules/ai_agent').then((m) => ({ default: m.OnboardingConfigPage })))
const KnowledgeConfigPage = lazy(() => import('@/modules/ai_agent').then((m) => ({ default: m.KnowledgeConfigPage })))
const AiRolesPage = lazy(() => import('@/modules/ai_agent').then((m) => ({ default: m.AiRolesPage })))
const BotListPage = lazy(() => import('@/modules/bots').then((m) => ({ default: m.BotListPage })))

const GroupListPage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupListPage })))
const GroupDetailPage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupDetailPage })))
const GroupMemberManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupMemberManagePage })))
const GroupNoticeManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupNoticeManagePage })))
const GroupCategoryManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupCategoryManagePage })))
const GroupTagManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupTagManagePage })))
const GroupFileManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupFileManagePage })))
const GroupAlbumManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupAlbumManagePage })))
const GroupGovernanceLogPage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupGovernanceLogPage })))
const GroupContextGatewayPage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupContextGatewayPage })))

const MessageListPage = lazy(() => import('@/modules/messages').then((m) => ({ default: m.MessageListPage })))
const UserListPage = lazy(() => import('@/modules/identity').then((m) => ({ default: m.UserListPage })))
const UserDetailPage = lazy(() => import('@/modules/identity').then((m) => ({ default: m.UserDetailPage })))
const RolePermissionPage = lazy(() => import('@/modules/identity').then((m) => ({ default: m.RolePermissionPage })))

const ReportCenterPage = lazy(() => import('@/modules/ops_governance').then((m) => ({ default: m.ReportCenterPage })))
const FeedbackListPage = lazy(() => import('@/modules/ops_governance').then((m) => ({ default: m.FeedbackListPage })))
const VersionPage = lazy(() => import('@/modules/ops_governance').then((m) => ({ default: m.VersionPage })))
const DDLPage = lazy(() => import('@/modules/ops_governance').then((m) => ({ default: m.DDLPage })))

const AnnouncementListPage = lazy(() => import('@/pages/announcements/AnnouncementListPage').then((m) => ({ default: m.AnnouncementListPage })))
const StorageOverviewPage = lazy(() => import('@/pages/storage/StorageOverviewPage').then((m) => ({ default: m.StorageOverviewPage })))
const AnalyticsPage = lazy(() => import('@/pages/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
// Workspace/Project 运营管理（双体验 v2.5.2 WP7/T11b）
const WorkspaceListPage = lazy(() => import('@/pages/workspaces/WorkspaceListPage').then((m) => ({ default: m.WorkspaceListPage })))
const WorkspaceDetailPage = lazy(() => import('@/pages/workspaces/WorkspaceDetailPage').then((m) => ({ default: m.WorkspaceDetailPage })))
const ProjectListPage = lazy(() => import('@/pages/workspaces/ProjectListPage').then((m) => ({ default: m.ProjectListPage })))
const ProjectDetailPage = lazy(() => import('@/pages/workspaces/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })))
const UserTagManagePage = lazy(() => import('@/modules/social_graph').then((m) => ({ default: m.UserTagManagePage })))
const UserCollectManagePage = lazy(() => import('@/modules/social_graph').then((m) => ({ default: m.UserCollectManagePage })))
const SettingsHomePage = lazy(() => import('@/pages/settings/SettingsHomePage').then((m) => ({ default: m.SettingsHomePage })))
const FeatureConfigPage = lazy(() => import('@/pages/settings/FeatureConfigPage').then((m) => ({ default: m.FeatureConfigPage })))
const ProfileSwitchPage = lazy(() => import('@/pages/settings/ProfileSwitchPage').then((m) => ({ default: m.ProfileSwitchPage })))
const CapabilityConfigPage = lazy(() => import('@/pages/settings/CapabilityConfigPage').then((m) => ({ default: m.CapabilityConfigPage })))
const AdminListPage = lazy(() => import('@/pages/admins/AdminListPage').then((m) => ({ default: m.AdminListPage })))
const MutedUsersPage = lazy(() => import('@/pages/settings/MutedUsersPage').then((m) => ({ default: m.MutedUsersPage })))
const PushTokenListPage = lazy(() => import('@/pages/settings/PushTokenListPage').then((m) => ({ default: m.PushTokenListPage })))
const AuditLogPage = lazy(() => import('@/pages/logs/AuditLogPage').then((m) => ({ default: m.AuditLogPage })))
const SystemHealthPage = lazy(() => import('@/pages/system-health/SystemHealthPage').then((m) => ({ default: m.SystemHealthPage })))
const PluginManagementPage = lazy(() => import('@/modules/plugin_management').then((m) => ({ default: m.PluginManagementPage })))
const PluginLogPage = lazy(() => import('@/modules/plugin_management').then((m) => ({ default: m.PluginLogPage })))

// 财务管理模块
const WalletListPage = lazy(() => import('@/modules/finance').then((m) => ({ default: m.WalletListPage })))
const RechargeOrderListPage = lazy(() => import('@/modules/finance').then((m) => ({ default: m.RechargeOrderListPage })))
const PaymentTransactionListPage = lazy(() => import('@/modules/finance').then((m) => ({ default: m.PaymentTransactionListPage })))
const BillingPlanListPage = lazy(() => import('@/modules/finance').then((m) => ({ default: m.BillingPlanListPage })))
const BillingSubscriptionListPage = lazy(() => import('@/modules/finance').then((m) => ({ default: m.BillingSubscriptionListPage })))
const BillingInvoiceListPage = lazy(() => import('@/modules/finance').then((m) => ({ default: m.BillingInvoiceListPage })))
const WithdrawalsPage = lazy(() => import('@/modules/finance').then((m) => ({ default: m.WithdrawalsPage })))
const FinanceReportPage = lazy(() => import('@/modules/finance').then((m) => ({ default: m.FinanceReportPage })))
const PricingPage = lazy(() => import('@/pages/pricing/PricingPage').then((m) => ({ default: m.PricingPage })))
const LicensePage = lazy(() => import('@/pages/license/LicensePage').then((m) => ({ default: m.LicensePage })))
const SensitiveWordPage = lazy(() => import('@/pages/content-moderation/SensitiveWordPage').then((m) => ({ default: m.SensitiveWordPage })))
const ContentReviewQueuePage = lazy(() => import('@/pages/content-moderation/ContentReviewQueuePage').then((m) => ({ default: m.ContentReviewQueuePage })))
const AppealReviewPage = lazy(() => import('@/pages/content-moderation/AppealReviewPage').then((m) => ({ default: m.AppealReviewPage })))
const SSOConfigPage = lazy(() => import('@/pages/settings/SSOConfigPage').then((m) => ({ default: m.SSOConfigPage })))
const McpGovernanceListPage = lazy(() => import('@/pages/mcp-governance/McpGovernanceListPage').then((m) => ({ default: m.McpGovernanceListPage })))
const AiHubOverviewPage = lazy(() => import('@/pages/ai-hub/AiHubOverviewPage').then((m) => ({ default: m.AiHubOverviewPage })))
const BotDeliveriesPage = lazy(() => import('@/pages/ai-hub/BotDeliveriesPage').then((m) => ({ default: m.BotDeliveriesPage })))
// Product Experience 安装级配置只读页（双体验 v2.5.2 WP7/T11）
const ProductExperiencePage = lazy(() => import('@/pages/settings/ProductExperiencePage').then((m) => ({ default: m.ProductExperiencePage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
})

function PageFallback() {
  return (
    <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
      加载中...
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TopLoadingBar />
      <BrowserRouter>
        <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* 首启初始化向导（P0-5）— 免鉴权 */}
            <Route path="/setup" element={<SetupPage />} />

            {/* 登录页 */}
            <Route path="/login" element={<LoginPage />} />

            {/* 受保护的管理后台路由 */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AdminLayout />}>
                <Route
                  path="/dashboard"
                  element={(
                    <PermissionRoute permission="dashboard:view" roles={['1', '2', '3', '4', '5', '6']}>
                      <DashboardPage />
                    </PermissionRoute>
                  )}
                />

                {/* 用户管理 */}
                <Route
                  path="/users"
                  element={(
                    <PermissionRoute permission="users:read" roles={['1', '2', '5', '6']}>
                      <UserListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/ai-agents"
                  element={(
                    <PermissionRoute permission="users:read" roles={['1', '2', '5', '6']}>
                      <AiAgentListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/ai-agents/onboarding"
                  element={(
                    <PermissionRoute permission="users:read" roles={['1', '2', '5', '6']}>
                      <OnboardingConfigPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/ai-agents/knowledge"
                  element={(
                    <PermissionRoute permission="users:read" roles={['1', '2', '5', '6']}>
                      <KnowledgeConfigPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/ai-agents/roles"
                  element={(
                    <PermissionRoute permission="users:read" roles={['1', '2', '5', '6']}>
                      <AiRolesPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/bots"
                  element={(
                    <PermissionRoute permission="bots:read" roles={['1', '2']}>
                      <BotListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/users/:id"
                  element={(
                    <PermissionRoute permission="users:read" roles={['1', '2', '5', '6']}>
                      <UserDetailPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/users/:id/tags"
                  element={(
                    <PermissionRoute permission="users:read" roles={['1', '2', '5', '6']}>
                      <UserTagManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/users/:id/collects"
                  element={(
                    <PermissionRoute permission="users:read" roles={['1', '2', '5', '6']}>
                      <UserCollectManagePage />
                    </PermissionRoute>
                  )}
                />

                {/* 群组管理 */}
                <Route
                  path="/groups"
                  element={(
                    <PermissionRoute permission="groups:read" roles={['1', '2']}>
                      <GroupListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/context"
                  element={(
                    <PermissionRoute roles={['1', '2', '3']}>
                      <GroupContextGatewayPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id"
                  element={(
                    <PermissionRoute permission="groups:read" roles={['1', '2']}>
                      <GroupDetailPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/members"
                  element={(
                    <PermissionRoute permission="groups:read" roles={['1', '2']}>
                      <GroupMemberManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/notices"
                  element={(
                    <PermissionRoute permission="groups:notice:read" roles={['1', '2']}>
                      <GroupNoticeManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/categories"
                  element={(
                    <PermissionRoute permission="groups:category:read" roles={['1', '2']}>
                      <GroupCategoryManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/tags"
                  element={(
                    <PermissionRoute permission="groups:tag:read" roles={['1', '2']}>
                      <GroupTagManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/files"
                  element={(
                    <PermissionRoute permission="groups:file:read" roles={['1', '2']}>
                      <GroupFileManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/albums"
                  element={(
                    <PermissionRoute permission="groups:album:read" roles={['1', '2']}>
                      <GroupAlbumManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/governance-logs"
                  element={(
                    <PermissionRoute roles={['1', '2', '3']}>
                      <GroupGovernanceLogPage />
                    </PermissionRoute>
                  )}
                />

                {/* 消息管理 */}
                <Route
                  path="/messages"
                  element={(
                    <PermissionRoute permission="messages:read" roles={['1', '2', '3', '4', '5', '6']}>
                      <MessageListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/logout-applications"
                  element={(
                    <PermissionRoute permission="logout_applications:read" roles={['1', '2', '3', '5']}>
                      <LogoutApplicationListPage />
                    </PermissionRoute>
                  )}
                />

                {compiledAdminFeatureRoutes()}
                <Route
                  path="/reports"
                  element={(
                    <PermissionRoute permission={['reports:read', 'moments:report:read', 'messages:read']} roles={['1', '2', '4', '5']}>
                      <ReportCenterPage />
                    </PermissionRoute>
                  )}
                />
                {/* Workspace / Project 运营管理（双体验 v2.5.2 WP7/T11b） */}
                <Route
                  path="/workspaces"
                  element={(
                    <PermissionRoute permission="workspaces:read" roles={['1', '2']}>
                      <WorkspaceListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/workspaces/:id"
                  element={(
                    <PermissionRoute permission="workspaces:read" roles={['1', '2']}>
                      <WorkspaceDetailPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/projects"
                  element={(
                    <PermissionRoute permission="workspaces:read" roles={['1', '2']}>
                      <ProjectListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/projects/:id"
                  element={(
                    <PermissionRoute permission="workspaces:read" roles={['1', '2']}>
                      <ProjectDetailPage />
                    </PermissionRoute>
                  )}
                />

                {/* 反馈管理 */}
                <Route
                  path="/feedback"
                  element={(
                    <PermissionRoute permission="feedback:read" roles={['1', '2', '4', '6']}>
                      <FeedbackListPage />
                    </PermissionRoute>
                  )}
                />

                {/* 全局公告 */}
                <Route
                  path="/announcements"
                  element={(
                    <PermissionRoute permission="announcements:read" roles={['1', '2']}>
                      <AnnouncementListPage />
                    </PermissionRoute>
                  )}
                />

                {/* 系统设置 */}
                <Route
                  path="/settings"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <SettingsHomePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/features"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <FeatureConfigPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/profile"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <ProfileSwitchPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/capabilities"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <CapabilityConfigPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/product-experience"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <ProductExperiencePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/versions"
                  element={(
                    <PermissionRoute permission="settings:version:read" roles={['1']}>
                      <VersionPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/muted-users"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <MutedUsersPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/push-tokens"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <PushTokenListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/ddl"
                  element={(
                    <PermissionRoute permission="settings:ddl:read" roles={['1']}>
                      <DDLPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/storage"
                  element={(
                    <PermissionRoute permission="storage:view" roles={['1']}>
                      <StorageOverviewPage />
                    </PermissionRoute>
                  )}
                />

                {/* 管理员管理 */}
                <Route
                  path="/admins"
                  element={(
                    <PermissionRoute permission="admins:read" roles={['1']}>
                      <AdminListPage />
                    </PermissionRoute>
                  )}
                />

                {/* 角色权限 */}
                <Route
                  path="/roles"
                  element={(
                    <PermissionRoute permission="roles:view" roles={['1', '3', '5']}>
                      <RolePermissionPage />
                    </PermissionRoute>
                  )}
                />

                {/* 日志审计 */}
                <Route
                  path="/logs"
                  element={(
                    <PermissionRoute permission="logs:view" roles={['1', '3', '5']}>
                      <AuditLogPage />
                    </PermissionRoute>
                  )}
                />

                {/* 内容审核 */}
                <Route
                  path="/moderation/sensitive-words"
                  element={(
                    <PermissionRoute permission="reports:read" roles={['1', '2']}>
                      <SensitiveWordPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/moderation/review-queue"
                  element={(
                    <PermissionRoute permission="reports:read" roles={['1', '2']}>
                      <ContentReviewQueuePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/moderation/appeals"
                  element={(
                    <PermissionRoute permission="reports:read" roles={['1', '2']}>
                      <AppealReviewPage />
                    </PermissionRoute>
                  )}
                />

                {/* SSO 配置 */}
                <Route
                  path="/settings/sso"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <SSOConfigPage />
                    </PermissionRoute>
                  )}
                />
                {/* 授权状态 */}
                <Route
                  path="/license"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <LicensePage />
                    </PermissionRoute>
                  )}
                />
                {/* 系统健康 */}
                <Route
                  path="/system-health"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <SystemHealthPage />
                    </PermissionRoute>
                  )}
                />
                {/* 插件管理 */}
                <Route
                  path="/plugins"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <PluginManagementPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/plugins/logs"
                  element={(
                    <PermissionRoute permission="settings:view" roles={['1']}>
                      <PluginLogPage />
                    </PermissionRoute>
                  )}
                />

                {/* 运营分析 */}
                <Route
                  path="/analytics"
                  element={(
                    <PermissionRoute permission="analytics:view" roles={['1', '2']}>
                      <AnalyticsPage />
                    </PermissionRoute>
                  )}
                />

                {/* 财务管理 */}
                <Route
                  path="/wallets"
                  element={(
                    <PermissionRoute permission="finance:read" roles={['1', '2']}>
                      <WalletListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/recharge-orders"
                  element={(
                    <PermissionRoute permission="finance:read" roles={['1', '2']}>
                      <RechargeOrderListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/payment-transactions"
                  element={(
                    <PermissionRoute permission="finance:read" roles={['1', '2']}>
                      <PaymentTransactionListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/billing-plans"
                  element={(
                    <PermissionRoute permission="finance:read" roles={['1', '2']}>
                      <BillingPlanListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/billing-subscriptions"
                  element={(
                    <PermissionRoute permission="finance:read" roles={['1', '2']}>
                      <BillingSubscriptionListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/billing-invoices"
                  element={(
                    <PermissionRoute permission="finance:read" roles={['1', '2']}>
                      <BillingInvoiceListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/withdrawals"
                  element={(
                    <PermissionRoute permission="finance:read" roles={['1', '2']}>
                      <WithdrawalsPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/finance-report"
                  element={(
                    <PermissionRoute permission="finance:read" roles={['1', '2']}>
                      <FinanceReportPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/pricing"
                  element={(
                    <PermissionRoute permission="finance:read" roles={['1', '2']}>
                      <PricingPage />
                    </PermissionRoute>
                  )}
                />

                {/* MCP 治理（roadmap T3.5，后端 /api/adm/mcp/* 已就绪） */}
                {/* AI 协作总览 + 出站交付死信（ADM-01） */}
                <Route
                  path="/ai-hub"
                  element={(
                    <PermissionRoute permission="mcp_clients:approve" roles={['1', '2']}>
                      <AiHubOverviewPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/ai-hub/deliveries"
                  element={(
                    <PermissionRoute permission="mcp_clients:approve" roles={['1', '2']}>
                      <BotDeliveriesPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/mcp-governance"
                  element={(
                    <PermissionRoute permission="mcp_clients:approve" roles={['1', '2']}>
                      <McpGovernanceListPage />
                    </PermissionRoute>
                  )}
                />

                <Route path="/forbidden" element={<ForbiddenPage />} />
              </Route>
            </Route>

            {/* 默认路由 */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  )
}

export default App
