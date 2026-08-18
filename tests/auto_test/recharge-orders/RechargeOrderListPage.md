# `src/pages/recharge-orders/RechargeOrderListPage.tsx`

> 功能点 8 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/recharge-orders/RechargeOrderListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/recharge-orders/RechargeOrderListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 | 500注入后错误态已渲染(p7) |
| 无待办 | - | `src/pages/recharge-orders/RechargeOrderListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/recharge-orders/RechargeOrderListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次9 | 0 | 0 | 0 | 造数18条实测：page=2 GET 200 |
| 无待办 | - | `src/pages/recharge-orders/RechargeOrderListPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/recharge-orders/RechargeOrderListPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次7 | 0 | 0 | 0 | 点行打开详情抽屉（标题「充值订单 RCHE2E7REFUND001」字段完整渲染）→关闭按钮实测关闭；本页为只读详情抽屉无表单提交 |
| 无待办 | - | `src/pages/recharge-orders/RechargeOrderListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 「确认为该充值订单退款？」ConfirmDialog（含订单号/金额/不可撤销提示）实测出现；取消路径实测关闭+DB 订单状态/钱包余额无变化 |
| 无待办 | - | `src/pages/recharge-orders/RechargeOrderListPage.tsx` | 「退款」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 本地净零段实测（非生产资金，mock 支付订单）：确认退款→toast「退款成功」+列表状态变「已退款」+DB 订单 status→3/钱包 500→400 扣回 100 分/wallet_transaction 落 1 条流水核实（订单 RCHE2E7REFUND001） |
