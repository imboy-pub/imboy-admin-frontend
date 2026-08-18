# `src/pages/groups/GroupDetailPage.tsx`

> 功能点 16 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 | 错误态经定向 XHR 劫持注入验证（API 404 → ErrorState 错误文案+重试按钮）：「加载群组详情失败」 |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 「确认解散群组」ConfirmDialog（取消/解散+不可恢复提示）实测出现；取消路径实测关闭弹窗无副作用，确认执行路径由行12 覆盖 |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 「群组信息已更新」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 编辑卡片改群名称→保存→toast「群组信息已更新」+详情刷新+DB title 落库核实（e2e 群组 92000000000020014，净零段；受益于批次7 adm_group_handler binary 键修复） |
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 「群组已解散」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 确认弹窗→解散→自动跳回 /groups+列表刷新+DB status→-1 核实（状态列显示「已解散」，受益于批次7 -1 标签修复） |
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
| 无待办 | - | `src/pages/groups/GroupDetailPage.tsx` | 跳转 `/groups/:id/governance-logs` | 已通过 | 批次3 | 0 | 0 | 0 | 「治理日志」tab 导航验证（p17b） |
