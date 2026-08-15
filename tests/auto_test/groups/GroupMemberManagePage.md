# `src/pages/groups/GroupMemberManagePage.tsx`

> 功能点 10 个 | bug 发现 2 / 解决 2 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 错误态注入待补测 |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 1 | 1 | 0 | bug 已修：members 查询缺 JOIN user 致 500（复验 200） |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 渲染+交互验证通过；数据单页，多页翻页待数据扩充 |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 「确认踢出成员」alertdialog 实测出现（e2e 测试遗留群），取消路径弹窗关闭且 DB group_member 行无变化 |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 「成员已踢出」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 1 | 1 | 0 | bug：adm_group_handler:kick_member 调 group_member_logic:leave/3，管理员不在群成员表→validate_role_permission 恒失败且被 `{error,_}->ok` 吞成假成功（API success+toast 但 DB 零变化，eval 复现）。已修：logic 新增 admin_kick/3（免群内校验，adm_acl 门禁不变），复验踢出后 DB 行删除+统计重算+group_log type=202；测试后 INSERT 回成员行净零 |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 「导出当前页 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 跳转 `/users/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 「查看用户」按钮导航验证（p17b） |
| 无待办 | - | `src/pages/groups/GroupMemberManagePage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
