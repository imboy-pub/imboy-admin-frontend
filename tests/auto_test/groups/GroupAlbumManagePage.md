# `src/pages/groups/GroupAlbumManagePage.tsx`

> 功能点 9 个 | bug 发现 0 / 解决 0 / 待处理 0
> 索引：[../README.md](../README.md)

| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 无待办 | - | `src/pages/groups/GroupAlbumManagePage.tsx` | 路由直达与权限守卫（未登录跳 /login，无权限跳 403） | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupAlbumManagePage.tsx` | 加载中 / 空态 / 错误态展示（LoadingState / ErrorState） | 已通过 | 批次8 | 0 | 0 | 0 | 错误态经定向 XHR 劫持注入验证（API 404 → ErrorState 错误文案+重试按钮）：「加载群相册数据失败」 |
| 无待办 | - | `src/pages/groups/GroupAlbumManagePage.tsx` | 列表数据加载渲染与字段格式化 | 已通过 | 批次3 | 0 | 0 | 0 |  |
| 无待办 | - | `src/pages/groups/GroupAlbumManagePage.tsx` | 分页翻页与每页条数切换（筛选/搜索变化时重置 page=1） | 已通过 | 批次8 | 0 | 0 | 0 | 多页翻页实测（群 106571324669036544）：第1页 10 行→第2页 4 行，末页禁用下一页 |
| 无待办 | - | `src/pages/groups/GroupAlbumManagePage.tsx` | 危险/写操作二次确认弹窗（确认执行与取消） | 已通过 | 批次3 | 0 | 0 | 0 | 弹窗/抽屉打开+取消已验证（批次3 主巡检） |
| 无待办 | - | `src/pages/groups/GroupAlbumManagePage.tsx` | 导出 CSV（字段完整性与大数据量分页导出） | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办| -| `src/pages/groups/GroupAlbumManagePage.tsx` | 「相册已删除」操作提交成功并刷新列表数据 | 已通过| 批次7| 0| 0| 0| 实测…04010 行内 trash icon→确认弹窗「删除」：删除成功+列表刷新，DB status 1→0 核实（e2e 播种行） |
| 无待办 | - | `src/pages/groups/GroupAlbumManagePage.tsx` | 「导出当前页 N 条数据」操作提交成功并刷新列表数据 | 已通过 | 批次3 | 0 | 0 | 0 | 播种数据后复测通过（批次3 p15/p16） |
| 无待办 | - | `src/pages/groups/GroupAlbumManagePage.tsx` | 跳转 `/groups/:id` | 已通过 | 批次3 | 0 | 0 | 0 | 返回按钮导航验证（p17） |
