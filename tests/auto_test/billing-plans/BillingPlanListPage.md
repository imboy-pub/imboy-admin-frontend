# `src/pages/billing-plans/BillingPlanListPage.tsx`

> 功能点 8 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/billing-plans/BillingPlanListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/billing-plans/BillingPlanListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 500注入后错误态已渲染(p7) |
| 无待办 | - | `src/pages/billing-plans/BillingPlanListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/billing-plans/BillingPlanListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次5 | 0 | 0 | 0 | 造数16条实测：page=2 GET 200 |
| 无待办 | - | `src/pages/billing-plans/BillingPlanListPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/billing-plans/BillingPlanListPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次7 | 0 | 0 | 0 | 编辑抽屉打开（标题「编辑套餐 e2e_batch7_plan」）→改名称→保存提交→toast+抽屉关闭+列表刷新，全程实测 |
| 无待办 | - | `src/pages/billing-plans/BillingPlanListPage.tsx` | 「套餐已创建」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 本地净零段实测（非生产资金）：新建抽屉填编码/名称/价格9.9→保存→toast「套餐已创建」+列表出现新行+DB price=990 分/billing_period=month 落库核实（code=e2e_batch7_plan） |
| 无待办 | - | `src/pages/billing-plans/BillingPlanListPage.tsx` | 「套餐已更新」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 编辑抽屉改名称→保存→toast「套餐已更新」+列表行刷新+DB name 落库核实 |
