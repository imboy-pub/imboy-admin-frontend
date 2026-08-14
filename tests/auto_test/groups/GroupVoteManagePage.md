# `src/pages/groups/GroupVoteManagePage.tsx`

> 功能点 9 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 错误态注入待补测 |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 七阶段数据整备后复测通过（p24-p27） |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 七阶段数据整备后复测通过（p24-p27） |
| 阻塞 | 永久人工道（§1.4 不可逆写操作） | `src/pages/groups/GroupVoteManagePage.tsx` | 「投票已结束」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 行内操作含不可逆动作（删除/解散/踢出），按规程人工执行 |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 「导出当前页 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次5 | 0 | 0 | 0 | 下载 group_votes_2026-08-14.csv+toast「已导出当前页 10 条数据」 |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
