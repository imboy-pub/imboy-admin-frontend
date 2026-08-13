# `src/pages/feedback/FeedbackListPage.tsx`

> 功能点 11 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 1 | 1 | 0 | bug 已修：feedback-workflow env 双前缀 404（修复复验 200） |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 渲染+交互验证通过；数据单页，多页翻页待数据扩充 |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 阻塞 | 需人工验证 | `src/pages/feedback/FeedbackListPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 未测 | 批次3 | 0 | 0 | 0 | 弹窗交互深度超出自动化边界 |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 渲染+交互验证通过；数据单页，多页翻页待数据扩充 |
| 阻塞 | 需测试数据 | `src/pages/feedback/FeedbackListPage.tsx` | 「回复」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 本地库无该类数据，写操作无法真实执行 |
| 阻塞 | 需测试数据 | `src/pages/feedback/FeedbackListPage.tsx` | 「反馈已删除」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 本地库无该类数据，写操作无法真实执行 |
| 阻塞 | 需测试数据 | `src/pages/feedback/FeedbackListPage.tsx` | 「反馈已标记完结」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 本地库无该类数据，写操作无法真实执行 |
| 无待办 | - | `src/pages/feedback/FeedbackListPage.tsx` | 「导出 N 条反馈数据」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
