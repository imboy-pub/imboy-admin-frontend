# `src/pages/payment-transactions/PaymentTransactionListPage.tsx`

> 功能点 8 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/payment-transactions/PaymentTransactionListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/payment-transactions/PaymentTransactionListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 500注入后错误态已渲染(p7) |
| 无待办 | - | `src/pages/payment-transactions/PaymentTransactionListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/payment-transactions/PaymentTransactionListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次5 | 0 | 0 | 0 | 造数15条实测：page=2 GET 200 |
| 无待办 | - | `src/pages/payment-transactions/PaymentTransactionListPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/payment-transactions/PaymentTransactionListPage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次7 | 0 | 0 | 0 | 行点击 EntityDrawer 打开渲染流水详情（trade_no/金额/状态等字段核对），关闭正常（e2e 净零段流水） |
| 无待办 | - | `src/pages/payment-transactions/PaymentTransactionListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 「确认退款」alertdialog 实测出现，取消路径关闭弹窗且 DB payment_transaction.status 无变化，确认路径由行15 覆盖（本地净零 mock 数据） |
| 无待办 | - | `src/pages/payment-transactions/PaymentTransactionListPage.tsx` | 「退款」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 1 | 1 | 0 | toast「退款成功」+行状态→已退款+DB status→3 落库核实；bug：finance_adm_logic:do_gateway_refund 把 payment_transaction.amount（分）未适配直传 wallet 网关 refund/2（按元接收）→ 退款放大 100 倍，已加 fen_to_gateway_amount/2 修复并造新流水复验（100 分退 100 分），测试后净零清理 |
