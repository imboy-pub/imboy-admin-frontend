# `src/pages/content-moderation/ContentReviewQueuePage.tsx`

> 功能点 6 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/content-moderation/ContentReviewQueuePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/content-moderation/ContentReviewQueuePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/content-moderation/ContentReviewQueuePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/content-moderation/ContentReviewQueuePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次9 | 0 | 0 | 0 | 造数 review_queue 12 条后实测：下一页→page=2 URL 同步，「共 12 条」 |
| 无待办 | - | `src/pages/content-moderation/ContentReviewQueuePage.tsx` | 抽屉（详情/编辑）打开、提交与关闭 | 已通过 | 批次7 | 0 | 0 | 0 | 「查看详情」icon 按钮打开 EntityDrawer，详情字段完整渲染（消息 ID/类型/发送者/命中词）；ESC 关闭实测通过 |
| 无待办 | - | `src/pages/content-moderation/ContentReviewQueuePage.tsx` | 「moderate」写操作提交与错误提示 | 已通过 | 批次7 | 0 | 0 | 0 | 抽屉内「通过审核」pending 种子 id 92000000000021010：toast「已通过审核」+抽屉关闭+列表刷新；DB review_status=pending→approved 且 reviewer_id/-reviewed_at 落库 |
