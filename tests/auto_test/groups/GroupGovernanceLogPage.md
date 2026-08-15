# `src/pages/groups/GroupGovernanceLogPage.tsx`

> 功能点 6 个 | bug 发现 2 / 解决 2 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupGovernanceLogPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupGovernanceLogPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次8 | 0 | 0 | 0 | 错误态经定向 XHR 劫持注入验证（API 404 → ErrorState 错误文案+重试按钮）：「加载群治理日志失败」 |
| 无待办 | - | `src/pages/groups/GroupGovernanceLogPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 1 | 1 | 0 | bug 已修：jsonb 列 ILIKE 报 42883（::text cast，带关键词复验 200） |
| 无待办 | - | `src/pages/groups/GroupGovernanceLogPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 1 | 1 | 0 | bug 已修：jsonb 规范化空格使 group_id/target_id ILIKE 恒空（改 JSON 操作符，复验 15 条命中） |
| 无待办 | - | `src/pages/groups/GroupGovernanceLogPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次8 | 0 | 0 | 0 | 多页导出实测（共 30 条 3 页）：翻到第2页（显示 11-20 条）点导出 → toast「已导出当前页 10 条治理日志」；导出为当前页语义，无全量导出 |
| 无待办 | - | `src/pages/groups/GroupGovernanceLogPage.tsx` | 跳转 `/groups/context?gid=:id` | 已通过 | 批次3 | 0 | 0 | 0 | 群上下文链接验证（p17） |
