# `src/pages/channels/ChannelListPage.tsx`

> 功能点 15 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 | ux/events 404 已修复复验200 |
| 阻塞 | 需 >10 条数据 | `src/pages/channels/ChannelListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 未测 | 批次3 | 0 | 0 | 0 | 数据量不足，无第二页 |
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 批量勾选与批量操作执行 | 已通过 | 批次3 | 0 | 0 | 0 | 勾选后批量操作反馈已验证（p13） |
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次3 | 0 | 0 | 0 | 打开+取消已验证 |
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 确认弹窗+取消不发请求已断言 |
| 阻塞 | 需 >10 条数据 | `src/pages/channels/ChannelListPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 未测 | 批次3 | 0 | 0 | 0 | 数据量不足，无第二页 |
| 阻塞 | 需人工验证 | `src/pages/channels/ChannelListPage.tsx` | 「频道已删除」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 写操作交互深度超出自动化边界（icon 行内按钮/编辑弹窗） |
| 阻塞 | 需人工验证 | `src/pages/channels/ChannelListPage.tsx` | 「批量删除」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 写操作交互深度超出自动化边界（icon 行内按钮/编辑弹窗） |
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 「导出 N 条频道数据」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 跳转 `/channels/:id` | 已通过 | 批次3 | 0 | 0 | 0 | eye(title=查看详情)导航验证（p17c） |
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 跳转 `/channels/:id?edit=1` | 已通过 | 批次3 | 0 | 0 | 0 | 编辑入口与详情入口同列（pencil），导航验证（p17c） |
| 无待办 | - | `src/pages/channels/ChannelListPage.tsx` | 跳转 `/channels/:id/messages` | 已通过 | 批次3 | 0 | 0 | 0 | 频道详情 tab 已验证可达（p14） |
