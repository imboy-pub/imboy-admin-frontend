# `src/pages/channels/ChannelOrderPage.tsx`

> 功能点 9 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/channels/ChannelOrderPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelOrderPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次8 | 0 | 0 | 0 | 错误态经定向 XHR 劫持注入验证（API 404 → ErrorState 错误文案+重试按钮）：「加载频道订单失败」（页面无「刷新数据」按钮，劫持注入于页面加载） |
| 无待办 | - | `src/pages/channels/ChannelOrderPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelOrderPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次8 | 0 | 0 | 0 | 多页翻页实测（频道 103209560378181632 共 15 条）：第1页 10 行→第2页 5 行，末页禁用下一页 |
| 无待办 | - | `src/pages/channels/ChannelOrderPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelOrderPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办| -| `src/pages/channels/ChannelOrderPage.tsx` | 「退款」操作提交成功并刷新列表数据 | 已通过| 批次7| 1| 1| 0| e2e_order_12 实测退款：弹窗填原因→确认退款，订单 status 1→2、refund_reason 落库、钱包退款流水 R_WPY_ +2190 分、列表「已支付」→「已退款」；bug=payment_no 为 DB NULL 时 epgsql 返 null atom 致 <<"R_",null/binary>> 崩溃 HTTP 500 空响应，已修 refund_fen 守卫+热加载复验（本地 mock 钱包网关，e2e 播种订单） |
| 无待办 | - | `src/pages/channels/ChannelOrderPage.tsx` | 「导出 N 条订单记录」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/channels/ChannelOrderPage.tsx` | 跳转 `/channels/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
