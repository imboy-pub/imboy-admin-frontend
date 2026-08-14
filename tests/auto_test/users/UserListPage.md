# `src/pages/users/UserListPage.tsx`

> 功能点 15 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 | ux/events 404 已修复复验200 |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 批量勾选与批量操作执行 | 已通过 | 批次3 | 0 | 0 | 0 | 勾选后批量操作反馈已验证（p13） |
| 阻塞 | 需人工验证 | `src/pages/users/UserListPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 未测 | 批次3 | 0 | 0 | 0 | 弹窗交互深度超出自动化边界 |
| 阻塞 | 永久人工道（§1.4 不可逆/敏感写操作） | `src/pages/users/UserListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 未测 | 批次3 | 0 | 0 | 0 | 确认执行路径属不可逆/敏感操作 |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 「用户已封禁」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 单条封禁 e2e_688453_13（指定牺牲账号）实测 POST 200+徽章禁用+GET 刷新 |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 「用户已解封」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 单条解封实测 POST 200+徽章回正常 |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 「批量封禁」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 批量封禁实测（中风险原因门禁生效）POST 200+勾选清空 |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 「批量解封」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 批量解封实测（低风险免原因）POST 200；终态 DB status=1 |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 「导出 N 条用户数据」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/users/UserListPage.tsx` | 跳转 `/users/:id` | 已通过 | 批次3 | 0 | 0 | 0 | eye(title=查看详情)导航验证（p17c） |
