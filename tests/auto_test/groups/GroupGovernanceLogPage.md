# `src/pages/groups/GroupGovernanceLogPage.tsx`

> 功能点 6 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupGovernanceLogPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupGovernanceLogPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 错误态注入待补测 |
| 无待办 | - | `src/pages/groups/GroupGovernanceLogPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 1 | 1 | 0 | bug 已修：jsonb 列 ILIKE 报 42883（::text cast，带关键词复验 200） |
| 阻塞 | 需 >10 条数据 | `src/pages/groups/GroupGovernanceLogPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 未测 | 批次3 | 0 | 0 | 0 | 数据量不足，无第二页 |
| 阻塞 | 需 >10 条数据 | `src/pages/groups/GroupGovernanceLogPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 未测 | 批次3 | 0 | 0 | 0 | 数据量不足，无第二页 |
| 回归复测 | 需人工点击验证 | `src/pages/groups/GroupGovernanceLogPage.tsx` | 跳转 `/groups/context?gid=:id` | 待重验 | 批次3 | 0 | 0 | 0 | 返回/入口按钮存在（截图），自动点击未命中文案 |
