# `src/pages/workspaces/WorkspaceDetailPage.tsx`

> 功能点 7 个 | bug 发现 3 / 解决 0 / 待处理 3
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/workspaces/WorkspaceDetailPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次W2R1 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/workspaces/WorkspaceDetailPage.tsx` | 加载中 / 错误态展示（LoadingState / ErrorState + 重试） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 错误态500注入验证+重试恢复2xx |
| 待修复 | 2026-08-30 | `src/pages/workspaces/WorkspaceDetailPage.tsx` | 基本信息卡渲染（名称/ID/状态徽标/Owner/创建时间） | 有BUG待修 | 批次W2R1 | 1 | 0 | 1 | Owner昵称缺失显示—：detail回嵌套owner{}，页面读扁平owner_nickname |
| 待修复 | 2026-08-30 | `src/pages/workspaces/WorkspaceDetailPage.tsx` | 资源计数 StatsCard 渲染（项目数/群组数/频道数/工作区成员数） | 有BUG待修 | 批次W2R1 | 1 | 0 | 1 | 四卡全0：detail无*_count字段（实际1/1/1/2），前端未按数组推导 |
| 待修复 | 2026-08-30 | `src/pages/workspaces/WorkspaceDetailPage.tsx` | 工作区成员清单渲染（昵称/账号/角色徽标 Owner·Admin·Member·Guest/加入时间） | 有BUG待修 | 批次W2R1 | 1 | 0 | 1 | 恒显暂无工作区成员：members.list嵌套分页未归一为items（实际2成员） |
| 无待办 | - | `src/pages/workspaces/WorkspaceDetailPage.tsx` | 归属资源清单卡渲染（项目/群组/频道各前 20 条，含成员数或订阅数列，空态文案） | 已通过 | 批次W2R1 | 0 | 0 | 0 | 三卡各1行实测（AT-项目*/General成员1/Announcements订阅0） |
| 无待办 | - | `src/pages/workspaces/WorkspaceDetailPage.tsx` | 返回列表按钮跳转 /workspaces | 已通过 | 批次W2R1 | 0 | 0 | 0 |  |

## 批次W2R1 发现的 bug（同根因：detail 页按 list 行形状取数，detail 接口返回嵌套形状）

后端 `/api/adm/workspace/detail` payload 为嵌套形状：`owner:{nickname,account}`、`members:{list:[...],total}`、
`projects/groups/channels` 数组（无 `owner_nickname`/`*_count` 扁平字段）；`WorkspaceDetailPage` +
`WorkspaceAdminDetail`（src/services/api/workspaces.ts）按列表页的扁平形状取数，`getWorkspaceDetailPayload` 纯 cast 无映射：

1. **主 Owner 昵称缺失**：`data.owner_nickname || data.owner_account` 均为 undefined → 显示「— 178809489600161」
   （实际昵称走查AT甲）。证据：w2r1-*-wdetail-basic-info.png / wdetail-fullpage.png。
2. **资源计数四卡全 0**：`data.project_count ?? 0` 等 → 0/0/0/0（实际项目1/群组1/频道1/成员2）。同上截图。
3. **成员清单恒空**：`data.members?.items ?? []`，payload members 为嵌套分页（`list` 键，响应适配器仅归一化顶层）
   → 恒显「暂无工作区成员」（实际 2 成员：走查AT甲 owner / 走查AT乙 member）。证据：wdetail-members-empty.png。

对比：`/workspace/list` 行 payload 为扁平字段（owner_nickname/*_count 齐全），列表页不受影响。
