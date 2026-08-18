# `src/pages/moments/MomentListPage.tsx`

> 功能点 12 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次9 | 0 | 0 | 0 | ux/events 404 已修复复验200 |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次9 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 批量勾选与批量操作执行 | 已通过 | 批次3 | 0 | 0 | 0 | 勾选交互已验证（数据播种后） |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次6 | 0 | 0 | 0 | 实测单删弹窗（仅 status=1 行渲染删除按钮）：取消→弹窗关闭、无请求；确认→POST 200+toast「动态已删除」；批量弹窗要求原因≥2字+确认关键字 DELETE，未填时校验拦截 |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次9 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 「动态已删除」操作提交成功并刷新列表数据 | 已通过 | 批次6 | 0 | 0 | 0 | 实测对播种动态（id 920000000000000025）执行删除：POST /moment/delete 200+toast「动态已删除」+列表刷新，DB status 置 -1 核实 |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 「批量删除」操作提交成功并刷新列表数据 | 已通过 | 批次6 | 0 | 0 | 0 | 实测勾选 2 条播种动态→填原因+DELETE→2×POST 200+toast「批量删除完成：成功 2 条动态」，DB 两条均置 -1 核实 |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 「导出 N 条动态数据」操作提交成功并刷新列表数据 | 已通过 | 批次9 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 跳转 `/moments/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 行点击进入动态详情验证（p17） |
| 无待办 | - | `src/pages/moments/MomentListPage.tsx` | 跳转 `/moments/reports` | 已通过 | 批次3 | 0 | 0 | 0 |  |
