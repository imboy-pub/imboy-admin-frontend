# `src/pages/users/UserCollectManagePage.tsx`

> 功能点 9 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 错误态注入待补测 |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 阻塞 | 需 >10 条数据 | `src/pages/users/UserCollectManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 未测 | 批次3 | 0 | 0 | 0 | 数据量不足，无第二页 |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 阻塞 | 需 >10 条数据 | `src/pages/users/UserCollectManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 未测 | 批次3 | 0 | 0 | 0 | 数据量不足，无第二页 |
| 阻塞 | 需测试数据 | `src/pages/users/UserCollectManagePage.tsx` | 「收藏项已移除」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 本地库无该类数据，写操作无法真实执行 |
| 阻塞 | 需 >10 条数据 | `src/pages/users/UserCollectManagePage.tsx` | 「导出 N 条数据」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 列表为空导出按钮禁用/无数据可导 |
| 无待办 | - | `src/pages/users/UserCollectManagePage.tsx` | 跳转 `/users/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 入口点击导航已验证（p14） |
