# `src/pages/moments/MomentDetailPage.tsx`

> 功能点 6 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/moments/MomentDetailPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次6 | 0 | 0 | 0 | 播种数据后（moment_post 25 条）登录态直达 /moments/92000000000000001 渲染「动态详情 #…」正常 |
| 无待办 | - | `src/pages/moments/MomentDetailPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次6 | 0 | 0 | 0 | 不存在 ID（…999999）→ ErrorState「加载动态详情失败」含重试；正常 ID 正常渲染 |
| 无待办 | - | `src/pages/moments/MomentDetailPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次6 | 0 | 0 | 0 | 实测详情页删除弹窗（仅 status=1 渲染删除按钮）：取消→弹窗关闭、无请求 |
| 无待办 | - | `src/pages/moments/MomentDetailPage.tsx` | 「动态已删除」操作提交成功并刷新列表数据 | 已通过 | 批次6 | 0 | 0 | 0 | 实测对播种动态（id 92000000000000022）确认删除：POST 200+toast「动态已删除」+自动跳回 /moments，DB status 置 -1 核实 |
| 无待办 | - | `src/pages/moments/MomentDetailPage.tsx` | 跳转 `/moments` | 已通过 | 批次6 | 0 | 0 | 0 | 实测「返回列表」按钮→/moments；删除成功后亦自动 navigate('/moments') |
| 无待办 | - | `src/pages/moments/MomentDetailPage.tsx` | 跳转 `/moments/reports` | 已通过 | 批次6 | 0 | 0 | 0 | 实测「举报处理」→/moments/reports，App.tsx:446 显式重定向至 /reports?target_type=moment（举报统一收编治理中心，设计内） |
