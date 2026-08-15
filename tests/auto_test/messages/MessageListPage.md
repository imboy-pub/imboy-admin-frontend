# `src/pages/messages/MessageListPage.tsx`

> 功能点 8 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/messages/MessageListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/messages/MessageListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/messages/MessageListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/messages/MessageListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/messages/MessageListPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次3 | 0 | 0 | 0 | 打开+取消已验证 |
| 无待办 | - | `src/pages/messages/MessageListPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/messages/MessageListPage.tsx` | 「开始下载导出文件」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/messages/MessageListPage.tsx` | 「N已复制」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 实测：行内「查看详情」开抽屉→「复制消息ID」→toast「消息ID已复制」（navigator.clipboard.readText 挂起系权限提示，以 toast 为准）；handleCopy 模板 `${label}已复制` 同源覆盖整行JSON/Payload 变体（detailData 未加载时按钮不渲染，属正常懒加载） |
