# `src/pages/groups/GroupTaskListPage.tsx`

> 功能点 8 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupTaskListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupTaskListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 需先选群组才加载列表，ErrorState 已实现；features 失败走 fail-open 缓存设计 |
| 无待办 | - | `src/pages/groups/GroupTaskListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupTaskListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 六阶段播种/修复后复测通过（logout type=102 / grouptask 带参查询） |
| 无待办 | - | `src/pages/groups/GroupTaskListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 取消路径实测：e2e_task_13（id 92000000000003013）弹「确定要强制结束任务…」→点取消→弹窗关闭+DB status 仍 0；确认执行路径见本文件「任务已强制关闭」行（status→3 实测） |
| 无待办 | - | `src/pages/groups/GroupTaskListPage.tsx` | 「任务已强制关闭」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 播种数据已存在（原「无数据」理由过时）；实测填群组ID查询→行内 CheckCircle2「强制关闭任务」→ConfirmDialog 确认：toast「任务已强制关闭」，DB status→3 核实（关闭后按钮按 status!==3 隐藏） |
| 无待办 | - | `src/pages/groups/GroupTaskListPage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupTaskListPage.tsx` | 跳转 `/groups/:id/tasks` | 已通过 | 批次3 | 0 | 0 | 0 |  |
