# `src/pages/channels/ChannelInvitationPage.tsx`

> 功能点 8 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/channels/ChannelInvitationPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelInvitationPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次8 | 0 | 0 | 0 | 错误态经定向 XHR 劫持注入验证（API 404 → ErrorState 错误文案+重试按钮）：「加载频道邀请失败」 |
| 无待办 | - | `src/pages/channels/ChannelInvitationPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelInvitationPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次8 | 0 | 0 | 0 | 多页翻页实测（频道 103209560378181632 共 15 条）：第1页 10 行→第2页 5 行，末页禁用下一页，?page=2 同步 URL state |
| 无待办 | - | `src/pages/channels/ChannelInvitationPage.tsx` | 筛选 / 搜索条件生效与清空重置 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/channels/ChannelInvitationPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/channels/ChannelInvitationPage.tsx` | 「导出 N 条邀请记录」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/channels/ChannelInvitationPage.tsx` | 跳转 `/channels/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
