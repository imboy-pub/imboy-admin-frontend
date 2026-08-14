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
| 阻塞 | 永久人工道（§1.4 不可逆/敏感写操作） | `src/pages/withdrawals/WithdrawalsPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 未测 | 批次3 | 0 | 0 | 0 | 敏感/不可逆操作 |
| 阻塞 | 永久人工道（§1.4 资金/审批/敏感配置写操作） | `src/pages/withdrawals/WithdrawalsPage.tsx` | 「标记」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 资金/审批/配置类敏感操作，自动化跳过 |
| 阻塞 | 永久人工道（§1.4 资金/审批/敏感配置写操作） | `src/pages/withdrawals/WithdrawalsPage.tsx` | 「拒绝提现」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 资金/审批/配置类敏感操作，自动化跳过 |
