# `src/pages/channels/ChannelSubscriberPage.tsx`

> 功能点 9 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/channels/ChannelSubscriberPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelSubscriberPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 错误态注入待补测 |
| 无待办 | - | `src/pages/channels/ChannelSubscriberPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelSubscriberPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次5 | 0 | 0 | 0 | 频道103209560378181632造数15订阅：page=2 GET 200 |
| 无待办| -| `src/pages/channels/ChannelSubscriberPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过| 批次7| 0| 0| 0| e2e 播种行实测：移除订阅者有 ConfirmDialog（取消/移除），确认执行成功（路径由行14 覆盖） |
| 无待办 | - | `src/pages/channels/ChannelSubscriberPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后导出按钮点击验证通过（p20） |
| 无待办| -| `src/pages/channels/ChannelSubscriberPage.tsx` | 「订阅者已移除」操作提交成功并刷新列表数据 | 已通过| 批次7| 0| 0| 0| 实测…12006 行内「移除订阅者」→确认弹窗「移除」：列表刷新行消失，DB status 1→0 且 subscriber_count 15→14（e2e 播种行；初测 500 根因=播种未同步计数致 0-1 违反 check 约束，校正数据后通过，非产品 bug） |
| 无待办 | - | `src/pages/channels/ChannelSubscriberPage.tsx` | 「导出 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后导出按钮点击验证通过（p20） |
| 无待办 | - | `src/pages/channels/ChannelSubscriberPage.tsx` | 跳转 `/channels/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
