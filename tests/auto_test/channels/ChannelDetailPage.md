# `src/pages/channels/ChannelDetailPage.tsx`

> 功能点 12 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 错误态注入待补测 |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 「确认删除频道」ConfirmDialog（取消/删除+不可恢复提示）实测出现，确认执行路径由行12 覆盖，取消路径实测关闭弹窗无副作用 |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 「频道已删除」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 实测「删除频道」→确认弹窗→toast「频道已删除」+自动跳回 /channels，DB channel.status→-1（软删除，列表状态列变「已删除」）；e2e 主频道 103209560378181632（订阅/管理员/消息/订单页均已测完后最后执行） |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 「频道已更新」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 编辑频道表单改描述→「保存修改」→toast「频道已更新」，DB description 落库核实 |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 「频道价格已更新」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 类型切「付费」后出现「频道价格」卡片→设置价格 9.90→「保存价格」→toast「频道价格已更新」，DB channel_price 落 9.90 CNY 核实 |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 跳转 `/channels` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮验证（p17） |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 跳转 `/channels/:id/messages` | 已通过 | 批次3 | 0 | 0 | 0 | tab「消息」点击导航已验证（p14） |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 跳转 `/channels/:id/subscribers` | 已通过 | 批次3 | 0 | 0 | 0 | tab「订阅」点击导航已验证（p14） |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 跳转 `/channels/:id/admins` | 已通过 | 批次3 | 0 | 0 | 0 | 管理员 tab 导航验证（p17b） |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 跳转 `/channels/:id/invitations` | 已通过 | 批次3 | 0 | 0 | 0 | tab「邀请」点击导航已验证（p14） |
| 无待办 | - | `src/pages/channels/ChannelDetailPage.tsx` | 跳转 `/channels/:id/orders` | 已通过 | 批次3 | 0 | 0 | 0 | tab「订单」点击导航已验证（p14） |
