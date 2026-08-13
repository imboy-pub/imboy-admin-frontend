# `src/pages/groups/GroupMemberManagePage.tsx`

> 功能点 10 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 错误态注入待补测 |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 1 | 1 | 0 | bug 已修：members 查询缺 JOIN user 致 500（复验 200） |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 渲染+交互验证通过；数据单页，多页翻页待数据扩充 |
| 阻塞 | 需人工验证 | `src/pages/groups/GroupMemberManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 未测 | 批次3 | 0 | 0 | 0 | 确认执行路径属不可逆/敏感操作 |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 阻塞 | 需人工验证 | `src/pages/groups/GroupMemberManagePage.tsx` | 「成员已踢出」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 行内操作含不可逆动作（删除/解散/踢出），按规程人工执行 |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 「导出当前页 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 跳转 `/users/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 「查看用户」按钮导航验证（p17b） |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
