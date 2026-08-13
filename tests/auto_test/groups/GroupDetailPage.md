# `src/pages/groups/GroupDetailPage.tsx`

> 功能点 16 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 错误态注入待补测 |
| 阻塞 | 需人工验证 | `src/pages/groups/GroupDetailPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 未测 | 批次3 | 0 | 0 | 0 | 确认执行路径属不可逆/敏感操作 |
| 阻塞 | 需人工验证 | `src/pages/groups/GroupDetailPage.tsx` | 「群组信息已更新」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 写操作交互深度超出自动化边界（icon 行内按钮/编辑弹窗） |
| 阻塞 | 需人工验证 | `src/pages/groups/GroupDetailPage.tsx` | 「群组已解散」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 写操作交互深度超出自动化边界（icon 行内按钮/编辑弹窗） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups` | 已通过 | 批次3 | 0 | 0 | 0 | tab「返回群列表」点击导航已验证（p14） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/members` | 已通过 | 批次3 | 0 | 0 | 0 | tab「成员」点击导航已验证（p14） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/votes` | 已通过 | 批次3 | 0 | 0 | 0 | tab「投票」点击导航已验证（p14） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/notices` | 已通过 | 批次3 | 0 | 0 | 0 | tab「公告」点击导航已验证（p14） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/tags` | 已通过 | 批次3 | 0 | 0 | 0 | tab「标签」点击导航已验证（p14） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/categories` | 已通过 | 批次3 | 0 | 0 | 0 | tab「分类」点击导航已验证（p14） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/files` | 已通过 | 批次3 | 0 | 0 | 0 | tab「文件」点击导航已验证（p14） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/albums` | 已通过 | 批次3 | 0 | 0 | 0 | tab「相册」点击导航已验证（p14） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/schedules` | 已通过 | 批次3 | 0 | 0 | 0 | tab「日程」点击导航已验证（p14） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/tasks` | 已通过 | 批次3 | 0 | 0 | 0 | tab「任务」点击导航已验证（p14） |
| 回归复测 | 需人工点击验证 | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/governance-logs` | 待重验 | 批次3 | 0 | 0 | 0 | tab 按钮文案差异，自动定位未命中 |
