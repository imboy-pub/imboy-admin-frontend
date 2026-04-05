import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { PermissionRoute } from '@/components/auth/PermissionRoute'
import { FeatureRoute } from '@/components/auth/FeatureRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { LoginPage } from '@/modules/identity'
import { NotFoundPage } from '@/pages/errors/NotFoundPage'
import { ForbiddenPage } from '@/pages/errors/ForbiddenPage'
import { ErrorBoundary } from '@/components/shared'
import { TopLoadingBar } from '@/components/shared/TopLoadingBar'

// Route-level code splitting — each page loads on demand
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const LogoutApplicationListPage = lazy(() => import('@/pages/logoutApplications/LogoutApplicationListPage').then((m) => ({ default: m.LogoutApplicationListPage })))

const ChannelListPage = lazy(() => import('@/modules/channels').then((m) => ({ default: m.ChannelListPage })))
const ChannelDetailPage = lazy(() => import('@/modules/channels').then((m) => ({ default: m.ChannelDetailPage })))
const ChannelMessagePage = lazy(() => import('@/modules/channels').then((m) => ({ default: m.ChannelMessagePage })))
const ChannelSubscriberPage = lazy(() => import('@/modules/channels').then((m) => ({ default: m.ChannelSubscriberPage })))
const ChannelAdminPage = lazy(() => import('@/modules/channels').then((m) => ({ default: m.ChannelAdminPage })))
const ChannelInvitationPage = lazy(() => import('@/modules/channels').then((m) => ({ default: m.ChannelInvitationPage })))
const ChannelOrderPage = lazy(() => import('@/modules/channels').then((m) => ({ default: m.ChannelOrderPage })))

const GroupListPage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupListPage })))
const GroupDetailPage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupDetailPage })))
const GroupMemberManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupMemberManagePage })))
const GroupVoteManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupVoteManagePage })))
const GroupNoticeManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupNoticeManagePage })))
const GroupCategoryManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupCategoryManagePage })))
const GroupTagManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupTagManagePage })))
const GroupFileManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupFileManagePage })))
const GroupAlbumManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupAlbumManagePage })))
const GroupScheduleManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupScheduleManagePage })))
const GroupTaskManagePage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupTaskManagePage })))
const GroupGovernanceLogPage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupGovernanceLogPage })))
const GroupContextGatewayPage = lazy(() => import('@/modules/groups').then((m) => ({ default: m.GroupContextGatewayPage })))

const MessageListPage = lazy(() => import('@/modules/messages').then((m) => ({ default: m.MessageListPage })))
const MomentListPage = lazy(() => import('@/modules/moments').then((m) => ({ default: m.MomentListPage })))
const MomentDetailPage = lazy(() => import('@/modules/moments').then((m) => ({ default: m.MomentDetailPage })))

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
const UserTagManagePage = lazy(() => import('@/modules/social_graph').then((m) => ({ default: m.UserTagManagePage })))
const UserCollectManagePage = lazy(() => import('@/modules/social_graph').then((m) => ({ default: m.UserCollectManagePage })))
const SettingsHomePage = lazy(() => import('@/pages/settings/SettingsHomePage').then((m) => ({ default: m.SettingsHomePage })))
const FeatureConfigPage = lazy(() => import('@/pages/settings/FeatureConfigPage').then((m) => ({ default: m.FeatureConfigPage })))
const CapabilityConfigPage = lazy(() => import('@/pages/settings/CapabilityConfigPage').then((m) => ({ default: m.CapabilityConfigPage })))
const ComplianceKeyPage = lazy(() => import('@/pages/settings/ComplianceKeyPage').then((m) => ({ default: m.ComplianceKeyPage })))
const AdminListPage = lazy(() => import('@/pages/admins/AdminListPage').then((m) => ({ default: m.AdminListPage })))
const MutedUsersPage = lazy(() => import('@/pages/settings/MutedUsersPage').then((m) => ({ default: m.MutedUsersPage })))
const PushTokenListPage = lazy(() => import('@/pages/settings/PushTokenListPage').then((m) => ({ default: m.PushTokenListPage })))
const AuditLogPage = lazy(() => import('@/pages/logs/AuditLogPage').then((m) => ({ default: m.AuditLogPage })))

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
            {/* 登录页 */}
            <Route path="/login" element={<LoginPage />} />

            {/* 受保护的管理后台路由 */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AdminLayout />}>
                <Route
                  path="/dashboard"
                  element={(
                    <PermissionRoute permission="dashboard:view" roles={[1, 2, 3]}>
                      <DashboardPage />
                    </PermissionRoute>
                  )}
                />

                {/* 用户管理 */}
                <Route
                  path="/users"
                  element={(
                    <PermissionRoute permission="users:read" roles={[1, 2]}>
                      <UserListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/users/:id"
                  element={(
                    <PermissionRoute permission="users:read" roles={[1, 2]}>
                      <UserDetailPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/users/:id/tags"
                  element={(
                    <PermissionRoute permission="users:read" roles={[1, 2]}>
                      <UserTagManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/users/:id/collects"
                  element={(
                    <PermissionRoute permission="users:read" roles={[1, 2]}>
                      <UserCollectManagePage />
                    </PermissionRoute>
                  )}
                />

                {/* 群组管理 */}
                <Route
                  path="/groups"
                  element={(
                    <PermissionRoute permission="groups:read" roles={[1, 2]}>
                      <GroupListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/context"
                  element={(
                    <PermissionRoute roles={[1, 2, 3]}>
                      <GroupContextGatewayPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id"
                  element={(
                    <PermissionRoute permission="groups:read" roles={[1, 2]}>
                      <GroupDetailPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/members"
                  element={(
                    <PermissionRoute permission="groups:read" roles={[1, 2]}>
                      <GroupMemberManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/votes"
                  element={(
                    <PermissionRoute permission="groups:vote:read" roles={[1, 2]}>
                      <FeatureRoute feature="group_vote">
                        <GroupVoteManagePage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/notices"
                  element={(
                    <PermissionRoute permission="groups:notice:read" roles={[1, 2]}>
                      <GroupNoticeManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/categories"
                  element={(
                    <PermissionRoute permission="groups:category:read" roles={[1, 2]}>
                      <GroupCategoryManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/tags"
                  element={(
                    <PermissionRoute permission="groups:tag:read" roles={[1, 2]}>
                      <GroupTagManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/files"
                  element={(
                    <PermissionRoute permission="groups:file:read" roles={[1, 2]}>
                      <GroupFileManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/albums"
                  element={(
                    <PermissionRoute permission="groups:album:read" roles={[1, 2]}>
                      <GroupAlbumManagePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/schedules"
                  element={(
                    <PermissionRoute permission="groups:schedule:read" roles={[1, 2]}>
                      <FeatureRoute feature="group_schedule">
                        <GroupScheduleManagePage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/tasks"
                  element={(
                    <PermissionRoute permission="groups:task:read" roles={[1, 2]}>
                      <FeatureRoute feature="group_task">
                        <GroupTaskManagePage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/groups/:id/governance-logs"
                  element={(
                    <PermissionRoute roles={[1, 2, 3]}>
                      <GroupGovernanceLogPage />
                    </PermissionRoute>
                  )}
                />

                {/* 消息管理 */}
                <Route
                  path="/messages"
                  element={(
                    <PermissionRoute permission="messages:read" roles={[1, 2, 3]}>
                      <MessageListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/logout-applications"
                  element={(
                    <PermissionRoute permission="logout_applications:read" roles={[1, 2, 3]}>
                      <LogoutApplicationListPage />
                    </PermissionRoute>
                  )}
                />

                {/* 频道管理 */}
                <Route
                  path="/channels"
                  element={(
                    <PermissionRoute permission="channels:read" roles={[1, 2]}>
                      <FeatureRoute feature="channel">
                        <ChannelListPage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/channels/:id"
                  element={(
                    <PermissionRoute permission="channels:read" roles={[1, 2]}>
                      <FeatureRoute feature="channel">
                        <ChannelDetailPage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/channels/:id/messages"
                  element={(
                    <PermissionRoute permission="channels:read" roles={[1, 2]}>
                      <FeatureRoute feature="channel">
                        <ChannelMessagePage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/channels/:id/subscribers"
                  element={(
                    <PermissionRoute permission="channels:read" roles={[1, 2]}>
                      <FeatureRoute feature="channel">
                        <ChannelSubscriberPage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/channels/:id/admins"
                  element={(
                    <PermissionRoute permission="channels:read" roles={[1, 2]}>
                      <FeatureRoute feature="channel">
                        <ChannelAdminPage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/channels/:id/invitations"
                  element={(
                    <PermissionRoute permission="channels:read" roles={[1, 2]}>
                      <FeatureRoute feature="channel_invitation">
                        <ChannelInvitationPage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/channels/:id/orders"
                  element={(
                    <PermissionRoute permission="channels:read" roles={[1, 2]}>
                      <FeatureRoute feature="channel_order">
                        <ChannelOrderPage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/moments"
                  element={(
                    <PermissionRoute permission={['moments:read', 'messages:read']} roles={[1, 2]}>
                      <FeatureRoute feature="moment">
                        <MomentListPage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/reports"
                  element={(
                    <PermissionRoute permission={['reports:read', 'moments:report:read', 'messages:read']} roles={[1, 2]}>
                      <ReportCenterPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/moments/reports"
                  element={(
                    <PermissionRoute permission={['reports:read', 'moments:report:read', 'messages:read']} roles={[1, 2]}>
                      <Navigate to="/reports?target_type=moment" replace />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/moments/:id"
                  element={(
                    <PermissionRoute permission={['moments:read', 'messages:read']} roles={[1, 2]}>
                      <FeatureRoute feature="moment">
                        <MomentDetailPage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />

                {/* 反馈管理 */}
                <Route
                  path="/feedback"
                  element={(
                    <PermissionRoute permission="feedback:read" roles={[1, 2]}>
                      <FeedbackListPage />
                    </PermissionRoute>
                  )}
                />

                {/* 全局公告 */}
                <Route
                  path="/announcements"
                  element={(
                    <PermissionRoute permission="announcements:read" roles={[1, 2]}>
                      <AnnouncementListPage />
                    </PermissionRoute>
                  )}
                />

                {/* 系统设置 */}
                <Route
                  path="/settings"
                  element={(
                    <PermissionRoute permission="settings:view" roles={[1]}>
                      <SettingsHomePage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/features"
                  element={(
                    <PermissionRoute permission="settings:view" roles={[1]}>
                      <FeatureConfigPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/capabilities"
                  element={(
                    <PermissionRoute permission="settings:view" roles={[1]}>
                      <CapabilityConfigPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/compliance-keys"
                  element={(
                    <PermissionRoute permission="settings:view" roles={[1]}>
                      <FeatureRoute feature="e2ee">
                        <ComplianceKeyPage />
                      </FeatureRoute>
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/versions"
                  element={(
                    <PermissionRoute permission="settings:version:read" roles={[1]}>
                      <VersionPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/muted-users"
                  element={(
                    <PermissionRoute permission="settings:view" roles={[1]}>
                      <MutedUsersPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/push-tokens"
                  element={(
                    <PermissionRoute permission="settings:view" roles={[1]}>
                      <PushTokenListPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/settings/ddl"
                  element={(
                    <PermissionRoute permission="settings:ddl:read" roles={[1]}>
                      <DDLPage />
                    </PermissionRoute>
                  )}
                />
                <Route
                  path="/storage"
                  element={(
                    <PermissionRoute permission="storage:view" roles={[1]}>
                      <StorageOverviewPage />
                    </PermissionRoute>
                  )}
                />

                {/* 管理员管理 */}
                <Route
                  path="/admins"
                  element={(
                    <PermissionRoute permission="admins:read" roles={[1]}>
                      <AdminListPage />
                    </PermissionRoute>
                  )}
                />

                {/* 角色权限 */}
                <Route
                  path="/roles"
                  element={(
                    <PermissionRoute permission="roles:view" roles={[1, 3]}>
                      <RolePermissionPage />
                    </PermissionRoute>
                  )}
                />

                {/* 日志审计 */}
                <Route
                  path="/logs"
                  element={(
                    <PermissionRoute permission="logs:view" roles={[1, 3]}>
                      <AuditLogPage />
                    </PermissionRoute>
                  )}
                />
                {/* 运营分析 */}
                <Route
                  path="/analytics"
                  element={(
                    <PermissionRoute permission="analytics:view" roles={[1, 2]}>
                      <AnalyticsPage />
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
