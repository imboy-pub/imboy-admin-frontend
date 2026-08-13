# `src/pages/moments/MomentReportPage.tsx`

> 功能点 8 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 | 302 → /reports?target_type=moment（p13） |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 500 注入错误态已渲染（p13） |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 | 举报列表 API 200（p13） |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 举报数据播种后翻页验证通过（p21） |
| 无待办 | - | `src/pages/moments/MomentReportPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 | 搜索按钮点击已验证（p17） |
| 阻塞 | 需测试数据 | `src/pages/moments/MomentReportPage.tsx` | 批量勾选与批量操作执行 | 未测 | 批次3 | 0 | 0 | 0 | 无数据行可勾选 |
| 阻塞 | 需人工验证 | `src/pages/moments/MomentReportPage.tsx` | 「举报处理」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 写操作交互深度超出自动化边界（icon 行内按钮/编辑弹窗） |
| 阻塞 | 需测试数据 | `src/pages/moments/MomentReportPage.tsx` | 跳转 `/moments/:id` | 未测 | 批次3 | 0 | 0 | 0 | 无举报数据，动态详情链接未渲染 |
