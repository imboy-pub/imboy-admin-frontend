# `src/pages/announcements/AnnouncementListPage.tsx`

> 功能点 10 个 | bug 发现 1 / 解决 1 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/announcements/AnnouncementListPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 1 | 1 | 0 | bug 已修：后端 RBAC 缺 analytics:view/announcements:read（补种子复验通过） |
| 无待办 | - | `src/pages/announcements/AnnouncementListPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次3 | 0 | 0 | 0 | 500注入后错误态已渲染(p7) |
| 无待办 | - | `src/pages/announcements/AnnouncementListPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 阻塞 | 需 >10 条数据 | `src/pages/announcements/AnnouncementListPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 未测 | 批次3 | 0 | 0 | 0 | 数据量不足，无第二页 |
| 无待办 | - | `src/pages/announcements/AnnouncementListPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 阻塞 | 需 >10 条数据 | `src/pages/announcements/AnnouncementListPage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 未测 | 批次3 | 0 | 0 | 0 | 数据量不足，无第二页 |
| 阻塞 | 需人工验证 | `src/pages/announcements/AnnouncementListPage.tsx` | 「公告已删除」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 写操作交互深度超出自动化边界（icon 行内按钮/编辑弹窗） |
| 无待办 | - | `src/pages/announcements/AnnouncementListPage.tsx` | 「公告已发布」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 自动填表提交 2xx |
| 阻塞 | 需人工验证 | `src/pages/announcements/AnnouncementListPage.tsx` | 「公告已撤回」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 写操作交互深度超出自动化边界（icon 行内按钮/编辑弹窗） |
| 阻塞 | 需 >10 条数据 | `src/pages/announcements/AnnouncementListPage.tsx` | 「导出 N 条公告数据」操作提交成功并刷新列表数据 | 未测 | 批次3 | 0 | 0 | 0 | 列表为空导出按钮禁用/无数据可导 |
