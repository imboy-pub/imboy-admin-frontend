# `src/pages/storage/StorageOverviewPage.tsx`

> 功能点 9 个 | bug 发现 2 / 解决 2 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/storage/StorageOverviewPage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/storage/StorageOverviewPage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次9 | 1 | 1 | 0 | 错误态缺失已修复并复验通过 |
| 无待办 | - | `src/pages/storage/StorageOverviewPage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次9 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/storage/StorageOverviewPage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次9 | 0 | 0 | 0 | 造数 attachment 8 条（共 14）后实测：下一页→page=2 URL 同步，「共 14 条」 |
| 无待办 | - | `src/pages/storage/StorageOverviewPage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次7 | 0 | 0 | 0 | 禁用/启用/软删除三个 ConfirmDialog（「确认禁用」「确认启用」「确认删除」均含取消按钮+后果说明）实测出现，确认执行路径由行13-15 覆盖 |
| 无待办 | - | `src/pages/storage/StorageOverviewPage.tsx` | 「禁用」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 实测 e2e 附件 …23001「禁用」→确认弹窗→toast「已禁用」+列表刷新行消失，DB status 1→0 核实 |
| 无待办 | - | `src/pages/storage/StorageOverviewPage.tsx` | 「启用」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 1 | 1 | 0 | 实测 …23001「启用」→确认→toast「已启用」+DB status 0→1；bug=列表后端硬编码 WHERE status=1，禁用后行从后台消失、「启用」端点存在但 UI 无入口，已修（attachment_repo:page 加 status 白名单筛选 + handler 透传 + 前端状态 select 正常/已禁用/已删除/全部，热加载复验） |
| 无待办 | - | `src/pages/storage/StorageOverviewPage.tsx` | 「软删除」操作提交成功并刷新列表数据 | 已通过 | 批次7 | 0 | 0 | 0 | 实测 e2e 附件 …23008「删」→「确认删除」弹窗（说明 status=-1 且 S3 暂留）→toast「已软删除」+行消失，DB status→-1 核实 |
| 无待办 | - | `src/pages/storage/StorageOverviewPage.tsx` | 跳转 `/settings` | 已通过 | 批次3 | 0 | 0 | 0 |  |
