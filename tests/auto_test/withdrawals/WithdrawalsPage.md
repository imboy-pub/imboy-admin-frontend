# `src/pages/withdrawals/WithdrawalsPage.tsx`

> 功能点 8 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/withdrawals/WithdrawalsPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/withdrawals/WithdrawalsPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 500注入后错误态已渲染(p7) |
| 无待办 | - | `src/pages/withdrawals/WithdrawalsPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/withdrawals/WithdrawalsPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次3 | 0 | 0 | 0 | 第五阶段播种后复测通过（p22/p23） |
| 无待办 | - | `src/pages/withdrawals/WithdrawalsPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/withdrawals/WithdrawalsPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 「确认标记为已完成？」「确认拒绝该提现？」ConfirmDialog（含用户/金额/单号/不可撤销提示）实测出现；取消路径实测关闭弹窗无副作用 |
| 无待办 | - | `src/pages/withdrawals/WithdrawalsPage.tsx` | 「标记」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 本地净零段实测：e2e_wd_15 确认完成→toast「已标记完成」+状态列「已完成」+DB wallet_transaction status→1 核实 |
| 无待办 | - | `src/pages/withdrawals/WithdrawalsPage.tsx` | 「拒绝提现」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 本地净零段实测：e2e_wd_12 确认拒绝→toast「已拒绝提现」+状态列「已拒绝」+DB status→2/钱包余额 1000→1112 原子退回 112 分/tx_type=11 退款流水（WRF_92000000000022012）核实 |
