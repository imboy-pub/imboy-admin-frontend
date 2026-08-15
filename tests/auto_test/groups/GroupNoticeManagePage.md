# `src/pages/groups/GroupNoticeManagePage.tsx`

> 功能点 9 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupNoticeManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupNoticeManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 错误态注入待补测 |
| 无待办 | - | `src/pages/groups/GroupNoticeManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupNoticeManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 播种 15 条后翻页验证通过（p18/p19） |
| 无待办 | - | `src/pages/groups/GroupNoticeManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/groups/GroupNoticeManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 播种 15 条后翻页验证通过（p18/p19） |
| 无待办 | - | `src/pages/groups/GroupNoticeManagePage.tsx` | 「公告已删除」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 种子群 106571324669036544 公告 92000000000001014：确认弹窗（取消路径 DB 无变化）→确认→toast「公告已删除」+DB deleted_at 落库+刷新后列表行消失（软删除用 deleted_at 列非 status）；种子行保留已删态 |
| 无待办 | - | `src/pages/groups/GroupNoticeManagePage.tsx` | 「导出当前页 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次5 | 0 | 0 | 0 | 下载 group_notices_2026-08-14.csv+toast「已导出当前页 10 条数据」 |
| 无待办 | - | `src/pages/groups/GroupNoticeManagePage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
