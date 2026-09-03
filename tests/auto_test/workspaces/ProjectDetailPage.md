# `src/pages/workspaces/ProjectDetailPage.tsx`

> 功能点 14 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 未登录跳login实测；路由级403缺无权限账号未测 |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 加载中 / 错误态展示（LoadingState / ErrorState + 重试） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 500注入错误态+重试恢复2xx |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 页头与基本信息卡（项目名/ID/状态徽标 进行中·已完成/所属工作区名+ID/Owner 名+ID/创建时间/描述） | 已通过 | 批次W2R1 | 0 | 0 | 0 | owner/workspace嵌套契约实测渲染正常 |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 任务统计 StatsCard 四卡（任务总数/已完成/assignee 数/完成率%） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 四卡标题与数值渲染实测 |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 任务状态分布四格渲染（待办/进行中/待评审/已完成计数，data-testid=task-stat-*） | 已通过 | 批次W2R1 | 0 | 0 | 0 | task-stat-todo/doing/review/done 四格实测 |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | Assignee 概览表（昵称/账号/任务 完成/总数；空态「暂无已指派任务」） | 已通过 | 批次W2R1 | 0 | 0 | 0 | assignee 表格实测渲染 |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | W2 治理 Tab 切换（成员/里程碑/频道/聚合四 Tab，默认成员，懒加载互不干扰） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 四Tab存在+默认成员2xx实测 |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 成员 Tab：只读表格（用户ID/昵称/账号/角色/加入时间）+ 服务端分页与刷新 | 已通过 | 批次W2R1 | 0 | 0 | 0 | 五列头+刷新2xx实测 |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 里程碑 Tab：状态筛选（全部/未达成/已达成，变化重置 page=1）+ 只读表格（ID/名称/状态徽标/计划时间/达成时间）+ 分页 | 已通过 | 批次W2R1 | 0 | 0 | 0 | status=planned请求page=1实测2xx |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 频道 Tab：只读表格（频道ID/名称/关联时间）+ 服务端分页 | 已通过 | 批次W2R1 | 1 | 1 | 0 | 重测：列头对齐真实契约+种子频道行实测 |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 聚合 Tab：类型筛选（置顶/资源/动态/关联帖子，变化重置 page=1）+ 只读表格（ID/类型/标题/关联对象/时间）+ 分页 | 已通过 | 批次W2R1 | 0 | 0 | 0 | type=activity请求page=1实测2xx |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 面板 403 fail-closed 态（无 workspaces:read 权限时显示明确文案 + 重试按钮，不白屏） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 403注入文案+重试恢复实测；缺真实无权限账号 |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 面板空态（后端未返回记录时 EmptyState「后端未返回任何记录」） | 已通过 | 批次W2R1 | 0 | 0 | 0 | pinned自然空+related_posts注入空双重验证 |
| 无待办 | - | `src/pages/workspaces/ProjectDetailPage.tsx` | 返回列表按钮跳转 /projects | 已通过 | 批次W2R1 | 0 | 0 | 0 |  |

## 批次W2R1 发现的 bug

1. **频道 Tab 字段错配（前端）**：`/api/adm/project/channels` 实际返回 `channel_id`/`linked_at`（无 `id`/`subscriber_count`/`created_at`），
   `ProjectChannelsPanel`（src/pages/workspaces/ProjectDetailPage.tsx）按 `c.id`/`c.subscriber_count`/`c.created_at` 渲染 →
   频道 ID 列为空、订阅数恒 0、创建时间恒 —，且 `<tr key={c.id}>` key 为 undefined 触发 React console error
   （`Each child in a list should have a unique "key" prop ... Check the render method of ProjectChannelsPanel`）。
   证据：evidence/workspaces/w2r1-*-pdetail-channels-panel.png（Announcements 行 ID 空/订阅数 0/时间 —）、
   evidence-misc/w2r1-*-console-errors.json。getProjectChannelsPayload 纯 cast 无行级映射（src/services/api/workspaces.ts）。
   **已修复（批次W2R2FIX）**：ProjectChannelRow 类型与表格列对齐真实契约（ID=channel_id、时间=linked_at，
   订阅数列删除不造假），key 改 channel_id；复验 /projects/109901866229565440 频道 Tab 实测
   ID 109901866059696128 / Announcements / 2026/08/30 21:36，console 无 key error（w2r2fix-pdetail-channels-panel.png）。
