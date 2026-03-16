import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { PermissionRoute } from '@/components/auth/PermissionRoute'
import { FeatureRoute } from '@/components/auth/FeatureRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { LogoutApplicationListPage } from '@/pages/logoutApplications/LogoutApplicationListPage'
import {
  ChannelAdminPage,
  ChannelDetailPage,
  ChannelInvitationPage,
  ChannelListPage,
  ChannelMessagePage,
  ChannelOrderPage,
  ChannelSubscriberPage,
} from '@/modules/channels'
import {
  GroupAlbumManagePage,
  GroupCategoryManagePage,
  GroupContextGatewayPage,
  GroupDetailPage,
  GroupFileManagePage,
  GroupGovernanceLogPage,
  GroupListPage,
  GroupNoticeManagePage,
  GroupScheduleManagePage,
  GroupTagManagePage,
  GroupTaskManagePage,
  GroupVoteManagePage,
} from '@/modules/groups'
import { MessageListPage } from '@/modules/messages'
import { MomentDetailPage, MomentListPage } from '@/modules/moments'
import { LoginPage, RolePermissionPage, UserDetailPage, UserListPage } from '@/modules/identity'
import { DDLPage, FeedbackListPage, ReportCenterPage, VersionPage } from '@/modules/ops_governance'
import { UserCollectManagePage, UserTagManagePage } from '@/modules/social_graph'
import { SettingsHomePage } from '@/pages/settings/SettingsHomePage'
import { AdminListPage } from '@/pages/admins/AdminListPage'
import { AuditLogPage } from '@/pages/logs/AuditLogPage'
import { NotFoundPage } from '@/pages/errors/NotFoundPage'
import { ForbiddenPage } from '@/pages/errors/ForbiddenPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
                    <FeatureRoute feature="moment">
                      <ReportCenterPage />
                    </FeatureRoute>
                  </PermissionRoute>
                )}
              />
              <Route
                path="/moments/reports"
                element={(
                  <PermissionRoute permission={['reports:read', 'moments:report:read', 'messages:read']} roles={[1, 2]}>
                    <FeatureRoute feature="moment">
                      <Navigate to="/reports?target_type=moment" replace />
                    </FeatureRoute>
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
                path="/settings/versions"
                element={(
                  <PermissionRoute permission="settings:version:read" roles={[1]}>
                    <VersionPage />
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
              <Route path="/forbidden" element={<ForbiddenPage />} />
            </Route>
          </Route>

          {/* 默认路由 */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  )
}

export default App
