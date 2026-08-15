# `src/pages/groups/GroupVoteManagePage.tsx`

> 功能点 9 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次8 | 0 | 0 | 0 | 错误态经定向 XHR 劫持注入验证（API 404 → ErrorState 错误文案+重试按钮）：「加载群投票数据失败」 |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 七阶段数据整备后复测通过（p24-p27） |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 七阶段数据整备后复测通过（p24-p27） |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 「投票已结束」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 1 | 1 | 0 | bug=adm_group_vote_handler 复用客户端 close_vote/2（含「creator/群管理员」校验），平台管理员非群成员恒 403→toast「操作失败」；已修（照 task_close 模式直接 group_vote_ds 改状态）+重建复验：造数 e2e_vote_close_01 确认弹窗（取消路径 DB 不变）→确认→toast「投票已结束」+DB status 1→2+行内按钮消失；净零=测试行已删恢复 16 条基线 |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 「导出当前页 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次5 | 0 | 0 | 0 | 下载 group_votes_2026-08-14.csv+toast「已导出当前页 10 条数据」 |
| 无待办 | - | `src/pages/groups/GroupVoteManagePage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
