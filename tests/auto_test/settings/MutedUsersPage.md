# `src/pages/settings/MutedUsersPage.tsx`

> 功能点 7 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/settings/MutedUsersPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/MutedUsersPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/MutedUsersPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/settings/MutedUsersPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 七阶段数据整备后复测通过（p24-p27） |
| 无待办| -| `src/pages/settings/MutedUsersPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过| 批次7| 0| 0| 0| e2e 播种 uid …1001/…1002 造禁言数据后实测：单个解禁与批量解禁均有 ConfirmDialog，确认执行成功（路径由行13/14 覆盖） |
| 无待办| -| `src/pages/settings/MutedUsersPage.tsx` | 「解禁」操作提交成功并刷新列表数据 | 已通过| 批次7| 0| 0| 0| 造数：ETS msg_rate_muted 插入 {…1001, 未来1h}；实测行内「解禁」→ConfirmDialog 确认：列表刷新行消失，rpc 核实 ETS 键已删（e2e 播种 uid，非真实用户） |
| 无待办| -| `src/pages/settings/MutedUsersPage.tsx` | 「解禁 N 个用户」操作提交成功并刷新列表数据 | 已通过| 批次7| 0| 0| 0| 实测勾选 …1002→批量解禁→ConfirmDialog 确认：列表回空态「当前无禁言用户」，rpc 核实 ETS 全清（与造数构成净零） |
