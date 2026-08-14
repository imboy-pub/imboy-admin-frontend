# imboyadmin 自动化测试计划 —— 索引

> **权威文档**。imboyadmin 现有全部功能点（已完成 / 未完成 / 阻塞 全部纳入）。
> 覆盖 **74 个页面 / 543 个功能点**
> 数据源：`src/pages/**` 与 `src/modules/**/pages/**` 真实源码抽取 ＋ 浏览器实测记录

> ⚠️ 本文件由 `regen_readme.py` 生成，**不要手改**。
> 每轮回写完各模块 md 后跑：`python3 tests/auto_test/regen_readme.py`

## 目录结构

本目录**镜像 `src/pages/` 与 `src/modules/` 结构**：改了 `src/pages/users/UserListPage.tsx`，
就去 `tests/auto_test/users/UserListPage.md` 更新对应功能点。

执行规程见 [LOOP_PROMPT.md](./LOOP_PROMPT.md)。

## 表格规则（保证有限膨胀）

| 规则 | 说明 |
|---|---|
| **一行 = 一个功能点** | 行数只随功能增加，**不随测试轮次增加** |
| **按功能介绍覆盖写** | 同一功能点永远只有一行。新一轮改状态和计数，不加行 |
| **bug 用计数不用叙述** | `待处理 = 发现 − 解决`，恒等式可自动校验 |
| **备注只写当前未闭环的事** | 闭环即清空。修复细节去 git log 查 |

## 列定义

| 计划变化 | 含义 |
|---|---|
| `待首测` | 从没测过 |
| `回归复测` | 页面整体标过通过，但这个功能点当初没被单独验证 |
| `待修复` | 有未修 bug |
| `待复验` | 代码已改，缺浏览器实测证据 |
| `阻塞` | 缺外部条件（后端未发布 / 测试数据 / 权限配置 / 特定数据规模） |
| `无待办` | 当前无动作，只在回归轮被动扫到 |

## 「测试状态」列取值（第 6 列，白名单）

| 取值 | 含义 |
|---|---|
| `已通过` | 该功能点浏览器实测通过（网络响应/截图有证据） |
| `未测` | 条件不具备，从未执行 |
| `待重验` | 已按判据测过或代码已改，缺浏览器实测证据待补 |
| `有BUG待修` | 发现 bug，等待修复 |
| 空 | 未记录（历史行允许，新写行不推荐） |

## 全局汇总

| 计划变化 | 条数 | 占比 |
|---|---|---|
| 无待办 | 392 | 72.2% |
| 阻塞 | 151 | 27.8% |
| **合计** | **543** | 100% |

bug 累计：**发现 16 / 解决 16 / 待处理 0**

> 恒等式 `发现 − 解决 = 待处理` 成立

## 模块索引

| 模块 | 页面 | 功能点 | 待处理bug | 无待办 | 阻塞 |
|---|---|---|---|---|---|
| [groups](groups/) | 14 | 129 | 0 | 100 | 29 |
| [channels](channels/) | 8 | 80 | 0 | 59 | 21 |
| [settings](settings/) | 10 | 51 | 0 | 35 | 16 |
| [users](users/) | 4 | 41 | 0 | 36 | 5 |
| [moments](moments/) | 3 | 26 | 0 | 14 | 12 |
| [ai_agent](ai_agent/) | 4 | 25 | 0 | 20 | 5 |
| [plugin_management](plugin_management/) | 2 | 18 | 0 | 6 | 12 |
| [admins](admins/) | 1 | 14 | 0 | 14 | 0 |
| [content-moderation](content-moderation/) | 2 | 14 | 0 | 8 | 6 |
| [feedback](feedback/) | 1 | 11 | 0 | 7 | 4 |
| [logs](logs/) | 1 | 11 | 0 | 9 | 2 |
| [announcements](announcements/) | 1 | 10 | 0 | 7 | 3 |
| [logout-applications](logout-applications/) | 1 | 9 | 0 | 6 | 3 |
| [storage](storage/) | 1 | 9 | 0 | 4 | 5 |
| [billing-plans](billing-plans/) | 1 | 8 | 0 | 4 | 4 |
| [messages](messages/) | 1 | 8 | 0 | 7 | 1 |
| [payment-transactions](payment-transactions/) | 1 | 8 | 0 | 4 | 4 |
| [recharge-orders](recharge-orders/) | 1 | 8 | 0 | 4 | 4 |
| [withdrawals](withdrawals/) | 1 | 8 | 0 | 5 | 3 |
| [auth](auth/) | 2 | 7 | 0 | 4 | 3 |
| [roles](roles/) | 1 | 7 | 0 | 5 | 2 |
| [billing-invoices](billing-invoices/) | 1 | 6 | 0 | 4 | 2 |
| [billing-subscriptions](billing-subscriptions/) | 1 | 6 | 0 | 5 | 1 |
| [wallets](wallets/) | 1 | 6 | 0 | 6 | 0 |
| [mcp-governance](mcp-governance/) | 1 | 5 | 0 | 4 | 1 |
| [analytics](analytics/) | 1 | 4 | 0 | 3 | 1 |
| [license](license/) | 1 | 4 | 0 | 2 | 2 |
| [dashboard](dashboard/) | 1 | 2 | 0 | 2 | 0 |
| [errors](errors/) | 2 | 2 | 0 | 2 | 0 |
| [finance-report](finance-report/) | 1 | 2 | 0 | 2 | 0 |
| [system-health](system-health/) | 1 | 2 | 0 | 2 | 0 |
| [pricing](pricing/) | 1 | 1 | 0 | 1 | 0 |
| [reports](reports/) | 1 | 1 | 0 | 1 | 0 |

## 页面清单


### admins

- [AdminListPage](admins/AdminListPage.md) — 14 功能点

### ai_agent

- [AiAgentListPage](ai_agent/AiAgentListPage.md) — 9 功能点
- [AiRolesPage](ai_agent/AiRolesPage.md) — 10 功能点
- [KnowledgeConfigPage](ai_agent/KnowledgeConfigPage.md) — 3 功能点
- [OnboardingConfigPage](ai_agent/OnboardingConfigPage.md) — 3 功能点

### analytics

- [AnalyticsPage](analytics/AnalyticsPage.md) — 4 功能点

### announcements

- [AnnouncementListPage](announcements/AnnouncementListPage.md) — 10 功能点

### auth

- [LoginPage](auth/LoginPage.md) — 3 功能点
- [SetupPage](auth/SetupPage.md) — 4 功能点

### billing-invoices

- [BillingInvoiceListPage](billing-invoices/BillingInvoiceListPage.md) — 6 功能点

### billing-plans

- [BillingPlanListPage](billing-plans/BillingPlanListPage.md) — 8 功能点

### billing-subscriptions

- [BillingSubscriptionListPage](billing-subscriptions/BillingSubscriptionListPage.md) — 6 功能点

### channels

- [ChannelAdminPage](channels/ChannelAdminPage.md) — 10 功能点
- [ChannelDetailPage](channels/ChannelDetailPage.md) — 12 功能点
- [ChannelInvitationPage](channels/ChannelInvitationPage.md) — 8 功能点
- [ChannelListPage](channels/ChannelListPage.md) — 15 功能点
- [ChannelMessagePage](channels/ChannelMessagePage.md) — 12 功能点
- [ChannelOrderPage](channels/ChannelOrderPage.md) — 9 功能点
- [ChannelSubscriberPage](channels/ChannelSubscriberPage.md) — 9 功能点
- [PaidChannelOpsPage](channels/PaidChannelOpsPage.md) — 5 功能点

### content-moderation

- [ContentReviewQueuePage](content-moderation/ContentReviewQueuePage.md) — 6 功能点
- [SensitiveWordPage](content-moderation/SensitiveWordPage.md) — 8 功能点

### dashboard

- [DashboardPage](dashboard/DashboardPage.md) — 2 功能点

### errors

- [ForbiddenPage](errors/ForbiddenPage.md) — 1 功能点
- [NotFoundPage](errors/NotFoundPage.md) — 1 功能点

### feedback

- [FeedbackListPage](feedback/FeedbackListPage.md) — 11 功能点

### finance-report

- [FinanceReportPage](finance-report/FinanceReportPage.md) — 2 功能点

### groups

- [GroupAlbumManagePage](groups/GroupAlbumManagePage.md) — 9 功能点
- [GroupCategoryManagePage](groups/GroupCategoryManagePage.md) — 7 功能点
- [GroupContextGatewayPage](groups/GroupContextGatewayPage.md) — 2 功能点
- [GroupDetailPage](groups/GroupDetailPage.md) — 16 功能点
- [GroupFileManagePage](groups/GroupFileManagePage.md) — 9 功能点
- [GroupGovernanceLogPage](groups/GroupGovernanceLogPage.md) — 6 功能点
- [GroupListPage](groups/GroupListPage.md) — 13 功能点
- [GroupMemberManagePage](groups/GroupMemberManagePage.md) — 10 功能点
- [GroupNoticeManagePage](groups/GroupNoticeManagePage.md) — 9 功能点
- [GroupScheduleManagePage](groups/GroupScheduleManagePage.md) — 10 功能点
- [GroupTagManagePage](groups/GroupTagManagePage.md) — 9 功能点
- [GroupTaskListPage](groups/GroupTaskListPage.md) — 8 功能点
- [GroupTaskManagePage](groups/GroupTaskManagePage.md) — 12 功能点
- [GroupVoteManagePage](groups/GroupVoteManagePage.md) — 9 功能点

### license

- [LicensePage](license/LicensePage.md) — 4 功能点

### logout-applications

- [LogoutApplicationListPage](logout-applications/LogoutApplicationListPage.md) — 9 功能点

### logs

- [AuditLogPage](logs/AuditLogPage.md) — 11 功能点

### mcp-governance

- [McpGovernanceListPage](mcp-governance/McpGovernanceListPage.md) — 5 功能点

### messages

- [MessageListPage](messages/MessageListPage.md) — 8 功能点

### moments

- [MomentDetailPage](moments/MomentDetailPage.md) — 6 功能点
- [MomentListPage](moments/MomentListPage.md) — 12 功能点
- [MomentReportPage](moments/MomentReportPage.md) — 8 功能点

### payment-transactions

- [PaymentTransactionListPage](payment-transactions/PaymentTransactionListPage.md) — 8 功能点

### plugin_management

- [PluginLogPage](plugin_management/PluginLogPage.md) — 6 功能点
- [PluginManagementPage](plugin_management/PluginManagementPage.md) — 12 功能点

### pricing

- [PricingPage](pricing/PricingPage.md) — 1 功能点

### recharge-orders

- [RechargeOrderListPage](recharge-orders/RechargeOrderListPage.md) — 8 功能点

### reports

- [ReportCenterPage](reports/ReportCenterPage.md) — 1 功能点

### roles

- [RolePermissionPage](roles/RolePermissionPage.md) — 7 功能点

### settings

- [CapabilityConfigPage](settings/CapabilityConfigPage.md) — 5 功能点
- [ComplianceKeyPage](settings/ComplianceKeyPage.md) — 5 功能点
- [DDLPage](settings/DDLPage.md) — 6 功能点
- [FeatureConfigPage](settings/FeatureConfigPage.md) — 4 功能点
- [MutedUsersPage](settings/MutedUsersPage.md) — 7 功能点
- [ProfileSwitchPage](settings/ProfileSwitchPage.md) — 5 功能点
- [PushTokenListPage](settings/PushTokenListPage.md) — 5 功能点
- [SSOConfigPage](settings/SSOConfigPage.md) — 6 功能点
- [SettingsHomePage](settings/SettingsHomePage.md) — 2 功能点
- [VersionPage](settings/VersionPage.md) — 6 功能点

### storage

- [StorageOverviewPage](storage/StorageOverviewPage.md) — 9 功能点

### system-health

- [SystemHealthPage](system-health/SystemHealthPage.md) — 2 功能点

### users

- [UserCollectManagePage](users/UserCollectManagePage.md) — 9 功能点
- [UserDetailPage](users/UserDetailPage.md) — 8 功能点
- [UserListPage](users/UserListPage.md) — 15 功能点
- [UserTagManagePage](users/UserTagManagePage.md) — 9 功能点

### wallets

- [WalletListPage](wallets/WalletListPage.md) — 6 功能点

### withdrawals

- [WithdrawalsPage](withdrawals/WithdrawalsPage.md) — 8 功能点
