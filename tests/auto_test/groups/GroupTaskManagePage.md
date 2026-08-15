# `src/pages/groups/GroupTaskManagePage.tsx`

> 功能点 12 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupTaskManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupTaskManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 错误态注入待补测 |
| 无待办 | - | `src/pages/groups/GroupTaskManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupTaskManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 渲染+交互验证通过；数据单页，多页翻页待数据扩充 |
| 无待办| -| `src/pages/groups/GroupTaskManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过| 批次7| 0| 0| 0| 实测三个 ConfirmDialog（强制结束/删除/恢复）打开+取消+确认执行全链路；取消路径点「取消」弹窗关闭无请求发出 |
| 无待办 | - | `src/pages/groups/GroupTaskManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办| -| `src/pages/groups/GroupTaskManagePage.tsx` | 「任务已强制结束」操作提交成功并刷新列表数据 | 已通过| 批次7| 0| 0| 0| 实测…3014「强制结束任务」→ConfirmDialog「确认强制结束任务」→确认：POST /group/task/close 200+列表刷新，DB status 0→3 核实 |
| 无待办| -| `src/pages/groups/GroupTaskManagePage.tsx` | 「任务批改已提交」操作提交成功并刷新列表数据 | 已通过| 批次7| 1| 1| 0| 实测选中…3013→待批改区（造 assignment …4001 status=2）→「批改」填分88+评语→「提交批改」：POST /group/task/review 200+待批改清空，DB status 2→3/score=88/comment/reviewed_by/reviewed_at 全落库。发现并修复后端 bug：adm 入口 review 必 500——logic ensure_task_creator 拿 adm_user_id 对比用户侧 creator_id（两个 ID 空间永不相等）→返回三元组 {error,Msg,5306} 而 handler case 只匹配二元组→case clause 崩溃；修复=logic 新增 review_as_admin/3（RBAC 已在 adm 层把关，跳过创建者校验）+handler 改调并匹配三元组（热加载复验） |
| 无待办| -| `src/pages/groups/GroupTaskManagePage.tsx` | 「任务已删除」操作提交成功并刷新列表数据 | 已通过| 批次7| 0| 0| 0| 实测…3013「删除任务」→ConfirmDialog「确认删除任务」→确认：POST /group/task/delete 200+列表刷新，DB deleted_at 置位核实（软删） |
| 无待办| -| `src/pages/groups/GroupTaskManagePage.tsx` | 「任务已恢复」操作提交成功并刷新列表数据 | 已通过| 批次7| 0| 0| 0| 实测「恢复软删除任务」输入 …3013→「恢复」→ConfirmDialog「确认恢复任务」→确认：POST /group/task/restore 200+列表刷新，DB deleted_at 清空核实（与删除行构成往返净零） |
| 无待办 | - | `src/pages/groups/GroupTaskManagePage.tsx` | 「导出当前页 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/groups/GroupTaskManagePage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
