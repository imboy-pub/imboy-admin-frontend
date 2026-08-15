# `src/pages/groups/GroupScheduleManagePage.tsx`

> 功能点 10 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupScheduleManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupScheduleManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次8 | 0 | 0 | 0 | 错误态经定向 XHR 劫持注入验证（API 404 → ErrorState 错误文案+重试按钮）：「加载群日程数据失败」 |
| 无待办 | - | `src/pages/groups/GroupScheduleManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupScheduleManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次8 | 0 | 0 | 0 | 多页翻页实测（群 106571324669036544 共 15 条）：第1页 10 行→第2页 5 行，末页禁用下一页 |
| 无待办 | - | `src/pages/groups/GroupScheduleManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 取消路径实测：e2e_sched_3 弹「确定要取消日程…」→点取消→弹窗关闭+DB status 仍 1；确认执行路径见本文件行「日程已取消」（status 1→4 实测） |
| 无待办 | - | `src/pages/groups/GroupScheduleManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/groups/GroupScheduleManagePage.tsx` | 「日程已取消」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 实测（播种数据已存在，原「无数据」理由过时）行内「取消日程」→ConfirmDialog 确认：toast「日程已取消」，DB status 1→4 核实 |
| 无待办 | - | `src/pages/groups/GroupScheduleManagePage.tsx` | 「日程已恢复」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 实测取消后行内出现「恢复日程」→确认：toast「日程已恢复」，DB status 回 1（净零还原） |
| 无待办 | - | `src/pages/groups/GroupScheduleManagePage.tsx` | 「导出当前页 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/groups/GroupScheduleManagePage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
